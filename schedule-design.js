(function(){
 'use strict';
 var feed=document.getElementById('feedView'),members=document.querySelector('.parts');if(!feed||!members)return;
 var panel=document.createElement('aside');panel.className='schedule-selection';panel.hidden=true;panel.setAttribute('aria-label','선택한 일정');members.before(panel);
 function text(tag,value,cls){var n=document.createElement(tag);n.textContent=value;if(cls)n.className=cls;return n;}
 function action(label,icon,callback){var b=document.createElement('button');b.type='button';var img=document.createElement('img');img.src='assets/schedule/'+icon+'.svg';img.alt='';b.append(img,text('span',label));b.onclick=callback;return b;}
 var showDetail=false;
 feed.addEventListener('click',function(click){
  if(showDetail)return;
  if(click.target.closest('.ev-star'))return;var row=click.target.closest('.ev');if(!row||!row._ev)return;var e=row._ev;
  click.stopImmediatePropagation();feed.querySelectorAll('.ev.selected').forEach(function(n){n.classList.remove('selected');});row.classList.add('selected');panel.replaceChildren();panel.hidden=false;members.hidden=true;
  panel.append(text('p','선택한 일정','selection-label'),text('h2',e.title||'일정'),text('p',(e.date||'')+' · '+(e.time||'종일'),'selection-time'),text('p','장소','selection-label'),text('p',e._location||'장소가 등록되지 않았습니다.'));
  var actions=document.createElement('div');actions.className='selection-actions';
  if(e._location){var route=document.createElement('a');route.className='selection-route';route.href='https://map.kakao.com/link/search/'+encodeURIComponent(e._location);route.target='_blank';route.rel='noopener noreferrer';var img=document.createElement('img');img.src='assets/schedule/route.svg';img.alt='';route.append(img,text('span','카카오맵 길찾기'));actions.append(route);}
  actions.append(action('일정 상세 보기','edit',function(){showDetail=true;try{row.click();}finally{showDetail=false;}}),action('의원실 멤버 보기','link',function(){panel.hidden=true;members.hidden=false;}));panel.append(actions);
 },true);
})();
