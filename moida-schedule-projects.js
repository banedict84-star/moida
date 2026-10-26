import {DEFAULT_PROJECTS,projectForEvent,eventProjectStyle} from './schedule-projects.js';
export function createProjectUI({user,canWrite,changed,onCalendar}){
 const $=id=>document.getElementById(id),el=(tag,text)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;return e;};
 let projects=DEFAULT_PROJECTS.map(p=>({...p})),calendars=[],owner='',loaded='',revision=0,pending=false,editing=null;
 const hidden=new Set(),dialog=$('projectEditor'),form=$('projectForm'),f=form.elements;
 async function api(path,body){const u=user(),uid=u?.uid;if(!uid)throw Error('로그인이 필요합니다.');const token=await u.getIdToken();if(user()?.uid!==uid)throw Error('계정이 변경되었습니다.');const r=await fetch('https://moida-gpt.banedict84.workers.dev'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();if(user()?.uid!==uid)throw Error('계정이 변경되었습니다.');if(!r.ok)throw Error(data.error?.message||'프로젝트를 저장하지 못했습니다.');return data;}
 function render(){
  $('projectList').replaceChildren();
  for(const p of projects){const row=el('div'),label=el('label'),check=el('input'),dot=el('i'),name=el('span',p.name),edit=el('button','색상·설정');row.className='project-row';check.type='checkbox';check.checked=!hidden.has(p.id);check.onchange=()=>{check.checked?hidden.delete(p.id):hidden.add(p.id);changed();};dot.className='category-dot';dot.style.setProperty('--color',p.color);label.append(check,dot,name);edit.type='button';edit.className='project-settings';edit.setAttribute('aria-label',p.name+' 색상 및 프로젝트 설정');edit.onclick=()=>open(p);row.append(label,edit);$('projectList').append(row);}
  const select=document.querySelector('#form [name=projectId]'),previous=select.value;select.replaceChildren();
  for(const p of projects){const option=el('option',p.name+(p.calendarId?' · 구글 연결':''));option.value=p.id;select.append(option);}if(projects.some(p=>p.id===previous))select.value=previous;
  $('projectAdd').disabled=!canWrite()||!loaded;
 }
 async function load(){const uid=user()?.uid;if(!uid)return;if(owner!==uid){owner=uid;loaded='';revision++;projects=DEFAULT_PROJECTS.map(p=>({...p}));calendars=[];hidden.clear();}if(loaded===uid||loaded==='loading:'+uid)return;loaded='loading:'+uid;const id=++revision;
  try{const data=await api('/schedule/projects');if(id!==revision)return;projects=data.projects;loaded=uid;render();changed();}
  catch(e){if(id!==revision)return;loaded='';$('projectStatus').textContent=e.message;render();}
 }
 function options(){f.calendarId.replaceChildren();const no=el('option','모이다에만 저장');no.value='';f.calendarId.append(no);for(const c of calendars.filter(c=>['owner','writer','writerWithoutPrivateAccess'].includes(c.accessRole))){const o=el('option',c.name+' · '+c.id);o.value=c.id;f.calendarId.append(o);}if(editing?.calendarId&&!calendars.some(c=>c.id===editing.calendarId)){const o=el('option','연결 확인 필요 · '+editing.calendarId);o.value=editing.calendarId;f.calendarId.append(o);}}
 function open(p=null){editing=p;form.reset();f.name.value=p?.name||'';f.color.value=p?.color||'#8d68bd';f.colorHex.value=f.color.value;preview();options();f.calendarId.value=p?.calendarId||'';$('projectMessage').textContent='';$('projectTitle').textContent=p?'프로젝트 설정':'새 프로젝트';$('projectSave').disabled=!canWrite()||pending;dialog.showModal();}
 function preview(){const sample=$('projectColorPreview');sample.style.setProperty('--project-color',f.color.value);sample.textContent=f.name.value.trim()||'선택한 색상의 일정 미리보기';}
 f.color.oninput=()=>{f.colorHex.value=f.color.value;f.colorHex.setCustomValidity('');preview();};
 f.colorHex.oninput=()=>{const value=f.colorHex.value.trim();const valid=/^#[0-9a-f]{6}$/i.test(value);f.colorHex.setCustomValidity(valid?'':'#으로 시작하는 6자리 색상 코드를 입력해 주세요.');if(valid){f.color.value=value;preview();}};
 f.name.oninput=preview;
 form.onsubmit=async e=>{e.preventDefault();if(pending||!canWrite())return;pending=true;$('projectSave').disabled=true;$('projectCancel').disabled=true;const uid=user()?.uid;try{const p={id:editing?.id||crypto.randomUUID(),name:f.name.value,color:f.color.value,calendarId:f.calendarId.value};const data=await api('/schedule/projects',p);if(user()?.uid!==uid)return;projects=data.projects;dialog.close();render();changed();if(p.calendarId)await onCalendar(p.calendarId);$('projectStatus').textContent='프로젝트를 저장했습니다.';}catch(e){$('projectMessage').textContent=e.message;}finally{pending=false;$('projectSave').disabled=false;$('projectCancel').disabled=false;}};
 $('projectAdd').onclick=()=>open();$('projectCancel').onclick=()=>{if(!pending)dialog.close();};dialog.addEventListener('cancel',e=>{if(pending)e.preventDefault();});render();
 return {load,render,all:()=>projects,find:id=>projects.find(p=>p.id===id),forEvent:e=>projectForEvent(e,projects),style:e=>eventProjectStyle(e,projects),visible:e=>!hidden.has(projectForEvent(e,projects)?.id),calendars:list=>{calendars=list;},writable:id=>calendars.some(c=>c.id===id&&['owner','writer','writerWithoutPrivateAccess'].includes(c.accessRole))};
}
