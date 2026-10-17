import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {STAFF_ROLES,CORE_ROLES,assignmentPlan,staffRole,ALLOWED_AGENTS} from '../agent-core.js';
import {agentPolicy,DELEGATE_TOOL,agentInstructions} from '../secretary-core-agents.js';
import {SECRETARY_TOOLS} from '../secretary-tools.js';
test('기본 8명 외 CRM 담당자를 보존하고 전문 직원을 등록하고 실제 에이전트 배정에 연결한다',()=>{
 assert.equal(CORE_ROLES.length,8);assert.equal(STAFF_ROLES.length,2);const role=STAFF_ROLES[0];assert.equal(role.id,'crm_manager');assert.equal(role.person,'모음');assert(ALLOWED_AGENTS.has(role.id));assert(!ALLOWED_AGENTS.has('M021'));assert(DELEGATE_TOOL.parameters.properties.agent_id.enum.includes(role.id));assert.equal(assignmentPlan('명부 점검',[{agent:role.id,instruction:'중복 후보 확인'}])[0].agent,role.id);assert.equal(staffRole(role.id),role);assert.match(agentInstructions(role.id),/추정·점수화하지 않는다/);assert(readFileSync(new URL('../'+role.portrait,import.meta.url),'utf8').includes('<svg'));
 const policy=agentPolicy({tools:SECRETARY_TOOLS,signature:'test'},role.id);assert(policy.allowed.has('crm_contacts'));assert(!policy.allowed.has('add_contact'));assert(!policy.allowed.has('search_contacts'));
});
test('CRM 담당 조회는 전체 건수와 다음 페이지를 반환하고 민감·추가 항목을 노출하지 않는다',()=>{
 const ctx={};vm.createContext(ctx);vm.runInContext(readFileSync(new URL('../crm-contact-reader.js',import.meta.url),'utf8'),ctx);
 const members=Array.from({length:205},(_,i)=>({mid:'m'+i,name:'사람'+i,phone:'010-1234-'+String(i).padStart(4,'0'),addr:'안산',dong:'일동',rrn:'secret',photo:'private',vote:'private',type:'private',rec:'추천인',rec2:'둘',rec3:'셋'}));
 const first=ctx.MOIDA_CRM_CONTACTS(members,{});assert.equal(first.total,205);assert.equal(first.contacts.length,100);assert.equal(first.next_offset,100);const last=ctx.MOIDA_CRM_CONTACTS(members,{offset:200});assert.equal(last.contacts.length,5);assert.equal(last.next_offset,null);assert.equal(last.contacts[0].id,'m200');for(const field of ['rrn','photo','vote','type'])assert(!(field in first.contacts[0]));assert.equal(first.contacts[0].third_referrer,'셋');assert.equal(ctx.MOIDA_CRM_CONTACTS(members,{query:'01012340000'}).total,1);assert.throws(()=>ctx.MOIDA_CRM_CONTACTS(members,{limit:1000}),/범위/);
 const html=readFileSync(new URL('../platform.html',import.meta.url),'utf8');assert(html.includes("if(name==='crm_contacts')return window.MOIDA_CRM_CONTACTS"));assert(html.includes('crm-contact-reader.js?v=1'));
});
