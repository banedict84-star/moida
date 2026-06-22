/* 공지사항 안 읽음 뱃지 (실제 새 공지 수) — 전 페이지 공통 스크립트 */
(function(){
  function uid(){ try{ return JSON.parse(sessionStorage.getItem('moida_auth_user')||'{}').uid||'default'; }catch(e){ return 'default'; } }
  function dn(d){ return +String(d||'').replace(/\D/g,''); }
  window.setNoticesAll=function(dates){ try{ localStorage.setItem('moida_notices_all_'+uid(), JSON.stringify(dates||[])); }catch(e){} };
  window.markNoticesRead=function(){ try{ var u=uid(); var all=JSON.parse(localStorage.getItem('moida_notices_all_'+u)||'[]'); var mx=all.reduce(function(a,b){ return Math.max(a,dn(b)); },0); localStorage.setItem('moida_notices_read_'+u, String(mx)); }catch(e){} };
  window.updateNoticeBadge=function(){
    try{
      var u=uid();
      var all=JSON.parse(localStorage.getItem('moida_notices_all_'+u)||'[]');
      var rk='moida_notices_read_'+u;
      if(localStorage.getItem(rk)==null){ var seed=all.reduce(function(a,b){ return Math.max(a,dn(b)); },0); localStorage.setItem(rk, String(seed)); }
      var read=+(localStorage.getItem(rk)||0);
      var unread=all.filter(function(d){ return dn(d)>read; }).length;
      var badge=null; document.querySelectorAll('.nav-item').forEach(function(a){ var nm=a.querySelector('.nm'); if(nm&&nm.textContent.trim()==='공지사항') badge=a.querySelector('.badge'); });
      if(badge){ if(unread>0){ badge.textContent=unread>99?'99+':unread; badge.style.display=''; } else { badge.style.display='none'; } }
    }catch(e){}
  };
  updateNoticeBadge();
})();
