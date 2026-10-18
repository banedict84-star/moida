import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {randomBytes} from 'node:crypto';
import {crmStoreRoute,writePayload,readPayload,initChunks} from '../crm-chunks.js';
import {crmSheetsRoute} from '../crm-sheets.js';
import {FIELDS,HEADERS,validate,parseRows,mergeContacts} from '../crm-sheets-merge.js';
function database(){
 const db=new DatabaseSync(':memory:');
 const env={AGENT_DB:{prepare(sql){return {run:async()=>db.exec(sql),bind(...args){return {first:async()=>db.prepare(sql).get(...args),run:async()=>({meta:{changes:db.prepare(sql).run(...args).changes}})};}};}}};
 return {db,env};
}
const makeRows=()=>Array.from({length:50000},(_,i)=>({mid:'scale_'+i,name:'가상 연락처 '+i,phone:'010'+String(i).padStart(8,'0'),dong:'테스트동',addr:'가상시 테스트로 '+i,addrDetail:(i%120)+'층',org:'테스트 조직 '+(i%97),age:'40',family:'2',note:randomBytes(80).toString('hex')}));
function codec(){const ctx={TextEncoder,TextDecoder,Blob,Response,CompressionStream,DecompressionStream,btoa,atob,crypto};vm.createContext(ctx);vm.runInContext(readFileSync(new URL('../crm-storage.js',import.meta.url),'utf8'),ctx);return ctx.MOIDA_CRM_STORAGE;}
test('50,000 contacts use bounded immutable chunks and survive reload, edits, failed uploads and account switches',async t=>{
 const {db,env}=database(),storage=codec();let calls=0,fail=false;
 storage.configure(async(path,body,uid)=>{calls++;if(fail)throw Error('test upload failure');return crmStoreRoute({env,uid,request:new Request('https://worker'+path,{method:'POST',body:JSON.stringify(body)})});});
 const rows=makeRows(),start=performance.now(),encoded=await storage.encode(rows,{uid:'a'}),manifest=JSON.parse(encoded);assert.equal(manifest.count,50000);assert.equal(manifest.format,'moida-crm-remote-v1');assert(manifest.parts.length>1);assert(encoded.length<20000);assert.equal(db.prepare('SELECT MAX(length(payload)) AS n FROM crm_payload_chunks').get().n<=500000,true);
 assert.equal(JSON.stringify(await storage.decode(encoded,{uid:'a'})),JSON.stringify(rows));
 const beforeCalls=calls;await storage.encode(rows,{uid:'a'});assert.equal(calls,beforeCalls,'unchanged parts do not upload again');
 await storage.encode(rows,{uid:'b'});assert.equal(JSON.stringify(await storage.decode(encoded,{uid:'b'})),JSON.stringify(rows));await assert.rejects(storage.decode(encoded,{uid:'other'}),/찾지/);
 rows[49999].note='changed';fail=true;await assert.rejects(storage.encode(rows,{uid:'a'}),/upload failure/);fail=false;assert.notEqual((await storage.decode(encoded,{uid:'a'}))[49999].note,'changed');
 const changed=JSON.parse(await storage.encode(rows,{uid:'a'}));assert.equal(changed.parts.filter((id,i)=>id!==manifest.parts[i]).length,1);assert.equal((await storage.decode(JSON.stringify(changed),{uid:'a'}))[49999].note,'changed');
 const missing={...manifest,parts:[...manifest.parts]};missing.parts[0]='0'.repeat(64);await assert.rejects(storage.decode(JSON.stringify(missing),{uid:'a'}),/찾지/);
 assert.throws(()=>validate([...rows,rows[0]]),/50,000/);t.diagnostic('50k lossless roundtrip and fault checks: '+Math.round(performance.now()-start)+'ms; '+manifest.parts.length+' chunks; '+encoded.length+'-byte pointer');db.close();
});
test('large baseline/pending values never depend on one D1 field and old JSON remains readable',async()=>{const {db,env}=database();await initChunks(env);const value=Array.from({length:20000},(_,i)=>({id:i,text:randomBytes(80).toString('hex')}));const packed=await writePayload(env,'owner',value);assert(packed.length<500000);assert.deepEqual(await readPayload(env,'owner',packed),value);assert.deepEqual(await readPayload(env,'owner','[]'),[]);await assert.rejects(readPayload(env,'other',packed),/찾지/);db.close();});
test('50k Sheets sync splits writes, preserves reordered headers, checks conflicts, and skips unchanged blocks',async t=>{
 const {db,env}=database();let values=[],writes=0,maxWrite=0,grid=10001;
 const headers=[...HEADERS].reverse();let reads=0;
 const api=async(_token,url,init={})=>{if(url.includes('?fields='))return {sheets:[{properties:{sheetId:1,title:'모이다 CRM',gridProperties:{rowCount:grid,columnCount:18}}}]};if(url.endsWith(':batchUpdate')){for(const r of JSON.parse(init.body).requests)if(r.updateSheetProperties)grid=r.updateSheetProperties.properties.gridProperties.rowCount;return{};}
 const range=decodeURIComponent(url).match(/!A(\d+):[A-Z]+(\d+)/);assert(range);const start=Number(range[1])-1,end=Number(range[2]);if(init.method==='PUT'){const next=JSON.parse(init.body).values;writes++;maxWrite=Math.max(maxWrite,next.length);next.forEach((row,i)=>values[start+i]=row);return{};}reads++;const result=values.slice(start,end);while(result.length&&(!result.at(-1)||!result.at(-1).length))result.pop();return {values:result};};
 const call=(path,body,uid='owner')=>crmSheetsRoute({env,uid,api,token:async()=> 'test',request:new Request('https://worker/crm-sheets/'+path,{method:'POST',body:JSON.stringify(body)})});
 const rows=makeRows();values=[headers];await call('connect',{sheetId:'test_sheet_identifier_123456789',confirmed:true});
 // The browser uploads compressed parts rather than a multi-megabyte POST.
 const storage=codec();storage.configure((path,body,uid)=>crmStoreRoute({env,uid,request:new Request('https://worker'+path,{method:'POST',body:JSON.stringify(body)})}));
 const contactsPayload=await storage.encode(rows,{uid:'owner'}),start=performance.now();const plan=await call('prepare',{contactsPayload});assert(plan.ok);let result,rounds=0;do{result=await call('commit',{lease:plan.lease});assert(++rounds<100);}while(result.done===false);
 assert.equal(result.count,50000);assert.equal(values.length,50001);assert.deepEqual(values[0],headers);assert(grid>=50001);assert(maxWrite<=2500);assert(writes>1);assert.equal(parseRows(values).at(-1).name,rows.at(-1).name);
 const oldWrites=writes;const unchanged=await call('prepare',{contactsPayload});assert((await call('commit',{lease:unchanged.lease})).done);assert.equal(writes,oldWrites);
 const modified=rows.map(r=>({...r}));modified[49999].name='Changed';const next=await call('prepare',{contactsPayload:await storage.encode(modified,{uid:'owner'})});assert((await call('commit',{lease:next.lease})).done);assert.equal(writes,oldWrites+1);
 const conflict=await call('prepare',{contactsPayload:await storage.encode(modified,{uid:'owner'})});values[3][headers.indexOf('이름')]='Concurrent';await assert.rejects(call('commit',{lease:conflict.lease}),/시트가 수정/);await call('release',{lease:conflict.lease});
 assert.equal(mergeContacts(rows,parseRows([HEADERS,...rows.map(r=>FIELDS.map(k=>r[k]))],rows),[]).rows.length,50000);
 t.diagnostic('50k Sheet simulation: '+Math.round(performance.now()-start)+'ms; initial '+rounds+' requests; '+maxWrite+' rows/write; '+reads+' bounded reads');db.close();
});
