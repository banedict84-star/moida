import {applyTabler} from './moida-tabler.js?v=7';
import {koreaDay,shiftDay,monthGrid} from './google-schedule-dates.js';
export function googleDescription(value){
 const text=String(value||'');if(!text.includes('<'))return text;
 const template=document.createElement('template');template.innerHTML=text.replace(/<br\s*\/?\s*>/gi,'\n').replace(/<\/(p|div|li)>/gi,'\n');
 template.content.querySelectorAll('script,style,iframe,object,embed').forEach(e=>e.remove());
 template.content.querySelectorAll('a').forEach(a=>{if(a.textContent.trim()==='Flow 게시글 바로가기')a.remove();});
 return template.content.textContent.replace(/\n{3,}/g,'\n\n').trim();
}
export function normalizeGoogleOverlay(e,c){
 const local=v=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(v)).replace(' ','T');
 if(!e.start||e.status==='cancelled')return null;
 try{const start=e.allDay?e.start.slice(0,10):local(e.start),end=e.end?(e.allDay?e.end.slice(0,10):local(e.end)):start;
 return {id:'google:'+c.id+':'+e.id,googleEventId:e.id,source:'google',calendarId:c.id,calendarName:c.name,title:e.title||'제목 없는 일정',author:'Google · '+c.name,created:e.created||'',date:start.slice(0,10),time:e.allDay?'':start.slice(11,16),endDate:e.allDay?(end>start?shiftDay(end.slice(0,10),-1):start.slice(0,10)):end.slice(11,16)==='00:00'&&end>start?shiftDay(end.slice(0,10),-1):end.slice(0,10),endTime:e.allDay?'':end.slice(11,16),allDay:!!e.allDay,_location:e.location||'',_body:googleDescription(e.description),category:'office',readOnly:true};}catch{return null;}
}
export function createGoogleOverlay({mount,user,apply}){
 const el=(tag,text)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;return e;};
 const details=el('details'),summary=el('summary','구글 캘린더'),choices=el('div'),status=el('span'),refresh=el('button','↻');refresh.type='button';refresh.setAttribute('aria-label','구글 일정 새로고침');details.className='google-picker';choices.className='google-choices';details.append(summary,choices);mount.append(details,status,refresh);mount.className='google-overlay';status.setAttribute('role','status');
 let owner='',calendars=null,chosen=new Set(),loaded='',pending='',serial=0,selected=koreaDay(),last=0;
 async function api(resource,params={}){const u=user(),uid=u?.uid;if(!uid)throw Error('로그인 연결 대기');const token=await u.getIdToken();if(user()?.uid!==uid)throw Error('계정이 변경되었습니다.');const response=await fetch('https://moida-gpt.banedict84.workers.dev/google/calendar/'+resource+'?'+new URLSearchParams(params),{headers:{Authorization:'Bearer '+token}});const data=await response.json();if(user()?.uid!==uid)throw Error('계정이 변경되었습니다.');if(!response.ok)throw Error(data.error?.message||'구글 일정 연결 실패');return data;}
 function picker(key){choices.replaceChildren();for(const c of calendars){const label=el('label'),input=el('input');input.type='checkbox';input.checked=chosen.has(c.id);input.onchange=()=>{if(input.checked)chosen.add(c.id);else chosen.delete(c.id);localStorage.setItem(key,JSON.stringify([...chosen]));loaded='';pending='';load(selected,true);};label.append(input,document.createTextNode(c.name));choices.append(label);}summary.textContent='구글 '+chosen.size+'개';applyTabler(mount);}
 async function load(day,force=false){selected=day;const uid=user()?.uid||'';if(!uid)return;let reset=false;if(uid!==owner){owner=uid;calendars=null;loaded='';pending='';serial++;reset=true;}
  const key=uid+'|'+day.slice(0,7);if(pending===key||(!force&&loaded===key&&Date.now()-last<300000))return;pending=key;const request=++serial;if(reset)apply([]);status.textContent='구글 불러오는 중…';refresh.disabled=true;
  try{if(!calendars){const data=await api('list');if(request!==serial)return;calendars=data.calendars||[];const storageKey='moida_calendar_selection_v1_'+uid+'_'+(data.email||'');let saved;try{saved=JSON.parse(localStorage.getItem(storageKey));}catch{}chosen=new Set(Array.isArray(saved)?saved:calendars.filter(c=>c.selected||c.primary).map(c=>c.id));if(!Array.isArray(saved)&&!chosen.size&&calendars.length)chosen.add(calendars[0].id);details.dataset.storageKey=storageKey;}
   picker(details.dataset.storageKey);const days=monthGrid(day),targets=calendars.filter(c=>chosen.has(c.id)),results=[];
   for(let i=0;i<targets.length;i+=4)results.push(...await Promise.allSettled(targets.slice(i,i+4).map(async c=>{const data=await api('events',{calendarId:c.id,timeMin:days[0]+'T00:00:00+09:00',timeMax:shiftDay(days.at(-1),1)+'T00:00:00+09:00'});return (data.events||[]).map(e=>normalizeGoogleOverlay(e,c)).filter(Boolean);})));if(request!==serial)return;
   const events=results.flatMap(r=>r.status==='fulfilled'?r.value:[]),failed=results.filter(r=>r.status==='rejected').length;loaded=key;last=Date.now();pending='';status.textContent=failed?'구글 '+events.length+'건 · '+failed+'개 조회 실패':day.slice(0,7)+' · 구글 '+events.length+'건';apply(events);
  }catch(error){if(request!==serial)return;loaded=key;last=Date.now();pending='';status.textContent=error.message;apply([]);}
  finally{if(request===serial)refresh.disabled=false;}
 }
 refresh.onclick=()=>{calendars=null;load(selected,true);};return {load};
}
