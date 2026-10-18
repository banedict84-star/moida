import {parseSmsXml} from './crm-sheets-sms-xml.js';
const TABLE='crm_sms_drive_sources';
export async function smsDriveStore(env,uid){
 await env.AGENT_DB.prepare(`CREATE TABLE IF NOT EXISTS ${TABLE}(uid TEXT PRIMARY KEY,folder_id TEXT NOT NULL,title TEXT NOT NULL,file_id TEXT,version TEXT,records TEXT NOT NULL DEFAULT '[]',updated INTEGER NOT NULL DEFAULT 0,lease_until INTEGER NOT NULL DEFAULT 0)`).run();
 const query=(sql,args)=>env.AGENT_DB.prepare(sql).bind(...args);
 return {read:()=>query(`SELECT * FROM ${TABLE} WHERE uid=?`,[uid]).first(),remove:()=>query(`DELETE FROM ${TABLE} WHERE uid=?`,[uid]).run(),save:(id,title)=>query(`INSERT INTO ${TABLE}(uid,folder_id,title) VALUES(?,?,?) ON CONFLICT(uid) DO UPDATE SET folder_id=excluded.folder_id,title=excluded.title,file_id=NULL,version=NULL,records='[]',updated=0,lease_until=0`,[uid,id,title]).run(),query};
}
export const driveSource=row=>({connected:true,kind:'drive',title:row.title,url:'https://drive.google.com/drive/folders/'+row.folder_id});
export async function connectSmsDrive({store,url,confirmed,token,api}){
 if(confirmed!==true)throw Error('문자 자료 연결 확인이 필요합니다.');
 const parsed=new URL(url),id=parsed.pathname.match(/^\/drive\/folders\/([\w-]{15,150})\/?$/)?.[1];
 if(parsed.origin!=='https://drive.google.com'||!id)throw Error('문자 백업 폴더의 Google Drive 주소를 입력해 주세요.');
 const access=await token('drive'),meta=await api(access,'https://www.googleapis.com/drive/v3/files/'+id+'?fields=id,name,mimeType,trashed');
 if(meta.mimeType!=='application/vnd.google-apps.folder'||meta.trashed)throw Error('접근 가능한 문자 백업 폴더를 선택해 주세요.');
 await store.save(id,meta.name);return driveSource({folder_id:id,title:meta.name});
}
export async function readSmsDrive({store,config,uid,token,api,download=fetch}){
 const now=Date.now();if(config.updated&&now-config.updated<60000)return JSON.parse(config.records);
 const access=await token('drive'),params=new URLSearchParams({q:`'${config.folder_id}' in parents and trashed=false and (name contains '.xml' or name contains '.XML')`,orderBy:'modifiedTime desc',pageSize:'100',fields:'files(id,name,mimeType,size,modifiedTime)'});
 const listed=await api(access,'https://www.googleapis.com/drive/v3/files?'+params),file=listed.files?.find(f=>/\.xml$/i.test(f.name));
 if(!file)throw Error('폴더에 문자 백업 XML이 없습니다. 업로드가 완료되었는지 확인해 주세요.');
 const version=file.id+':'+file.modifiedTime;
 if(config.version===version){await store.query(`UPDATE ${TABLE} SET updated=? WHERE uid=? AND folder_id=? AND version=?`,[now,uid,config.folder_id,version]).run();return JSON.parse(config.records);}
 if(Number(file.size)>300*1024*1024)throw Error('문자 백업은 300MB 이하로 연결해 주세요.');
 const lease=now+120000,result=await store.query(`UPDATE ${TABLE} SET lease_until=? WHERE uid=? AND folder_id=? AND lease_until<?`,[lease,uid,config.folder_id,now]).run();
 if(!result.meta?.changes)throw Error('문자 백업을 처리 중입니다. 잠시 후 다시 확인해 주세요.');
 try{
  const response=await download('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(file.id)+'?alt=media',{headers:{Authorization:'Bearer '+access},redirect:'manual'});
  if(!response.ok||!response.body)throw Error('문자 백업 파일을 가져오지 못했습니다. Google Drive 연결을 확인해 주세요.');
  async function* chunks(){const reader=response.body.getReader(),decoder=new TextDecoder();let bytes=0;try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>300*1024*1024)throw Error('문자 백업은 300MB 이하로 연결해 주세요.');yield decoder.decode(value,{stream:true});}yield decoder.decode();}finally{await reader.cancel();}}
  const parsed=await parseSmsXml(chunks()),records=JSON.stringify(parsed.messages);
  if(new TextEncoder().encode(records).length>1500000)throw Error('추출한 문자 텍스트가 너무 많습니다. 기간별로 나눈 백업을 연결해 주세요.');
  const saved=await store.query(`UPDATE ${TABLE} SET file_id=?,version=?,records=?,updated=?,lease_until=0 WHERE uid=? AND folder_id=? AND lease_until=?`,[file.id,version,records,Date.now(),uid,config.folder_id,lease]).run();
  if(!saved.meta?.changes)throw Error('문자 연결 설정이 변경되었습니다. 다시 열어 주세요.');return parsed.messages;
 }finally{await store.query(`UPDATE ${TABLE} SET lease_until=0 WHERE uid=? AND folder_id=? AND lease_until=?`,[uid,config.folder_id,lease]).run();}
}
