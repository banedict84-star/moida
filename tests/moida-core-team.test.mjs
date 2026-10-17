import test from 'node:test';
import assert from 'node:assert/strict';
import {CORE_ROLES,STAFF_ROLES,assignmentPlan,selectTaskWorkers,staffRole} from '../agent-core.js';
import {teamTools} from '../agent-tools.js';
test('eight core characters preserve specialist identities and execute distinct assignments',()=>{
 assert.equal(CORE_ROLES.length,8);assert.equal(STAFF_ROLES.length,2);
 assert.equal(new Set(CORE_ROLES.map(r=>r.id)).size,8);
 for(const r of CORE_ROLES){assert(r.person&&r.description&&r.output&&r.requirements&&r.workMode);assert.equal(staffRole(r.id),r);assert.equal(selectTaskWorkers(r.id,'업무')[0][0],r.id);assert.equal(assignmentPlan('업무',[{agent:r.id,instruction:r.description}])[0].agent,r.id);}
 assert.equal(globalThis.MOIDA_CORE_SCORE(staffRole('core_dami'),'담이에게 녹음 요약을 부탁해'),100);
 assert.equal(globalThis.MOIDA_CORE_SCORE(staffRole('core_tick'),'일정과 마감 확인'),20);
 assert(teamTools('core_tick').some(t=>t.function.name==='office_calendar'));
 assert(!teamTools('core_bitna').some(t=>t.function.name==='office_calendar'));
 assert(!teamTools('core_semi').some(t=>t.function.name==='office_search_law'));
});
