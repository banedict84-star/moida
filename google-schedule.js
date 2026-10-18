import {koreaDay,shiftDay,monthGrid,eventOnDay,sortedEvents} from './google-schedule-dates.js';
const $=id=>document.getElementById(id),endpoint='https://moida-gpt.banedict84.workers.dev/google/calendar/events';
const form=$('form'),fields=form.elements;
let calendarId=$('calendarSelect').value,selected=koreaDay(),month=selected.slice(0,7)+'-01',events=[],busy=false,editing=null,generation=0,loading=true,loadError='',owner=null;
function user(){try{return parent.MOIDA?.auth?.currentUser;}catch{return null;}}
function localValue(value,allDay){if(allDay)return value.slice(0,10);return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(value)).replace(' ','T');}
function node(tag,text,className){const e=document.createElement(tag);e.textContent=text;if(className)e.className=className;return e;}
function dayLabel(key,options){return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',...options}).format(new Date(key+'T12:00:00+09:00'));}
function eventsFor(key){return sortedEvents(events.filter(e=>eventOnDay(e,key)));}
function timeLabel(e,key){if(e.allDay)return '종일';return koreaDay(e.start)<key?'이전 날부터 계속':localValue(e.start,false).slice(11);}
function emptyState(title,message){const empty=node('div','','empty');empty.append(node('span','□','empty-mark'),node('strong',title),node('span',message));return empty;}
function renderDay(){
 $('selectedDate').textContent=dayLabel(selected,{month:'long',day:'numeric'});$('selectedWeekday').textContent=dayLabel(selected,{weekday:'long'})+(selected===koreaDay()?' · 오늘':'');
 const list=eventsFor(selected);$('dayCount').textContent=loading?'…':loadError?'—':list.length+'건';$('events').replaceChildren();
 if(loading){$('events').append(emptyState('일정을 불러오고 있어요','잠시만 기다려 주세요.'));return;}
 if(loadError){$('events').append(emptyState('일정을 불러오지 못했어요','연결 상태를 확인하고 새로고침해 주세요.'));return;}
 if(!list.length)$('events').append(emptyState('등록된 일정이 없어요','새로운 일정을 추가해 보세요.'));
 for(const e of list){const row=node('article','','event'),edit=node('button','일정 확인 ↗');edit.type='button';edit.setAttribute('aria-label',(e.title||'제목 없는 일정')+' 확인·수정');edit.onclick=()=>openEditor(e);row.append(node('span',timeLabel(e,selected),'event-time'),node('h3',e.title||'제목 없는 일정'),node('p',e.location||'장소 미등록','event-place'),edit);$('events').append(row);}
}
function renderCalendar(focusKey){
 $('month').textContent=Number(month.slice(0,4))+'년 '+Number(month.slice(5,7))+'월';const today=koreaDay();$('calendar').replaceChildren();
 for(const [index,key] of monthGrid(month).entries()){
  const list=eventsFor(key),button=node('button','','day');button.type='button';button.dataset.date=key;
  button.classList.toggle('outside',key.slice(0,7)!==month.slice(0,7));button.classList.toggle('selected',key===selected);button.classList.toggle('is-today',key===today);button.classList.toggle('sunday',index%7===0);button.classList.toggle('saturday',index%7===6);
  button.setAttribute('aria-pressed',String(key===selected));if(key===today)button.setAttribute('aria-current','date');
  button.setAttribute('aria-label',dayLabel(key,{year:'numeric',month:'long',day:'numeric',weekday:'long'})+(loading?' 일정 확인 중':loadError?' 일정 확인 불가':', 일정 '+list.length+'건'));
  button.append(node('span',String(Number(key.slice(8))),'day-number'));
  const items=node('span','','day-items');for(const e of list.slice(0,3))items.append(node('span',(e.allDay?'':timeLabel(e,key)+' ')+(e.title||'제목 없는 일정'),'calendar-event'+(e.allDay?' all-day':'')));
  if(list.length>3)items.append(node('span','+'+(list.length-3)+'개 더','more'));button.append(items);if(list.length)button.append(node('span',list.length+'건','mobile-count'));
  button.onclick=()=>{selected=key;renderCalendar(key);renderDay();};
  button.onkeydown=event=>{const step={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[event.key];if(!step)return;event.preventDefault();selected=shiftDay(key,step);if(selected.slice(0,7)!==month.slice(0,7)){month=selected.slice(0,7)+'-01';load(selected);}else{renderCalendar(selected);renderDay();}};
  $('calendar').append(button);
 }
 if(focusKey)$('calendar').querySelector('[data-date="'+focusKey+'"]')?.focus({preventScroll:true});
}
async function api(method='GET',body,params={}){
 const u=user();if(!u)throw Error('모이다에 로그인한 뒤 다시 열어 주세요.');const target=calendarId,uid=u.uid,token=await u.getIdToken();if(user()?.uid!==uid)throw Error('로그인 계정이 변경되었습니다.');
 const r=await fetch(endpoint+'?'+new URLSearchParams({calendarId:target,...params}),{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();if(user()?.uid!==uid)throw Error('로그인 계정이 변경되었습니다.');if(!r.ok)throw Error(data.error?.message||'구글 캘린더 요청 실패');return data;
}
async function load(focusKey){
 const serial=++generation,days=monthGrid(month);loading=true;loadError='';events=[];$('status').textContent='Google 캘린더에서 불러오는 중…';$('status').classList.remove('error');$('refresh').disabled=true;renderCalendar(focusKey);renderDay();
 try{const data=await api('GET',null,{timeMin:days[0]+'T00:00:00+09:00',timeMax:shiftDay(days.at(-1),1)+'T00:00:00+09:00'});if(serial!==generation)return;events=(data.events||[]).filter(e=>e.status!=='cancelled'&&e.start);loading=false;renderCalendar(focusKey);renderDay();$('status').textContent='Google 연동 완료 · '+new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});}
 catch(e){if(serial!==generation)return;loading=false;loadError=e.message;renderCalendar();renderDay();$('status').textContent=e.message+' · 도구 연결에서 Google 연결과 캘린더 권한을 확인해 주세요.';$('status').classList.add('error');}
 finally{if(serial===generation)$('refresh').disabled=false;}
}
function types(){const all=fields.allDay.checked;fields.start.type=fields.end.type=all?'date':'datetime-local';$('endHint').textContent=all?'구글 종일 일정의 종료일은 마지막 행사일 다음 날입니다.':'종료 시각을 확인해 주세요.';}
function openEditor(e=null){editing=e;form.reset();fields.allDay.checked=!!e?.allDay;types();fields.title.value=e?.title||'';fields.location.value=e?.location||'';fields.description.value=e?.description||'';fields.start.value=e?localValue(e.start,e.allDay):selected+'T09:00';fields.end.value=e?localValue(e.end,e.allDay):selected+'T10:00';$('formTitle').textContent=e?'일정 확인·수정':'일정 등록';$('formStatus').textContent='';$('editor').showModal();}
fields.allDay.onchange=()=>{const start=fields.start.value,end=fields.end.value;types();if(!start||!end)return;fields.start.value=fields.allDay.checked?start.slice(0,10):start.slice(0,10)+'T09:00';fields.end.value=fields.allDay.checked?(end.slice(0,10)>start.slice(0,10)?end.slice(0,10):shiftDay(start.slice(0,10),1)):end.slice(0,10)+'T10:00';};
form.onsubmit=async event=>{
 event.preventDefault();if(busy)return;const allDay=fields.allDay.checked,start=fields.start.value,end=fields.end.value;if(!start||!end||end<=start){$('formStatus').textContent='종료는 시작 이후로 입력해 주세요.';return;}
 busy=true;for(const control of [$('save'),$('cancel'),$('closeEditor'),$('calendarSelect')])control.disabled=true;
 try{await api(editing?'PUT':'POST',{...(editing?{id:editing.id}:{}),title:fields.title.value.trim(),description:fields.description.value,location:fields.location.value,allDay,start:allDay?start:start+':00+09:00',end:allDay?end:end+':00+09:00'});$('editor').close();selected=start.slice(0,10);month=selected.slice(0,7)+'-01';await load();}
 catch(e){$('formStatus').textContent=e.message+' 입력 내용은 유지했습니다.';}
 finally{busy=false;for(const control of [$('save'),$('cancel'),$('closeEditor'),$('calendarSelect')])control.disabled=false;}
};
$('calendarSelect').onchange=()=>{calendarId=$('calendarSelect').value;$('editor').close();load();};$('editor').addEventListener('cancel',e=>{if(busy)e.preventDefault();});$('cancel').onclick=$('closeEditor').onclick=()=>$('editor').close();$('add').onclick=$('addDay').onclick=()=>openEditor();$('refresh').onclick=()=>load();
function moveMonth(amount){const [y,m]=month.split('-').map(Number);month=new Date(Date.UTC(y,m-1+amount,1,12)).toISOString().slice(0,10);selected=koreaDay().startsWith(month.slice(0,7))?koreaDay():month;load();}
$('prev').onclick=()=>moveMonth(-1);$('next').onclick=()=>moveMonth(1);$('today').onclick=()=>{selected=koreaDay();month=selected.slice(0,7)+'-01';load();};renderCalendar();renderDay();
setInterval(()=>{const uid=user()?.uid||'';if(uid!==owner){owner=uid;generation++;events=[];$('editor').close();if(uid)load();else{loading=false;loadError='로그인이 필요합니다.';$('status').textContent=loadError;renderCalendar();renderDay();}}},1000);
window.addEventListener('focus',()=>{if(user()&&!busy&&!loading&&!$('editor').open)load();});
