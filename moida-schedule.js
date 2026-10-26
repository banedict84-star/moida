import {createProjectUI} from './moida-schedule-projects.js?v=colors1';
import {googleEventPayload} from './schedule-projects.js';
import {applyTabler} from './moida-tabler.js?v=7';
import {createGoogleOverlay} from './moida-google-overlay.js?v=projects1';
import {createScheduleFeed} from './moida-schedule-feed.js?v=projects1';
import {koreaDay,shiftDay,monthGrid} from './google-schedule-dates.js';
import {categories,validateEvent} from './moida-schedule-model.js?v=3';
const $=id=>document.getElementById(id),form=$('form'),f=form.elements;
let M,selected=koreaDay(),view='month',events=[],editing=null,busy=false,ready=false,newId='',googleEvents=[];
const projects=createProjectUI({user:()=>M?.auth?.currentUser,canWrite,changed:()=>render(),onCalendar:id=>google.select(id)});
const google=createGoogleOverlay({mount:$('googleSources'),user:()=>M?.auth?.currentUser,onCalendars:list=>projects.calendars(list),apply:list=>{googleEvents=list;events=(M?.events||[]).concat(list);render();}});
const feed=createScheduleFeed({host:$('feed'),model:()=>M,canWrite,allEvents:()=>events.filter(e=>e.source!=='flow'&&!(M?.deletedEventIds||[]).includes(e.id)),events:filtered,category,openEditor,register:()=>openEditor(),changed:()=>{events=(M.events||[]).concat(googleEvents);render();}});
const visibleCategories=new Set(categories.map(c=>c[0]));
function node(tag,text,cls){const e=document.createElement(tag);if(text!=null)e.textContent=text;if(cls)e.className=cls;return e;}
function label(day,options){return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',...options}).format(new Date(day+'T12:00:00+09:00'));}
function category(e){return projects.style(e);}
function onDay(e,d){return e.date<=d&&(e.endDate||e.date)>=d;}
function own(){return M?.auth?.currentUser?.uid||'';}
function canWrite(){return ready&&!!M?.saveNativeSchedule&&!parent.MOIDA_READONLY;}
function filtered(){const q=$('search').value.trim().toLowerCase(),mine=document.querySelector('[name=scope]:checked').value==='mine';return events.filter(e=>e.source!=='flow'&&!(M?.deletedEventIds||[]).includes(e.id)&&projects.visible(e)&&(e.source==='google'||visibleCategories.has(e.category||'office'))&&(!mine||e.authorUid===own())&&(!q||[e.title,e._location,e.attendees,e._body].join(' ').toLowerCase().includes(q))).sort((a,b)=>(a.date+(a.time||'')).localeCompare(b.date+(b.time||'')));}
function forDay(d){return filtered().filter(e=>onDay(e,d));}
function time(e){return e.allDay||!e.time?'종일':e.time+(e.endTime?' – '+e.endTime:'');}
function eventButton(e){const b=node('button',null,'event');b.type='button';b.style.setProperty('--color',category(e)[2]);b.append(node('small',time(e)+' · '+category(e)[1]),node('strong',e.title),node('p',e._location||'장소 미등록'));if(e.attendees)b.append(node('p','참석 · '+e.attendees));if((e.endDate||e.date)!==e.date)b.append(node('p',e.date+' ~ '+e.endDate));b.onclick=()=>feed.open(e);return b;}
function renderDay(){const list=forDay(selected);$('weekday').textContent=label(selected,{weekday:'long'})+(selected===koreaDay()?' · 오늘':'');$('selectedDate').textContent=label(selected,{month:'long',day:'numeric'});$('dayCount').textContent=list.length+'건';$('dayEvents').replaceChildren(...list.map(eventButton));if(!list.length)$('dayEvents').append(node('p',ready?'등록된 일정이 없습니다.':'일정을 불러오는 중…','empty'));$('add').disabled=$('addDay').disabled=!canWrite();}
function weekDays(){const offset=new Date(selected+'T12:00:00Z').getUTCDay(),start=shiftDay(selected,-offset);return Array.from({length:7},(_,i)=>shiftDay(start,i));}
function render(){
 const days=view==='week'?weekDays():monthGrid(selected);$('period').textContent=view==='feed'?'일정 피드':label(selected,{year:'numeric',month:'long'});for(const id of ['prev','next','today'])$(id).hidden=view==='feed';$('calendar').hidden=view==='list'||view==='feed';$('list').hidden=view!=='list';$('feed').hidden=view!=='feed';document.querySelector('.workspace').classList.toggle('feed-mode',view==='feed');$('calendar').style.setProperty('--weeks',String(days.length/7));$('calendar').classList.toggle('week-mode',view==='week');$('calendar').replaceChildren();
 document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));
 if(view==='feed'){feed.render();}else if(view==='list'){
  $('list').replaceChildren();const month=selected.slice(0,7),last=shiftDay(monthGrid(selected).findLast(d=>d.slice(0,7)===month),0);const list=filtered().filter(e=>e.date<=last&&(e.endDate||e.date)>=month+'-01');let group='';for(const e of list){if(e.date!==group){group=e.date;$('list').append(node('h3',label(group,{month:'long',day:'numeric',weekday:'long'})));}$('list').append(eventButton(e));}if(!list.length)$('list').append(node('p','이번 달에 표시할 일정이 없습니다.','empty'));
 }else{
  for(const d of ['일','월','화','수','목','금','토'])$('calendar').append(node('div',d,'week-label'));
  days.forEach((d,i)=>{const list=forDay(d),b=node('button',null,'day');b.type='button';b.dataset.date=d;b.classList.toggle('selected',d===selected);b.classList.toggle('outside',d.slice(0,7)!==selected.slice(0,7));b.classList.toggle('today',d===koreaDay());b.classList.toggle('sunday',i%7===0);b.classList.toggle('saturday',i%7===6);b.setAttribute('aria-pressed',String(d===selected));b.setAttribute('aria-label',label(d,{month:'long',day:'numeric',weekday:'long'})+', 일정 '+list.length+'건');b.append(node('span',view==='week'?d.slice(5).replace('-','/') :String(Number(d.slice(8))),'number'));const max=view==='week'?12:3;for(const e of list.slice(0,max)){const c=node('span',(e.allDay||!e.time?'':e.time+' ')+e.title,'chip');c.style.setProperty('--color',category(e)[2]);b.append(c);}if(list.length>max)b.append(node('span','+'+(list.length-max)+'개 더','more'));b.onclick=()=>{selected=d;render();};b.ondblclick=()=>{selected=d;openEditor();};b.onkeydown=ev=>{const n={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[ev.key];if(n){ev.preventDefault();selected=shiftDay(d,n);render();$('calendar').querySelector('[data-date="'+selected+'"]')?.focus();}};$('calendar').append(b);});
 }
 $('count').textContent='전체 '+filtered().length+'건';if(view!=='feed')feed.refreshDetail();renderDay();applyTabler();if(ready){google.load(selected);projects.load();}
}
function setTypes(){for(const name of ['start','end']){const v=f[name].value;f[name].type=f.allDay.checked?'date':'datetime-local';f[name].value=f.allDay.checked?v.slice(0,10):v.slice(0,10)+'T'+(name==='start'?'09:00':'10:00');}}
function openEditor(e){
 if(busy)return;editing=e||null;newId=crypto.randomUUID();form.reset();$('formStatus').textContent='';$('conflict').textContent='';$('editorTitle').textContent=e?'일정 상세·수정':'일정 등록';f.title.value=e?.title||'';f.category.value=e?.category||'office';const p=e?projects.forEvent(e):projects.all().find(p=>projects.visible({projectId:p.id}));f.projectId.value=p?.id||'office';f.allDay.checked=!!e?.allDay||!!(e&&!e.time);f.start.type=f.end.type=f.allDay.checked?'date':'datetime-local';f.start.value=f.allDay.checked?e.date:(e?.date||selected)+'T'+(e?.time||'09:00');f.end.value=f.allDay.checked?(e.endDate||e.date):(e?.editEndDate||e?.endDate||e?.date||selected)+'T'+(e?.endTime||'10:00');f.location.value=e?._location||'';f.attendees.value=e?.attendees||'';f.body.value=e?._body||'';$('author').textContent=e?'등록 · '+(e.author||'의원실'):'모이다 의원실 캘린더에 저장됩니다.';$('remove').hidden=!e||!canWrite();$('remove').textContent='일정 삭제';$('remove').dataset.confirm='';$('save').hidden=!canWrite();for(const el of [...form.elements])if(['INPUT','SELECT','TEXTAREA'].includes(el.tagName))el.disabled=!canWrite();$('editor').showModal();
 f.projectId.disabled=!!e;const external=e?.source==='google',write=canWrite()&&(!external||projects.writable(e.calendarId));
 if(external){$('author').textContent='구글 · '+e.calendarName+' · 원본 일정에 저장됩니다.';if(!projects.forEvent(e)){const o=node('option',e.calendarName);o.value='external';f.projectId.append(o);f.projectId.value='external';}f.attendees.disabled=true;f.category.disabled=true;}
 else if(!e){const target=projects.find(f.projectId.value);$('author').textContent=target?.calendarId?'연결된 구글 캘린더에 저장됩니다.':'모이다 프로젝트에 저장됩니다.';}
 $('save').textContent=external||(!e&&projects.find(f.projectId.value)?.calendarId)?'구글 캘린더에 저장':'모이다에 저장';$('save').hidden=!write;$('remove').hidden=!e||!write;
 if(!write)for(const el of [...form.elements])if(['INPUT','SELECT','TEXTAREA'].includes(el.tagName))el.disabled=true;
}
function draft(){const allDay=f.allDay.checked;return {id:editing?.id||newId,title:f.title.value.trim(),projectId:f.projectId.value,category:f.category.value,allDay,date:f.start.value.slice(0,10),time:allDay?'':f.start.value.slice(11,16),endDate:f.end.value.slice(0,10),endTime:allDay?'':f.end.value.slice(11,16),_location:f.location.value.trim(),attendees:f.attendees.value.trim(),_body:f.body.value.trim()};}
async function googleWrite(method,calendarId,event){
 const u=M.auth.currentUser,uid=u.uid,token=await u.getIdToken();if(M.auth.currentUser?.uid!==uid)throw Error('계정이 변경되었습니다.');
 const params=new URLSearchParams({calendarId});if(method==='DELETE')params.set('id',event.id);
 const r=await fetch('https://moida-gpt.banedict84.workers.dev/google/calendar/events?'+params,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(method==='DELETE'?{}:{body:JSON.stringify(event)})});const data=await r.json();if(M.auth.currentUser?.uid!==uid)throw Error('계정이 변경되었습니다.');if(!r.ok)throw Error(data.error?.message||'구글 저장 실패');return data;
}
async function save(remove=false){if(busy||!canWrite())return;try{
 const e=remove?editing:validateEvent(draft()),project=projects.find(e.projectId),external=editing?.source==='google',target=external?editing.calendarId:!editing?project?.calendarId:'';
 if(!editing&&!project)throw Error('프로젝트를 선택해 주세요.');
 if(target&&!projects.writable(target))throw Error('이 구글 캘린더의 수정 권한을 확인해 주세요.');
 busy=true;for(const id of ['save','remove','cancel','close'])$(id).disabled=true;$('formStatus').textContent='저장 중…';
 if(target){await googleWrite(remove?'DELETE':editing?'PUT':'POST',target,remove?{id:editing.googleEventId}:{...googleEventPayload(e),...(editing?{id:editing.googleEventId}:{})});await google.select(target);}
 else await M.saveNativeSchedule(e,{remove,create:!editing});
 selected=e.date;$('editor').close();$('status').textContent=remove?'일정을 삭제했습니다.':target?'구글 캘린더에 저장했습니다.':'프로젝트에 저장했습니다.';events=(M.events||[]).concat(googleEvents);render();
 }catch(error){$('formStatus').textContent=error.message||'저장하지 못했습니다. 다시 시도해 주세요.';}finally{busy=false;for(const id of ['save','remove','cancel','close'])$(id).disabled=false;}
}
$('googleInline').onclick=()=>{google.showPicker();};
f.projectId.onchange=()=>{const p=projects.find(f.projectId.value);$('save').textContent=p?.calendarId?'구글 캘린더에 저장':'모이다에 저장';$('author').textContent=p?.calendarId?'이 프로젝트에 연결된 구글 캘린더에 저장됩니다.':'모이다 프로젝트에 저장됩니다.';};

for(const c of categories){const label=node('label'),input=document.createElement('input');input.type='checkbox';input.checked=true;input.onchange=()=>{if(input.checked)visibleCategories.add(c[0]);else visibleCategories.delete(c[0]);render();};const dot=node('i',null,'category-dot');dot.style.setProperty('--color',c[2]);label.append(input,dot,document.createTextNode(c[1]));$('categories').append(label);const option=node('option',c[1]);option.value=c[0];f.category.append(option);}
document.querySelectorAll('[name=scope]').forEach(e=>e.onchange=render);$('search').oninput=render;document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{view=b.dataset.view;render();});
function move(delta){if(view==='week')selected=shiftDay(selected,7*delta);else{const d=new Date(selected.slice(0,7)+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+delta);selected=d.toISOString().slice(0,10);}render();}
$('prev').onclick=()=>move(-1);$('next').onclick=()=>move(1);$('today').onclick=()=>{selected=koreaDay();render();};$('add').onclick=$('addDay').onclick=()=>openEditor();$('cancel').onclick=$('close').onclick=()=>{if(!busy)$('editor').close();};$('editor').addEventListener('cancel',e=>{if(busy)e.preventDefault();});f.allDay.onchange=setTypes;
form.onsubmit=e=>{e.preventDefault();save();};$('remove').onclick=()=>{if($('remove').dataset.confirm==='yes')save(true);else{$('remove').dataset.confirm='yes';$('remove').textContent='삭제 확인';$('formStatus').textContent='이 일정을 삭제하려면 ‘삭제 확인’을 눌러 주세요.';}};
form.oninput=()=>{if(!f.start.value||!f.end.value)return;const d=draft();const same=events.filter(e=>e.id!==editing?.id&&e.source!=='flow'&&e.date===d.date&&!e.allDay&&!d.allDay&&e.time<d.endTime&&(e.endTime||e.time)>d.time);$('conflict').textContent=same.length?'같은 시간대의 일정 '+same.length+'건이 있습니다.':'';};
document.querySelector('.views').append($('add'));
render();
function connect(){try{M=parent.MOIDA;}catch{}if(!M?.onData){$('status').textContent=parent===window?'모이다 AI비서실에서 일정을 열어 주세요.':'로그인 연결을 기다리는 중…';return false;}M.onData(()=>{events=(M.events||[]).concat(googleEvents);ready=!!M.saveNativeSchedule;$('status').textContent=ready?'의원실 일정 연결됨 · 모이다에 직접 저장': '로그인 연결을 확인하는 중…';render();});if(M.ready){events=(M.events||[]).concat(googleEvents);ready=!!M.saveNativeSchedule;render();}}
if(connect()===false){let attempts=0;const retry=setInterval(()=>{if(connect()!==false||++attempts>=120)clearInterval(retry);},500);window.addEventListener('pagehide',()=>clearInterval(retry),{once:true});}
