(function(root){
 'use strict';
 root.createFlowCalendarClient=function(options){
  var currentEvents=[],owner='',busy=false,lastCheck=0,connected=false,projectId='',syncedAt=0,box=document.createElement('div');box.className='flow-calendar-bar';
  function el(tag,text){var e=document.createElement(tag);if(text)e.textContent=text;return e;}
  var title=el('strong','FLOW 일정'),status=el('span','연결 확인 중…'),select=el('select'),connect=el('button','FLOW 연결'),sync=el('button','새로고침'),disconnect=el('button','연결 해제');select.setAttribute('aria-label','가져올 FLOW 프로젝트');status.setAttribute('role','status');[connect,sync,disconnect].forEach(function(b){b.type='button';});box.append(title,status,select,connect,sync,disconnect);options.mount.append(box);
  function user(){return options.user();}
  function ensure(uid){if(!user()||user().uid!==uid)throw Error('로그인 계정이 변경되었습니다.');}
  async function api(path,body){var u=user();if(!u)throw Error('로그인이 필요합니다.');var uid=u.uid,token=await u.getIdToken();ensure(uid);var r=await fetch('https://moida-gpt.banedict84.workers.dev/flow/calendar/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});var data=await r.json();ensure(uid);if(!r.ok)throw Object.assign(Error(data.error&&data.error.message||'FLOW 연결 실패'),{status:r.status});return data;}
  function apply(events){ensure(owner);currentEvents=events||[];options.apply(currentEvents);try{localStorage.setItem('moida_flow_events_'+owner,JSON.stringify(events||[]));}catch(e){}}
  function controls(){connect.hidden=connected;sync.hidden=disconnect.hidden=select.hidden=!connected;[connect,sync,disconnect,select].forEach(function(b){b.disabled=busy;});}
  async function projects(){var data=await api('projects');select.replaceChildren();data.projects.forEach(function(p){var o=el('option',p.title);o.value=p.projectId;select.append(o);});if(projectId)select.value=projectId;else{var target=data.projects.find(function(p){return p.title==='경기도의원 일정';});select.value=target?target.projectId:'';}if(!select.value){var placeholder=el('option','프로젝트 선택');placeholder.value='';select.prepend(placeholder);select.value='';}}
  async function refresh(force){var u=user();if(!u)return;if(busy)return;if(owner===u.uid&&!force&&Date.now()-lastCheck<300000){options.apply(currentEvents);return;}busy=true;if(owner!==u.uid){owner=u.uid;lastCheck=0;projectId='';connected=false;select.replaceChildren();try{apply(JSON.parse(localStorage.getItem('moida_flow_events_'+owner)||'[]'));}catch(e){apply([]);}}
   controls();
   try{var data=await api('status');connected=data.connected;projectId=data.projectId;syncedAt=data.syncedAt||0;apply(data.events);if(!connected){status.textContent='FLOW 로그인으로 일정을 가져오세요.';return;}if(!select.options.length)await projects();
    if(force||!projectId||Date.now()-syncedAt>300000){if(!select.value){status.textContent='가져올 프로젝트를 선택해 주세요.';return;}status.textContent='최신 일정 가져오는 중…';data=await api('sync',{projectId:select.value});projectId=data.projectId;syncedAt=data.syncedAt;apply(data.events);}
    status.textContent=(data.projectName||'FLOW')+' · '+(data.events||[]).length+'건 · '+new Date(syncedAt).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})+' 확인';lastCheck=Date.now();
   }catch(e){if(e.status===409)connected=false;status.textContent=e.message;}finally{busy=false;controls();}}
  connect.onclick=async function(){if(busy)return;busy=true;controls();try{var data=await api('connect',{});root.top.location.href=data.authorizationUrl;}catch(e){status.textContent=e.message;busy=false;controls();}};
  sync.onclick=function(){refresh(true);};select.onchange=function(){refresh(true);};
  disconnect.onclick=async function(){if(busy)return;busy=true;controls();try{await api('disconnect',{});connected=false;projectId='';select.replaceChildren();apply([]);status.textContent='FLOW 연결을 해제했습니다.';}catch(e){if(e.status===409)connected=false;status.textContent=e.message;}finally{busy=false;controls();}};
  var timer=setInterval(function(){if(!document.hidden)refresh(false);},300000);root.addEventListener('pagehide',function(){clearInterval(timer);});controls();return{refresh:refresh,state:function(){return{connected:connected,projectId:projectId,projectName:select.selectedOptions[0]?.textContent||''};},create:function(event,requestId,target){return api('create',{event:event,requestId:requestId,projectId:target});},detail:function(eventId){return api('detail',{eventId:eventId});}};
 };
})(window);
