/* Presentation only: retain the existing data mounts and navigation routes. */
(() => {
 const page=document.querySelector('.page[data-page="dashboard"] .pg');
 if(!page||page.classList.contains('dashboard-cards'))return;
 page.classList.add('dashboard-cards');
 const greet=page.firstElementChild,grid=page.querySelector('.dashboard-grid');
 greet.classList.add('dashboard-greeting');
 const brand=document.createElement('div');brand.className='dashboard-brand';
 brand.innerHTML='<img src="assets/moida-office-logo.svg" alt="모이다"><div><strong>모이다</strong><span>AI 비서실</span></div>';
 page.prepend(brand);
 const brief=grid.firstElementChild;brief.classList.add('dashboard-brief');
 const briefTitle=document.createElement('h2');briefTitle.className='dashboard-brief-title';briefTitle.innerHTML='하루의 업무를<br>한눈에 정리하세요.';brief.querySelector('#dashBrief').before(briefTitle);
 page.insertBefore(brief,greet.nextElementSibling);
 const shortcuts=document.createElement('section');shortcuts.className='dashboard-shortcuts';shortcuts.setAttribute('aria-label','업무 바로가기');
 const label=document.createElement('h2');label.textContent='업무 바로가기';shortcuts.append(label);
 const tiles=document.createElement('div');tiles.className='dashboard-tiles';
 const items=[['schedule','일정·행사','의원실 일정 관리'],['crm','조직·연락처','사람과 소통 연결'],['minwon','민원 관리','접수부터 처리까지'],['calls','통화 기록','지난 소통 돌아보기']];
 for(const [route,title,detail]of items){
  const button=document.createElement('button');button.type='button';button.dataset.go=route;
  const icon=document.querySelector('.nav-item[data-page="'+route+'"] svg');if(icon){const copy=icon.cloneNode(true);copy.setAttribute('aria-hidden','true');button.append(copy);}
  const text=document.createElement('strong');text.textContent=title;const sub=document.createElement('span');sub.textContent=detail;text.append(sub);button.append(text);tiles.append(button);
 }
 shortcuts.append(tiles);brief.after(shortcuts);
 const kpis=page.querySelector('.dashboard-kpis');kpis.classList.add('dashboard-live-summary');
 const summaryLabel=document.createElement('h2');summaryLabel.className='dashboard-section-title';summaryLabel.textContent='업무 현황';kpis.before(summaryLabel);
 const upcoming=page.querySelector('#dashToday').parentElement;grid.prepend(upcoming);
 const shorts=document.createElement('button');shorts.type='button';shorts.dataset.go='shorts';shorts.className='dashboard-shorts-link';
 shorts.innerHTML='<span><strong>오늘의 뉴스 숏츠</strong><small>기사로 대본과 영상 만들기</small></span><span aria-hidden="true">→</span>';
 grid.after(shorts);
 const bottom=document.createElement('nav');bottom.className='dashboard-bottom-nav';bottom.setAttribute('aria-label','메인 화면 바로가기');
 for(const [route,title]of [['dashboard','홈'],['schedule','일정'],['secretary','AI 비서']]){const button=document.createElement('button');button.type='button';button.dataset.go=route;button.textContent=title;if(route==='dashboard')button.setAttribute('aria-current','page');bottom.append(button);}
 const menu=document.createElement('button');menu.type='button';menu.textContent='전체 메뉴';menu.addEventListener('click',()=>document.getElementById('mobileMenuBtn')?.click());bottom.append(menu);page.append(bottom);
})();
