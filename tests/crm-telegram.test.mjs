import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {crmTelegramRoute,telegramCrmMessage} from '../crm-telegram.js';
function fixture(){
 const db=new DatabaseSync(':memory:');const env={AGENT_DB:{prepare(sql){return {bind(...a){return {run:async()=>({meta:{changes:db.prepare(sql).run(...a).changes}}),first:async()=>db.prepare(sql).get(...a),all:async()=>({results:db.prepare(sql).all(...a)})};}}}}};
 const api=(uid,path,body)=>crmTelegramRoute({env,uid,request:new Request('https://example.test/crm-telegram/'+path,{method:body?'POST':'GET',...(body?{body:JSON.stringify(body)}:{})})});
 let id=0;const msg=(user,text,update_id=++id)=>telegramCrmMessage(env,{user_id:user,text,update_id,created_at:Date.now()});
 return {db,env,api,msg};
}
test('pairing is single-use and contact notes stay tenant scoped, append-only and idempotent',async()=>{
 const f=fixture();try{
  await f.api('a','index',{contacts:[{id:'1',name:'홍길동',phone:'01012345678',rrn:'not stored',type:'not stored'}]});
  await f.api('b','index',{contacts:[{id:'1',name:'홍길동'}]});
  assert.equal((await f.msg('7','홍길동 메모: 전화')).includes('연결 코드'),true);
  const {code}=await f.api('a','code',{});assert.match(await f.msg('7','/CRM '+code),/연결 완료/);
  assert.match(await f.msg('8','/CRM '+code),/만료/);
  assert.match(await f.msg('7','홍길동 메모: 내일 전화',100),/저장했습니다/);
  await f.msg('7','홍길동 메모: 내일 전화',100);
  assert.equal((await f.api('a','notes?id=1')).notes.length,1);
  assert.equal((await f.api('b','notes?id=1')).notes.length,0);
  const stored=f.db.prepare('SELECT contacts FROM crm_tg_index WHERE uid=?').get('a').contacts;assert(!stored.includes('not stored'));assert(stored.includes('01012345678'));assert(stored.includes('5678'));
  await f.api('a','disconnect',{});assert.match(await f.msg('7','홍길동 메모: 다시'),/연결 코드/);
  assert.equal((await f.api('a','notes?id=1')).notes.length,1);
 }finally{f.db.close();}
});
test('duplicate names require selection; separate name/content, cancel and deleted contact are handled',async()=>{
 const f=fixture();try{
  await f.api('a','index',{contacts:[{id:'1',name:'김민수',phone:'1111'},{id:'2',name:'김민수',phone:'2222'},{id:'3',name:'홍길동'}]});
  await f.msg('7','/CRM '+(await f.api('a','code',{})).code);
  assert.match(await f.msg('7','김민수 메모: 일정 확인'),/동명이인/);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM crm_tg_notes').get().n,0);
  assert.match(await f.msg('7','3'),/목록에 있는 번호/);
  assert.match(await f.msg('7','2'),/저장/);
  assert.equal((await f.api('a','notes?id=2')).notes[0].text,'일정 확인');
  assert.match(await f.msg('7','홍길동'),/메모 내용을/);
  assert.match(await f.msg('7','다음 주 연락하기'),/저장/);
  assert.equal((await f.api('a','notes?id=3')).notes.length,1);
  await f.msg('7','홍길동');await f.msg('7','/취소');assert.equal(await f.msg('7','취소된 내용'),null);
  await f.msg('7','홍길동');await f.api('a','index',{contacts:[]});assert.match(await f.msg('7','없어진 사람'),/변경/);
  assert.match(await f.msg('7','없는사람 메모: 내용'),/찾지 못했습니다/);
 }finally{f.db.close();}
});
test('expired codes, expired selection and other account pairing do not reuse pending contact',async()=>{
 const f=fixture();try{
  const {code}=await f.api('a','code',{});f.db.exec('UPDATE crm_tg_codes SET expires=0');assert.match(await f.msg('7','/CRM '+code),/만료/);
  await f.api('a','index',{contacts:[{id:'1',name:'홍길동'}]});await f.msg('7','/CRM '+(await f.api('a','code',{})).code);await f.msg('7','홍길동');
  await f.msg('7','/CRM '+(await f.api('b','code',{})).code);assert.equal(await f.msg('7','연락 예정입니다'),null);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM crm_tg_notes').get().n,0);
  assert.match(await f.msg('7','/선택 1'),/만료/);
 }finally{f.db.close();}
});

test('contact lookup bypasses AI, supports natural requests, and never writes a lookup as a memo',async()=>{
 const f=fixture();try{
  await f.api('a','index',{contacts:[{id:'1',name:'홍길동',phone:'010-1234-5678',rrn:'secret',type:'secret'}]});
  assert.match(await f.msg('7','홍길동 연락처 알려줘'),/연결 코드/);
  await f.msg('7','/CRM '+(await f.api('a','code',{})).code);
  await f.msg('7','홍길동'); // lookup replaces an unfinished memo prompt
  for(const text of ['홍길동 연락처 알려줘','홍길동님 전화번호 알려주세요','/조회 홍길동','CRM 홍길동 조회','연락처 홍길동']){
   const result=await f.msg('7',text);assert.match(result,/010-1234-5678/);assert(!result.includes('secret'));assert.match(result,/CRM 동기화/);
  }
  assert.equal((await f.api('a','notes?id=1')).notes.length,0);
  assert.match(await f.msg('7','/조회 없는이름'),/찾지 못했습니다/);
  assert.match(await f.msg('7','홍길동 메모: 연락처 알려줘'),/저장/);
  assert.equal((await f.api('a','notes?id=1')).notes.length,1);
  await f.api('a','disconnect',{});assert.match(await f.msg('7','홍길동 연락처'),/연결 코드/);
 }finally{f.db.close();}
});
test('lookup selection reveals only chosen contact from paired CRM and legacy index asks to refresh',async()=>{
 const f=fixture();try{
  await f.api('a','index',{contacts:[{id:'1',name:'김민수',phone:'010-1111-1111'},{id:'2',name:'김민수',phone:'010-2222-2222'}]});
  await f.api('b','index',{contacts:[{id:'3',name:'김민수',phone:'010-3333-3333'}]});
  await f.msg('7','/CRM '+(await f.api('a','code',{})).code);
  const choices=await f.msg('7','김민수 연락처');assert.match(choices,/번호를 보내/);assert(!choices.includes('010-'));
  const result=await f.msg('7','2');assert.match(result,/010-2222-2222/);assert(!result.includes('3333'));
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM crm_tg_notes').get().n,0);
  f.db.prepare('UPDATE crm_tg_index SET contacts=? WHERE uid=?').run(JSON.stringify([{id:'1',name:'이전이름',last4:'1111'}]),'a');
  assert.match(await f.msg('7','이전이름 연락처'),/아직 동기화/);
 }finally{f.db.close();}
});
