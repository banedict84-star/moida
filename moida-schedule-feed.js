export function createScheduleFeed({host,model,canWrite,allEvents,events,category,openEditor,register,changed}){
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
 const button=(text,fn,cls)=>{const b=el('button',text,cls);b.type='button';b.onclick=fn;return b;};
 const uid=()=>model()?.auth?.currentUser?.uid||'';
 const stamp=e=>Number(e.updatedAt)||Date.parse(e.created)||0;
 const unread=e=>Number(e.readBy?.[uid()]||0)<stamp(e);
 const format=value=>{const d=new Date(value);return isNaN(d)?String(value||''):new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}).format(d);};
 const when=e=>e.date+' '+(e.allDay||!e.time?'종일':e.time)+' ~ '+((e.endDate||e.date)!==e.date?(e.endDate+' '):'')+(e.allDay||!e.time?'종일':e.endTime||'종료 미정');
 let selected=null,pending=false,filter='all',sort='recent',compact=false,draft='',commentId='',writeError='';
 const detail=el('dialog',null,'schedule-detail'),box=el('div',null,'detail-inner');detail.append(box);document.body.append(detail);
 detail.addEventListener('cancel',e=>{if(pending)e.preventDefault();else selected=null;});
 async function action(e,kind,value){
  if(pending||!canWrite())return false;pending=true;writeError='';refreshDetail();
  try{await model().saveNativeSchedule({id:e.id},{action:kind,value});changed();return true;}
  catch(error){writeError=error.message||'저장하지 못했습니다. 다시 시도해 주세요.';return false;}
  finally{pending=false;refreshDetail();render();}
 }
 function detailButton(text,fn,cls){const b=button(text,fn,cls);b.disabled=pending||!canWrite();return b;}
 function open(e){selected=e.id;draft='';commentId='';writeError='';refreshDetail();detail.showModal();if(unread(e)&&canWrite())action(e,'read',null);}
 function refreshDetail(){
  if(!selected)return;const e=allEvents().find(x=>x.id===selected);if(!e){if(detail.open)detail.close();selected=null;return;}
  const textarea=box.querySelector('textarea');if(textarea)draft=textarea.value;const focused=textarea===document.activeElement;
  box.replaceChildren();const head=el('div',null,'detail-top'),close=button('×',()=>{if(!pending){detail.close();selected=null;}},'detail-close');close.setAttribute('aria-label','상세 닫기');close.disabled=pending;
  head.append(el('strong','일정 상세'),close);box.append(head);
  const meta=el('div',null,'post-author');meta.append(el('span',(e.author||'의원실').slice(0,1),'author-avatar'),el('div',(e.author||'의원실')+' · '+format(e.created)));box.append(meta);
  const title=el('div',null,'detail-title');title.style.setProperty('--color',category(e)[2]);title.append(el('span',category(e)[1],'feed-tag'),el('h2',e.title),el('p',when(e)));box.append(title);
  if(e._location){const place=el('p','장소 · '+e._location,'detail-place'),map=el('a','지도 보기 ↗');map.href='https://map.kakao.com/link/search/'+encodeURIComponent(e._location);map.target='_blank';map.rel='noopener noreferrer';place.append(map);box.append(place);}
  if(e.attendees)box.append(el('p','참석 대상 · '+e.attendees,'detail-place'));
  if(e._body)box.append(el('p',e._body,'detail-body'));
  const responses=Object.values(e.responses||{}),counts=el('div',null,'response-counts');for(const [status,label] of [['attending','참석'],['absent','불참'],['undecided','미정']])counts.append(el('span',label+' '+responses.filter(r=>r.status===status).length));box.append(counts);
  const choices=el('div',null,'response-actions');for(const [status,label] of [['attending','참석할게요'],['absent','참석 어려워요'],['undecided','아직 미정']]){const b=detailButton(label,()=>action(e,'rsvp',status));b.setAttribute('aria-pressed',String(e.responses?.[uid()]?.status===status));choices.append(b);}box.append(choices);
  if(responses.length)box.append(el('p',responses.map(r=>r.name+' · '+({attending:'참석',absent:'불참',undecided:'미정'}[r.status]||'미정')).join(' / '),'response-names'));
  const actions=el('div',null,'detail-actions');actions.append(detailButton(e.pinned?'고정 해제':'상단 고정',()=>action(e,'pin',!e.pinned)),detailButton(e.bookmarkedBy?.[uid()]?'북마크 해제':'북마크',()=>action(e,'bookmark',!e.bookmarkedBy?.[uid()])),detailButton('일정 수정',()=>{detail.close();selected=null;openEditor(e);}));box.append(actions);
  const comments=el('section',null,'detail-comments');comments.append(el('h3','댓글 '+(e.comments||[]).length));for(const c of e.comments||[]){const row=el('article',null,'comment');row.append(el('strong',c.name||'의원실'),el('time',format(c.createdAt)),el('p',c.text));comments.append(row);}if(!e.comments?.length)comments.append(el('p','준비사항이나 전달할 내용을 남겨 주세요.','empty'));
  const form=el('form',null,'comment-form'),input=el('textarea');input.rows=3;input.maxLength=3000;input.placeholder='댓글을 입력하세요';input.setAttribute('aria-label','댓글 입력');input.value=draft;input.disabled=pending||!canWrite();input.oninput=()=>{draft=input.value;commentId='';};const submit=el('button',pending?'저장 중…':'댓글 등록','primary');submit.type='submit';submit.disabled=pending||!canWrite();form.append(input,submit);form.onsubmit=async ev=>{ev.preventDefault();if(!draft.trim())return;const text=draft;if(!commentId)commentId=crypto.randomUUID();if(await action(e,'comment',{id:commentId,text})){draft='';commentId='';const current=box.querySelector('textarea');if(current)current.value='';refreshDetail();}};comments.append(form);box.append(comments);
  const status=el('p',writeError,'detail-status');status.setAttribute('role','status');box.append(status);if(focused&&!pending)box.querySelector('textarea')?.focus();
 }
 function card(e){
  const card=el('article',null,'feed-card');card.style.setProperty('--color',category(e)[2]);
  const head=el('div',null,'feed-card-head'),meta=el('div',null,'post-author');meta.append(el('span',(e.author||'의원실').slice(0,1),'author-avatar'),el('div',(e.author||'의원실')+' · '+format(e.created)));head.append(meta);if(e.pinned)head.append(el('span','상단 고정','feed-tag'));if(unread(e))head.append(el('span','새 소식','unread-badge'));card.append(head);
  const body=button('',()=>open(e),'feed-open');body.append(el('span',category(e)[1],'feed-tag'),el('h3',e.title),el('p',when(e),'feed-time'));if(e._location)body.append(el('p','장소 · '+e._location));if(!compact&&e._body)body.append(el('p',e._body,'feed-body'));card.append(body);
  const foot=el('div',null,'feed-card-foot');foot.append(button('댓글 '+(e.comments||[]).length,()=>open(e)),el('span','참석 '+Object.values(e.responses||{}).filter(r=>r.status==='attending').length),button(e.bookmarkedBy?.[uid()]?'★ 북마크':'☆ 북마크',()=>action(e,'bookmark',!e.bookmarkedBy?.[uid()])));foot.lastChild.disabled=pending||!canWrite();card.append(foot);return card;
 }
 function render(){
  let peoplePanel=document.querySelector('.feed-people');if(!peoplePanel){peoplePanel=el('section',null,'feed-people');document.querySelector('.day-panel').append(peoplePanel);}
  const people=new Map(),current=model()?.sessUser?.();if(uid())people.set(uid(),{name:current?.displayName||'내 계정',role:'현재 로그인'});
  for(const e of allEvents()){if(e.authorUid&&e.author)people.set(e.authorUid,{name:e.author,role:e.authorUid===uid()?'현재 로그인':'일정 등록자'});for(const [id,response] of Object.entries(e.responses||{}))if(!people.has(id))people.set(id,{name:response.name||'의원실',role:'참석 응답자'});}
  peoplePanel.replaceChildren(el('h3','일정 참여자 '+people.size),el('p','일정을 등록하거나 참석 응답한 구성원입니다.','people-hint'));
  for(const person of people.values()){const row=el('div',null,'people-row');row.append(el('span',person.name.slice(0,1),'author-avatar'),el('strong',person.name),el('small',person.role));peoplePanel.append(row);}
  host.replaceChildren();const composer=el('div',null,'feed-composer');composer.append(el('strong','의원실 일정 피드'),el('p','일정을 공유하고 준비사항을 함께 확인하세요.'),button('＋ 새 일정 등록',register,'primary'));composer.lastChild.disabled=!canWrite();host.append(composer);
  const tools=el('div',null,'feed-controls'),tabs=el('div',null,'feed-filters');for(const [key,name] of [['all','전체'],['unread','미확인'],['pinned','상단 고정'],['bookmarked','북마크']]){const b=button(name,()=>{filter=key;render();});b.setAttribute('aria-pressed',String(filter===key));tabs.append(b);}tools.append(tabs);
  const select=el('select');select.setAttribute('aria-label','피드 정렬');for(const [value,text] of [['recent','최근 등록순'],['date','일정 날짜순']]){const o=el('option',text);o.value=value;select.append(o);}select.value=sort;select.onchange=()=>{sort=select.value;render();};tools.append(select,button(compact?'자세히 보기':'간단히 보기',()=>{compact=!compact;render();}));host.append(tools);
  const list=events().filter(e=>filter==='all'||(filter==='unread'&&unread(e))||(filter==='pinned'&&e.pinned)||(filter==='bookmarked'&&e.bookmarkedBy?.[uid()]));list.sort((a,b)=>Number(!!b.pinned)-Number(!!a.pinned)||(sort==='date'?(a.date+(a.time||'')).localeCompare(b.date+(b.time||'')):((Date.parse(b.created)||0)-(Date.parse(a.created)||0))));
  const summary=el('p','일정 '+list.length+'건','feed-summary');host.append(summary);if(!list.length)host.append(el('p',filter==='all'?'등록된 일정이 없습니다. 새 일정을 등록하면 달력과 피드에 함께 표시됩니다.':'이 조건에 해당하는 일정이 없습니다.','feed-empty'));for(const e of list)host.append(card(e));if(detail.open)refreshDetail();
 }
 return {render,open,refreshDetail};
}
