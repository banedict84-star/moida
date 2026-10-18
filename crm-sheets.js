import {crmMessagesRoute} from './crm-sheets-messages.js';
import {FIELDS,HEADERS,LAST_COLUMN,sheetValues,parseRows,validate,mergeContacts} from './crm-sheets-merge.js';
const TABLE='crm_sheet_connections',TAB='모이다 CRM';
const q=(env,sql,args=[])=>env.AGENT_DB.prepare(sql).bind(...args);
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))).map(v=>v.toString(16).padStart(2,'0')).join('');
export async function crmSheetsRoute({env,uid,request,token,api}){
 await env.AGENT_DB.prepare(`CREATE TABLE IF NOT EXISTS ${TABLE}(uid TEXT PRIMARY KEY,sheet_id TEXT NOT NULL,baseline TEXT NOT NULL DEFAULT '[]',pending TEXT,lease TEXT,lease_until INTEGER NOT NULL DEFAULT 0,last_sync INTEGER NOT NULL DEFAULT 0)`).run();
 const path=new URL(request.url).pathname;if(path.startsWith('/crm-sheets/messages/'))return crmMessagesRoute({env,uid,request,token,api});const read=()=>q(env,`SELECT * FROM ${TABLE} WHERE uid=?`,[uid]).first();
 if(path==='/crm-sheets/status'&&request.method==='GET'){const row=await read();return {connected:!!row,sheetId:row?.sheet_id,lastSync:row?.last_sync||0,tab:TAB};}
 if(request.method!=='POST')throw Error('지원하지 않는 요청입니다.');
 if(Number(request.headers.get('content-length'))>3000000)throw Error('요청 용량이 너무 큽니다.');
 const raw=await request.text();if(raw.length>3000000)throw Error('요청 용량이 너무 큽니다.');const body=JSON.parse(raw||'{}');
 if(path==='/crm-sheets/disconnect'){await q(env,`DELETE FROM ${TABLE} WHERE uid=?`,[uid]).run();return {ok:true};}
 const access=await token();
 if(path==='/crm-sheets/connect'){
  if(body.confirmed!==true)throw Error('연락처 동기화 승인이 필요합니다.');
  const id=String(body.sheetId||'');if(!/^[a-zA-Z0-9_-]{20,150}$/.test(id))throw Error('Google 시트 주소를 확인해 주세요.');
  const prior=await read();if(prior&&prior.sheet_id!==id)throw Error('기존 연결을 해제한 뒤 다른 시트를 연결해 주세요.');
  const base='https://sheets.googleapis.com/v4/spreadsheets/'+id;
  const meta=await api(access,base+'?fields=sheets.properties');let tab=meta.sheets?.find(s=>s.properties.title===TAB);
  if(!tab)await api(access,base+':batchUpdate',{method:'POST',body:JSON.stringify({requests:[{addSheet:{properties:{title:TAB,gridProperties:{rowCount:10001,columnCount:FIELDS.length,frozenRowCount:1}}}}]})});
  if(tab&&Number(tab.properties.gridProperties?.columnCount||0)<FIELDS.length)await api(access,base+':batchUpdate',{method:'POST',body:JSON.stringify({requests:[{updateSheetProperties:{properties:{sheetId:tab.properties.sheetId,gridProperties:{columnCount:FIELDS.length}},fields:'gridProperties.columnCount'}}]})});
  const values=await api(access,base+'/values/'+encodeURIComponent("'"+TAB+"'!A1:"+String.fromCharCode(64+Math.min(Math.max(Number(tab?.properties.gridProperties?.columnCount)||0,FIELDS.length),26))+"10001"));parseRows(values.values||[]);
  await q(env,`INSERT OR IGNORE INTO ${TABLE}(uid,sheet_id) VALUES(?,?)`,[uid,id]).run();return {ok:true,tab:TAB};
 }
 const config=await read();if(!config)throw Error('시트를 먼저 연결해 주세요.');
 const base='https://sheets.googleapis.com/v4/spreadsheets/'+config.sheet_id;
 const meta=await api(access,base+'?fields=sheets.properties');
 const columns=Number(meta.sheets?.find(s=>s.properties.title===TAB)?.properties.gridProperties?.columnCount)||FIELDS.length;
 const readColumn=String.fromCharCode(64+Math.min(Math.max(columns,FIELDS.length),26));
 const range=encodeURIComponent("'"+TAB+"'!A1:"+readColumn+"10001");
 const readSheet=async()=>{const data=await api(access,base+'/values/'+range);return data.values||[];};
 if(path==='/crm-sheets/prepare'){
  const crm=validate(body.contacts);const values=await readSheet();const merged=mergeContacts(crm,parseRows(values,crm),JSON.parse(config.baseline));
  if(merged.conflicts.length)return {ok:false,conflicts:merged.conflicts.slice(0,100)};
  const lease=crypto.randomUUID(),pending=JSON.stringify({rows:merged.rows,sheetHash:await hash(values)});
  const r=await q(env,`UPDATE ${TABLE} SET lease=?,lease_until=?,pending=? WHERE uid=? AND lease_until<?`,[lease,Date.now()+120000,pending,uid,Date.now()]).run();if(!r.meta.changes)throw Error('다른 화면에서 동기화 중입니다. 잠시 후 다시 시도해 주세요.');
  return {ok:true,lease,contacts:merged.rows};
 }
 if(path==='/crm-sheets/commit'){
  if(!body.lease||config.lease!==body.lease||config.lease_until<Date.now())throw Error('동기화 확인 시간이 지났습니다. 다시 동기화해 주세요.');
  const pending=JSON.parse(config.pending);const values=await readSheet();
  if(await hash(values)!==pending.sheetHash)throw Error('동기화 중 시트가 수정되었습니다. 다시 동기화해 주세요.');
  const removed=values[0]?.findIndex(h=>['문자답장','문자답장여부'].includes(String(h).trim()))??-1;
  if(removed>=0){const meta=await api(access,base+'?fields=sheets.properties');const sheet=meta.sheets?.find(s=>s.properties.title===TAB);if(sheet?.properties.sheetId!==undefined)await api(access,base+':batchUpdate',{method:'POST',body:JSON.stringify({requests:[{deleteDimension:{range:{sheetId:sheet.properties.sheetId,dimension:'COLUMNS',startIndex:removed,endIndex:removed+1}}}]})});}
  const rows=sheetValues(pending.rows,values);
  const writeColumn=String.fromCharCode(64+rows[0].length);
  await api(access,base+'/values/'+encodeURIComponent("'"+TAB+"'!A1:"+writeColumn+rows.length)+'?valueInputOption=RAW',{method:'PUT',body:JSON.stringify({values:rows})});
  await q(env,`UPDATE ${TABLE} SET baseline=?,pending=NULL,lease=NULL,lease_until=0,last_sync=? WHERE uid=? AND lease=?`,[JSON.stringify(pending.rows),Date.now(),uid,body.lease]).run();return {ok:true,count:pending.rows.length};
 }
 if(path==='/crm-sheets/release'){await q(env,`UPDATE ${TABLE} SET pending=NULL,lease=NULL,lease_until=0 WHERE uid=? AND lease=?`,[uid,String(body.lease||'')]).run();return {ok:true};}
 throw Error('지원하지 않는 요청입니다.');
}
