import {smsDriveStore,driveSource,connectSmsDrive,readSmsDrive} from './crm-sheets-sms-drive.js';
const TABLE='crm_sms_sources';
export function normalizeSmsPhone(value){let phone=String(value??'').replace(/\D/g,'');if(phone.startsWith('82'))phone='0'+phone.slice(2);if(/^10\d{8}$/.test(phone))phone='0'+phone;return /^01\d{8,9}$/.test(phone)?phone:'';}
function dateKey(value){const text=String(value),date=text.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);if(!date)return 0;const time=text.slice(date.index+date[0].length).match(/(오전|오후|AM|PM)?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/i);let hour=Number(time?.[2]||0);if(time?.[1])hour=hour%12+(/오후|PM/i.test(time[1])?12:0);return Date.UTC(+date[1],+date[2]-1,+date[3],hour,+time?.[3]||0,+time?.[4]||0);}
export function smsRecords(values,phone){
 const headers=values[0]||[],indices=['Date','Sender','Content'].map(h=>headers.findIndex(v=>String(v).trim().toLowerCase()===h.toLowerCase()));
 if(indices.some(i=>i<0))throw Error('문자 시트 첫 줄에 Date, Sender, Content 열이 필요합니다.');
 const target=normalizeSmsPhone(phone);if(!target)throw Error('연락처 전화번호를 확인해 주세요.');
 const records=[];for(let i=1;i<values.length;i++){const row=values[i];if(normalizeSmsPhone(row[indices[1]])!==target)continue;const content=String(row[indices[2]]??'');if(!content.trim())continue;const date=String(row[indices[0]]??'');records.push({row:i+1,date,content,preview:content.replace(/\s+/g,' ').trim().slice(0,140),sort:dateKey(date)});}
 records.sort((a,b)=>b.sort-a.sort||b.row-a.row);return records.map(({sort,...record})=>record);
}
export function smsCounts(values,phones){
 const headers=values[0]||[],sender=headers.findIndex(h=>String(h).trim().toLowerCase()==='sender'),content=headers.findIndex(h=>String(h).trim().toLowerCase()==='content');
 if(sender<0||content<0)throw Error('문자 시트 첫 줄에 Sender, Content 열이 필요합니다.');
 const counts=Object.fromEntries(phones.map(normalizeSmsPhone).filter(Boolean).map(phone=>[phone,0]));
 for(const row of values.slice(1)){const phone=normalizeSmsPhone(row[sender]);if(Object.hasOwn(counts,phone)&&String(row[content]??'').trim())counts[phone]++;}
 return counts;
}
export async function crmMessagesRoute({env,uid,request,token,api}){
 await env.AGENT_DB.prepare(`CREATE TABLE IF NOT EXISTS ${TABLE}(uid TEXT PRIMARY KEY,sheet_id TEXT NOT NULL,tab_id INTEGER NOT NULL,tab_title TEXT NOT NULL)`).run();
 const query=(sql,args)=>env.AGENT_DB.prepare(sql).bind(...args),path=new URL(request.url).pathname;
 const stored=await query(`SELECT * FROM ${TABLE} WHERE uid=?`,[uid]).first(),drive=await smsDriveStore(env,uid),driveConfig=await drive.read();
 const publicSource=row=>({connected:!!row,...(row?{title:row.tab_title,url:`https://docs.google.com/spreadsheets/d/${row.sheet_id}/edit#gid=${row.tab_id}`}:{})});
 if(path==='/crm-sheets/messages/source'&&request.method==='GET')return driveConfig?driveSource(driveConfig):publicSource(stored);
 if(request.method!=='POST')throw Error('지원하지 않는 요청입니다.');
 const raw=await request.text();if(raw.length>4096)throw Error('문자 조회 요청이 너무 큽니다.');const body=JSON.parse(raw||'{}');
 if(path==='/crm-sheets/messages/source'){
  if(body.kind==='drive')return connectSmsDrive({store:drive,url:String(body.url||''),confirmed:body.confirmed,token,api});
  const url=new URL(String(body.url||''));const match=url.pathname.match(/^\/spreadsheets\/d\/([\w-]{20,150})\//);const gid=new URLSearchParams(url.hash.slice(1)).get('gid')||url.searchParams.get('gid');
  if(url.origin!=='https://docs.google.com'||!match||!/^\d+$/.test(gid||''))throw Error('문자답장 탭의 Google 스프레드시트 주소를 입력해 주세요.');
  if(body.confirmed!==true)throw Error('문자 자료 연결 확인이 필요합니다.');
  const access=await token(),base='https://sheets.googleapis.com/v4/spreadsheets/'+match[1],meta=await api(access,base+'?fields=sheets.properties');const tab=meta.sheets?.find(s=>s.properties.sheetId===Number(gid))?.properties;
  if(!tab)throw Error('연결할 문자 탭을 찾지 못했습니다.');
  const data=await api(access,base+'/values/'+encodeURIComponent("'"+tab.title.replace(/'/g,"''")+"'!A1:C1"));smsRecords(data.values||[],'01000000000');
  await query(`INSERT INTO ${TABLE}(uid,sheet_id,tab_id,tab_title) VALUES(?,?,?,?) ON CONFLICT(uid) DO UPDATE SET sheet_id=excluded.sheet_id,tab_id=excluded.tab_id,tab_title=excluded.tab_title`,[uid,match[1],Number(gid),tab.title]).run();
  await drive.remove();return publicSource({sheet_id:match[1],tab_id:Number(gid),tab_title:tab.title});
 }
 if(path==='/crm-sheets/messages/read'||path==='/crm-sheets/messages/counts'){
  if(driveConfig){const counting=path.endsWith('/counts');if(counting&&(!Array.isArray(body.phones)||body.phones.length>100))throw Error('한 번에 100개 이하의 전화번호를 조회해 주세요.');const phone=normalizeSmsPhone(body.phone);if(!counting&&!phone)throw Error('연락처 전화번호를 확인해 주세요.');const records=await readSmsDrive({store:drive,config:driveConfig,uid,token,api});if(counting){const counts=Object.fromEntries(body.phones.map(normalizeSmsPhone).filter(Boolean).map(p=>[p,0]));for(const record of records)if(Object.hasOwn(counts,record.phone))counts[record.phone]++;return {connected:true,counts,limited:false};}return {messages:records.filter(record=>record.phone===phone).map(({phone,...record})=>record),source:driveSource(driveConfig),limited:false};}
  if(!stored){if(path.endsWith('/counts'))return {connected:false,counts:{}};throw Error('문자 내역 시트를 먼저 연결해 주세요.');}
  const counting=path.endsWith('/counts'),phone=normalizeSmsPhone(body.phone);
  if(counting){if(!Array.isArray(body.phones)||body.phones.length>100)throw Error('한 번에 100개 이하의 전화번호를 조회해 주세요.');}
  else if(!phone)throw Error('연락처 전화번호를 확인해 주세요.');
  const access=await token(),base='https://sheets.googleapis.com/v4/spreadsheets/'+stored.sheet_id,meta=await api(access,base+'?fields=sheets.properties');const tab=meta.sheets?.find(s=>s.properties.sheetId===stored.tab_id)?.properties;
  if(!tab)throw Error('문자 원본 탭이 삭제되었거나 접근할 수 없습니다.');const count=Math.min(tab.gridProperties?.rowCount||1000,5001);
  const data=await api(access,base+'/values/'+encodeURIComponent("'"+tab.title.replace(/'/g,"''")+"'!A1:C"+count));
  if(counting)return {connected:true,counts:smsCounts(data.values||[],body.phones),limited:(tab.gridProperties?.rowCount||0)>5001};
  return {messages:smsRecords(data.values||[],phone),source:publicSource({...stored,tab_title:tab.title}),limited:(tab.gridProperties?.rowCount||0)>5001};
 }
 throw Error('지원하지 않는 요청입니다.');
}
