/* Show persisted automation state, rather than calling every template active. */
(()=>{
 let filter='all';
 const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
 const time=value=>value?new Date(Number(value)).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'아직 실행 기록 없음';
 window.renderWorkspaceAutomations=({target,data,error,request,load,ask,go})=>{
  target.replaceChildren();const head=el('header',undefined,'workspace-view-heading');head.append(el('h1','자동화'),el('p','반복 업무의 실행 상태와 최근 결과를 확인하세요.'));const refresh=el('button','새로고침','workspace-action');refresh.type='button';refresh.onclick=load;head.append(refresh);target.append(head);
  const title=el('h2','나의 자동화','automation-section-title');target.append(title);
  if(error)target.append(el('p',error,'workspace-empty'));
  else if(!data)target.append(el('p','등록된 자동화를 불러오고 있습니다.','workspace-empty'));
  else{
   const monitors=data.monitors||[],reminders=data.reminders||[];
   const filters=el('div',undefined,'automation-filters');filters.setAttribute('aria-label','자동화 상태 필터');
   for(const [key,label]of [['all','전체'],['active','실행 중·예약됨'],['paused','중지됨'],['done','완료']]){const b=el('button',label,'workspace-small-action');b.type='button';b.setAttribute('aria-pressed',String(filter===key));b.onclick=()=>{filter=key;window.renderWorkspaceAutomations({target,data,error,request,load,ask,go});};filters.append(b);}target.append(filters);
   const list=el('div',undefined,'automation-instance-grid');target.append(list);
   function card(name,status,kind){const c=el('article',undefined,'automation-instance');const top=el('div',undefined,'automation-instance-head');const badge=el('span',status,'workspace-status');badge.dataset.state=kind;top.append(badge,el('span','모아 · 설정 및 알림 관리','automation-owner'));c.append(top,el('h3',name));list.append(c);return c;}
   function detail(c,label,value){const row=el('div',undefined,'automation-detail');row.append(el('span',label),el('strong',value));c.append(row);}
   for(const m of monitors){const enabled=Number(m.enabled)===1;if(filter==='done'||filter==='active'&&!enabled||filter==='paused'&&enabled)continue;
    const c=card(m.query,m.error&&enabled?'확인 필요':enabled?'실행 중':'중지됨',m.error&&enabled?'error':enabled?'active':'paused');
    detail(c,'실행 조건','30분마다 새 기사 확인');detail(c,'최근 확인',time(m.last_checked));detail(c,'다음 확인',enabled?(m.next_check?time(m.next_check):'다음 점검 시 확인'):'중지됨');
    const result=(data.notifications||[]).find(n=>n.id?.startsWith('news_'+m.id+'_'));detail(c,'최근 결과',m.error||result?.title||(m.last_checked?'기사 확인 완료 · 새 기사 발견 시 받은함에 알림':'실행 대기'));
    const actions=el('div',undefined,'automation-actions');const toggle=el('button',enabled?'일시 중지':'다시 켜기','workspace-small-action');toggle.type='button';toggle.setAttribute('aria-label',m.query+' '+(enabled?'일시 중지':'다시 켜기'));toggle.onclick=async()=>{toggle.disabled=true;try{await request('/office-tools/monitors/state',{id:m.id,enabled:!enabled});await load();}catch(e){toggle.disabled=false;const notice=el('p',e.message,'automation-error');notice.setAttribute('role','alert');c.append(notice);}};actions.append(toggle);if(result){const b=el('button','결과 보기 →','workspace-small-action');b.type='button';b.onclick=()=>go('inbox');actions.append(b);}c.append(actions);
   }
   for(const r of reminders){const done=!!r.notified_at;if(filter==='paused'||filter==='active'&&done||filter==='done'&&!done)continue;const c=card(r.title,done?'완료':'예약됨',done?'done':'active');detail(c,'실행 조건','지정 시각에 한 번');detail(c,'예약 시각',time(r.at));detail(c,'최근 결과',done?time(r.notified_at)+' · 받은함에 알림 저장':'예약 시각을 기다리고 있습니다.');if(done){const b=el('button','결과 보기 →','workspace-small-action');b.type='button';b.onclick=()=>go('inbox');c.append(b);}}
   if(!list.children.length)list.append(el('p',monitors.length||reminders.length?'이 상태의 자동화가 없습니다.':'등록된 자동화가 없습니다. 아래에서 필요한 업무를 설정하세요.','workspace-empty'));
  }
  target.append(el('h2','새 자동화 시작하기','automation-section-title'));const templates=el('div',undefined,'workspace-automation-grid');target.append(templates);
  for(const [name,status,desc,label,action]of [
   ['뉴스 모니터링','설정 필요','공개 뉴스 검색어를 30분마다 확인하고, 새 기사를 받은함으로 알려드립니다.','모아에게 설정 요청',()=>ask('뉴스 모니터링을 설정하고 싶어. 검색어와 알림 기준을 먼저 물어봐줘.')],
   ['예약 알림','설정 필요','내용과 시각을 지정하면 그때 받은함에 알림을 저장합니다.','알림 예약하기',()=>ask('예약 알림을 설정하고 싶어. 알림 내용과 날짜, 시간을 먼저 확인해줘.')],
   ['일정·동선 확인','수동 확인','현재 위치와 일정을 직접 확인하는 도구입니다. 이 카드는 반복 자동화 설정이 아닙니다.','일정·위치 확인',()=>go('locations')]
  ]){const c=el('article',undefined,'workspace-automation-card');c.append(el('span',status,'automation-template-state'),el('h2',name),el('p',desc));const b=el('button',label+' →','workspace-action');b.type='button';b.onclick=action;c.append(b);templates.append(c);}
 };
})();
