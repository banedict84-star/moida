(function(){
 'use strict';
 var feed=document.getElementById('feedView'),main=document.querySelector('main.main'),members=document.querySelector('.parts');if(!feed||!main||!members)return;
 function el(tag,value,cls){var n=document.createElement(tag);if(value!=null)n.textContent=value;if(cls)n.className=cls;return n;}
 function icon(name){var i=el('img');i.src='assets/schedule/'+name+'.svg';i.alt='';return i;}
 function button(label,callback,cls,name){var b=el('button',null,cls);b.type='button';if(name)b.append(icon(name));b.append(el('span',label));b.onclick=callback;return b;}
 function key(e){return String(e.id||e.googleEventId||[e.title,e.date,e.time,e.created].join('|'));}
 function dateKey(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
 function humanDate(s){return new Intl.DateTimeFormat('ko-KR',{month:'long',day:'numeric',weekday:'long'}).format(new Date(s+'T12:00:00'));}
 var day=dateKey(new Date()),selected=null,showDetail=false,attendance={},owner='',saveKey='',loadedOwner='',loadingOwner='';
 var places=new Map(),placeQueue=[],activePlaces=0;
 function placeInfo(e){var direct=window.moidaSchedulePlace.read(e);if(direct)return {value:direct,state:'ready'};return places.get(account()+'|'+key(e))||{value:'',state:e.source==='flow'?'waiting':'ready'};}
 function placeLabel(e){var p=placeInfo(e);return p.value||(p.state==='error'?'장소 확인 실패':p.state==='waiting'||p.state==='loading'?'장소 확인 중…':'장소 미등록');}
 function loadPlaces(){while(activePlaces<3&&placeQueue.length){var task=placeQueue.shift();activePlaces++;Promise.resolve().then(function(task){return function(){return window._flowLoadDetail(task.event.id);};}(task)).then(function(task){return function(response){if(task.owner!==account())return;var location=window.moidaSchedulePlace.read(response.detail||{});places.set(task.cacheKey,{value:location,state:'ready'});if(location)task.event._location=location;};}(task)).catch(function(task){return function(){if(task.owner===account())places.set(task.cacheKey,{value:'',state:'error'});};}(task)).finally(function(task){return function(){activePlaces--;if(task.owner===account())refreshRows();loadPlaces();};}(task));}}
 function requestPlace(e,force){if(e.source!=='flow'||!window._flowLoadDetail||window.moidaSchedulePlace.read(e))return;var cacheKey=account()+'|'+key(e),cached=places.get(cacheKey);if(cached&&!force)return;places.set(cacheKey,{value:'',state:'loading'});placeQueue.push({event:e,cacheKey:cacheKey,owner:account()});loadPlaces();}
 function account(){try{var a=JSON.parse(sessionStorage.getItem('moida_auth_user')||'{}');return a.effectiveUid||a.uid||'';}catch(e){return '';}}
 function ensureOwner(){var uid=account();if(uid!==owner){owner=uid;saveKey='moida_schedule_attendance_'+uid;try{attendance=JSON.parse(localStorage.getItem(saveKey)||'{}');}catch(e){attendance={};}if(!attendance||Array.isArray(attendance)||typeof attendance!=='object')attendance={};loadedOwner='';}}
 ensureOwner();main.classList.add('schedule-ui');main.dataset.view=document.querySelector('.vbtn.active')?.dataset.view||'feed';
 var head=main.querySelector('.page-head'),info=head.querySelector('.ph-info'),add=head.querySelector('.add-ev'),flow=document.getElementById('flowCalendarMount'),view=head.querySelector('.view-toggle'),birthday=head.querySelector('.birthday-toggle');
 info.querySelector('h1').textContent='일정·행사';add.replaceChildren(icon('plus'),el('span','일정 등록'));head.replaceChildren(info,add);head.after(flow);
 var dateBar=el('div',null,'schedule-date-bar'),dateLeft=el('div',null,'schedule-date-left'),dateTitle=el('h2',null,'schedule-date-title'),summary=el('span',null,'schedule-summary');
 var prev=button('‹',function(){changeDay(-1);},'schedule-day-nav'),next=button('›',function(){changeDay(1);},'schedule-day-nav'),today=button('오늘',function(){day=dateKey(new Date());refreshRows();},'schedule-today');prev.setAttribute('aria-label','이전 날짜');next.setAttribute('aria-label','다음 날짜');
 dateLeft.append(dateTitle,prev,next,today,summary);dateBar.append(dateLeft,view);flow.after(dateBar);
 view.querySelector('[data-view=feed]').replaceChildren(el('span','목록'));view.querySelector('[data-view=cal]').replaceChildren(el('span','달력'));
 var manage=el('details',null,'schedule-manage');manage.append(el('summary','연결 관리'));flow.after(manage);manage.append(birthday,button('의원실 멤버 보기',function(){members.hidden=!members.hidden;}));members.hidden=true;
 var tools=main.querySelector('.schedule-tools'),shell=el('section',null,'schedule-list'),group=el('div',null,'schedule-list-heading'),footer=el('p',null,'schedule-list-footer');feed.before(shell);shell.append(tools,group,feed,footer);
 var search=document.getElementById('scheduleSearch');search.placeholder='제목 또는 장소 검색';search.setAttribute('aria-label','제목 또는 장소 검색');tools.querySelector('.schedule-search').firstChild.textContent='';
 var sort=document.getElementById('feedSort');sort.querySelector('option[value=date]').textContent='시간순';sort.value='date';sort.dispatchEvent(new Event('change'));var period=document.getElementById('schedulePeriod');
 var panel=el('aside',null,'schedule-selection');panel.setAttribute('aria-label','선택한 일정');members.before(panel);var mobileActions=el('div',null,'schedule-mobile-actions');shell.after(mobileActions);
 var announcement=el('p',null,'schedule-announcement');announcement.setAttribute('role','status');panel.after(announcement);
 async function saveAttendance(value){ensureOwner();if(!selected)return;var id=key(selected._ev),uid=owner;if(!uid||!window._saveScheduleAttendance){announcement.textContent='로그인 연결을 확인한 뒤 다시 선택해 주세요.';return;}
  var updated=Object.assign({},attendance);if(value==='undecided')delete updated[id];else updated[id]=value;
  panel.querySelectorAll('button,select').forEach(function(b){b.disabled=true;});mobileActions.querySelectorAll('button').forEach(function(b){b.disabled=true;});
  try{await window._saveScheduleAttendance(uid,updated);if(uid!==account())return;attendance=updated;localStorage.setItem(saveKey,JSON.stringify(attendance));announcement.textContent='모이다 참석 표시를 저장했습니다.';}catch(e){announcement.textContent=e.message||'참석 표시를 저장하지 못했습니다.';}renderSelection();
 }
 function openDetail(edit){if(!selected)return;showDetail=true;try{selected.click();if(edit){var b=document.querySelector('.evd [data-edit]');if(b&&!b.hidden)b.click();}}finally{showDetail=false;}}
 function routeLink(e,label){var a=el('a',null,'selection-route');a.href='https://map.kakao.com/link/search/'+encodeURIComponent(placeInfo(e).value);a.target='_blank';a.rel='noopener noreferrer';a.append(icon('route'),el('span',label));return a;}
 function noPlace(e){var b=button(placeLabel(e),function(){},'selection-route','route');b.disabled=true;return b;}
 function renderSelection(){ensureOwner();panel.replaceChildren();mobileActions.replaceChildren();var e=selected?selected._ev:null;
  if(!e){panel.append(el('p','선택한 일정','selection-label'),el('h2','일정을 선택하세요'),el('p','목록에서 일정을 선택하면 장소와 참석 여부를 확인할 수 있습니다.','selection-note'));mobileActions.hidden=true;return;}mobileActions.hidden=false;
  var state=attendance[key(e)]||'undecided',place=placeInfo(e).value;panel.append(el('p','선택한 일정','selection-label'),el('h2',e.title||'일정'),el('p',humanDate(e.date)+' · '+(e.time||'종일'),'selection-time'),el('p','장소','selection-label'),el('p',place||placeLabel(e),'selection-place'));
  if(placeInfo(e).state==='error')panel.append(button('장소 다시 확인',function(){requestPlace(e,true);renderSelection();},'selection-edit'));
  panel.append(el('p','참석 여부','selection-label'));
  var choose=el('select',null,'selection-attendance');choose.setAttribute('aria-label','참석 여부');[['undecided','참석 미정'],['attending','참석'],['absent','불참']].forEach(function(p){var o=el('option',p[1]);o.value=p[0];choose.append(o);});choose.value=state;choose.onchange=function(){saveAttendance(choose.value);};
  panel.append(choose,el('p','일정 알림','selection-label'),el('p','시작 30분 전 현재 위치 기준\n이동 정보를 확인하세요.','selection-note'));
  var actions=el('div',null,'selection-actions');actions.append(place?routeLink(e,'길찾기'):noPlace(e),button(state==='attending'?'참석 선택됨':'이 일정 참석하기',function(){saveAttendance('attending');},'selection-primary','check'));
  if(e.source==='flow'){var original=el('a',null,'selection-edit');original.append(icon('edit'),el('span','FLOW 원문 보기'));try{var u=new URL(e.sourceUrl);if(u.protocol==='https:'&&/(^|\.)flow\.team$/.test(u.hostname)){original.href=u.href;original.target='_blank';original.rel='noopener noreferrer';actions.append(original);}else actions.append(button('일정 상세 보기',function(){openDetail(false);},'selection-edit','edit'));}catch(err){actions.append(button('일정 상세 보기',function(){openDetail(false);},'selection-edit','edit'));}}
  else actions.append(button('일정 수정',function(){openDetail(true);},'selection-edit','edit'));
  panel.append(actions);mobileActions.append(button(state==='attending'?'참석 선택됨':'참석하기',function(){saveAttendance('attending');},'selection-primary','check'),place?routeLink(e,'길찾기'):noPlace(e));
 }
 function changeDay(delta){var d=new Date(day+'T12:00:00');d.setDate(d.getDate()+delta);day=dateKey(d);period.value='all';period.dispatchEvent(new Event('change'));refreshRows();}
 function refreshRows(){var rows=Array.from(feed.querySelectorAll('.ev')),visible=[];rows.forEach(function(row){var e=row._ev;if(!e)return;var ok=period.value!=='all'||(e.date<=day&&(e.endDate||e.date)>=day);row.hidden=!ok;if(!ok)return;visible.push(row);requestPlace(e);var ico=row.querySelector('.ev-ico'),meta=row.querySelector('.ev-meta');if(ico&&ico.textContent!==(e.time||'종일'))ico.textContent=e.time||'종일';if(meta&&meta.textContent!==placeLabel(e))meta.textContent=placeLabel(e);if(!row.querySelector('.schedule-row-arrow')){var arrow=el('span','›','schedule-row-arrow');arrow.setAttribute('aria-hidden','true');row.append(arrow);}});
  dateTitle.textContent=humanDate(day);summary.textContent='오늘 '+(document.getElementById('st-today')?.textContent||'0')+'건 · 이번 주 '+(document.getElementById('st-week')?.textContent||'0')+'건';group.textContent=(day===dateKey(new Date())?'오늘 일정':humanDate(day))+'  '+visible.length;
  var empty=shell.querySelector('.schedule-date-empty');if(!visible.length&&!feed.querySelector('.schedule-empty')){if(!empty){empty=el('p','이 날짜에 등록된 일정이 없습니다.','schedule-date-empty');feed.after(empty);}}else if(empty)empty.remove();
  if(selected){var id=key(selected._ev);selected=visible.find(function(r){return key(r._ev)===id;})||null;}if(!selected&&visible.length)selected=visible.find(function(r){return attendance[key(r._ev)]==='attending';})||visible[0];rows.forEach(function(r){r.classList.toggle('selected',r===selected);});
  var time=selected?selected._ev.time:'',count=time?visible.filter(function(r){return r._ev.time===time;}).length:0;footer.textContent=count>1?time+' 일정이 '+count+'건 있습니다. 참석할 일정을 선택해 주세요.':'목록에서 일정을 선택해 장소와 참석 여부를 확인하세요.';renderSelection();
 }
 feed.addEventListener('click',function(click){if(showDetail||click.target.closest('.ev-star'))return;var row=click.target.closest('.ev');if(!row||!row._ev)return;click.stopImmediatePropagation();selected=row;refreshRows();},true);
 view.querySelectorAll('button').forEach(function(b){b.addEventListener('click',function(){main.dataset.view=b.dataset.view;});});period.addEventListener('change',refreshRows);
 var queued=false;new MutationObserver(function(records){if(!records.some(function(r){return r.target===feed;}))return;if(queued)return;queued=true;queueMicrotask(function(){queued=false;refreshRows();});}).observe(feed,{childList:true});
 var compact=window.matchMedia('(max-width:700px)'),connectionControls=null;
 function adaptLayout(){
  var searchLabel=search.closest('label');
  if(compact.matches){dateBar.before(searchLabel);manage.append(prev,next,today,view,period,sort);if(connectionControls)manage.append(connectionControls.select,connectionControls.connect,connectionControls.sync);}
  else{tools.prepend(searchLabel);tools.append(period,sort);dateLeft.insertBefore(prev,summary);dateLeft.insertBefore(next,summary);dateLeft.insertBefore(today,summary);dateBar.append(view);if(connectionControls){connectionControls.right.prepend(connectionControls.select,connectionControls.connect,connectionControls.sync);}}
 }
 compact.addEventListener('change',adaptLayout);
 function arrangeFlow(){var box=flow.querySelector('.flow-calendar-bar');if(!box||box.dataset.designed)return;box.dataset.designed='true';var title=box.querySelector('strong'),status=box.querySelector('span'),select=box.querySelector('select'),buttons=Array.from(box.querySelectorAll('button')),left=el('div',null,'schedule-connection-state'),right=el('div',null,'schedule-connection-actions');left.append(title,status);right.append(select,...buttons);box.append(left,right);
  buttons[1].replaceChildren(icon('refresh'),el('span','새로고침'));buttons[2].replaceChildren(icon('link'),el('span','연결 해제'));right.append(button('연결 관리',function(){manage.open=!manage.open;},'schedule-connection-manage','link'));manage.append(buttons[2]);
  select.classList.add('schedule-flow-project');connectionControls={select:select,connect:buttons[0],sync:buttons[1],right:right};adaptLayout();
  function state(){var s=select.hidden?'● FLOW 연결 안 됨':'● FLOW 연결됨';if(title.textContent!==s)title.textContent=s;}new MutationObserver(state).observe(select,{attributes:true,attributeFilter:['hidden']});state();
 }
 new MutationObserver(arrangeFlow).observe(flow,{childList:true,subtree:true});arrangeFlow();adaptLayout();refreshRows();
 async function loadAttendance(){ensureOwner();if(!owner||loadedOwner===owner||loadingOwner===owner||!window._fsLoad||!window._flowAuth?.currentUser)return;var uid=owner;loadingOwner=uid;try{var saved=await window._fsLoad(uid,'scheduleAttendance');if(uid===account()){attendance=saved&&typeof saved==='object'&&!Array.isArray(saved)?saved:attendance;loadedOwner=uid;try{localStorage.setItem(saveKey,JSON.stringify(attendance));}catch(e){}refreshRows();}}finally{loadingOwner='';}}
 var timer=setInterval(loadAttendance,1500);loadAttendance();window.addEventListener('pagehide',function(){clearInterval(timer);});
})();
