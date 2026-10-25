/* Arrange existing live data mounts into a focused daily workspace. */
(() => {
 const page=document.querySelector('.page[data-page="dashboard"] .pg');
 if(!page||page.classList.contains('dashboard-workdesk'))return;
 const greet=page.firstElementChild,metrics=page.querySelector('.dashboard-kpis'),brief=page.querySelector('#dashBrief').parentElement,agenda=page.querySelector('#dashToday');
 page.classList.add('dashboard-workdesk');greet.className='desk-greeting';greet.removeAttribute('style');greet.querySelector('button')?.remove();
 const date=document.createElement('div');date.className='desk-date';date.textContent=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',weekday:'long'}).format(new Date());greet.prepend(date);
 const actions=document.createElement('div');actions.className='desk-header-actions';actions.innerHTML='<button class="btn btn-sm" data-go="schedule">일정 보기 ↗</button><button class="btn btn-sm btn-primary" data-go="secretary">모아에게 요청하기 ↗</button>';greet.append(actions);
 metrics.className='desk-metrics';metrics.removeAttribute('style');
 for(const id of ['kpiToday','kpiWeek','kpiCalls','kpiMembers']){
  const card=metrics.querySelector('#'+id).parentElement.parentElement;card.className='desk-metric';card.removeAttribute('style');card.removeAttribute('data-hover');card.tabIndex=0;card.setAttribute('role','button');card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();card.click();}});if(id==='kpiCalls')card.firstElementChild.firstElementChild.textContent='오늘 통화 기록';metrics.append(card);
 }
 const layout=document.createElement('div');layout.className='desk-layout';
 const left=document.createElement('div');left.className='desk-main';
 const schedule=document.createElement('section');schedule.className='desk-card desk-agenda';schedule.setAttribute('aria-label','일정 요약');
 schedule.innerHTML='<div class="desk-card-head"><div><span class="desk-eyebrow">SCHEDULE</span><h2>일정 한눈에 보기</h2></div><button class="desk-link" data-go="schedule">전체 일정 ↗</button></div><div class="desk-agenda-toolbar"><div class="desk-segments" aria-label="일정 기간"><button type="button" data-desk-range="upcoming" aria-pressed="true">다가오는 일정</button><button type="button" data-desk-range="today" aria-pressed="false">오늘</button></div><span>모이다 · 구글 캘린더</span></div>';
 agenda.removeAttribute('style');schedule.append(agenda);
 schedule.addEventListener('click',e=>{const b=e.target.closest('[data-desk-range]');if(!b)return;window.MOIDA_DASHBOARD_RANGE=b.dataset.deskRange;schedule.querySelectorAll('[data-desk-range]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));window.__dashRefresh?.();});
 const attention=document.createElement('section');attention.className='desk-card desk-attention';attention.innerHTML='<div class="desk-card-head"><div><span class="desk-eyebrow">FOLLOW UP</span><h2>오늘 챙길 일</h2></div><span class="desk-caption">연락과 업무 확인</span></div><div id="deskFollowups"></div>';
 const notices=document.createElement('section');notices.className='desk-card desk-notices';notices.innerHTML='<div class="desk-card-head"><h2>최근 공지</h2><button class="desk-link" data-go="notices">전체 보기 ↗</button></div><div id="deskNotices"></div>';
 left.append(schedule,attention,notices);
 const right=document.createElement('aside');right.className='desk-aside';right.setAttribute('aria-label','업무 요약과 도구');brief.className='desk-card desk-brief';brief.removeAttribute('style');
 brief.firstElementChild.innerHTML='<div><span class="desk-eyebrow">MOA BRIEFING</span><h2>모아의 오늘 요약</h2></div><span id="dashBriefCount" class="desk-caption">업무 요약</span>';brief.firstElementChild.className='desk-card-head';brief.firstElementChild.removeAttribute('style');
 const chat=brief.querySelector('button');chat.removeAttribute('style');chat.removeAttribute('data-hover');chat.className='btn btn-sm';chat.textContent='모아와 업무 정리하기 ↗';
 const shortcuts=document.createElement('section');shortcuts.className='desk-card desk-tools';shortcuts.innerHTML='<div class="desk-card-head"><h2>자주 쓰는 업무</h2></div>';
 for(const [route,title,sub] of [['crm','연락처 찾기','등록된 사람과 소통하기'],['calls','통화 기록','녹음 · 전사 · 요약 확인'],['messaging','문자 작성','대상과 내용을 확인해 발송'],['shorts','뉴스 숏츠','기사로 대본과 영상 만들기']]){const b=document.createElement('button');b.dataset.go=route;b.className='desk-tool';b.innerHTML='<span class="desk-tool-icon" aria-hidden="true"></span><span><strong>'+title+'</strong><small>'+sub+'</small></span><span aria-hidden="true">↗</span>';const svg=document.querySelector('.nav-item[data-page="'+route+'"] svg');if(svg)b.firstElementChild.append(svg.cloneNode(true));else b.firstElementChild.textContent='▤';shortcuts.append(b);}
 right.append(brief,shortcuts);layout.append(left,right);
 const foot=document.createElement('p');foot.className='desk-footnote';foot.textContent='연결된 일정과 의원실 데이터를 바탕으로 표시합니다.';
 page.replaceChildren(greet,metrics,layout,foot);
 function renderFollowups(){
  const M=window.MOIDA||{},esc=M.esc||((s)=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'));
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()).slice(5).replace(/\D/g,'');
  const birthdays=(M.members||[]).filter(m=>{const v=String(m.birthday||m.birth||m.dob||m.rrn||'').replace(/\D/g,'');return (v.length===8?v.slice(4,8):v.length>=6?v.slice(2,6):'')===today;});
  document.getElementById('deskFollowups').innerHTML='<div class="desk-followup"><span class="desk-followup-icon" aria-hidden="true">♡</span><div><strong>'+(birthdays.length?'오늘 생일인 연락처 '+birthdays.length+'명':'오늘 생일인 연락처 없음')+'</strong><p>'+(birthdays.length?birthdays.slice(0,3).map(m=>esc(m.name||'이름 미등록')).join(' · ')+(birthdays.length>3?' 외 '+(birthdays.length-3)+'명':''):'등록된 연락처의 생일 기준입니다.')+'</p></div><button class="btn btn-sm" data-go="'+(birthdays.length?'messaging':'crm')+'">'+(birthdays.length?'축하 문자 준비':'연락처 보기')+'</button></div><div class="desk-followup"><span class="desk-followup-icon" aria-hidden="true">↻</span><div><strong>예약 작업 점검</strong><p>등록한 자동화의 일정과 실행 상태를 확인하세요.</p></div><button class="btn btn-sm" data-go="automations">자동화 보기</button></div>';
  const news=(M.notices||[]).slice(0,3);document.getElementById('deskNotices').innerHTML=news.length?news.map(n=>'<button class="desk-notice" data-go="notices"><span>'+esc(n.title||'공지사항')+'</span><small>'+esc(String(n.date||'').slice(0,10))+'</small></button>').join(''):'<p class="desk-empty-small">표시할 공지가 없습니다. 전체 보기에서 확인하세요.</p>';
 }
 document.addEventListener('moida:dashboard-data',renderFollowups);renderFollowups();window.__dashRefresh?.();
})();
