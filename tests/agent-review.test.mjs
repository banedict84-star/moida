import test from 'node:test';import assert from 'node:assert/strict';
import worker,{reviewTask} from '../gpt-worker.js';
const original=globalThis.fetch;
test.afterEach(()=>globalThis.fetch=original);
const env={OPENAI_API_KEY:'test-placeholder',AGENT_MODEL:'test-model',AGENT_DB:{prepare(){return {bind(){return this},async run(){return {meta:{changes:1}}},async first(){return {tenant_id:'test'}}}}}};
const run={id:'run-test',instruction:'간담회 일정 확인',context_json:JSON.stringify({events:[{title:'주민 간담회',date:'2026-10-06'}]})};
const task={agent:'schedule',instruction:run.instruction};
test('팀장은 원자료와 초안을 대조하는 모델 응답으로 수정 결과를 반환한다',async()=>{
 let payload;
 globalThis.fetch=async(_url,options)=>{payload=JSON.parse(options.body);return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({approved:true,feedback:'임의 장소를 제거했습니다.',finalResult:'주민 간담회 날짜는 2026-10-06이며 장소는 확인 필요입니다.'})}}]})};
 const result=await reviewTask(env,run,task,'주민 간담회는 2026-10-06에 시청에서 개최됩니다.');
 assert.equal(payload.model,'test-model');assert.match(payload.messages[1].content,/2026-10-06/);assert.match(payload.messages[1].content,/시청/);assert.equal(result.approved,true);assert.doesNotMatch(result.finalResult,/시청/);
});
test('잘못된 팀장 응답은 승인 처리하지 않는다',async()=>{
 globalThis.fetch=async()=>Response.json({choices:[{finish_reason:'stop',message:{content:'{"approved":"yes"}'}}]});
 await assert.rejects(reviewTask(env,run,task,'충분히 긴 초안이라고 해서 검토 승인하지 않아야 합니다.'),/형식/);
});
test('서버의 모델과 실행 설정을 공개 상태 조회에서 확인한다',async()=>{
 const response=await worker.fetch(new Request('https://worker.example/health'),env);const data=await response.json();assert.equal(data.agentModel,'test-model');assert.equal(data.executionMode,'parallel-teams');assert.equal(data.leadReview,'model');
});
