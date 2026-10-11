(function(root){'use strict';root.setupDashboardCalls=function(options){
 var number=document.getElementById('kpiCalls'),meta=document.getElementById('kpiCallsMeta');if(!number)return;
 var owner=null,loaded=0,busy=false;
 function state(value,note){number.textContent=value;number.style.fontSize=typeof value==='number'?'30px':'14px';number.dataset.loading=String(typeof value!=='number');number.nextElementSibling.hidden=typeof value!=='number';meta.textContent=note;}
 async function load(){var uid=options.owner();if(uid!==owner){owner=uid;loaded=0;state('확인 중','오늘 등록된 녹음을 불러옵니다');}if(!uid||busy||Date.now()-loaded<60000)return;busy=true;
  try{var data=await options.request('/call-records',{method:'GET'});if(uid!==options.owner())return;var start=new Date();start.setHours(0,0,0,0);var count=(data.records||[]).filter(function(r){return r.created_at>=start.getTime()&&r.created_at<start.getTime()+86400000;}).length;state(count,data.records.length===100&&count===100?'오늘 등록된 녹음 100건 이상':'오늘 등록된 녹음 · 전사·요약 보기');loaded=Date.now();}
  catch(e){if(uid===options.owner())state('확인 실패','통화 기록을 불러오지 못했습니다');}
  finally{busy=false;}
 }
 state('확인 중','오늘 등록된 녹음을 불러옵니다');options.subscribe(load);root.addEventListener('hashchange',function(){if(location.hash==='#dashboard')load();});root.addEventListener('focus',load);var timer=setInterval(function(){if(!document.hidden&&location.hash==='#dashboard')load();},60000);root.addEventListener('pagehide',function(){clearInterval(timer);});
};})(window);
