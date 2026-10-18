import {koreaDay,shiftDay,monthGrid,eventOnDay,sortedEvents} from './google-schedule-dates.js';
const $=id=>document.getElementById(id),endpoint='https://moida-gpt.banedict84.workers.dev/google/calendar/';
const form=$('form'),fields=form.elements;
let calendars=[],chosen=new Set(),account='',selectionKey='',listGeneration=0,partialErrors=[],listBusy=false;
let selected=koreaDay(),month=selected.slice(0,7)+'-01',events=[],busy=false,editing=null,generation=0,loading=true,loadError='',owner=null;
function user(){try{return parent.MOIDA?.auth?.currentUser;}catch{return null;}}
function localValue(value,allDay){if(allDay)return value.slice(0,10);return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(value)).replace(' ','T');}
function node(tag,text,className){const e=document.createElement(tag);e.textContent=text;if(className)e.className=className;return e;}
function dayLabel(key,options){return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',...options}).format(new Date(key+'T12:00:00+09:00'));}
const palette=['#299fa5','#5e79c5','#bf7a35','#a269ab','#59965a','#cc717e'];
function writable(c){return ['owner','writer'].includes(c?.accessRole);}
function color(e){return e.calendarColor||'#299fa5';}
function syncAddButtons(){const enabled=calendars.some(c=>chosen.has(c.id)&&writable(c));$('add').disabled=$('addDay').disabled=!enabled;}
function remember(){try{localStorage.setItem(selectionKey,JSON.stringify([...chosen]));}catch{}}
function renderPicker(){
 $('calendarSummary').textContent=listBusy?'캘린더 불러오는 중…':'캘린더 선택 · '+chosen.size+'개';$('calendarChoices').replaceChildren();
 for(const c of calendars){const label=node('label','','calendar-option'),input=document.createElement('input');input.type='checkbox';input.value=c.id;input.checked=chosen.has(c.id);input.disabled=busy;input.setAttribute('aria-label',c.name);const dot=node('i','');dot.style.background=c.color;label.append(input,dot,node('span',c.name));if(!writable(c))label.append(node('small','읽기 전용'));input.onchange=()=>{if(input.checked)chosen.add(c.id);else chosen.delete(c.id);remember();renderPicker();load();};$('calendarChoices').append(label);}
 $('calendarAccount').textContent=account?'연결 계정 · '+account:'';$('allCalendars').disabled=listBusy||busy||!calendars.length;$('allCalendars').textContent=chosen.size===calendars.length&&calendars.length?'선택 해제':'전체 선택';syncAddButtons();
}
function eventsFor(key){return sortedEvents(events.filter(e=>eventOnDay(e,key)));}
function timeLabel(e,key){if(e.allDay)return '종일';return koreaDay(e.start)<key?'이전 날부터 계속':localValue(e.start,false).slice(11);}
function emptyState(title,message){const empty=node('div','','empty');empty.append(node('span','□','empty-mark'),node('strong',title),node('span',message));return empty;}
function renderDay(){
 $('selectedDate').textContent=dayLabel(selected,{month:'long',day:'numeric'});$('selectedWeekday').textContent=dayLabel(selected,{weekday:'long'})+(selected===koreaDay()?' · 오늘':'');
 const list=eventsFor(selected);$('dayCount').textContent=loading?'…':loadError?'—':list.length+'건'+(partialErrors.length?' +':'');$('events').replaceChildren();
 if(loading){$('events').append(emptyState('일정을 불러오고 있어요','잠시만 기다려 주세요.'));return;}
 if(loadError){$('events').append(emptyState('일정을 불러오지 못했어요','연결 상태를 확인하고 새로고침해 주세요.'));return;}
 if(!list.length)$('events').append(!chosen.size?emptyState('표시할 캘린더를 선택해 주세요','위에서 원하는 캘린더를 체크하세요.'):partialErrors.length?emptyState('일부 캘린더를 확인하지 못했어요','새로고침해서 다시 확인해 주세요.'):emptyState('등록된 일정이 없어요','새로운 일정을 추가해 보세요.'));
 for(const e of list){const row=node('article','','event'),edit=node('button','일정 확인 ↗');edit.type='button';if(!writable(calendars.find(c=>c.id===e.calendarId)))edit.textContent='일정 보기 ↗';edit.setAttribute('aria-label',(e.title||'제목 없는 일정')+' 확인·수정');edit.onclick=()=>openEditor(e);row.style.setProperty('--event-color',color(e));row.append(node('span',e.calendarName,'event-calendar'),node('span',timeLabel(e,selected),'event-time'),node('h3',e.title||'제목 없는 일정'),node('p',e.location||'장소 미등록','event-place'),edit);$('events').append(row);}
}
function renderCalendar(focusKey){
 $('month').textContent=Number(month.slice(0,4))+'년 '+Number(month.slice(5,7))+'월';const today=koreaDay();$('calendar').replaceChildren();$('calendar').style.setProperty('--weeks',monthGrid(month).length/7);
 for(const [index,key] of monthGrid(month).entries()){
  const list=eventsFor(key),button=node('button','','day');button.type='button';button.dataset.date=key;
  button.classList.toggle('outside',key.slice(0,7)!==month.slice(0,7));button.classList.toggle('selected',key===selected);button.classList.toggle('is-today',key===today);button.classList.toggle('sunday',index%7===0);button.classList.toggle('saturday',index%7===6);
  button.setAttribute('aria-pressed',String(key===selected));if(key===today)button.setAttribute('aria-current','date');
  button.setAttribute('aria-label',dayLabel(key,{year:'numeric',month:'long',day:'numeric',weekday:'long'})+(loading?' 일정 확인 중':loadError?' 일정 확인 불가':', 일정 '+list.length+'건'));
  button.append(node('span',String(Number(key.slice(8))),'day-number'));
  const items=node('span','','day-items');for(const e of list.slice(0,3)){const chip=node('span',(e.allDay?'':timeLabel(e,key)+' ')+(e.title||'제목 없는 일정'),'calendar-event'+(e.allDay?' all-day':''));chip.title=e.calendarName+' · '+(e.title||'제목 없는 일정');chip.style.setProperty('--event-color',color(e));items.append(chip);}
  if(list.length>3)items.append(node('span','+'+(list.length-3)+'개 더','more'));button.append(items);if(list.length)button.append(node('span',list.length+'건','mobile-count'));
  button.onclick=()=>{selected=key;renderCalendar(key);renderDay();};
  button.onkeydown=event=>{const step={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[event.key];if(!step)return;event.preventDefault();selected=shiftDay(key,step);if(selected.slice(0,7)!==month.slice(0,7)){month=selected.slice(0,7)+'-01';load(selected);}else{renderCalendar(selected);renderDay();}};
  $('calendar').append(button);
 }
 if(focusKey)$('calendar').querySelector('[data-date="'+focusKey+'"]')?.focus({preventScroll:true});
}
async function api(method='GET',body,params={},resource='events'){
 const u=user();if(!u)throw Error('모이다에 로그인한 뒤 다시 열어 주세요.');const uid=u.uid,token=await u.getIdToken();if(user()?.uid!==uid)throw Error('로그인 계정이 변경되었습니다.');
 const r=await fetch(endpoint+resource+'?'+new URLSearchParams(params),{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();if(user()?.uid!==uid)throw Error('로그인 계정이 변경되었습니다.');if(!r.ok)throw Error(data.error?.message||'구글 캘린더 요청 실패');return data;
}
async function loadCalendars(){
 const serial=++listGeneration,uid=user()?.uid;if(!uid)return;listBusy=true;generation++;loading=true;loadError='';events=[];partialErrors=[];renderPicker();renderCalendar();renderDay();$('refresh').disabled=true;
 try{const data=await api('GET',null,{},'list');if(serial!==listGeneration||user()?.uid!==uid)return;
  const oldKey=selectionKey;account=data.email||'';selectionKey='moida_calendar_selection_v1_'+uid+'_'+account;
  calendars=(data.calendars||[]).map((c,i)=>({...c,color:/^#[0-9a-f]{6}$/i.test(c.color||'')?c.color:palette[i%palette.length]}));
  let saved=null;try{const value=JSON.parse(localStorage.getItem(selectionKey));if(Array.isArray(value))saved=value;}catch{}
  const ids=saved|| (oldKey===selectionKey?[...chosen]:null);chosen=new Set(ids?ids.filter(id=>calendars.some(c=>c.id===id)):calendars.filter(c=>c.selected||c.primary).map(c=>c.id));if(!ids&&!chosen.size&&calendars.length)chosen.add(calendars[0].id);
  listBusy=false;renderPicker();await load();
 }catch(e){if(serial!==listGeneration||user()?.uid!==uid)return;listBusy=false;calendars=[];chosen.clear();account='';loading=false;loadError=e.message;renderPicker();renderCalendar();renderDay();$('status').textContent=e.message+' · 도구 연결에서 Google 연결을 확인해 주세요.';$('status').classList.add('error');$('refresh').disabled=false;}
}
async function load(focusKey){
 const serial=++generation,days=monthGrid(month),targets=calendars.filter(c=>chosen.has(c.id));loading=true;loadError='';partialErrors=[];events=[];$('status').textContent='선택한 캘린더에서 불러오는 중…';$('status').classList.remove('error');$('refresh').disabled=true;renderCalendar(focusKey);renderDay();
 const results=[];for(let i=0;i<targets.length;i+=4){const group=await Promise.allSettled(targets.slice(i,i+4).map(async c=>{const data=await api('GET',null,{calendarId:c.id,timeMin:days[0]+'T00:00:00+09:00',timeMax:shiftDay(days.at(-1),1)+'T00:00:00+09:00'});return (data.events||[]).filter(e=>e.status!=='cancelled'&&e.start).map(e=>({...e,calendarId:c.id,calendarName:c.name,calendarColor:c.color}));}));if(serial!==generation)return;results.push(...group);}
 if(serial!==generation)return;
 events=results.flatMap(r=>r.status==='fulfilled'?r.value:[]);partialErrors=results.flatMap((r,i)=>r.status==='rejected'?[targets[i].name]:[]);loading=false;
 if(targets.length&&partialErrors.length===targets.length)loadError='선택한 캘린더를 불러오지 못했습니다.';
 renderCalendar(focusKey);renderDay();$('status').textContent=partialErrors.length?'불러오기 실패: '+partialErrors.join(', ')+' · 새로고침해 주세요.':!targets.length?'표시할 캘린더를 선택해 주세요.':targets.length+'개 캘린더 연동 완료 · '+new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});$('status').classList.toggle('error',partialErrors.length>0);$('refresh').disabled=false;
}
function types(){const all=fields.allDay.checked;fields.start.type=fields.end.type=all?'date':'datetime-local';$('endHint').textContent=all?'구글 종일 일정의 종료일은 마지막 행사일 다음 날입니다.':'종료 시각을 확인해 주세요.';}
function openEditor(e=null){editing=e;form.reset();const available=e?calendars.filter(c=>c.id===e.calendarId):calendars.filter(c=>chosen.has(c.id)&&writable(c));if(!available.length)return;fields.calendar.replaceChildren();for(const c of available){const o=node('option',c.name);o.value=c.id;fields.calendar.append(o);}fields.calendar.disabled=!!e;const readOnly=e&&!writable(available[0]);$('save').disabled=!!readOnly;for(const el of [fields.title,fields.location,fields.description,fields.start,fields.end])el.readOnly=!!readOnly;fields.allDay.disabled=!!readOnly;fields.allDay.checked=!!e?.allDay;types();fields.title.value=e?.title||'';fields.location.value=e?.location||'';fields.description.value=e?.description||'';fields.start.value=e?localValue(e.start,e.allDay):selected+'T09:00';fields.end.value=e?localValue(e.end,e.allDay):selected+'T10:00';$('formTitle').textContent=e?(readOnly?'일정 보기':'일정 확인·수정'):'일정 등록';$('formStatus').textContent='';$('editor').showModal();}
fields.allDay.onchange=()=>{const start=fields.start.value,end=fields.end.value;types();if(!start||!end)return;fields.start.value=fields.allDay.checked?start.slice(0,10):start.slice(0,10)+'T09:00';fields.end.value=fields.allDay.checked?(end.slice(0,10)>start.slice(0,10)?end.slice(0,10):shiftDay(start.slice(0,10),1)):end.slice(0,10)+'T10:00';};
form.onsubmit=async event=>{
 event.preventDefault();if(busy||$('save').disabled)return;const target=editing?.calendarId||fields.calendar.value;if(!writable(calendars.find(c=>c.id===target))){$('formStatus').textContent='이 캘린더는 읽기 전용입니다.';return;}const allDay=fields.allDay.checked,start=fields.start.value,end=fields.end.value;if(!start||!end||end<=start){$('formStatus').textContent='종료는 시작 이후로 입력해 주세요.';return;}
 busy=true;for(const control of [$('save'),$('cancel'),$('closeEditor'),$('allCalendars')])control.disabled=true;
 try{await api(editing?'PUT':'POST',{...(editing?{id:editing.id}:{}),title:fields.title.value.trim(),description:fields.description.value,location:fields.location.value,allDay,start:allDay?start:start+':00+09:00',end:allDay?end:end+':00+09:00'},{calendarId:target});$('editor').close();selected=start.slice(0,10);month=selected.slice(0,7)+'-01';await load();}
 catch(e){$('formStatus').textContent=e.message+' 입력 내용은 유지했습니다.';}
 finally{busy=false;for(const control of [$('save'),$('cancel'),$('closeEditor'),$('allCalendars')])control.disabled=false;}
};
$('allCalendars').onclick=()=>{chosen=chosen.size===calendars.length?new Set():new Set(calendars.map(c=>c.id));remember();renderPicker();load();};document.addEventListener('click',e=>{if(!$('calendarPicker').contains(e.target))$('calendarPicker').open=false;});$('editor').addEventListener('cancel',e=>{if(busy)e.preventDefault();});$('cancel').onclick=$('closeEditor').onclick=()=>$('editor').close();$('add').onclick=$('addDay').onclick=()=>openEditor();$('refresh').onclick=()=>loadCalendars();
function moveMonth(amount){const [y,m]=month.split('-').map(Number);month=new Date(Date.UTC(y,m-1+amount,1,12)).toISOString().slice(0,10);selected=koreaDay().startsWith(month.slice(0,7))?koreaDay():month;load();}
$('prev').onclick=()=>moveMonth(-1);$('next').onclick=()=>moveMonth(1);$('today').onclick=()=>{selected=koreaDay();month=selected.slice(0,7)+'-01';load();};renderCalendar();renderDay();
setInterval(()=>{const uid=user()?.uid||'';if(uid!==owner){owner=uid;generation++;listGeneration++;listBusy=false;events=[];calendars=[];chosen.clear();account='';selectionKey='';partialErrors=[];renderPicker();$('editor').close();if(uid)loadCalendars();else{loading=false;loadError='로그인이 필요합니다.';$('status').textContent=loadError;renderCalendar();renderDay();}}},1000);
// Explicit refresh keeps calendar switching and day clicks from being interrupted by window focus changes.
