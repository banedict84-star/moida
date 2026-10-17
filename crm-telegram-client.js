const manager=document.querySelector('.crm-sheet-body');
if(manager){
 const section=document.createElement('section');section.className='crm-telegram-settings';
 section.innerHTML='<h3>텔레그램 사람별 메모</h3><p>기존 모이다 봇에 “홍길동 메모: 다음 주 연락하기”라고 보내세요. 동명이인은 번호를 선택합니다. 이름·내부 ID·전화번호 끝 4자리만 검색용으로 저장합니다.</p><div class="crm-sheet-actions"><button type="button" data-tg="connect">봇 연결 코드 발급</button><button type="button" data-tg="sync">연락처 목록 갱신</button><button type="button" data-tg="disconnect">봇 연결 해제</button></div><p role="status"></p><code hidden></code>';
 manager.prepend(section);
 const state=section.querySelector('[role=status]'),code=section.querySelector('code');let owner='',connected=false,busy=false;
 const notes=document.createElement('section');notes.className='crm-telegram-notes';notes.innerHTML='<h4>텔레그램 메모</h4><div role="status"></div><div class="crm-telegram-items"></div><button type="button" hidden>이전 메모 더 보기</button>';document.getElementById('dtMemo')?.after(notes);
 const items=notes.querySelector('.crm-telegram-items'),noteState=notes.querySelector('[role=status]'),more=notes.querySelector('button');let contact='',generation=0,before=0;
 const user=()=>window._crmSheetUser?.();
 async function api(path,body){const u=user();if(!u)throw Error('로그인이 필요합니다.');const token=await u.getIdToken();const r=await fetch('https://moida-gpt.banedict84.workers.dev/crm-telegram/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const d=await r.json();if(user()?.uid!==u.uid)throw Error('로그인 계정이 변경되었습니다.');if(!r.ok)throw Error(d.error?.message||'요청에 실패했습니다.');return d;}
 async function sync(){if(!window._crmSheetBridge?.ready())throw Error('CRM 자료가 로드된 뒤 다시 시도해 주세요.');const all=await window._crmSheetBridge.snapshot();const contacts=all.filter(c=>c.name?.trim()).map(c=>({id:c.mid,name:c.name,phone:String(c.phone||'').replace(/\D/g,'').slice(-4)}));return api('index',{contacts});}
 async function status(){const d=await api('status');connected=d.connected;state.textContent=connected?'봇 연결됨 · CRM을 열어두면 연락처 변경을 30초마다 반영합니다.':'처음 한 번 연결 코드를 모이다 봇에 보내 주세요.';}
 async function run(fn){if(busy)return;busy=true;section.querySelectorAll('button').forEach(b=>b.disabled=true);try{await fn();}catch(e){state.textContent=e.message;}finally{busy=false;section.querySelectorAll('button').forEach(b=>b.disabled=false);}}
 section.querySelector('[data-tg=connect]').onclick=()=>run(async()=>{await sync();const d=await api('code',{});code.hidden=false;code.textContent='/CRM '+d.code;state.textContent='아래 명령을 복사해 기존 모이다 봇에 보내세요. 10분간 유효하며 한 번만 사용할 수 있습니다.';});
 section.querySelector('[data-tg=sync]').onclick=()=>run(async()=>{const d=await sync();state.textContent=d.count+'명의 검색용 연락처를 갱신했습니다.';});
 section.querySelector('[data-tg=disconnect]').onclick=()=>run(async()=>{await api('disconnect',{});code.textContent='';code.hidden=true;await status();});
 async function loadNotes(append=false){if(!contact||!user())return;const id=contact,seq=++generation,uid=user().uid;try{const d=await api('notes?id='+encodeURIComponent(id)+(append?'&before='+before:''));if(contact!==id||seq!==generation||user()?.uid!==uid)return;if(!append)items.replaceChildren();for(const n of d.notes){const row=document.createElement('article'),time=document.createElement('small'),body=document.createElement('p');time.textContent=new Date(n.created).toLocaleString('ko-KR')+' · 텔레그램';body.textContent=n.text;row.append(time,body);items.append(row);}before=d.notes.at(-1)?.id||0;more.hidden=d.notes.length<100;noteState.textContent=items.children.length?'':'아직 텔레그램 메모가 없습니다.';}catch{if(seq===generation)noteState.textContent='메모를 불러오지 못했습니다. 잠시 후 다시 확인합니다.';}}
 window._crmTelegramShow=(id)=>{generation++;contact=id||'';items.replaceChildren();more.hidden=true;noteState.textContent=id?'불러오는 중…':'';if(id)loadNotes();};
 more.onclick=()=>loadNotes(true);
 setInterval(()=>{const uid=user()?.uid||'';if(uid!==owner){owner=uid;connected=false;code.hidden=true;code.textContent='';window._crmTelegramShow('');state.textContent='';if(uid)run(status);}},1500);
 setInterval(()=>{if(owner&&document.visibilityState==='visible'){if(connected)run(async()=>{await sync();await status();});else if(!busy)run(status);if(contact)loadNotes();}},30000);
}
