import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {DEFAULT_PROJECTS,validateProject,projectForEvent,eventProjectStyle,googleEventPayload,scheduleProjectsRoute} from '../schedule-projects.js';
import {updateSchedule} from '../moida-schedule-model.js';
test('projects preserve legacy schedules and separate new class schedules',()=>{
 assert.equal(projectForEvent({title:'old'},DEFAULT_PROJECTS).id,'office');
 assert.equal(projectForEvent({projectId:'classes'},DEFAULT_PROJECTS).id,'classes');
 const e={id:'1',title:'가죽 수업',category:'meeting',projectId:'classes',date:'2026-10-26',endDate:'2026-10-26',time:'09:00',endTime:'10:00'};
 assert.equal(updateSchedule({},e,{create:true,uid:'user'}).events[0].projectId,'classes');
});
test('linked Google schedules use project color, unlinked schedules retain Google color',()=>{
 const projects=[{id:'class',name:'수업',color:'#aabbcc',calendarId:'work'}];
 assert.deepEqual(eventProjectStyle({source:'google',calendarId:'work'},projects),['class','수업','#aabbcc']);
 assert.equal(eventProjectStyle({source:'google',calendarId:'other',calendarColor:'#112233'},projects)[2],'#112233');
 assert.throws(()=>validateProject({id:'other',name:'다른 수업',color:'#123456',calendarId:'work'},projects),/다른 프로젝트/);
 assert.throws(()=>validateProject({id:'bad',name:'수업',color:'url(x)'},projects));
});
test('inclusive all-day editor dates become Google exclusive end dates',()=>{
 const event={title:'수업',allDay:true,date:'2026-10-31',endDate:'2026-11-01'};
 assert.equal(googleEventPayload(event).end,'2026-11-02');
 assert.equal(googleEventPayload({...event,allDay:false,time:'09:00',endTime:'10:00'}).start,'2026-10-31T09:00:00+09:00');
});
test('projects persist per tenant and repeated save updates instead of duplicating',async()=>{
 const db=new DatabaseSync(':memory:');const env={AGENT_DB:{prepare(sql){const bind=(...args)=>({run:async()=>db.prepare(sql).run(...args),all:async()=>({results:db.prepare(sql).all(...args)})});return {...bind(),bind};}}};
 const read=uid=>scheduleProjectsRoute({env,uid,request:new Request('https://test/schedule/projects')});
 const write=body=>scheduleProjectsRoute({env,uid:'a',request:new Request('https://test/schedule/projects',{method:'POST'}),body});
 const body={id:'extra',name:'공방 수업',color:'#123456',calendarId:''};await write(body);await write({...body,color:'#abcdef'});
 assert.equal((await read('a')).projects.filter(p=>p.id==='extra').length,1);
 assert.equal((await read('a')).projects.find(p=>p.id==='extra').color,'#abcdef');
 assert.equal((await read('b')).projects.length,2);assert(!(await read('b')).projects.some(p=>p.id==='extra'));db.close();
});
