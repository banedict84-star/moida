import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {RETIRED_STAFF_ROLES as STAFF_ROLES,STAFF_ROLES as ACTIVE_STAFF_ROLES,CORE_ROLES,staffRole,assignmentPlan,selectTaskWorkers,ALLOWED_AGENTS} from '../agent-core.js';
import {workerPrompt,reviewTask} from '../gpt-worker.js';
import {teamTools,executeTeamTool} from '../agent-tools.js';

test('every employee has a distinct deployable WebP portrait',()=>{
 const hashes=new Set();
 for(const role of STAFF_ROLES){
  const bytes=readFileSync(new URL('../assets/staff/'+role.id+'.webp',import.meta.url));
  assert.equal(bytes.toString('ascii',0,4),'RIFF',role.id);
  assert.equal(bytes.toString('ascii',8,12),'WEBP',role.id);
  assert(bytes.length>1000&&bytes.length<100000,role.id+' portrait size');
  hashes.add(createHash('sha256').update(bytes).digest('hex'));
 }
 assert.equal(hashes.size,300);
});

test('retired employee identities remain readable for historical reports but cannot receive new assignments',()=>{
 assert.equal(ACTIVE_STAFF_ROLES.length,0);assert.equal(CORE_ROLES.length,8);
 assert.equal(STAFF_ROLES.length,300);
 assert.equal(new Set(STAFF_ROLES.map(r=>r.id)).size,300);
 const groups=new Map();
 for(const role of STAFF_ROLES){
  groups.set(role.group,(groups.get(role.group)||0)+1);
  assert(!ALLOWED_AGENTS.has(role.id));
  for(const field of ['person','name','description','output','requirements','approval','trigger','workMode'])assert(role[field]);
  assert.throws(()=>assignmentPlan('자료를 검토해 주세요',[{agent:role.id,instruction:role.description}]));
  const task={agent:role.id,title:role.person+' · '+role.name,instruction:role.description};
  assert(task.title.includes(role.person));
  const workers=selectTaskWorkers(role.id,task.instruction);assert.equal(workers.length,1);
  const prompt=workerPrompt({instruction:'자료를 검토해 주세요',context_json:'{}'},task,workers[0],'','');
  assert(prompt.system.includes(role.output));assert(prompt.system.includes(role.approval));
  assert.match(prompt.system,/자동 감시·예약 실행은 설정되지 않았다/);
  assert.match(prompt.system,/외부 발송·게시·결제·예약·DB 수정은 실행하지 않는다/);
 }
 assert.equal(groups.size,15);assert([...groups.values()].every(n=>n===20));
 assert(ALLOWED_AGENTS.has('records'));
});

test('multiple same-field employees stay separate and task limits reject invalid assignments',()=>{
 assert.throws(()=>assignmentPlan('업무',[{agent:'M021',instruction:'작업'}]));
 const plan=assignmentPlan('문서와 분석',[{agent:'core_glim',instruction:'문서 작성'},{agent:'core_semi',instruction:'표 분석'}]);
 assert.deepEqual(plan.map(t=>t.agent),['core_glim','core_semi']);
 assert.throws(()=>assignmentPlan('업무',[{agent:'M301',instruction:'작업'}]));
 assert.throws(()=>assignmentPlan('업무',Array.from({length:9},(_,i)=>({agent:STAFF_ROLES[i].id,instruction:'작업'}))));
 assert.throws(()=>assignmentPlan('업무',[{agent:'M021',instruction:'작업'},{agent:'M021',instruction:'작업'}]));
});

test('role tools remain read-only, with calendar and legal access restricted by role',async()=>{
 assert(teamTools('M008').some(t=>t.function.name==='office_calendar'));
 assert(!teamTools('M021').some(t=>t.function.name==='office_calendar'));
 assert(teamTools('M169').some(t=>t.function.name==='office_search_law'));
 assert(!teamTools('M202').some(t=>t.function.name==='office_search_law'));
 await assert.rejects(executeTeamTool({run:{tenant_id:'owner'},team:'M021',name:'office_calendar'}),/연결되지 않은/);
 const result=await executeTeamTool({run:{tenant_id:'owner',context_json:JSON.stringify({events:[{title:'수업'}],contacts:[{name:'private'}]})},team:'M008',name:'office_read_context'});
 assert.equal(result.events[0].title,'수업');assert.equal(result.contacts,undefined);
});

test('explicit IDs and names outrank general words without ID-prefix collisions',()=>{
 const score=globalThis.MOIDA_STAFF_ROLES.score;
 assert.equal(score(staffRole('M021'),'M021 견적 작성'),100);
 assert.notEqual(score(staffRole('M021'),'M0210'),100);
 assert(score(staffRole('M021'),'견적서 작성')>=80);
 assert(score(staffRole('M021'),staffRole('M021').person+'에게 업무')>=80);
});

test('new employees pass through the existing model review using their own contract',async()=>{
 const original=globalThis.fetch;let payload;
 globalThis.fetch=async(_url,options)=>{payload=JSON.parse(options.body);return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({approved:true,feedback:'자료를 확인했습니다.',finalResult:'입력한 품목과 수량을 반영했습니다. 단가는 추가 확인이 필요합니다.'})}}]});};
 try{
  const env={OPENAI_API_KEY:'test',AGENT_MODEL:'test',AGENT_DB:{prepare(){return{bind(){return this;},async run(){return{meta:{changes:1}};},async first(){return{tenant_id:'test'};}};}}};
  const result=await reviewTask(env,{id:'test',instruction:'견적 준비',context_json:'{"officeMode":"direct"}'},{agent:'M021',instruction:'견적서 준비'},'품목과 수량을 바탕으로 견적 문안을 작성했습니다.');
  assert(result.approved);assert.match(payload.messages[0].content,/견적서 PDF/);assert.match(payload.messages[0].content,/AI 비서실장 역할로 검토/);
 }finally{globalThis.fetch=original;}
});
