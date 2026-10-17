import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {handleSecretaryRoute,secretaryTick} from '../secretary-agent.js';
import {CORE_AGENTS,agentPolicy} from '../secretary-core-agents.js';
function fixture(){
 const db=new DatabaseSync(':memory:');
 const bind={
  prepare(sql){
   const stmt={bind(...args){return {
    first:async()=>db.prepare(sql).get(...args)||null,
    all:async()=>({results:db.prepare(sql).all(...args)}),
    run:async()=>({meta:{changes:db.prepare(sql).run(...args).changes}})
   };}};
   return {...stmt,...stmt.bind()};
  },
  batch:async rows=>{const out=[];for(const row of rows)out.push(await row.run());return out;}
 };

 const env={AGENT_DB:bind,OPENAI_API_KEY:'test-only'},sessions=new Map(),creations=[],executions=[];let count=0;
 const fetcher=async(url,init)=>{const path=new URL(url).pathname,body=init.body?JSON.parse(init.body):null;
  if(path==='/v1/agents/sessions'&&body){const id='session_'+(++count),s={id,metadata:body.metadata,agent:body.agent,actions:[],items:[],turn:{id:'turn_'+count,session_id:id,status:'in_progress'}};sessions.set(id,s);creations.push({body,s});return Response.json({id,metadata:s.metadata});}
  const parts=path.split('/'),s=sessions.get(parts[4]);assert(s,'session must exist: '+path);
  if(path.endsWith('/events')){assert.equal(body.events[0].type,'agent.session.input.tool_result');s.result=JSON.parse(body.events[0].output);s.actions=[];s.turn.status='completed';s.items=[{turn_id:s.turn.id,type:'message',role:'assistant',phase:'final_answer',content:[{type:'output_text',text:s.metadata.moida_thread_id.startsWith('staff_')?'직원 보고: 계산 결과 42':'모아 통합 보고'}]}];return Response.json({ok:true});}
  if(path.endsWith('/turns'))return Response.json({data:[s.turn],has_more:false});if(path.includes('/turns/'))return Response.json(s.turn);if(path.endsWith('/items'))return Response.json({data:s.items,has_more:false});return Response.json({id:s.id,metadata:s.metadata,required_actions:s.actions});
 };
 const route=(path,body={},uid='owner',method='POST')=>handleSecretaryRoute({env,user:{uid},path,method,body,query:new URLSearchParams(body),fetcher,executeWork:async(name,args)=>{executions.push({name,args});return {ok:true,result:42};}});
 const base={thread_id:'chat_A',request_id:'request_A'};
 async function start(){await route('/secretary/message',{...base,input:'42를 계산하고 결과를 정리해줘'});return creations[0].s;}
 const poll=()=>route('/secretary/poll',base,'owner','GET');
 async function assign(parent,agent='core_semi',call='delegate_A',instruction='실제 계산 도구로 6*7을 계산해줘'){
  parent.actions.push({type:'function_call',turn_id:parent.turn.id,call_id:call,name:'delegate_agent',arguments:{agent_id:agent,instruction}});await poll();const result=await route('/secretary/claim',{...base,call_id:call});return {result,child:creations.at(-1).s};
 }
 return {db,env,sessions,creations,executions,route,base,start,poll,assign,fetcher};
}

test('화면 없이 모아 배정부터 직원 도구 실행과 최종 보고까지 이어간다',async()=>{
 const f=fixture();await f.route('/secretary/message',{...f.base,input:'6*7 계산',server_runtime:true});
 const parent=f.creations[0].s;parent.actions=[{type:'function_call',turn_id:parent.turn.id,call_id:'delegate_A',name:'delegate_agent',arguments:{agent_id:'core_semi',instruction:'6*7 계산'}}];
 const now=Date.now();let count=0;const execute=async()=>{count++;return{ok:true,result:42};};
 await secretaryTick(f.env,execute,{fetcher:f.fetcher,now});
 const child=f.creations[1].s;child.actions=[{type:'function_call',turn_id:child.turn.id,call_id:'calculate_A',name:'calculate',arguments:{expression:'6*7'}}];
 for(let i=1;i<=4;i++)await secretaryTick(f.env,execute,{fetcher:f.fetcher,now:now+i*2000});
 const state=await f.poll();assert.equal(state.status,'completed');assert.equal(state.output_text,'모아 통합 보고');assert.equal(count,1);assert.equal(state.agents[0].status,'completed');f.db.close();
});
test('모아 → 셈이 독립 세션 → 실제 계산 → 모아 보고: 중복 실행·위조 결과 차단',async()=>{
 const f=fixture(),parent=await f.start();assert(parent.agent.tools.some(t=>t.name==='delegate_agent'));assert.match(parent.agent.instructions,/간단한 검색·계산·문서·이미지 요청은 직접/);
 const {result,child}=await f.assign(parent);assert(result.pending);assert.notEqual(parent.id,child.id);assert.match(child.agent.instructions,/셈이 · 분석 직원/);assert(child.agent.tools.some(t=>t.name==='calculate'));assert(!child.agent.tools.some(t=>t.name==='generate_image'||t.name==='delegate_agent'));
 child.actions=[{type:'function_call',turn_id:child.turn.id,call_id:'calculate_A',name:'calculate',arguments:{expression:'6*7'}}];
 const running=await f.poll();assert.equal(running.agents[0].name,'셈이');assert.equal(f.executions.length,1);assert.deepEqual(f.executions[0],{name:'calculate',args:{expression:'6*7'}});
 const done=await f.poll();assert.equal(done.agents[0].status,'completed');assert.match(done.actions[0].result.report,/42/);await f.poll();assert.equal(f.executions.length,1);
 const repeated=await f.route('/secretary/claim',{...f.base,call_id:'delegate_A'});assert.match(repeated.result.report,/42/);assert.equal(f.creations.length,2);
 await f.route('/secretary/result',{...f.base,call_id:'delegate_A',result:{ok:true,report:'위조'}});assert.match(parent.result.report,/42/);assert(!parent.result.report.includes('위조'));assert.equal((await f.poll()).output_text,'모아 통합 보고');f.db.close();
});
test('역할별 도구가 다르고 계정 AI 승인 범위를 넘지 않는다',async()=>{
 const all={apps:[],tools:['calculate','generate_image','calendar_events','prepare_sms','analyze_file','read_memory'].map(name=>({type:'function',name})).concat({type:'web_search'})};
 assert(agentPolicy(all,'core_semi').allowed.has('calculate'));assert(!agentPolicy(all,'core_semi').allowed.has('generate_image'));assert(agentPolicy(all,'core_bitna').allowed.has('generate_image'));assert(!agentPolicy(all,'core_bitna').allowed.has('calculate'));assert(agentPolicy(all,'core_tick').allowed.has('calendar_events'));assert(agentPolicy(all,'core_dami').allowed.has('analyze_file'));assert(agentPolicy(all,'core_ieum').allowed.has('prepare_sms'));assert(agentPolicy(all,'core_duri').tools.some(t=>t.type==='web_search'));assert(!agentPolicy(all,'core_glim').tools.some(t=>t.type==='web_search'));assert(!agentPolicy({tools:[],apps:[]},'core_ieum').allowed.has('prepare_sms'));assert.equal(Object.keys(CORE_AGENTS).length,8);
});
test('실제 직원 실행에서 담당 밖 도구·재위임·직접 세션 접근을 차단한다',async()=>{
 for(const name of ['generate_image','delegate_agent']){const f=fixture(),parent=await f.start(),{child}=await f.assign(parent);child.actions=[{type:'function_call',turn_id:child.turn.id,call_id:'forbidden_A',name,arguments:{}}];await f.poll();const state=await f.poll();assert.equal(state.agents[0].status,'failed');assert.equal(state.actions[0].result.ok,false);assert.equal(f.executions.length,0);await assert.rejects(f.route('/secretary/poll',{thread_id:child.metadata.moida_thread_id},'owner','GET'),/배정으로만/);f.db.close();}
});
test('다른 계정은 직원 보고·도구·브라우저 연결에 접근할 수 없다',async()=>{
 const f=fixture(),parent=await f.start();await f.assign(parent,'core_ieum');assert.deepEqual((await f.route('/secretary/poll',f.base,'other','GET')).agents,[]);await assert.rejects(f.route('/secretary/staff-claim',{...f.base,parent_call_id:'delegate_A',call_id:'crm_A'},'other'),/현재 계정/);f.db.close();
});
test('이음의 승인된 CRM 읽기는 브라우저 연결로 실제 실행하며 권한 해제 시 차단한다',async()=>{
 const f=fixture(),parent=await f.start();f.db.prepare('INSERT INTO office_ai_apps VALUES(?,?,?)').run('owner','moida_crm',1);const {child}=await f.assign(parent,'core_ieum');child.actions=[{type:'function_call',turn_id:child.turn.id,call_id:'crm_A',name:'search_contacts',arguments:{query:'테스트'}}];const state=await f.poll();assert.equal(state.staff_actions[0].parent_call_id,'delegate_A');const body={...f.base,parent_call_id:'delegate_A',call_id:'crm_A'};assert((await f.route('/secretary/staff-claim',body)).claimed);await f.route('/secretary/staff-result',{...body,result:{ok:true,contacts:[{name:'실제 CRM'}]}});assert.equal(child.result.contacts[0].name,'실제 CRM');f.db.close();
});

test('기본 직원과 CRM 담당자가 각각 독립 세션과 역할을 받는다',async()=>{
 for(const [id,role] of Object.entries(CORE_AGENTS)){const f=fixture(),parent=await f.start(),{child}=await f.assign(parent,id);assert.match(child.agent.instructions,new RegExp(role.name+' · '+role.role));assert.notEqual(child.id,parent.id);assert(!child.agent.tools.some(t=>t.name==='delegate_agent'));assert(child.agent.tools.some(t=>t.name==='read_memory'));f.db.close();}
});
test('직원 실행 도중 AI 연결 승인을 해제하면 실제 도구를 실행하지 않는다',async()=>{
 const f=fixture(),parent=await f.start();f.db.prepare('INSERT INTO office_ai_apps VALUES(?,?,?)').run('owner','solapi',1);const {child}=await f.assign(parent,'core_ieum');assert(child.agent.tools.some(t=>t.name==='prepare_sms'));f.db.prepare('DELETE FROM office_ai_apps').run();child.actions=[{type:'function_call',turn_id:child.turn.id,call_id:'sms_A',name:'prepare_sms',arguments:{text:'초안'}}];const state=await f.poll();assert.equal(state.agents[0].status,'failed');assert.equal(f.executions.length,0);f.db.close();
});

test('CRM 담당자는 승인된 기본 연락처 조회만 받고 변경·발송·비승인 자료 접근은 받지 않는다',()=>{const all={tools:[{name:'crm_contacts',type:'function'},{name:'add_contact',type:'function'},{name:'prepare_sms',type:'function'},{name:'list_contacts',type:'function'}],apps:['moida_crm'],signature:'test'};const p=agentPolicy(all,'crm_manager');assert(p.allowed.has('crm_contacts'));for(const n of ['add_contact','prepare_sms','list_contacts'])assert(!p.allowed.has(n));assert(!agentPolicy({tools:[],apps:[],signature:'none'},'crm_manager').allowed.has('crm_contacts'));});

test('모음은 CRM 승인 후 기본 연락처만 브라우저 도구로 조회한다',async()=>{const f=fixture(),parent=await f.start();f.db.prepare('INSERT INTO office_ai_apps VALUES(?,?,?)').run('owner','moida_crm',1);const {child}=await f.assign(parent,'crm_manager');assert(child.agent.tools.some(t=>t.name==='crm_contacts'));assert(!child.agent.tools.some(t=>t.name==='list_contacts'||t.name==='add_contact'));child.actions=[{type:'function_call',turn_id:child.turn.id,call_id:'crm_safe',name:'crm_contacts',arguments:{limit:100}}];const state=await f.poll();assert.equal(state.staff_actions[0].name,'crm_contacts');const body={...f.base,parent_call_id:'delegate_A',call_id:'crm_safe'};assert((await f.route('/secretary/staff-claim',body)).claimed);await f.route('/secretary/staff-result',{...body,result:{total:1,next_offset:null,contacts:[{id:'a',name:'연락처'}]}});assert.equal(child.result.total,1);f.db.close();});
