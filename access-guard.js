/* access-guard.js — 구독 기반 접근 제어 (전 페이지 공통)
   · 총관리자: 항상 전체 사용
   · 기간 미부여(미승인 가입자): 입장 차단(승인 대기 화면)
   · 기간 만료: 읽기 전용(데이터 저장 차단 + 안내 배너)
   초대받은 사용자는 소속 의원(ownerUid)의 구독 상태를 따릅니다.
   ※ 안전장치: 구독 정보를 못 읽으면(권한/네트워크 오류) 막지 않고 통과(fail-open). */
(function(){
  var SUPER_ADMIN = 'banedict84@gmail.com';
  var B = "https://www.gstatic.com/firebasejs/10.12.0/";

  Promise.all([
    import(B+"firebase-app.js"),
    import(B+"firebase-auth.js"),
    import(B+"firebase-firestore.js")
  ]).then(function(m){
    var appMod=m[0], authMod=m[1], fsMod=m[2];
    // 페이지가 만든 기본 앱에 그대로 붙는다(직접 initializeApp 하면 충돌·인증상태 분리됨).
    return waitForApp(appMod).then(function(app){
      if(!app){ console.warn('access-guard: Firebase 앱 없음(통과)'); return; }
      var auth = authMod.getAuth(app);
      var db = fsMod.getFirestore(app);
      authMod.onAuthStateChanged(auth, function(user){
        if(!user) return; // 미로그인 → 각 페이지가 index.html로 보냄
        if((user.email||'').toLowerCase()===SUPER_ADMIN) return; // 총관리자: 전체 사용
        checkAccess(user, auth, authMod, fsMod, db);
      });
    });
  }).catch(function(e){ console.warn('access-guard 로드 실패(통과):', e); });

  // 페이지 모듈이 initializeApp() 할 때까지 대기(최대 ~10초)
  function waitForApp(appMod){
    return new Promise(function(res){
      var n=0;
      (function chk(){
        if(appMod.getApps().length) return res(appMod.getApp());
        if(++n>200) return res(null);
        setTimeout(chk, 50);
      })();
    });
  }

  async function checkAccess(user, auth, authMod, fsMod, db){
    var doc=fsMod.doc, getDoc=fsMod.getDoc;
    var ownerUid = user.uid;
    // 초대받은 사용자면 소속 의원(ownerUid)의 구독을 따름
    try{
      var emailKey=(user.email||'').replace(/\./g,'_').replace(/@/g,'__');
      var inv=await getDoc(doc(db,'invitations',emailKey));
      if(inv.exists() && inv.data().ownerUid) ownerUid=inv.data().ownerUid;
    }catch(e){}
    var end='';
    try{
      var ts=await getDoc(doc(db,'tenants',ownerUid));
      if(ts.exists() && ts.data().subscriptionEnd) end=ts.data().subscriptionEnd;
    }catch(e){ console.warn('access-guard 구독 조회 실패(통과):', e); return; }
    if(!end){ showBlock(auth, authMod); return; }          // 기간 미부여 → 차단
    var today=new Date(); today.setHours(0,0,0,0);
    var ed=new Date(String(end)+'T23:59:59');
    if(isNaN(ed.getTime())) return;                          // 날짜 형식 이상 → 통과
    if(ed < today) enableReadonly(end);                      // 만료 → 읽기전용
    // 유효기간 내 → 전체 사용(아무 것도 안 함)
  }

  function showBlock(auth, authMod){
    if(document.getElementById('mo-guard-block')) return;
    var html =
      '<div id="mo-guard-block" style="position:fixed;inset:0;z-index:2147483647;background:#f3f5f8;display:flex;align-items:center;justify-content:center;font-family:inherit">'
      +'<div style="max-width:420px;width:88%;background:#fff;border:1px solid #e6e9ef;border-radius:18px;padding:38px 32px;text-align:center;box-shadow:0 12px 40px rgba(20,30,60,.12)">'
      +'<div style="width:60px;height:60px;border-radius:50%;background:#eef2fb;display:flex;align-items:center;justify-content:center;margin:0 auto 18px"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#3b5bdb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>'
      +'<h2 style="margin:0 0 10px;font-size:19px;color:#1a2138">승인 대기 중입니다</h2>'
      +'<p style="margin:0 0 22px;font-size:14px;line-height:1.6;color:#5b657a">가입이 완료되었습니다.<br>관리자 승인(이용 기간 부여) 후 이용하실 수 있습니다.<br>승인을 원하시면 관리자에게 문의해 주세요.</p>'
      +'<button id="mo-guard-logout" style="width:100%;padding:12px;border:0;border-radius:10px;background:#3b5bdb;color:#fff;font-size:14px;font-weight:600;cursor:pointer">다른 계정으로 로그인</button>'
      +'</div></div>';
    function inject(){
      if(!document.body){ setTimeout(inject,80); return; }
      document.body.insertAdjacentHTML('beforeend', html);
      document.documentElement.style.overflow='hidden';
      document.getElementById('mo-guard-logout').addEventListener('click', function(){
        authMod.signOut(auth).then(function(){ try{ sessionStorage.clear(); }catch(e){} location.href='index.html'; });
      });
    }
    inject();
  }

  function enableReadonly(end){
    if(window.MOIDA_READONLY) return;
    window.MOIDA_READONLY = true;
    var warned=false;
    function warn(){ if(warned) return; warned=true; setTimeout(function(){ alert('구독이 만료되어 읽기 전용 모드입니다.\n데이터를 수정하려면 이용 기간을 연장해 주세요.'); warned=false; }, 0); }

    // 1) 클라우드(Firestore) 저장 차단 — 페이지 모듈이 늦게 정의할 수 있어 잠시 동안 재적용
    function wrap(){ if(window._fsSave && window._fsSave.__moGuard!==true){ window._fsSave=function(){ warn(); return Promise.resolve(); }; window._fsSave.__moGuard=true; } }
    wrap();
    var n=0, iv=setInterval(function(){ wrap(); if(++n>20) clearInterval(iv); }, 300);

    // 2) 로컬 데이터 저장 차단 (UI/설정 키는 허용)
    var origSet=localStorage.setItem.bind(localStorage);
    localStorage.setItem=function(k,v){ if(/^moida_(members|events|votes)_/.test(k)){ warn(); return; } return origSet(k,v); };

    // 3) 안내 배너
    function banner(){
      if(document.getElementById('mo-guard-banner')) return;
      if(!document.body){ setTimeout(banner,100); return; }
      var b=document.createElement('div');
      b.id='mo-guard-banner';
      b.style.cssText='position:fixed;left:0;right:0;bottom:0;z-index:2147483646;background:#b4232a;color:#fff;font-size:13.5px;padding:10px 16px;text-align:center;font-family:inherit;box-shadow:0 -2px 10px rgba(0,0,0,.18)';
      b.innerHTML='구독이 만료되어 <b>읽기 전용</b> 모드입니다 (만료일 '+String(end).replace(/-/g,'.')+'). 이용 기간 연장은 관리자에게 문의하세요.';
      document.body.appendChild(b);
    }
    banner();
  }
})();
