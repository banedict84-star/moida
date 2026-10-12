(function(root){
 'use strict';
 root.setupAppConnections=function(options){
  var host=document.getElementById('moidaAppConnections'),apps=[],selected=new Set(),aiEnabled=new Set(),statuses={},owner='',category='전체',query='',filter='all',sequence=0,selectionReady=false;
  if(!host)return;
  function el(tag,text,cls){var n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
  function owned(uid){if(!uid||options.owner()!==uid)throw Error('로그인 계정이 변경되었습니다. 다시 열어 주세요.');}
  function btn(text,action,cls){var n=el('button',text,cls);n.type='button';n.onclick=async function(){n.disabled=true;try{await action();}catch(e){message.textContent=e.message||'연결 상태를 확인하지 못했습니다.';}finally{n.disabled=false;}};return n;}
  var head=el('div',undefined,'apps-heading'),copy=el('div');copy.append(el('span','MOIDA AI','apps-eyebrow'),el('h1','쓰는 앱을, 모이다에.'),el('p','필요한 앱을 고르고 연결하세요. 연결 준비도 이곳에서 관리합니다.'));
  head.append(copy,btn('상태 새로고침',refresh,'apps-secondary'));host.append(head);
  var toolbar=el('div',undefined,'apps-toolbar'),search=el('input');search.type='search';search.autocomplete='off';search.name='moida-app-catalog-search';search.readOnly=true;search.onfocus=function(){search.readOnly=false;};search.onblur=function(){search.readOnly=true;};search.placeholder='앱 이름 검색';search.setAttribute('aria-label','연결할 앱 검색');search.oninput=function(){if(search.readOnly){search.value=query;return;}query=search.value.toLowerCase().trim();renderCards();};
  var filters=el('div',undefined,'apps-filters');[['all','모든 앱'],['selected','선택한 앱'],['connected','연결된 앱']].forEach(function(item){var b=btn(item[1],function(){filter=item[0];updateFilters();renderCards();});b.dataset.filter=item[0];b.setAttribute('aria-pressed',String(item[0]===filter));filters.append(b);});toolbar.append(search,filters);host.append(toolbar);
  var categories=el('div',undefined,'apps-categories');host.append(categories);
  var message=el('p','연결 상태를 불러오는 중입니다.','apps-message');message.setAttribute('role','status');host.append(message);
  var count=el('p','','apps-message');count.setAttribute('aria-live','polite');host.append(count);var grid=el('div',undefined,'apps-grid');host.append(grid);
  var dialog=el('dialog',undefined,'apps-dialog');dialog.setAttribute('aria-labelledby','app-connect-title');document.body.append(dialog);
  function updateFilters(){Array.from(filters.children).forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.filter===filter));});}
  function state(app){return statuses[app.id]||{connected:false};}
  function renderCategories(){categories.replaceChildren();['전체'].concat(Array.from(new Set(apps.map(function(a){return a.category;})))).forEach(function(name){var b=btn(name,function(){category=name;query='';search.value='';filter='all';updateFilters();renderCategories();renderCards();});b.setAttribute('aria-pressed',String(name===category));categories.append(b);});}
  async function select(app,value){if(!selectionReady)throw Error('선택 목록 저장 서버를 확인하지 못했습니다. 상태 새로고침을 눌러 주세요.');var uid=owner;owned(uid);await options.request('/office-tools/apps/select',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({appId:app.id,selected:value})});owned(uid);if(value)selected.add(app.id);else selected.delete(app.id);renderCards();message.textContent=value?app.name+'을 선택했습니다. 계정 연결은 별도로 진행합니다.':app.name+'을 선택 목록에서 제외했습니다. 기존 계정 연결은 유지됩니다.';}
  function renderCards(){grid.replaceChildren();var visible=apps.filter(function(app){return(category==='전체'||app.category===category)&&(!query||app.name.toLowerCase().includes(query)||[app.description,app.category,app.keywords||''].join(' ').toLowerCase().includes(query))&&(filter!=='selected'||selected.has(app.id))&&(filter!=='connected'||state(app).connected);});
   count.textContent=visible.length+'개 표시 / 전체 '+apps.length+'개';visible.forEach(function(app){var s=state(app),card=el('article',undefined,'app-connect-card'),top=el('div',undefined,'app-card-top'),mark=el('span',undefined,'app-mark');if(app.logo){var logo=el('img');logo.src=app.logo;logo.alt='';logo.loading='lazy';logo.decoding='async';logo.onerror=function(){logo.remove();mark.textContent='\u25a6';mark.classList.add('app-mark-fallback');};mark.append(logo);}else{mark.textContent='\u25a6';mark.classList.add('app-mark-fallback');}mark.style.setProperty('--app-color',app.color);var badge=el('span',s.error?'확인 필요':s.connected?'연결됨':app.kind==='pending'?'연동 준비 필요':'연결 가능','app-badge '+(s.connected?'connected':app.kind==='pending'?'pending':''));top.append(mark,badge);card.append(top,el('h2',app.name),el('p',app.description,'app-description'));
    var actions=el('div',undefined,'app-card-actions');actions.append(btn(app.kind==='pending'?'연결 준비':s.connected?'연결 관리':'연결하기',function(){return detail(app);},'apps-primary'));
    var choice=el('label',undefined,'app-choice'),check=el('input');check.type='checkbox';check.checked=app.kind==='pending'?selected.has(app.id):aiEnabled.has(app.id);check.disabled=!selectionReady||(app.kind!=='pending'&&!s.connected);check.setAttribute('aria-label',app.name+(app.kind==='pending'?' 선택':' AI 사용'));check.onchange=async function(){check.disabled=true;try{if(app.kind==='pending')await select(app,check.checked);else{await options.request('/office-tools/apps/ai-enable',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({appId:app.id,enabled:check.checked})});owned(owner);if(check.checked)aiEnabled.add(app.id);else aiEnabled.delete(app.id);message.textContent=app.name+' AI 사용 '+(check.checked?'켜짐':'꺼짐');}}catch(e){check.checked=!check.checked;message.textContent=e.message;}finally{check.disabled=false;}};choice.append(check,el('span',app.kind==='pending'?'선택':'AI 사용'));actions.append(choice);card.append(actions);grid.append(card);
   });if(!visible.length)grid.append(el('p',filter==='connected'?'아직 확인된 연결이 없습니다. 연결하기를 눌러 계정을 연결하세요.':'조건에 맞는 앱이 없습니다.','apps-empty'));
  }
  async function connectGoogle(app){var uid=owner;owned(uid);var result=await options.request('/google/calendar/connect?'+new URLSearchParams({services:app.service,origin:location.origin,returnPath:location.pathname}),{method:'GET'});owned(uid);var url=new URL(result.authorizationUrl);if(url.protocol!=='https:'||url.hostname!=='accounts.google.com')throw Error('Google 연결 주소를 확인하지 못했습니다.');location.assign(url.href);}
  function detail(app){owned(owner);dialog.replaceChildren();var s=state(app),title=el('h2',app.name);title.id='app-connect-title';dialog.append(btn('닫기',function(){dialog.close();},'app-dialog-close'),el('span',app.category,'apps-eyebrow'),title,el('p',app.description));
   if(app.kind==='pending'){
    dialog.append(el('strong','모이다용 연동 준비가 필요합니다.'),el('p','현재는 연결 준비 단계입니다. 선택 목록에 저장해도 계정에 접근하거나 AI가 자료를 읽지는 않습니다.'));
    var steps=el('ol');[app.requirements,'모이다 서버에 서비스 인증과 자료 조회 기능을 연결합니다.','그 후 이 화면에서 계정 승인 절차를 진행합니다.'].forEach(function(text){steps.append(el('li',text));});dialog.append(steps);
    var selectButton=btn(selected.has(app.id)?'선택 목록에서 제외':'이 앱 선택하기',async function(){await select(app,!selected.has(app.id));dialog.close();},'apps-primary');selectButton.disabled=!selectionReady;dialog.append(selectButton);if(!selectionReady)dialog.append(el('p','선택 목록 저장 서버를 확인하지 못했습니다. 상태 새로고침 후 다시 시도해 주세요.'));
   }else if(app.kind==='google'){
    dialog.append(el('p',s.error?'연결 상태를 다시 확인해 주세요.':s.connected?'현재 계정에 연결되어 있습니다.':'Google 승인 화면에서 접근 권한을 확인해 주세요.'));
    if(s.email)dialog.append(el('p',s.email,'app-account'));
    dialog.append(el('p',app.id==='gmail'?'현재 지원 범위는 메일 초안 발송입니다. 받은편지함 조회는 제공하지 않습니다.':'Google 연결은 캘린더를 기본으로 사용하고, 선택한 서비스 권한을 함께 요청합니다.'));
    dialog.append(btn(s.connected?'권한 다시 연결':'Google 계정으로 연결',function(){return connectGoogle(app);},'apps-primary'));
   }else if(app.id==='flow'||app.id==='solapi'){
    dialog.append(el('p',s.error?app.name+' 연결 상태를 확인하지 못했습니다. 상태 새로고침 후 다시 확인해 주세요.':s.connected?app.name+' 계정이 연결되어 있습니다. 앱 카드의 AI 사용 설정으로 모아의 사용을 관리하세요.':app.name+' 계정이 연결되어 있지 않습니다.'));
   }else{
    dialog.append(el('p',s.error?'상태를 확인하지 못했습니다. 설정 화면에서 연결 상태를 확인하세요.':s.connected?'연결되어 있습니다. 기존 설정 화면에서 계정과 권한을 관리하세요.':'설정 화면에서 계정을 연결해 주세요.'));
    dialog.append(btn(app.name+' 설정 열기',function(){dialog.close();root.__go(app.page);},'apps-primary'));
   }
   dialog.showModal();
  }
  async function refresh(){var uid=options.owner(),run=++sequence;try{owned(uid);if(owner!==uid){apps=[];selected.clear();aiEnabled.clear();statuses={};grid.replaceChildren();}owner=uid;message.textContent='앱과 연결 상태를 확인하고 있습니다.';
    var results=await Promise.allSettled([options.request('/office-tools/apps',{method:'GET'}),options.request('/office-tools/status',{method:'GET'}),options.request('/flow/calendar/status',{method:'GET'}),options.request('/messaging/solapi/status',{method:'GET'})]);owned(uid);if(run!==sequence)return;
    selectionReady=results[0].status==='fulfilled';if(selectionReady){apps=results[0].value.apps;selected=new Set(results[0].value.selected);aiEnabled=new Set(results[0].value.aiEnabled||[]);}else{var catalog=await import('./secretary-app-catalog.js');owned(uid);if(run!==sequence)return;apps=catalog.APP_CATALOG;}statuses={};
    var google=results[1];apps.filter(function(a){return a.kind==='google';}).forEach(function(a){statuses[a.id]=google.status==='fulfilled'?{connected:!!google.value[a.statusKey],email:google.value.google_email}:{error:true};});
    ['flow','solapi'].forEach(function(id,i){var r=results[i+2];statuses[id]=r.status==='fulfilled'?{connected:!!r.value.connected}:{error:true};});
    renderCategories();renderCards();message.textContent=(selectionReady?'':'선택 목록 저장 서버 확인 필요 · ')+Object.values(statuses).filter(function(s){return s.connected;}).length+'개 연결됨 · '+selected.size+'개 선택됨'+(results.some(function(r){return r.status==='rejected';})?' · 일부 연결 상태 확인 필요':'');
   }catch(e){message.textContent=e.message||'앱 정보를 불러오지 못했습니다.';}
  }
  root.openAppConnections=refresh;
  // Clear all account-specific state immediately when authentication changes.
  if(options.subscribe)options.subscribe(function(){var uid=options.owner();if(uid!==owner){sequence++;selectionReady=false;owner=uid||'';apps=[];selected.clear();statuses={};grid.replaceChildren();categories.replaceChildren();if(dialog.open)dialog.close();message.textContent='앱 연결 화면을 다시 열어 주세요.';}if(location.hash==='#connections'&&uid)refresh();});
  if(location.hash==='#connections')refresh();
 };
})(window);
