import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {handleSecretaryRoute,finalText} from '../secretary-agent.js';
import {SECRETARY_TOOLS} from '../secretary-tools.js';
import worker from '../gpt-worker.js';

function fixture(){
 const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../migrations/0004_secretary_sessions.sql',import.meta.url),'utf8'));
 const binding={
  prepare(sql){const prepared={bind(...args){return {
   async first(){return db.prepare(sql).get(...args)||null;},
   async all(){return {results:db.prepare(sql).all(...args)};},
   async run(){return {meta:{changes:db.prepare(sql).run(...args).changes}};}
  };}};return {...prepared,...prepared.bind()};},
  async batch(statements){db.exec('BEGIN');try{const rows=[];for(const stmt of statements)rows.push(await stmt.run());db.exec('COMMIT');return rows;}catch(e){db.exec('ROLLBACK');throw e;}}
 };
 const env={AGENT_DB:binding,OPENAI_API_KEY:'test-only',SECRETARY_MODEL:'gpt-6-luna'};
 const state={session:null,turns:[],actions:[],items:[],writes:[],lost:false,invalid:false};
 const fetcher=async(url,init)=>{
  const path=new URL(url).pathname,body=init.body?JSON.parse(init.body):null;
  assert.equal(init.headers['OpenAI-Beta'],'agents=v1');
  if(body){state.writes.push({path,body});if(state.lost)throw Error('network lost');if(state.invalid)return Response.json({}, {status:403});}
  if(path==='/v1/agents/sessions'&&body){state.session={id:'session_A',metadata:body.metadata};state.turns.push({id:'turn_A',session_id:'session_A',status:'in_progress'});return Response.json(state.session);}
  if(path.endsWith('/events')&&body){if(body.events[0].type==='agent.session.input.message')state.turns.push({id:'turn_B',session_id:'session_A',status:'in_progress'});else state.actions=[];return Response.json({ok:true});}
  if(path.endsWith('/turns'))return Response.json({data:state.turns,has_more:false});
  if(path.includes('/turns/'))return Response.json(state.turns.find(t=>path.endsWith(t.id)));
  if(path.endsWith('/items'))return Response.json({data:state.items,has_more:false});
  return Response.json({...state.session,required_actions:state.actions});
 };
 const route=(path,body={},uid='owner',method='POST',extra={})=>handleSecretaryRoute({env,user:{uid},path,method,body,query:new URLSearchParams(body),fetcher,...extra});
 const start=(id='request_A',input='오늘 일정 알려줘')=>route('/secretary/message',{thread_id:'chat_A',request_id:id,input});
 const poll=(id='request_A',uid='owner')=>route('/secretary/poll',{thread_id:'chat_A',request_id:id},uid,'GET');
 return{db,env,state,route,start,poll};
}

test('세션 생성과 후속 메시지는 같은 세션을 사용하며 다른 실행의 출력은 섞이지 않는다',async()=>{
 const f=fixture();await f.start();assert.equal(f.state.writes[0].body.agent.model,'gpt-6-luna');assert.equal(f.state.writes[0].body.environment.type,'none');
 f.state.turns[0].status='completed';f.state.items=[{turn_id:'turn_A',type:'message',role:'assistant',phase:'final_answer',content:[{type:'output_text',text:'오늘 일정 답변'}]},{turn_id:'turn_other',type:'message',role:'assistant',phase:'final_answer',content:[{type:'output_text',text:'다른 대화'}]}];
 assert.equal((await f.poll()).output_text,'오늘 일정 답변');
 await f.start('request_B','내일도 알려줘');assert.equal(f.state.writes[1].path,'/v1/agents/sessions/session_A/events');assert.equal(f.state.writes[1].body.events[0].type,'agent.session.input.message');
 f.state.turns[1].status='completed';f.state.items.push({turn_id:'turn_B',type:'message',role:'assistant',phase:'final_answer',content:[{type:'output_text',text:'내일 일정 답변'}]});
 assert.equal((await f.poll('request_B')).output_text,'내일 일정 답변');f.db.close();
});
test('기존 D1 연결로 새 대화 테이블을 생성하며 기존 테이블은 유지한다',async()=>{
 const f=fixture();f.db.exec('DROP TABLE secretary_sessions; DROP TABLE secretary_turns; DROP TABLE secretary_calls; CREATE TABLE original_records(value TEXT); INSERT INTO original_records VALUES(\'기존 자료\');');
 await f.start();assert.equal(f.db.prepare('SELECT value FROM original_records').get().value,'기존 자료');assert.equal((await f.poll()).status,'in_progress');f.db.close();
});
test('새 대화에 live 웹검색을 연결하며 기존 업무 도구를 유지한다',async()=>{
 const f=fixture();await f.start();const agent=f.state.writes[0].body.agent;
 assert.deepEqual(agent.tools.find(tool=>tool.type==='web_search'),{type:'web_search',mode:'live'});
 assert.ok(agent.tools.some(tool=>tool.name==='list_contacts'));
 assert.match(agent.instructions,/근거 URL/);f.db.close();
});
test('검색 없는 기존 대화는 과거 기록을 참고 자료로 이어받고 새 검색 세션을 만든다',async()=>{
 const f=fixture();await f.start();f.state.turns[0].status='completed';
 f.state.items=[{turn_id:'turn_A',type:'message',role:'assistant',phase:'final_answer',content:[{type:'output_text',text:'이전 의정활동 대화'}]}];
 await f.poll();delete f.state.session.metadata.moida_web_search;
 await f.start('request_B','최신 경기도당 공지를 웹에서 찾아줘');
 const creation=f.state.writes[1];assert.equal(creation.path,'/v1/agents/sessions');
 assert.match(creation.body.agent.instructions,/이전 의정활동 대화/);
 assert.equal(creation.body.metadata.moida_web_search,'toolkit-v2');
 assert.deepEqual(JSON.parse(f.db.prepare('SELECT baseline_json FROM secretary_turns WHERE request_id=?').get('request_B').baseline_json),[]);
 f.db.close();
});
test('기존 검색 없는 세션의 작업이 진행 중이면 전환하지 않는다',async()=>{
 const f=fixture();await f.start();f.state.turns[0].status='completed';
 f.state.items=[{turn_id:'turn_A',type:'message',role:'assistant',phase:'final_answer',content:[{type:'output_text',text:'완료'}]}];await f.poll();
 delete f.state.session.metadata.moida_web_search;f.state.session.status='in_progress';
 await assert.rejects(f.start('request_B','웹검색'),/이전 요청/);assert.equal(f.state.writes.length,1);f.db.close();
});
test('같은 요청 재전송은 세션을 복제하지 않고 다른 입력과 다음 요청은 차단한다',async()=>{
 const f=fixture();await f.start();await f.start();assert.equal(f.state.writes.length,1);
 await assert.rejects(f.start('request_A','다른 내용'),/다른 메시지/);await assert.rejects(f.start('request_B'),/이전 요청/);f.db.close();
});
test('접수 응답 유실은 새 세션 생성으로 재시도하지 않는다',async()=>{
 const f=fixture();f.state.lost=true;assert.equal((await f.start()).status,'submission_uncertain');await f.start();assert.equal(f.state.writes.length,1);assert.equal((await f.poll()).status,'submission_uncertain');f.db.close();
});
test('접근 거절은 완료로 보고하지 않고 실패 사유를 표시한다',async()=>{
 const f=fixture();f.state.invalid=true;const result=await f.start();assert.equal(result.status,'failed');assert.match(result.error,/403/);f.db.close();
});
test('다른 계정은 세션·도구·대화 결과를 읽을 수 없다',async()=>{
 const f=fixture();await f.start();assert.equal((await f.poll('request_A','another_owner')).status,'ready');
 await assert.rejects(f.route('/secretary/result',{thread_id:'chat_A',request_id:'request_A',call_id:'call_A',result:{}},'another_owner'),/대기 중인 도구/);f.db.close();
});
test('도구는 현재 실행의 대기 요청만 한 번 선점하고 결과를 정확한 turn_id에 전달한다',async()=>{
 const f=fixture();await f.start();f.state.actions=[{type:'function_call',turn_id:'turn_A',call_id:'call_A',name:'list_schedule',arguments:{date:'2026-10-06'}}];
 const pending=await f.poll();assert.equal(pending.actions[0].name,'list_schedule');
 const args={thread_id:'chat_A',request_id:'request_A',call_id:'call_A'};
 assert.equal((await f.route('/secretary/claim',args)).claimed,true);assert.equal((await f.route('/secretary/claim',args)).claimed,false);
 await f.route('/secretary/result',{...args,result:{ok:true,events:[]}});await f.route('/secretary/result',{...args,result:{ok:true,events:[]}});
 assert.equal(f.state.writes.length,2);assert.equal(f.state.writes[1].body.events[0].turn_id,'turn_A');assert.equal(f.state.writes[1].body.events[0].call_id,'call_A');f.db.close();
});
test('도구 요청 변경 또는 결과 전송 유실 시 업무를 재실행하지 않는다',async()=>{
 const f=fixture();await f.start();f.state.actions=[{type:'function_call',turn_id:'turn_A',call_id:'call_A',name:'add_contact',arguments:{name:'테스트'}}];await f.poll();
 const args={thread_id:'chat_A',request_id:'request_A',call_id:'call_A'};
 f.state.actions[0].arguments={name:'변경'};await assert.rejects(f.route('/secretary/claim',args),/변경/);f.state.actions[0].arguments={name:'테스트'};
 await f.route('/secretary/claim',args);f.state.lost=true;await assert.rejects(f.route('/secretary/result',{...args,result:{ok:true}}),/network lost/);
 assert.equal((await f.route('/secretary/claim',args)).claimed,false);assert.equal((await f.poll()).actions[0].status,'submission_uncertain');f.db.close();
});
test('완료 상태만으로 성공 처리하지 않고 최종 답변 누락을 실패로 보고한다',async()=>{
 const f=fixture();await f.start();f.state.turns[0].status='completed';assert.equal((await f.poll()).status,'failed');f.db.close();
 assert.equal(finalText([{turn_id:'turn_A',type:'message',role:'assistant',phase:'commentary',content:[{type:'output_text',text:'처리 중'}]}],'turn_A'),'');
});
test('기존 업무 도구와 담당자 배정·검수 보고 도구가 포함되며 인증 없는 접근은 거절한다',async()=>{
 assert.ok(SECRETARY_TOOLS.some(t=>t.name==='delegate_work'));assert.ok(SECRETARY_TOOLS.some(t=>t.name==='read_work_report'));
 assert.match(SECRETARY_TOOLS.find(t=>t.name==='add_event').description,/확인/);
 const response=await worker.fetch(new Request('https://worker.test/secretary/poll?thread_id=chat_A'),{});assert.equal(response.status,401);
 const html=readFileSync(new URL('../platform.html',import.meta.url),'utf8');
 for(const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)){if(!/src=|type="module"/.test(match[1]))new vm.Script(match[2]);}
});

test('브라우저가 도구를 한 번 실행하고 전달 실패 후 저장된 결과를 재사용한다',async()=>{
 const storage=new Map(),sandbox={localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},crypto:{randomUUID:()=> 'request_A'},setTimeout:fn=>fn()};
 vm.runInNewContext(readFileSync(new URL('../secretary-client.js',import.meta.url),'utf8'),sandbox);
 let executions=0,resultPosts=0,completed=false,started=false;
 const request=async(path)=>{
  if(path==='/secretary/message'){started=true;return{status:'requires_action',actions:[{call_id:'call_A',name:'list_schedule',arguments:{},status:'pending'}]};}
  if(path==='/secretary/claim')return{claimed:true};
  if(path==='/secretary/result'){resultPosts++;if(resultPosts===1)throw Error('response lost before acceptance');completed=true;return{ok:true};}
  return completed?{status:'completed',request_id:'request_A',output_text:'완료'}:started?{status:'requires_action',request_id:'request_A',actions:[{call_id:'call_A',name:'list_schedule',arguments:{},status:'executing'}]}:{status:'ready'};
 };
 const options={owner:()=> 'owner',request,status:()=>{},busy:()=>{},execute:async()=>{executions++;return{ok:true};}};
 const client=sandbox.createSecretaryClient(options);await assert.rejects(client.run('chat_A','일정 확인',''),/response lost/);
 const resumed=sandbox.createSecretaryClient(options);assert.equal(await resumed.run('chat_A','새 메시지',''),'완료');assert.equal(executions,1);assert.equal(resultPosts,2);
});
test('도구 선점 도중 계정이 바뀌면 새 계정 자료를 변경하지 않는다',async()=>{
 const storage=new Map(),sandbox={localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},crypto:{randomUUID:()=> 'request_A'},setTimeout:fn=>fn()};
 vm.runInNewContext(readFileSync(new URL('../secretary-client.js',import.meta.url),'utf8'),sandbox);
 let owner='owner',executions=0;
 const request=async path=>path==='/secretary/claim'?(owner='another_owner',{claimed:true}):path==='/secretary/message'?{status:'requires_action',actions:[{call_id:'call_A',name:'add_contact',arguments:{},status:'pending'}]}:{status:'ready'};
 const client=sandbox.createSecretaryClient({owner:()=>owner,request,status:()=>{},busy:()=>{},execute:async()=>{executions++;}});
 await assert.rejects(client.run('chat_A','연락처 등록',''),/계정이 변경/);assert.equal(executions,0);
});

test('진행 중 답변 미리보기는 현재 실행만 보여주고 완료 기록으로 저장하지 않는다',async()=>{
 const f=fixture();await f.start();f.state.items=[{turn_id:'turn_A',type:'message',role:'assistant',phase:'final_answer',content:[{type:'output_text',text:'안녕하세요'}]},{turn_id:'turn_old',type:'message',role:'assistant',phase:'final_answer',content:[{type:'output_text',text:'이전 답변'}]}];
 const state=await f.route('/secretary/poll',{thread_id:'chat_A',request_id:'request_A',preview:'1'},'owner','GET');
 assert.equal(state.status,'in_progress');assert.equal(state.partial_text,'안녕하세요');assert.equal(state.output_text,'');
 assert.equal(f.db.prepare('SELECT output_text FROM secretary_turns').get().output_text,null);
 assert.equal((await f.route('/secretary/poll',{thread_id:'chat_A',request_id:'request_A',preview:'1'},'another_owner','GET')).partial_text,undefined);f.db.close();
});

test('담당 배정은 인증된 현재 도구를 서버에서 한 번 실행하고 응답 유실 시 결과를 복구한다',async()=>{
 const f=fixture();await f.start();f.state.actions=[{type:'function_call',turn_id:'turn_A',call_id:'call_A',name:'delegate_work',arguments:{instruction:'민원 회신 초안'}}];await f.poll();
 let executions=0;const extra={executeWork:async(name,args,key,context)=>{executions++;assert.equal(name,'delegate_work');assert.equal(args.instruction,'민원 회신 초안');assert.equal(key,'secretary_call_A');assert.equal(context.today,'2026-10-06');return {ok:true,run_id:'run_A'};}};
 const body={thread_id:'chat_A',request_id:'request_A',call_id:'call_A',work_context:{today:'2026-10-06'}};
 const claimed=await f.route('/secretary/claim',body,'owner','POST',extra);assert.equal(claimed.result.run_id,'run_A');
 assert.equal((await f.route('/secretary/claim',body,'owner','POST',extra)).claimed,false);assert.equal(executions,1);
 const recovered=await f.poll();assert.equal(recovered.actions[0].result.run_id,'run_A');
 await assert.rejects(f.route('/secretary/claim',body,'another_owner','POST',extra),/대기 중인 도구/);assert.equal(executions,1);
 await f.route('/secretary/result',{...body,result:claimed.result});assert.equal((await f.poll()).actions.length,0);f.db.close();
});

test('일시적인 조회 오류만 재시도하고 메시지 접수는 반복하지 않는다',async()=>{
 const storage=new Map(),sandbox={localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},crypto:{randomUUID:()=> 'request_A'},setTimeout:fn=>fn()};
 vm.runInNewContext(readFileSync(new URL('../secretary-client.js',import.meta.url),'utf8'),sandbox);let posts=0,reads=0;
 const client=sandbox.createSecretaryClient({owner:()=> 'owner',status:()=>{},busy:()=>{},execute:async()=>{},request:async(path)=>{if(path==='/secretary/message'){posts++;return {status:'pending'};}if(!posts)return {status:'ready'};reads++;if(reads===1)throw Object.assign(Error('temporary'),{status:502});return {status:'completed',output_text:'완료'};}});
 assert.equal(await client.run('chat_A','민원 초안',''),'완료');assert.equal(posts,1);assert.equal(reads,2);
});
test('새 자료 도구는 서버에서 실행하고 브라우저가 바꾼 결과 대신 실제 저장 결과를 전달한다',async()=>{
 const f=fixture();await f.start();assert.ok(f.state.writes[0].body.agent.tools.some(t=>t.name==='create_document'));
 f.state.actions=[{type:'function_call',turn_id:'turn_A',call_id:'call_A',name:'create_document',arguments:{title:'보고서',content:'확인 내용'}}];await f.poll();let executions=0;
 const extra={executeWork:async()=>{executions++;return{ok:true,file_id:'real_file'};}},body={thread_id:'chat_A',request_id:'request_A',call_id:'call_A'};
 const claim=await f.route('/secretary/claim',body,'owner','POST',extra);assert.equal(claim.result.file_id,'real_file');
 assert.equal((await f.poll()).actions[0].result.file_id,'real_file');
 await f.route('/secretary/result',{...body,result:{ok:true,file_id:'forged_file'}});
 assert.equal(JSON.parse(f.state.writes.at(-1).body.events[0].output).file_id,'real_file');assert.equal(executions,1);f.db.close();
});
