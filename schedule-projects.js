export const DEFAULT_PROJECTS = [
  {id:'office',name:'경기도의원 일정',color:'#3975d9',calendarId:''},
  {id:'classes',name:'굿엔레더 수업일정',color:'#259b87',calendarId:''},
];
export function validateProject(input,projects=[]){
  const p={id:String(input.id||''),name:String(input.name||'').trim(),color:String(input.color||''),calendarId:String(input.calendarId||'').trim()};
  if(!/^[a-zA-Z0-9_-]{1,80}$/.test(p.id)||!p.name||p.name.length>80||!/^#[0-9a-f]{6}$/i.test(p.color)||p.calendarId.length>300)throw Error('프로젝트 이름과 색상을 확인해 주세요.');
  if(projects.some(x=>x.id!==p.id&&x.name===p.name))throw Error('같은 이름의 프로젝트가 있습니다.');
  if(p.calendarId&&projects.some(x=>x.id!==p.id&&x.calendarId===p.calendarId))throw Error('이 구글 캘린더는 다른 프로젝트에 연결되어 있습니다.');
  return p;
}
export function projectForEvent(event,projects){
  return event.source==='google'?projects.find(p=>p.calendarId===event.calendarId):projects.find(p=>p.id===(event.projectId||'office'));
}
export function eventProjectStyle(event,projects){
  const p=projectForEvent(event,projects);
  return p?[p.id,p.name,p.color]:['google:'+event.calendarId,event.calendarName||'연결된 일정',/^#[0-9a-f]{6}$/i.test(event.calendarColor||'')?event.calendarColor:'#4285f4'];
}
export function googleEventPayload(event){
  const shift=day=>new Date(Date.parse(day+'T12:00:00Z')+86400000).toISOString().slice(0,10);
  return {title:event.title,description:event._body||'',location:event._location||'',allDay:event.allDay,start:event.allDay?event.date:event.date+'T'+event.time+':00+09:00',end:event.allDay?shift(event.endDate):event.endDate+'T'+event.endTime+':00+09:00'};
}
export async function scheduleProjectsRoute({env,uid,request,body={}}){
  const db=env.AGENT_DB;
  if(!db)throw Error('프로젝트 저장소 연결이 필요합니다.');
  await db.prepare('CREATE TABLE IF NOT EXISTS schedule_projects(uid TEXT NOT NULL,id TEXT NOT NULL,name TEXT NOT NULL,color TEXT NOT NULL,calendar_id TEXT NOT NULL DEFAULT \'\',PRIMARY KEY(uid,id))').run();
  const rows=await db.prepare('SELECT id,name,color,calendar_id FROM schedule_projects WHERE uid=?').bind(uid).all();
  let projects=DEFAULT_PROJECTS.map(p=>({...p}));
  for(const r of rows.results||[]){const p={id:r.id,name:r.name,color:r.color,calendarId:r.calendar_id};projects=projects.filter(x=>x.id!==p.id);projects.push(p);}
  if(request.method==='POST'){
    const p=validateProject(body,projects);
    if(projects.length>=100&&!projects.some(x=>x.id===p.id))throw Error('프로젝트는 최대 100개까지 만들 수 있습니다.');
    await db.prepare('INSERT INTO schedule_projects(uid,id,name,color,calendar_id) VALUES(?,?,?,?,?) ON CONFLICT(uid,id) DO UPDATE SET name=excluded.name,color=excluded.color,calendar_id=excluded.calendar_id').bind(uid,p.id,p.name,p.color,p.calendarId).run();
    projects=projects.filter(x=>x.id!==p.id).concat(p);
  }else if(request.method!=='GET')throw Error('지원하지 않는 요청입니다.');
  return {ok:true,projects};
}
