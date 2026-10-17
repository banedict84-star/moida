import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {normalizeWeeklyConfig,matchesWeeklyMail,weeklyEventsRoute} from '../weekly-events.js';
import {STAFF_ROLES,ALLOWED_AGENTS} from '../agent-core.js';
import {agentPolicy,agentInstructions} from '../secretary-core-agents.js';
import {FEATURE_TOOLS} from '../secretary-feature-tools.js';
const config={mailbox:'Office@naver.com',senders:['sender@korea.kr','sender@korea.kr'],keywords:['주간행사'],projectName:'행사 프로젝트'};
test('메일함과 발신자를 분리하고 동일 발신자는 하나로 저장하며 정확히 일치하는 메일만 허용',()=>{
 const c=normalizeWeeklyConfig(config);assert.equal(c.mailbox,'office@naver.com');assert.deepEqual(c.senders,['sender@korea.kr']);assert.equal(c.enabled,false);
 assert(matchesWeeklyMail(c,{from:'sender@korea.kr',subject:'이번 주간행사 안내'}));
 assert(!matchesWeeklyMail(c,{from:'sender@korea.kr.attacker.test',subject:'주간행사'}));
 assert(!matchesWeeklyMail(c,{from:c.mailbox,subject:'주간행사'}));
 assert(!matchesWeeklyMail(c,{from:'sender@korea.kr',subject:'기타'}));
 assert.throws(()=>normalizeWeeklyConfig({...config,enabled:true}),/자동 등록/);
 assert.throws(()=>normalizeWeeklyConfig({...config,senders:[]}),/발신자/);
});
test('담당 설정은 계정별 저장되며 연결 전 활성화·자동 수신으로 보고하지 않는다',async()=>{
 const db=new DatabaseSync(':memory:');const env={AGENT_DB:{prepare(sql){const bind=(...args)=>({run:async()=>db.prepare(sql).run(...args),first:async()=>db.prepare(sql).get(...args)||null});return {bind,...bind()};}}};
 const request=new Request('https://worker.test/weekly-events',{method:'POST'});
 const saved=await weeklyEventsRoute({env,uid:'owner',request,body:config});assert.equal(saved.status,'setup_required');assert(saved.checks.every(c=>c.ready===false));
 const other=await weeklyEventsRoute({env,uid:'other',request:new Request(request.url)});assert.equal(other.config,null);
 await assert.rejects(weeklyEventsRoute({env,uid:'owner',request,body:{...config,enabled:true}}),/켤 수 없습니다/);
 const again=await weeklyEventsRoute({env,uid:'owner',request:new Request(request.url)});assert.equal(again.config.enabled,false);db.close();
});
test('한주는 실제 직원 배정에 연결되고 상태 조회·첨부 분석·FLOW 범위만 사용한다',()=>{
 const role=STAFF_ROLES.find(r=>r.id==='weekly_events');assert.equal(role.person,'한주');assert(ALLOWED_AGENTS.has(role.id));
 const policy=agentPolicy({tools:FEATURE_TOOLS,signature:'test'},role.id);assert(policy.allowed.has('weekly_events_status'));assert(!policy.allowed.has('prepare_sms'));
 assert.match(agentInstructions(role.id),/연결 대기/);assert.match(agentInstructions(role.id),/추측하지/);
});
