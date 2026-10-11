(function(root){
 'use strict';
 root.renderOfficeLocation=function(host,options){
  var owner=options.owner(),alive=function(){return host.isConnected&&owner===options.owner();};
  function el(tag,text){var e=document.createElement(tag);if(text)e.textContent=text;return e;}
  function note(text){var e=el('p',text);e.className='office-tool-note';return e;}
  function button(text,action){var b=el('button',text);b.type='button';b.onclick=async function(){b.disabled=true;try{await action();}catch(e){if(alive())status.textContent=e.message;}finally{b.disabled=false;}};return b;}
  function post(path,body){return options.request(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});}
  var status=note('위치 연결 상태를 확인하고 있습니다.'),list=el('div'),setup=el('div'),name=el('input');name.placeholder='예: 수행팀 갤럭시 / 의원님 아이폰';name.maxLength=40;name.setAttribute('aria-label','위치 공유 휴대폰 이름');name.style.cssText='width:100%;box-sizing:border-box;margin:8px 0;padding:8px;border:1px solid #d2ddee;border-radius:8px';
  host.append(note('각 휴대폰에 다른 연결 정보를 발급하세요. 앱에서 위치 공유를 켜면 최신 위치만 보관합니다.'),list,name,button('휴대폰 연결 정보 만들기',async function(){
   if(!alive())return;var result=await post('/office-location/devices',{label:name.value});if(!alive())return;setup.replaceChildren();
   setup.append(note(result.label+' · OwnTracks 연결 방식은 HTTP로 선택하세요. 비밀번호는 이 화면에서만 확인할 수 있습니다.'));
   [['URL',result.url],['사용자 이름',result.username],['비밀번호',result.password]].forEach(function(pair){var label=el('label',pair[0]),input=el('input');input.value=pair[1];input.readOnly=true;input.setAttribute('aria-label',pair[0]);input.style.cssText='width:100%;box-sizing:border-box;padding:8px;margin:4px 0 8px;border:1px solid #d2ddee;border-radius:8px';label.append(input);setup.append(label);});
   setup.append(note('OwnTracks에서 위 값을 입력하고 위치 전송을 누르세요. 위치 권한은 항상 허용으로 설정하세요. 연결 정보를 잃어버리면 연결 해제 후 새로 발급하세요.'));name.value='';await load();
  }),setup,status,button('위치 새로고침',load));
  async function load(){var data=await options.request('/office-location/devices',{method:'GET'});if(!alive())return;list.replaceChildren();
   (data.devices||[]).forEach(function(device){var row=el('div');row.className='office-service-row';row.style.cssText='display:block';row.append(el('strong',device.label));var p=device.location;
    if(p){var old=Date.now()-p.tst*1000>300000;row.append(note((old?'이전 위치 · ':'위치 확인 · ')+new Date(p.tst*1000).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+(p.accuracy!==null?' · 오차 약 '+Math.round(p.accuracy)+'m':'')),note('수신: '+new Date(device.receivedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})));
     var a=el('a','카카오맵에서 보기');a.href='https://map.kakao.com/link/map/'+encodeURIComponent(device.label)+','+p.lat+','+p.lon;a.target='_blank';a.rel='noopener noreferrer';row.append(a);
    }else row.append(note('앱 위치 전송 대기'));
    row.append(button('연결 해제',async function(){if(!alive())return;await post('/office-location/disconnect',{id:device.id});if(alive()){setup.replaceChildren();await load();}}));list.append(row);
   });status.textContent=data.devices.length?'앱에서 전송한 위치를 표시합니다.':'아직 연결한 휴대폰이 없습니다.';
  }
  load().catch(function(e){if(alive())status.textContent=e.message;});
 };
})(window);
