(function(){
  'use strict';
  var M=window.MOIDA,root=document.getElementById('adminAiUsage');if(!M||!root)return;
  var ticket=0,loaded='',owner='',month=new Date(Date.now()+9*3600000).toISOString().slice(0,7);
  var esc=M.esc,number=function(v){return Number(v||0).toLocaleString('ko-KR');};
  function money(v){return v==null?'단가 확인 필요':Number(v)>0&&Number(v)<1?'1원 미만':Math.round(v).toLocaleString('ko-KR')+'원';}
  root.innerHTML='<div class="ai-head"><div><h2>AI 모델·사용 요금</h2><p>사용 중인 모델과 API 비용을 한곳에서 확인하세요.</p></div><div class="ai-controls"><input type="month" id="adminAiMonth" aria-label="사용량 조회 월"><button id="adminAiRefresh" type="button">새로고침</button></div></div><div id="adminAiContent" aria-live="polite"><div class="ai-state">계정 확인 중입니다.</div></div>';
  var input=document.getElementById('adminAiMonth'),refresh=document.getElementById('adminAiRefresh'),content=document.getElementById('adminAiContent');input.value=month;
  function render(data){
    var ai=data.ai||{},total=data.totals||{},rate=data.krwPerUsd,selected=document.getElementById('secretaryModelSelect');
    var current=selected&&selected.value;
    var rows=(data.rows||[]).slice().sort(function(a,b){return (b.costKrw||0)-(a.costKrw||0);});
    var kpis=[['기록된 예상 비용',money(total.costKrw)],['기록된 AI 호출',number(total.calls)+'회'],['사용 토큰',number(total.tokens)],['생성 이미지',number(total.images)+'장']];
    content.innerHTML='<div class="ai-kpis">'+kpis.map(function(x){return '<div class="ai-kpi"><span>'+x[0]+'</span><b>'+x[1]+'</b></div>';}).join('')+'</div>'
      +'<div class="ai-note">'+esc(ai.coverage||'저장된 사용 기록만 집계합니다.')+(total.unpricedCalls?'<br>단가를 확인할 수 없는 '+number(total.unpricedCalls)+'회는 예상 비용에서 제외했습니다.':'')+'</div>'
      +'<section class="ai-section"><h3>기능별 사용 모델</h3><div class="ai-config">'+(ai.configured||[]).map(function(x){return '<div class="ai-config-row"><strong>'+esc(x.name)+'</strong><code>'+esc(x.model)+'</code>'+(x.name==='모아 기본 대화'&&current?'<small>대화창 선택: '+esc(current)+'</small>':'')+(x.note?'<small>'+esc(x.note)+'</small>':'')+'</div>';}).join('')+'</div></section>'
      +'<section class="ai-section"><h3>대화 모델 요금</h3><p>100만 토큰당 USD · '+esc(ai.tier||'Standard')+'</p><div class="ai-models">'+(ai.models||[]).map(function(x){return '<article class="ai-model"><b>'+esc(x.label)+'</b>'+(x.model===current?'<span class="ai-selected">선택 중</span>':'')+'<p>'+esc(x.description)+'</p><dl><dt>입력</dt><dd>$'+x.input+'</dd><dt>캐시 입력</dt><dd>$'+x.cached+'</dd><dt>출력</dt><dd>$'+x.output+'</dd></dl><p>긴 문맥: 입력 $'+x.longInput+' · 출력 $'+x.longOutput+'</p></article>';}).join('')+'</div><p>토큰은 AI가 글을 읽고 쓰는 계산 단위입니다. 대화 문맥과 추론도 사용량에 포함될 수 있습니다.</p></section>'
      +'<section class="ai-section"><h3>도구별 추가 요금</h3>'+(ai.toolPrices||[]).map(function(x){return '<div class="ai-tool"><strong>'+esc(x.name)+'</strong><span>'+esc(x.price)+'</span><small>'+esc(x.note)+'</small></div>';}).join('')+'</section>'
      +'<section class="ai-section"><h3>'+esc(data.month)+' 사용 기록</h3><p>한국 시간 기준 · 현재 로그인 계정의 기록</p>'+(rows.length?'<div class="ai-table-wrap"><table><thead><tr><th>모델·작업</th><th>호출</th><th>토큰</th><th>예상 비용</th></tr></thead><tbody>'+rows.map(function(x){return '<tr><td>'+esc(x.model)+'<small>'+esc(x.operation||'')+'</small></td><td>'+number(x.calls)+'</td><td>'+number(x.total_tokens)+'</td><td>'+money(x.costKrw)+'</td></tr>';}).join('')+'</tbody></table></div>':'<div class="ai-state">이 달에 저장된 사용 기록이 없습니다. 실제 사용이 없거나 집계되지 않은 작업일 수 있습니다.</div>')
      +'<div class="ai-note">'+esc(ai.estimateNote||'실제 청구액과 다를 수 있습니다.')+'<br>환산 기준: $1 = '+number(rate)+'원 · 요금표 확인: '+esc(ai.checkedAt||'확인 필요')+'</div><div class="ai-links"><a href="https://developers.openai.com/api/docs/pricing" target="_blank" rel="noopener noreferrer">공식 요금표 ↗</a><a href="https://platform.openai.com/usage" target="_blank" rel="noopener noreferrer">OpenAI 실제 사용량 ↗</a><a href="https://platform.openai.com/settings/organization/billing/overview" target="_blank" rel="noopener noreferrer">결제·잔액 확인 ↗</a></div></section>';
  }
  async function load(force){
    var user=M.auth&&M.auth.currentUser;if(!user)return;
    var key=user.uid+'|'+input.value;if(!force&&loaded===key)return;loaded=key;owner=user.uid;var n=++ticket;
    refresh.disabled=true;content.innerHTML='<div class="ai-state">모델과 사용 기록을 불러오고 있습니다.</div>';
    try{var token=await user.getIdToken();var response=await fetch('https://moida-gpt.banedict84.workers.dev/usage?month='+encodeURIComponent(input.value),{headers:{Authorization:'Bearer '+token}});var data=await response.json();if(!response.ok||!data.ok)throw Error(data.error&&data.error.message||'사용량을 불러오지 못했습니다.');if(n!==ticket||!M.auth.currentUser||M.auth.currentUser.uid!==owner)return;render(data);}
    catch(e){if(n===ticket){loaded='';content.innerHTML='<div class="ai-state" role="alert">'+esc(e.message||'조회 실패')+'</div>';}}
    finally{if(n===ticket)refresh.disabled=false;}
  }
  input.addEventListener('change',function(){load(true);});refresh.addEventListener('click',function(){load(true);});
  M.onData(function(){var uid=M.auth&&M.auth.currentUser&&M.auth.currentUser.uid;if(!uid){ticket++;loaded='';owner='';content.innerHTML='<div class="ai-state">로그인 후 모델과 사용량을 확인할 수 있습니다.</div>';refresh.disabled=false;return;}load(false);});
  window.addEventListener('hashchange',function(){if(location.hash==='#admin')load(true);});
  // Firebase initializes after this classic script; do not leave the initial page waiting for a data edit.
  (function boot(attempt){if(M.auth&&M.auth.currentUser){load(false);return;}if(attempt<60)setTimeout(function(){boot(attempt+1);},500);})(0);
})();
