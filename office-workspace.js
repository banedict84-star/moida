(function(){
  'use strict';
  var root=document.getElementById('moidaOffice');if(!root)return;
  // Only the eight core characters are registered. Historical staff IDs remain readable in old reports.
  if(!Array.isArray(window.MOIDA_CORE_TEAM)||window.MOIDA_CORE_TEAM.length!==8){document.getElementById('moNotice').textContent='기본 직원 목록을 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.';return;}
  var catalog=window.MOIDA_CORE_TEAM.concat(window.MOIDA_STAFF_CATALOG||[]);
  var legacyDetails={};
  var catalogPage=1,pageSize=24,targetEmployee='',releaseOnly=false;
  var tab='staff',selected=new Set(),config={},runs=[],chosenRun='',owner='',loadedOwner='',generation=0,loadPending=false,loading=false,saving=false,search='',group='전체';
  var statuses={queued:'접수 대기',planning:'업무 배정 중',running:'작업 중',reviewing:'결과 검토 중',reworking:'수정 중',retrying:'재시도 대기',completed:'보고 완료',failed:'오류',needs_attention:'확인 필요'};
  var $=function(id){return document.getElementById(id);};
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function M(){return window.MOIDA||{};}
  function uid(){return M().uidOf?M().uidOf():'';}
  function valid(c){var out={};catalog.forEach(function(e){if(e.core||(c&&c[e.id]&&typeof c[e.id]==='object'))out[e.id]={paused:false};});return out;}
  function staff(active){return catalog.filter(function(e){return e.core||(config[e.id]&&(!active||!config[e.id].paused));});}
  function notice(text){$('moNotice').textContent=text;}
  function assertEditable(){if(!M().auth||!M().auth.currentUser)throw Error('로그인 후 직원을 고용해주세요.');if(window.MOIDA_READONLY)throw Error('읽기 전용 계정은 직원을 변경할 수 없습니다.');if(loadedOwner!==uid())throw Error('직원 설정을 계정에서 먼저 불러와주세요.');if(loading||saving)throw Error('직원 설정을 확인·저장 중입니다. 잠시 후 다시 시도해주세요.');}
  function confirmDismissal(name){return new Promise(function(resolve){var dialog=document.createElement('dialog');dialog.setAttribute('aria-label','직원 고용 해제');dialog.style.cssText='width:min(400px,85vw);padding:24px;border:1px solid #dfe7ec;border-radius:16px;color:#123456';dialog.innerHTML='<h3 style="margin:0 0 12px">고용을 해제할까요?</h3><p style="font-size:13px;line-height:1.7">'+esc(name)+'의 고용을 해제합니다. 기존 업무와 보고는 유지됩니다.</p><div style="display:flex;gap:8px;justify-content:flex-end"><button class="mo-outline" data-cancel>취소</button><button class="mo-primary" data-confirm>고용 해제 확인</button></div>';var accepted=false;dialog.querySelector('[data-confirm]').onclick=function(){accepted=true;dialog.close();};dialog.querySelector('[data-cancel]').onclick=function(){dialog.close();};dialog.addEventListener('close',function(){dialog.remove();resolve(accepted);},{once:true});root.append(dialog);dialog.showModal();});}
  async function persist(next){
    assertEditable();var me=uid(),gen=generation,previous=config;next=valid(next);saving=true;config=next;render();
    try{
      if(!M().db||!M().fs)throw Error('계정 저장 연결을 확인하지 못했습니다.');
      await M().fs.setDoc(M().fs.doc(M().db,'tenants',me),{officeEmployees:next,officeEmployeesUpdatedAt:Date.now()},{mergeFields:['officeEmployees','officeEmployeesUpdatedAt']});
      if(gen!==generation||uid()!==me)return;
      try{localStorage.setItem('moida_office_employees_'+me,JSON.stringify(next));}catch(_){}
      notice('직원 설정이 계정에 저장됐습니다. 새 업무부터 적용됩니다.');
    }catch(e){if(gen===generation){config=previous;notice('저장하지 못해 이전 설정으로 되돌렸습니다. '+(e.message||'연결을 확인해주세요.'));}e.officeHandled=true;throw e;}
    finally{if(gen===generation){saving=false;render();}}
  }
  async function load(){
    var me=uid();if(!me||me==='default')return;
    if(owner!==me){owner=me;generation++;loadedOwner='';loadPending=false;loading=false;saving=false;config={};selected.clear();chosenRun='';runs=[];search='';group='전체';catalogPage=1;targetEmployee='';try{config=valid(JSON.parse(localStorage.getItem('moida_office_employees_'+me)||'{}'));}catch(_){}render();}
    if(loadedOwner===me||loadPending||!M().db||!M().fs||!M().auth||!M().auth.currentUser)return;
    var gen=generation;loadPending=true;loading=true;render();
    try{var snap=await M().fs.getDoc(M().fs.doc(M().db,'tenants',me));if(gen!==generation)return;config=valid(snap.exists()?snap.data().officeEmployees:{});loadedOwner=me;notice('');}
    catch(e){if(gen===generation)notice('직원 설정을 계정에서 읽지 못했습니다. 다시 불러오기를 눌러주세요.');}
    finally{if(gen===generation){loading=false;loadPending=false;render();}}
  }
  function selectedRun(){return runs.find(function(r){return r.id===chosenRun;})||runs[0];}
  function pill(text,cls){return '<span class="mo-pill '+(cls||'')+'">'+esc(text)+'</span>';}
  function avatar(e,large){if(e&&e.portrait)return '<img class="mo-core-portrait" src="'+esc(e.portrait)+'" alt="'+esc(e.person)+' '+esc(e.name)+'" style="height:auto;object-fit:contain" width="320" height="320">';if(e&&e.core){var frames=['0 0 444 470','444 0 446 470','890 0 455 466','1345 0 429 470','0 470 444 417','444 470 446 417','890 466 455 421','1345 470 429 417'];return '<span class="mo-core-portrait" role="img" aria-label="'+esc(e.person)+' 캐릭터"><svg viewBox="'+frames[e.portraitIndex]+'" aria-hidden="true" preserveAspectRatio="xMidYMid meet"><defs><clipPath id="mo-core-clip-'+e.portraitIndex+'"><rect x="'+frames[e.portraitIndex].split(' ')[0]+'" y="'+frames[e.portraitIndex].split(' ')[1]+'" width="'+frames[e.portraitIndex].split(' ')[2]+'" height="'+frames[e.portraitIndex].split(' ')[3]+'"/></clipPath></defs><image href="assets/moida-core-team-v1.png" width="1774" height="887" clip-path="url(#mo-core-clip-'+e.portraitIndex+')"/></svg></span>';}if(e&&e.output)return '<img class="mo-avatar mo-staff-portrait" src="assets/staff/'+esc(e.id)+'.webp" alt="'+esc(e.person)+' AI 가상 직원 프로필" width="512" height="512" loading="lazy" decoding="async">';var i=catalog.indexOf(e);if(i<0)return '<span class="mo-avatar">검</span>';return '<span role="img" aria-label="'+esc(e.name)+' 가상 프로필" title="AI로 생성한 가상 직원 프로필" class="mo-avatar mo-portrait'+(large?' mo-portrait-card':'')+'" style="background-position:'+(i%4*100/3)+'% '+(i<4?0:100)+'%"></span>';}
  function busy(r){return r&&!/^(completed|failed)$/.test(r.status);}
  function employee(id){return catalog.find(function(e){return e.id===id;});}
  function needsConnection(e){if(e.id!=='schedule'&&e.connection!=='calendar')return false;var b=$('googleCalendarConnect');return !b||b.dataset.connected!=='true'||b.dataset.connectionOwner!==uid();}
  window.MOIDA_OFFICE_ASSIGNMENTS=function(text){
    assertEditable();if(loadedOwner!==uid())throw Error('직원 설정을 계정에서 불러온 후 지시해주세요.');
    var active=staff(true);if(!active.length)throw Error('직원 고용 탭에서 업무를 맡길 직원을 먼저 고용해주세요.');
    var named=active.filter(function(e){return text.includes(e.person);});
    var chosen=named.length?named:[];
    if(!chosen.length){
      var ranked=active.map(function(e){return {e:e,score:e.core?window.MOIDA_CORE_SCORE(e,text):e.output?window.MOIDA_STAFF_ROLES.score(e,text):((e.pattern.test(text)?10:0)+(text.includes(e.person)?100:0))};}).filter(function(x){return x.score>0;}).sort(function(a,b){return b.score-a.score;});
      if(ranked.some(function(x){return x.score>=80;}))ranked=ranked.filter(function(x){return x.score>=80;});
      chosen=ranked.slice(0,8).map(function(x){return x.e;});
      if(!chosen.length)chosen=active.filter(function(e){return e.id==='core_moa';});
      if(!chosen.length&&active.length===1)chosen=active;
      if(!chosen.length)throw Error('업무를 맡길 직원을 선택하거나 지시에 직원 이름·직무를 적어주세요.');
    }
    return chosen.map(function(e){return {agent:e.id,instruction:'담당 직원: '+e.person+' · '+e.name+'. '+e.description+(e.output?'\n목표 결과물: '+e.output:'')+'\n다음 원지시 중 자신의 전문 범위만 준비하고 비서실장에게 보고한다.\n'+text};});
  };
  function renderDesk(){
    var target=$('moEmployeeTarget');
    if(!target){var label=document.createElement('label');label.className='mo-target-label';label.htmlFor='moEmployeeTarget';label.textContent='담당 직원';target=document.createElement('select');target.id='moEmployeeTarget';label.append(target);$('officeCommand').prepend(label);}
    if(targetEmployee&&!config[targetEmployee])targetEmployee='';
    target.innerHTML='<option value="">업무에 맞춰 자동 배정 (최대 8명)</option>'+staff(true).map(function(e){return '<option value="'+esc(e.id)+'">'+esc(e.person+' · '+e.name)+'</option>';}).join('');target.value=targetEmployee;
    var r=selectedRun(),activeCount=r?(r.tasks||[]).filter(function(t){return busy(t);}).length:0;
    $('moSummary').innerHTML='<span>고용 직원 <b>'+staff(false).length+'명</b></span><span>진행 업무 <b>'+runs.filter(busy).length+'건</b></span><span>완료 보고 <b>'+runs.filter(function(x){return x.status==='completed';}).length+'건</b></span>';
    $('moReports').innerHTML=r?'<div class="mo-request">'+esc(r.instruction)+'</div><article class="mo-report"><div class="mo-row"><h3>비서실장 결과 보고</h3>'+pill(statuses[r.status]||r.status,r.status==='failed'?'warn':'')+'</div><pre>'+esc(r.summary||r.error||(r.status==='completed'?'보고 내용이 없습니다.':'직원이 업무를 준비하고 있습니다. 결과가 도착하면 여기에 표시됩니다.'))+'</pre>'+(r.summary?'<div class="mo-actions"><button data-mo-action="preview" class="mo-outline">크게 보기</button><button data-mo-action="download" class="mo-outline">보고서 다운로드</button><button data-mo-action="revise" class="mo-primary">수정 요청</button></div>':'')+'</article>':'<div class="mo-empty"><b>나만의 직원과 일을 시작하세요</b>직원 고용 탭에서 필요한 직원을 선택한 뒤<br>아래에 업무를 입력해주세요.<div><button data-mo-tab="hire" class="mo-primary" style="margin-top:18px">직원 고용하기</button></div></div>';
    $('moProgress').innerHTML=r?'<b>'+esc(String(r.instruction||'').slice(0,70))+'</b><p>'+pill(statuses[r.status]||r.status)+'</p>'+(r.tasks||[]).map(function(t){return '<div class="mo-progress-item '+(t.status==='completed'?'done':'')+'"><span>'+(t.status==='completed'?'✓':'·')+'</span><div>'+esc(employee(t.agent)?.name||(t.agent==='verification'?'비서실장 품질 확인':t.title))+'<small class="mo-muted" style="display:block">'+esc(statuses[t.status]||t.status)+'</small></div></div>';}).join('')+(r.status==='completed'?'<p class="mo-muted">결과를 검토하고 필요한 내용을 수정 요청하세요.</p>':''):'<p class="mo-muted">업무를 지시하면 진행 단계가 표시됩니다.</p>';
    $('moParticipants').innerHTML=r&&(r.tasks||[]).length?(r.tasks||[]).map(function(t){var e=employee(t.agent);return '<div class="mo-person">'+avatar(e,false)+'<div><b>'+esc(e?e.person+' · '+e.name:'비서실장 품질 확인')+'</b><small>'+esc(statuses[t.status]||t.status)+'</small></div></div>';}).join(''):'<p class="mo-muted">현재 선택한 업무에 참여하는 직원이 표시됩니다.</p>';
    var tools=new Map();staff(true).forEach(function(e){e.tools.forEach(function(t){tools.set(t[1],t[0]);});});
    $('moTools').innerHTML=tools.size?Array.from(tools).map(function(t){return '<button class="mo-outline" data-mo-tool="'+esc(t[0])+'">'+esc(t[1])+' ↗</button>';}).join(''):'<span class="mo-muted">직원을 고용하면 관련 도구가 표시됩니다.</span>';
  }
  function openCoreDetails(e){
    var dialog=document.createElement('dialog');dialog.className='mo-core-dialog';dialog.setAttribute('aria-labelledby','moCoreDialogTitle');
    dialog.innerHTML='<header><div><span>'+esc(e.name)+'</span><h2 id="moCoreDialogTitle">'+esc(e.person)+' · 하는 일과 연결 도구</h2></div><button type="button" class="mo-outline" data-close aria-label="팝업 닫기">닫기</button></header><section><h3>하는 일</h3><p>'+esc(e.description)+'</p><h3>작업 결과</h3><p>'+esc(e.output)+'</p><h3>연결 도구</h3><div class="mo-tools">'+e.tools.map(function(t){return '<button type="button" class="mo-outline" data-mo-tool="'+esc(t[1])+'">'+esc(t[0])+' ↗</button>';}).join('')+'</div><p>'+esc(e.requirements)+'</p><p class="mo-info">'+esc(e.approval)+'</p></section>';
    dialog.addEventListener('click',function(ev){var button=ev.target.closest('button');if(button&&button.hasAttribute('data-close'))dialog.close();if(button&&button.dataset.moTool){dialog.close();openOfficeTool(button.dataset.moTool);}if(ev.target===dialog){var rect=dialog.getBoundingClientRect();if(ev.clientX<rect.left||ev.clientX>rect.right||ev.clientY<rect.top||ev.clientY>rect.bottom)dialog.close();}});
    dialog.addEventListener('close',function(){dialog.remove();});document.body.append(dialog);dialog.showModal();
  }
  function openOfficeTool(target){if(target==='weekly-events'){window.openWeeklyEvents();}else if(target==='crm-sheets'){window.__moidaOpenCrmManager=true;window.__go('crm');var frame=document.querySelector('[data-page=crm] iframe');if(frame?.contentWindow?.openCrmManager){window.__moidaOpenCrmManager=false;frame.contentWindow.openCrmManager();}}else if(target==='calendar'){var g=$('googleCalendarConnect');if(g)g.click();}else if(target==='toolkit'){window.__go('secretary');var t=$('officeToolsOpen');if(t)t.click();}else window.__go(target);}
  function renderCard(e,hired){if(e.specialist)return '<article class="mo-core-card" data-employee-id="'+e.id+'">'+avatar(e,true)+'<div class="mo-core-body"><span class="mo-core-label">전문 직원 · '+esc(e.name)+'</span><h3>'+esc(e.person)+' <small>'+esc(e.name)+'</small></h3><p>'+esc(e.description)+'</p><button class="mo-core-details" data-mo-details="'+e.id+'" aria-haspopup="dialog">하는 일과 연결 도구 ↗</button>'+(hired?'<div class="mo-actions" style="display:flex;gap:6px;margin-top:auto;width:100%"><button class="mo-outline" data-mo-remove="'+e.id+'">제외</button></div>':'<button class="mo-primary mo-full" data-mo-add="'+e.id+'" '+(config[e.id]||loading||saving?'disabled':'')+'>'+(config[e.id]?'우리 팀에 추가됨':'우리 팀에 추가')+'</button>')+'</div></article>';if(e.core)return '<article class="mo-core-card" data-employee-id="'+e.id+'">'+avatar(e,true)+'<div class="mo-core-body"><span class="mo-core-label">기본 팀 · 기본 제공</span><h3>'+esc(e.person)+' <small>'+esc(e.name)+'</small></h3><p>'+esc(e.description)+'</p><button type="button" class="mo-core-details" data-mo-details="'+e.id+'" aria-haspopup="dialog">하는 일과 연결 도구 ↗</button></div></article>';
    var cfg=config[e.id];
    var role=e.output?e:legacyDetails[e.id];
    var details=role?'<details class="mo-role-details"><summary>업무 상세</summary><dl>'+[['직원 ID',e.id],['담당 업무',role.duties||e.description],['결과물',role.output],['필요 자료·연결',role.requirements],[e.output?'계획된 근무 방식':'근무 방식',role.workMode||'요청 시 자료 기반 작성·분석'],[e.output?'계획된 실행 조건':'실행 조건',role.trigger||'직원 선택 또는 해당 업무 지시 시 실행'],['승인·검토',role.approval]].map(function(row){return '<dt>'+esc(row[0])+'</dt><dd>'+esc(row[1])+'</dd>';}).join('')+'</dl><p>현재는 요청 시 자료 기반 작성·분석을 수행합니다. 자동 근무, 외부 변경·발송과 이미지·영상·파일 제작은 별도 도구 연결이 필요합니다.</p></details>':'';
    var overlayBadge=needsConnection(e)?'<button type="button" class="mo-connect-required" data-mo-tool="calendar" aria-label="'+esc(e.person)+' 캘린더 계정 연결 필요">계정 연결 필요</button>':'<span title="'+esc(e.group)+'">'+esc(e.output?e.id:e.group)+'</span>';
    return '<article class="mo-staff-card '+(selected.has(e.id)?'selected':'')+'" data-employee-id="'+esc(e.id)+'">'+(!hired?'<label class="mo-check"><input type="checkbox" data-mo-select="'+e.id+'" aria-label="'+esc(e.person+' '+e.name)+' 선택" '+(cfg||loading||saving?'disabled ':'')+(selected.has(e.id)||cfg?'checked':'')+'></label>':'')+'<div class="mo-staff-profile"><div class="mo-staff-photo">'+avatar(e,true)+(cfg?'<div class="mo-staff-state">'+pill('고용중','hired')+'</div>':'')+'<div class="mo-staff-overlay"><h3>'+esc(e.person)+'</h3>'+overlayBadge+'</div></div><div class="mo-staff-body"><div class="mo-staff-job">'+esc(e.name)+'</div>'+(e.output?'<div class="mo-role-field" title="'+esc(e.group)+'">'+esc(e.group)+'</div>':'')+'<p class="mo-staff-duty" title="'+esc(e.description)+'">'+esc(e.description)+'</p><div class="mo-staff-price"><span>급여</span><strong>미정</strong></div>'+details+'</div></div>'+(hired?'<div class="mo-actions"><button class="mo-link" data-mo-remove="'+e.id+'" '+(saving?'disabled':'')+'>고용 해제</button></div>':'')+'</article>';
  }
  function renderCatalog(){
    var hired=tab==='staff',q=search.trim().toLowerCase(),list=catalog.filter(function(e){return (hired?(e.core||config[e.id]):!e.core)&&(group==='전체'||e.group===group)&&(!releaseOnly||e.release==='1차 출시 후보')&&(!q||[e.id,e.person,e.name,e.group,e.description,e.output||''].join(' ').toLowerCase().includes(q));});
    var pages=Math.max(1,Math.ceil(list.length/pageSize));catalogPage=Math.min(catalogPage,pages);
    var groups=['전체'].concat(Array.from(new Set(catalog.map(function(e){return e.group;}))));
    $('moWorkspace').innerHTML='<div class="mo-grid mo-catalog-layout"><section><div class="mo-summary"><span>등록 직원 <b>'+catalog.length+'명</b></span><span>우리 팀 <b>'+staff(false).length+'명</b></span></div><div class="mo-catalog-toolbar"><input id="moSearch" value="'+esc(search)+'" placeholder="이름·직무·분야·직원 ID 검색" aria-label="직원 검색"><select id="moFilter" aria-label="업무 분류">'+groups.map(function(g){return '<option'+(group===g?' selected':'')+'>'+esc(g)+'</option>';}).join('')+'</select><button class="mo-outline" data-mo-action="reload">다시 불러오기</button></div><label class="mo-release-filter"><input id="moReleaseFilter" type="checkbox" '+(releaseOnly?'checked':'')+'> 1차 출시 후보만 보기</label><p class="mo-catalog-count" role="status">검색 결과 '+list.length+'명 · '+catalogPage+' / '+pages+' 페이지</p><div class="mo-staff-grid">'+(list.length?list.slice((catalogPage-1)*pageSize,catalogPage*pageSize).map(function(e){return renderCard(e,hired);}).join(''):'<div class="mo-empty">'+(hired?'조건에 맞는 직원이 없습니다.':'추가 등록된 전문 직원이 없습니다. 필요한 직원부터 하나씩 준비합니다.')+'</div>')+'</div><nav class="mo-pagination" aria-label="직원 목록 페이지"><button class="mo-outline" data-mo-page="'+(catalogPage-1)+'" '+(catalogPage===1?'disabled':'')+'>이전</button><span>'+catalogPage+' / '+pages+'</span><button class="mo-outline" data-mo-page="'+(catalogPage+1)+'" '+(catalogPage===pages?'disabled':'')+'>다음</button></nav></section><aside class="mo-panel mo-selection"><h3>'+(hired?'우리 팀 관리':'전문 직원 추가')+'</h3>'+(hired?'<p>직원을 선택해 업무를 맡길 수 있습니다. 고용 해제 후에도 기존 업무와 보고는 유지됩니다.</p><button data-mo-tab="hire" class="mo-primary mo-full">＋ 전문 직원 추가</button>':'<div class="mo-selected-list">'+Array.from(selected).map(function(id){var e=employee(id);return '<div class="mo-person">'+avatar(e,false)+'<div><b>'+esc(e.person)+'</b><small>'+esc(e.name)+'</small></div><button class="mo-link" data-mo-deselect="'+id+'" aria-label="'+esc(e.person)+' 선택 취소">×</button></div>';}).join('')+'</div><p>직원 카드에서 ‘우리 팀에 추가’를 누른 뒤, 모아에게 담당자 이름과 할 일을 알려주세요.</p>')+'<div class="mo-info" style="margin-top:18px"><b>모아 · AI 비서</b><br>직원 배정과 결과 검토·보고를 맡습니다.</div><p>기본 직원 8명으로 시작합니다. 전문 직원은 필요한 역할부터 하나씩 추가할 예정입니다.</p><p>자동 근무·외부 발송·이미지·영상 제작은 별도 연결이 필요합니다. 각 직원의 업무 상세에서 조건을 확인하세요.</p></aside></div>';
  }
  function render(){
    root.dataset.teamView=tab;
    root.querySelectorAll('.mo-tabs [data-mo-tab]').forEach(function(b){b.setAttribute('aria-selected',b.dataset.moTab===tab?'true':'false');});$('moStaffCount').textContent=staff(false).length;
    $('moDesk').hidden=tab!=='desk';$('moWorkspace').hidden=tab==='desk';
    if(tab==='desk')renderDesk();else if(tab==='hire'||tab==='staff')renderCatalog();else $('moWorkspace').innerHTML='<section class="mo-panel"><h3>업무 현황</h3><div class="mo-table-list">'+(runs.length?runs.map(function(r){return '<button class="mo-run-button" data-mo-run="'+esc(r.id)+'"><span><strong>'+esc(r.instruction)+'</strong><small>'+esc(new Date(r.createdAt).toLocaleString('ko-KR'))+'</small></span>'+pill(statuses[r.status]||r.status)+'</button>';}).join(''):'<div class="mo-empty">아직 지시한 업무가 없습니다.</div>')+'</div></section>';
  }
  root.addEventListener('change',function(ev){var el=ev.target;if(el.dataset.moSelect){el.checked?selected.add(el.dataset.moSelect):selected.delete(el.dataset.moSelect);render();}if(el.id==='moFilter'){group=el.value;catalogPage=1;render();}if(el.id==='moReleaseFilter'){releaseOnly=el.checked;catalogPage=1;render();}if(el.id==='moEmployeeTarget'){targetEmployee=el.value;}});
  root.addEventListener('input',function(ev){if(ev.target.id==='moSearch'){var pos=ev.target.selectionStart;search=ev.target.value;catalogPage=1;renderCatalog();$('moSearch').focus();$('moSearch').setSelectionRange(pos,pos);}});
  root.addEventListener('click',async function(ev){
    var b=ev.target.closest('button');if(!b||b.disabled)return;
    if(b.dataset.moDetails){openCoreDetails(employee(b.dataset.moDetails));return;}
    if(b.dataset.moTab){tab=b.dataset.moTab;search='';group='전체';catalogPage=1;releaseOnly=false;render();return;}
    if(b.dataset.moPage){catalogPage=Number(b.dataset.moPage);renderCatalog();$('moSearch').focus();return;}
    if(b.dataset.moAssign){targetEmployee=b.dataset.moAssign;var e=employee(targetEmployee);window.__go('secretary');var input=$('aiInput');if(input){input.value=e.person+'에게 부탁할 일: ';input.focus();input.dispatchEvent(new Event('input',{bubbles:true}));}return;}
    if(b.dataset.moDeselect){selected.delete(b.dataset.moDeselect);render();return;}
    if(b.dataset.moRun){chosenRun=b.dataset.moRun;tab='desk';render();return;}
    try{
      if(b.dataset.moAdd){var next=JSON.parse(JSON.stringify(config));next[b.dataset.moAdd]={paused:false};await persist(next);tab='staff';render();}
      if(b.dataset.moAction==='hire'){var next=JSON.parse(JSON.stringify(config));selected.forEach(function(id){next[id]={paused:false};});await persist(next);selected.clear();tab='staff';catalogPage=1;search='';group='전체';releaseOnly=false;render();}
      if(b.dataset.moRemove&& !employee(b.dataset.moRemove)?.core){var id=b.dataset.moRemove,next=JSON.parse(JSON.stringify(config));if(!next[id])return;if(!await confirmDismissal(employee(id).name))return;delete next[id];await persist(next);}
      if(b.dataset.moAction==='reload'){loadedOwner='';load();}
      if(b.dataset.moAction==='revise'){var r=selectedRun();$('officeInstruction').value='다음 업무의 결과를 수정해줘.\n원지시: '+String(r.instruction||'').slice(0,2500)+'\n기존 보고: '+String(r.summary||'').slice(0,7000)+'\n수정 사항: ';$('officeInstruction').focus();}
      if(b.dataset.moAction==='preview'){var r=selectedRun(),dialog=document.createElement('dialog');dialog.className='mo-preview-dialog';dialog.innerHTML='<h3>비서실장 결과 보고</h3><pre>'+esc(r.summary)+'</pre><button class="mo-outline">닫기</button>';dialog.querySelector('button').onclick=function(){dialog.close();};dialog.addEventListener('close',function(){dialog.remove();});document.body.append(dialog);dialog.showModal();}
      if(b.dataset.moAction==='download'){var r=selectedRun(),blob=new Blob([r.instruction+'\n\n'+r.summary],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='모이다_업무보고_'+new Date(r.createdAt).toISOString().slice(0,10)+'.txt';a.click();setTimeout(function(){URL.revokeObjectURL(url);},1000);}
      if(b.dataset.moTool)openOfficeTool(b.dataset.moTool);
    }catch(e){if(!e.officeHandled)notice(e.message||'작업하지 못했습니다.');}
  });
  $('officeCommand').addEventListener('submit',function(){chosenRun='';},true);
  window.addEventListener('moida:calendar-connection',function(){if(tab==='hire'||tab==='staff')renderCatalog();});
  window.addEventListener('moida:agent-runs',function(ev){runs=(Array.isArray(ev.detail)?ev.detail:[]).filter(function(r){return !r.tenantId||r.tenantId===uid();});render();});
  if(M().onData)M().onData(load);runs=window.MOIDA_AGENT_RUNS||[];render();load();
})();
