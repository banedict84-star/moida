import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {HEADERS,FIELDS,project,parseRows,mergeContacts} from '../crm-sheets-merge.js';
import {crmSheetsRoute} from '../crm-sheets.js';
const contact={mid:'a',name:'Kim',phone:'01012345678',dong:'일동',addr:'안산',type:'일반',rec:''};
test('양방향 필드 병합과 충돌·삭제 보호, 비공개 필드 제외',()=>{
 const crm={...contact,name:'Lee',rrn:'secret',photo:'private'};const sheet={...contact,dong:'이동'};
 const merged=mergeContacts([crm],[sheet],[contact]);assert.equal(merged.conflicts.length,0);assert.equal(merged.rows[0].name,'Lee');assert.equal(merged.rows[0].dong,'이동');assert(!('rrn' in merged.rows[0]));
 assert.equal(mergeContacts([crm],[{...sheet,name:'Park'}],[contact]).conflicts[0].field,'이름');
 assert.equal(mergeContacts([], [contact], [contact]).conflicts[0].field,'삭제');
 assert.equal(mergeContacts([contact],[],[]).rows.length,1);
 assert.throws(()=>parseRows([HEADERS,['a','<img onerror=x>']]),/HTML/);
 assert.throws(()=>mergeContacts([contact,contact],[],[]),/중복/);
});
test('시트 신규 행 ID 생성과 전송 실패 후 재시도 중복 방지',()=>{
 const data=[HEADERS,['','New','01011112222']];const first=parseRows(data);assert.match(first[0].mid,/^s_/);const retry=parseRows(data,first);assert.equal(retry[0].mid,first[0].mid);
 assert.throws(()=>parseRows(data,[first[0],{...first[0],mid:'other'}]),/여러 개/);
 assert.throws(()=>parseRows([['변경된 열']] ),/열 제목/);
});
function fixture(){const db=new DatabaseSync(':memory:');const env={AGENT_DB:{prepare(sql){return {bind(...args){return {first:async()=>db.prepare(sql).get(...args),run:async()=>({meta:{changes:db.prepare(sql).run(...args).changes}})}},run:async()=>db.exec(sql)}}}};let values=[],writes=0,tab=false;
 const api=async(_token,url,init={})=>{if(url.includes('?fields='))return {sheets:tab?[{properties:{title:'모이다 CRM'}}]:[]};if(url.endsWith(':batchUpdate')){tab=true;return{};}if(init.method==='PUT'){values=JSON.parse(init.body).values;writes++;return{};}return {values};};
 const call=(path,body,uid='owner')=>crmSheetsRoute({env,uid,api,token:async()=> 'token',request:new Request('https://worker/crm-sheets/'+path,{method:body?'POST':'GET',...(body?{body:JSON.stringify(body)}:{})})});return {db,call,get values(){return values},set values(v){values=v},get writes(){return writes}};
}
test('연결·동기화·동시 실행 임대·타 계정 차단·연결 해제',async()=>{const f=fixture();const id='12sBAVyUdckXV-SreCZxireFpyd2HVMGF0wznc5dJ3V0';await assert.rejects(f.call('connect',{sheetId:id}),/승인/);await f.call('connect',{sheetId:id,confirmed:true});assert(!(await f.call('status',null,'other')).connected);
 const plan=await f.call('prepare',{contacts:[contact]});await assert.rejects(f.call('prepare',{contacts:[contact]}),/다른 화면/);await assert.rejects(f.call('commit',{lease:plan.lease},'other'),/먼저/);assert.equal(f.writes,0);await f.call('commit',{lease:plan.lease});assert.equal(f.writes,1);assert.deepEqual(f.values[0],HEADERS);assert.equal(f.values[1][2],'01012345678');
 f.values=[HEADERS,FIELDS.map(k=>k==='name'?'Sheet Edit':contact[k])];const next=await f.call('prepare',{contacts:[contact]});assert.equal(next.contacts[0].name,'Sheet Edit');f.values[1][1]='Concurrent';await assert.rejects(f.call('commit',{lease:next.lease}),/시트가 수정/);assert.equal(f.writes,1);await f.call('release',{lease:next.lease});await f.call('disconnect',{});assert(!(await f.call('status')).connected);assert.equal(f.values[1][1],'Concurrent');f.db.close();});
test('CRM 연결 UI는 클라우드 저장을 먼저 확인하고 연동 필드 외 자료를 유지한다',async()=>{
 const html=readFileSync(new URL('../members.html',import.meta.url),'utf8');const source=html.slice(html.indexOf('window._crmSheetBridge={'),html.indexOf('  var members = loadMembers();'));
 const original={...contact,rrn:'preserve',photo:'keep',orgs:[]};let saved;const ctx={window:{MOIDA_READONLY:false,_crmSheetUser:()=>({uid:'owner'}),_fsLoad:async()=>[original]},_membersCloudReady:true,_uid:'owner',_membersSaveChain:Promise.resolve(),_membersPendingSave:false,members:[original],searchWorker:null,recalcScores(){},renderRows(){},saveMembers:async()=>{saved=ctx.members;return true},dispMembers:[],searchResultIds:null};vm.createContext(ctx);vm.runInContext(source,ctx);const before=await ctx.window._crmSheetBridge.snapshot();await ctx.window._crmSheetBridge.apply(before,project([{...contact,name:'Changed'}]));assert.equal(saved[0].rrn,'preserve');assert.equal(saved[0].photo,'keep');assert.equal(saved[0].name,'Changed');await assert.rejects(ctx.window._crmSheetBridge.apply(before,project([contact])),/CRM이 변경/);
});

test('17개 열의 기존 7열 전환과 문자관리 상태 양방향 반영',async()=>{const row={...contact,rec2:'second',rec3:'third',katalk:'관리중',org:'office',age:'40',ageb:'40대',family:'2',sms:'관리중',addrDetail:'7층',krGrade:'3'};const old=[HEADERS.slice(0,7),FIELDS.slice(0,7).map(k=>row[k])];assert.equal(HEADERS.length,17);assert(!FIELDS.includes('smsReply'));assert.deepEqual(parseRows(old,[row])[0],project([row])[0]);const f=fixture();f.values=old;await f.call('connect',{sheetId:'12sBAVyUdckXV-SreCZxireFpyd2HVMGF0wznc5dJ3V0',confirmed:true});const plan=await f.call('prepare',{contacts:[row]});assert(plan.ok);await f.call('commit',{lease:plan.lease});f.values[1][FIELDS.indexOf('sms')]='미관리';const next=await f.call('prepare',{contacts:[{...row,family:'3'}]});assert(next.ok);assert.equal(next.contacts[0].sms,'미관리');assert.equal(next.contacts[0].family,'3');f.db.close();});
test('열 순서와 문자관리여부 제목을 유지하고 삭제된 문자답장 열을 다시 만들지 않는다',async()=>{const {sheetValues}=await import('../crm-sheets-merge.js');const headers=[...HEADERS].reverse();const row={...contact,sms:'관리중'};const values=[headers,headers.map(h=>row[FIELDS[HEADERS.indexOf(h)]])];assert.equal(parseRows(values)[0].sms,'관리중');assert.deepEqual(sheetValues(project([row]),values)[0],headers);const legacyHeaders=[...headers,'문자답장'];const legacy=[legacyHeaders,[...values[1],'3']];assert.equal(parseRows(legacy)[0].sms,'관리중');assert.deepEqual(sheetValues(project([row]),legacy)[0],headers);assert.throws(()=>parseRows([[...headers.slice(0,16),headers[0]]]),/중복/);});
test('주민번호 입력용 시트 열은 동기화로 지우지 않고 ID 기준으로 유지한다',async()=>{const {sheetValues}=await import('../crm-sheets-merge.js');const headers=[...HEADERS.slice(0,3),'주민번호',...HEADERS.slice(3)],row=project([contact])[0],cells=headers.map(h=>h==='주민번호'?'입력용 보존값':row[FIELDS[HEADERS.indexOf(h)]]),values=[headers,cells];const parsed=parseRows(values);assert(!('rrn' in parsed[0]));const output=sheetValues([project([{...contact,mid:'new'}])[0],row],values);assert.deepEqual(output[0],headers);assert.equal(output[1][3],'');assert.equal(output[2][3],'입력용 보존값');assert(!('rrn' in project([{...contact,rrn:'자동전송 금지'}])[0]));});
