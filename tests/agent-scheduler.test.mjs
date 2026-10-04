import test from 'node:test';
import assert from 'node:assert/strict';
import {runTeamTasks} from '../agent-scheduler.js';
const task=(id,agent,dependencies=[])=>({id,agent,dependencies_json:JSON.stringify(dependencies)});
test('독립 팀은 동시에 시작하고 홍보·검증팀은 필요한 보고를 기다린다',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve),started=[];let reached;const both=new Promise(resolve=>reached=resolve);
 const execution=runTeamTasks([task('s','schedule'),task('p','policy'),task('pr','localpr'),task('v','verification')],async(t,prior)=>{
  started.push(t.id);if(started.length===2)reached();
  if(t.id==='s'||t.id==='p')await gate;
  if(t.id==='pr')assert.equal(prior,'s\n\np');
  if(t.id==='v')assert.equal(prior,'s\n\np\n\npr');
  return t.id;
 });
 await both;assert.deepEqual(started,['s','p']);release();assert.equal(await execution,'s\n\np\n\npr\n\nv');
});
test('선행 관계 오류는 실행 전에 중단한다',async()=>{
 let called=0;const execute=()=>{called++};
 await assert.rejects(runTeamTasks([task('a','schedule',['b']),task('b','policy',['a'])],execute),/순환/);
 await assert.rejects(runTeamTasks([task('a','schedule',['missing'])],execute),/선행/);assert.equal(called,0);
});
test('실패해도 진행 중인 동료 작업을 기다리며 후속 작업은 시작하지 않는다',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve),started=[];let reached;const both=new Promise(resolve=>reached=resolve);let settled=false;
 const job=runTeamTasks([task('a','schedule'),task('b','policy'),task('c','localpr')],async t=>{started.push(t.id);if(started.length===2)reached();if(t.id==='a')throw Error('fail');await gate;return t.id;});
 const observed=job.catch(error=>{settled=true;throw error});await both;await Promise.resolve();assert.equal(settled,false);release();await assert.rejects(observed,/fail/);assert.deepEqual(started,['a','b']);
});
