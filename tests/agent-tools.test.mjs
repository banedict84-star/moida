import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {teamTools,executeTeamTool,runToolConversation} from '../agent-tools.js';
test('팀 도구는 담당 범위의 조회만 허용한다',async()=>{
 assert.ok(teamTools('policy').some(t=>t.function.name==='office_search_law'));
 assert.ok(!teamTools('organization').some(t=>t.function.name==='office_calendar'));
 assert.ok(!teamTools('schedule').some(t=>/send|create|update/.test(t.function.name)));
 await assert.rejects(executeTeamTool({run:{tenant_id:'owner'},team:'organization',name:'office_calendar'}),/연결되지/);
});
test('자료실 조회는 현재 작업의 계정만 읽고 큰 자료는 이어 읽게 한다',async()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE office_files(tenant_id TEXT,id TEXT,title TEXT,format TEXT,content TEXT,provider_file_id TEXT,source_url TEXT,created_at INTEGER)');
 db.prepare('INSERT INTO office_files VALUES(?,?,?,?,?,?,?,?)').run('owner','A','예산','txt','가'.repeat(13000),null,null,1);
 const env={AGENT_DB:{prepare(sql){
  return {bind(...args){return {
   async first(){return db.prepare(sql).get(...args)},
   async all(){return {results:db.prepare(sql).all(...args)}}
  };}};
 }}};
 const call=(uid,name,args)=>executeTeamTool({env,run:{tenant_id:uid},team:'audit',name,args});
 assert.equal((await call('owner','office_search_files',{})).files.length,1);
 assert.equal((await call('other','office_search_files',{})).files.length,0);
 await assert.rejects(call('other','office_read_file',{file_id:'A'}),/현재 계정/);
 assert.equal((await call('owner','office_read_file',{file_id:'A'})).next_offset,12000);
 db.close();
});
test('실제 도구 결과를 모델에 전달하고 실패를 성공으로 숨기지 않는다',async()=>{
 const tools=teamTools('policy');let count=0;
 const result=await runToolConversation({tools,messages:[],invoke:async history=>{
  if(count++===0)return{choices:[{finish_reason:'tool_calls',message:{role:'assistant',content:null,tool_calls:[{id:'callA',type:'function',function:{name:'office_search_law',arguments:'{"query":"교육"}'}}]}}]};
  assert.match(history.at(-1).content,/공식 조회 실패/);
  return{choices:[{finish_reason:'stop',message:{content:'법령 확인 필요'}}]};
 },execute:async()=>{throw Error('공식 조회 실패')}});
 assert.equal(result,'법령 확인 필요');
});
test('도구 반복 호출은 제한하고 마지막 응답에서는 도구를 해제한다',async()=>{
 let count=0;await assert.rejects(runToolConversation({tools:teamTools('policy'),messages:[],execute:async()=>({ok:true}),invoke:async(_history,tools)=>{
  count++;if(count===3)assert.equal(tools.length,0);
  return{choices:[{finish_reason:'tool_calls',message:{tool_calls:[{id:'A'+count,function:{name:'office_read_context',arguments:'{}'}}]}}]};
 }}),/완성되지/);assert.equal(count,3);
});
