// Immutable, account-scoped chunks. Existing pointers stay readable if a write fails.
const gzip=async value=>new Uint8Array(await new Response(new Blob([JSON.stringify(value)]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
const LIMIT=500000,MAX_BYTES=200000000;
const query=(env,sql,args=[])=>env.AGENT_DB.prepare(sql).bind(...args);
export async function initChunks(env){await env.AGENT_DB.prepare('CREATE TABLE IF NOT EXISTS crm_payload_chunks(uid TEXT NOT NULL,id TEXT NOT NULL,payload TEXT NOT NULL,created INTEGER NOT NULL,PRIMARY KEY(uid,id))').run();}
export async function digest(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(v=>v.toString(16).padStart(2,'0')).join('');}
export async function putChunk(env,uid,payload){
 if(typeof payload!=='string'||payload.length>LIMIT)throw Error('저장 묶음 크기를 초과했습니다.');
 const id=await digest(payload),old=await query(env,'SELECT id FROM crm_payload_chunks WHERE uid=? AND id=?',[uid,id]).first();
 if(!old){const size=await query(env,'SELECT COALESCE(SUM(length(payload)),0) AS size FROM crm_payload_chunks WHERE uid=?',[uid]).first();if(size.size+payload.length>MAX_BYTES)throw Error('CRM 저장 공간을 확인해 주세요. 기존 자료는 유지됩니다.');await query(env,'INSERT OR IGNORE INTO crm_payload_chunks(uid,id,payload,created) VALUES(?,?,?,?)',[uid,id,payload,Date.now()]).run();}else await query(env,'UPDATE crm_payload_chunks SET created=? WHERE uid=? AND id=?',[Date.now(),uid,id]).run();return id;
}
export async function getChunk(env,uid,id){if(!/^[a-f0-9]{64}$/.test(id))throw Error('저장 묶음 주소가 올바르지 않습니다.');const row=await query(env,'SELECT payload FROM crm_payload_chunks WHERE uid=? AND id=?',[uid,id]).first();if(!row)throw Error('저장 묶음을 찾지 못했습니다. 다시 불러와 주세요.');return row.payload;}
const base64=bytes=>{let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);};
export async function writePayload(env,uid,value){const data=base64(await gzip(value));if(data.length<=LIMIT)return JSON.stringify({format:'crm-packed-v1',data});const parts=[];for(let i=0;i<data.length;i+=LIMIT)parts.push(await putChunk(env,uid,data.slice(i,i+LIMIT)));return JSON.stringify({format:'crm-payload-v1',parts});}
export async function readPayload(env,uid,raw){const value=JSON.parse(raw);if(value.format==='crm-packed-v1')return unpack(value.data);if(value.format!=='crm-payload-v1')return value;let data='';for(const id of value.parts)data+=await getChunk(env,uid,id);return unpack(data);}
async function unpack(data){const input=Uint8Array.from(atob(data),c=>c.charCodeAt(0)),reader=new Blob([input]).stream().pipeThrough(new DecompressionStream('gzip')).getReader(),parts=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_BYTES)throw Error('명부 크기를 초과했습니다.');parts.push(value);}}finally{await reader.cancel();}return JSON.parse(await new Blob(parts).text());}
export async function readContacts(env,uid,raw){const value=typeof raw==='string'?JSON.parse(raw):raw;if(value?.format==='moida-crm-gzip-v1'){const rows=await unpack(value.data);if(!Array.isArray(rows)||rows.length!==value.count)throw Error('명부 인원이 일치하지 않습니다.');return rows;}if(value?.format!=='moida-crm-remote-v1'||!Array.isArray(value.parts)||value.parts.length>1000||value.count>50000)throw Error('명부 전송 형식이 올바르지 않습니다.');const result=[];for(const id of value.parts){const payload=await getChunk(env,uid,id);if(JSON.parse(payload)?.format!=='moida-crm-gzip-v1')throw Error('명부 저장 묶음 형식이 올바르지 않습니다.');const rows=await readContacts(env,uid,payload);result.push(...rows);if(result.length>50000)throw Error('명부 인원을 초과했습니다.');}if(result.length!==value.count)throw Error('명부 인원이 일치하지 않습니다.');return result;}
export async function crmStoreRoute({env,uid,request}){
 await initChunks(env);const path=new URL(request.url).pathname;
 const raw=await request.text();if(raw.length>550000)throw Error('요청 용량이 너무 큽니다.');const body=JSON.parse(raw||'{}');
 if(request.method!=='POST')throw Error('지원하지 않는 요청입니다.');
 if(path==='/crm-store/put')return {id:await putChunk(env,uid,body.payload)};
 if(path==='/crm-store/get')return {payload:await getChunk(env,uid,body.id)};
 if(path==='/crm-store/prune'){
  // Read the authoritative Firestore pointer; never trust a client-supplied live set.
  const response=await fetch('https://firestore.googleapis.com/v1/projects/jjj2195-1bd15/databases/(default)/documents/moida_users/'+encodeURIComponent(uid),{headers:{Authorization:request.headers.get('Authorization')||''}});
  if(!response.ok)throw Error('현재 명부의 저장 주소를 확인하지 못했습니다.');
  const document=await response.json(),raw=document.fields?.members?.stringValue;if(!raw)throw Error('현재 명부가 저장된 후 다시 시도해 주세요.');
  const live=new Set(),add=value=>{if(value?.format==='moida-crm-remote-v1'||value?.format==='crm-payload-v1')for(const id of value.parts||[])live.add(id);};add(JSON.parse(raw));
  const sync=await query(env,'SELECT baseline,pending FROM crm_sheet_connections WHERE uid=?',[uid]).first().catch(()=>null);if(sync){for(const raw of [sync.baseline,sync.pending])if(raw){add(JSON.parse(raw));if(raw===sync.pending){const pending=await readPayload(env,uid,raw);if(pending?.rowsRef)add(JSON.parse(pending.rowsRef));}}}
  const source=await query(env,'SELECT baseline FROM crm_sheet_sources WHERE uid=?',[uid]).first().catch(()=>null);if(source?.baseline)add(JSON.parse(source.baseline));
  // In-flight reads and uncommitted uploads get a full day of grace.
  await query(env,'DELETE FROM crm_payload_chunks WHERE uid=? AND created<? AND id NOT IN (SELECT value FROM json_each(?))',[uid,Date.now()-86400000,JSON.stringify([...live])]).run();return {ok:true};
 }
 throw Error('지원하지 않는 요청입니다.');
}
