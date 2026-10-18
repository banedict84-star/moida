import {crmMessagesRoute} from './crm-sheets-messages.js';
import {FIELDS,MAX_CONTACTS,sheetValues,parseRows,validate,mergeContacts} from './crm-sheets-merge.js';
import {initChunks,readPayload,writePayload,readContacts} from './crm-chunks.js';
const TABLE='crm_sheet_connections',TAB='모이다 CRM',BATCH=2500,LEASE=15*60000;
const q=(env,sql,args=[])=>env.AGENT_DB.prepare(sql).bind(...args);
// Sheets omits empty trailing cells/rows in responses.
const normalize=values=>{const rows=values.map(row=>{const r=row.map(v=>v==null?'':String(v));while(r.length&&r.at(-1)==='')r.pop();return r;});while(rows.length&&!rows.at(-1).length)rows.pop();return rows;};
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(normalize(value)))))).map(v=>v.toString(16).padStart(2,'0')).join('');
export async function crmSheetsRoute({env,uid,request,token,api}){
 await env.AGENT_DB.prepare(`CREATE TABLE IF NOT EXISTS ${TABLE}(uid TEXT PRIMARY KEY,sheet_id TEXT NOT NULL,baseline TEXT NOT NULL DEFAULT '[]',pending TEXT,lease TEXT,lease_until INTEGER NOT NULL DEFAULT 0,last_sync INTEGER NOT NULL DEFAULT 0)`).run();
 const path=new URL(request.url).pathname;if(path.startsWith('/crm-sheets/messages/'))return crmMessagesRoute({env,uid,request,token,api});const read=()=>q(env,`SELECT * FROM ${TABLE} WHERE uid=?`,[uid]).first();
 if(path==='/crm-sheets/status'&&request.method==='GET'){const row=await read();return {connected:!!row,sheetId:row?.sheet_id,lastSync:row?.last_sync||0,tab:TAB,maxContacts:MAX_CONTACTS};}
 if(request.method!=='POST')throw Error('지원하지 않는 요청입니다.');
 if(Number(request.headers.get('content-length'))>3000000)throw Error('요청 용량이 너무 큽니다.');
 const raw=await request.text();if(raw.length>3000000)throw Error('요청 용량이 너무 큽니다.');const body=JSON.parse(raw||'{}');
 await initChunks(env);
 if(path==='/crm-sheets/disconnect'){await q(env,`DELETE FROM ${TABLE} WHERE uid=?`,[uid]).run();return {ok:true};}
 if(path==='/crm-sheets/release'){await q(env,`UPDATE ${TABLE} SET pending=NULL,lease=NULL,lease_until=0 WHERE uid=? AND lease=?`,[uid,String(body.lease||'')]).run();return {ok:true};}
 const access=await token();
 if(path==='/crm-sheets/connect'){
  if(body.confirmed!==true)throw Error('연락처 동기화 승인이 필요합니다.');
  const id=String(body.sheetId||'');if(!/^[a-zA-Z0-9_-]{20,150}$/.test(id))throw Error('Google 시트 주소를 확인해 주세요.');
  const prior=await read();if(prior&&prior.sheet_id!==id)throw Error('기존 연결을 해제한 뒤 다른 시트를 연결해 주세요.');
  const base='https://sheets.googleapis.com/v4/spreadsheets/'+id;
  const meta=await api(access,base+'?fields=sheets.properties');let tab=meta.sheets?.find(s=>s.properties.title===TAB);
  if(!tab)await api(access,base+':batchUpdate',{method:'POST',body:JSON.stringify({requests:[{addSheet:{properties:{title:TAB,gridProperties:{rowCount:MAX_CONTACTS+1,columnCount:FIELDS.length,frozenRowCount:1}}}}]})});
  const values=await api(access,base+'/values/'+encodeURIComponent("'"+TAB+"'!A1:"+String.fromCharCode(64+Math.min(Number(tab?.properties.gridProperties?.columnCount)||FIELDS.length,26))+"1"));if(values.values?.length)parseRows(values.values);
  await q(env,`INSERT OR IGNORE INTO ${TABLE}(uid,sheet_id) VALUES(?,?)`,[uid,id]).run();return {ok:true,tab:TAB};
 }
 const config=await read();if(!config)throw Error('시트를 먼저 연결해 주세요.');
 const base='https://sheets.googleapis.com/v4/spreadsheets/'+config.sheet_id;
 const meta=await api(access,base+'?fields=sheets.properties');
 const sheet=meta.sheets?.find(s=>s.properties.title===TAB),columns=Number(sheet?.properties.gridProperties?.columnCount)||FIELDS.length;
 const readColumn=String.fromCharCode(64+Math.min(columns,26));
 let gridRows=Math.min(MAX_CONTACTS+2,Number(sheet?.properties.gridProperties?.rowCount)||MAX_CONTACTS+2);
 const readRange=async(start,end,column=readColumn)=>{const data=await api(access,base+'/values/'+encodeURIComponent("'"+TAB+"'!A"+start+':'+column+end));return data.values||[];};
 const readSheet=async()=>{const rows=[];for(let start=1;start<=gridRows;start+=5000){const end=Math.min(start+4999,gridRows),part=await readRange(start,end);rows.push(...part);if(part.length<end-start+1)break;}return rows;};
 if(path==='/crm-sheets/prepare'){
  const crm=validate(body.contactsPayload?await readContacts(env,uid,body.contactsPayload):body.contacts);const values=await readSheet();const merged=mergeContacts(crm,parseRows(values,crm),await readPayload(env,uid,config.baseline));
  if(merged.conflicts.length)return {ok:false,conflicts:merged.conflicts.slice(0,100)};
  const lease=crypto.randomUUID(),pending=await writePayload(env,uid,{rowsRef:await writePayload(env,uid,merged.rows),sheetHash:await hash(values)});
  const r=await q(env,`UPDATE ${TABLE} SET lease=?,lease_until=?,pending=? WHERE uid=? AND lease_until<?`,[lease,Date.now()+LEASE,pending,uid,Date.now()]).run();if(!r.meta.changes)throw Error('다른 화면에서 동기화 중입니다. 잠시 후 다시 시도해 주세요.');
  return {ok:true,lease,contacts:merged.rows};
 }
 if(path==='/crm-sheets/commit'){
  if(!body.lease||config.lease!==body.lease||config.lease_until<Date.now())throw Error('동기화 확인 시간이 지났습니다. 다시 동기화해 주세요.');
  const pending=await readPayload(env,uid,config.pending);
  const contacts=pending.rowsRef?await readPayload(env,uid,pending.rowsRef):pending.rows;
  if(!pending.writes){
   const values=await readSheet();if(await hash(values)!==pending.sheetHash)throw Error('동기화 중 시트가 수정되었습니다. 다시 동기화해 주세요.');
   const removed=values[0]?.findIndex(h=>['문자답장','문자답장여부'].includes(String(h).trim()))??-1;
   const requests=[];if(removed>=0){requests.push({deleteDimension:{range:{sheetId:sheet.properties.sheetId,dimension:'COLUMNS',startIndex:removed,endIndex:removed+1}}});}
   const rows=sheetValues(contacts,values);
   if(sheet?.properties.sheetId!==undefined)requests.push({updateSheetProperties:{properties:{sheetId:sheet.properties.sheetId,gridProperties:{rowCount:Math.max(Number(sheet.properties.gridProperties?.rowCount)||0,rows.length),columnCount:Math.max(columns-(removed>=0?1:0),rows[0].length)}},fields:'gridProperties.rowCount,gridProperties.columnCount'}});
   gridRows=Math.max(gridRows,rows.length);
   if(requests.length)await api(access,base+':batchUpdate',{method:'POST',body:JSON.stringify({requests})});
   if(removed>=0)for(const row of values)row.splice(removed,1);
   pending.headers=rows[0];pending.column=String.fromCharCode(64+rows[0].length);pending.expectedHash=await hash(rows);pending.writes=[];pending.cursor=0;
   for(let start=0;start<rows.length;){let end=Math.min(start+BATCH,rows.length);while(end>start+1&&new TextEncoder().encode(JSON.stringify(rows.slice(start,end))).length>1000000)end=start+Math.ceil((end-start)/2);const next=rows.slice(start,end),old=values.slice(start,end);if(await hash(next)!==await hash(old))pending.writes.push({start:start+1,end,oldHash:await hash(old)});start=end;}
  }
  const write=pending.writes[pending.cursor];if(write&&!write.values){const first=write.start-1;const batch=sheetValues(contacts.slice(Math.max(0,first-1),write.end-1),[pending.headers]);write.values=first===0?batch:batch.slice(1);}

  if(write){const current=await readRange(write.start,write.start+write.values.length-1,pending.column);if(await hash(current)!==write.oldHash&&await hash(current)!==await hash(write.values))throw Error('전송할 구간이 시트에서 수정되었습니다. 다시 동기화해 주세요.');if(await hash(current)!==await hash(write.values))await api(access,base+'/values/'+encodeURIComponent("'"+TAB+"'!A"+write.start+':'+pending.column+(write.start+write.values.length-1))+'?valueInputOption=RAW',{method:'PUT',body:JSON.stringify({values:write.values})});pending.cursor++;}
  if(pending.cursor<pending.writes.length){if(write)delete write.values;await q(env,`UPDATE ${TABLE} SET pending=?,lease_until=? WHERE uid=? AND lease=?`,[await writePayload(env,uid,pending),Date.now()+LEASE,uid,body.lease]).run();return {ok:true,done:false,completed:pending.cursor,total:pending.writes.length,count:contacts.length};}
  if(await hash(await readSheet())!==pending.expectedHash)throw Error('시트 최종 확인 중 변경을 발견했습니다. 다시 동기화해 주세요.');
  await q(env,`UPDATE ${TABLE} SET baseline=?,pending=NULL,lease=NULL,lease_until=0,last_sync=? WHERE uid=? AND lease=?`,[pending.rowsRef||await writePayload(env,uid,contacts),Date.now(),uid,body.lease]).run();return {ok:true,done:true,count:contacts.length};
 }
 throw Error('지원하지 않는 요청입니다.');
}
