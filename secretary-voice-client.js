(function(root){
 'use strict';
 root.setupSecretaryVoice=function(options){
  var pc=null,channel=null,stream=null,audio=null,dialog=null,status=null,transcript=null,mute=null,speaker=null,start=null,timer=null,epoch=0,owner='',thread='',muted=false,seen=new Set(),queue=Promise.resolve();
  function element(tag,text){var e=document.createElement(tag);if(text)e.textContent=text;return e;}
  function button(text,fn){var b=element('button',text);b.type='button';b.onclick=fn;return b;}
  function current(run){return run===epoch&&options.owner()===owner;}
  function send(event){if(channel&&channel.readyState==='open')channel.send(JSON.stringify(event));}
  function cleanup(){epoch++;clearTimeout(timer);timer=null;if(channel){channel.close();channel=null;}if(pc){pc.onconnectionstatechange=null;pc.close();pc=null;}if(stream){stream.getTracks().forEach(function(t){t.stop();});stream=null;}if(audio){audio.pause();audio.srcObject=null;}muted=false;seen.clear();if(audio)audio.muted=false;if(speaker){speaker.classList.remove('is-muted');speaker.setAttribute('aria-pressed','false');speaker.textContent='오디오';}if(mute){mute.disabled=true;mute.textContent='마이크 끄기';mute.classList.remove('is-muted');mute.setAttribute('aria-pressed','false');}if(start)start.disabled=false;}
  function hangup(){cleanup();status.textContent='통화를 종료했습니다. 실행 중인 업무는 작업실에서 확인하세요.';}
  function line(role,text){if(!text)return;var e=element('p',(role==='user'?'나: ':'비서실장: ')+text);transcript.append(e);transcript.scrollTop=transcript.scrollHeight;while(transcript.children.length>30)transcript.firstElementChild.remove();options.record(role,text,thread,owner);}
  async function tool(item,run){
   if(!current(run))return;
   var output;
   try{if(item.name!=='ask_secretary')throw Error('연결되지 않은 음성 도구입니다.');var args=JSON.parse(item.arguments||'{}');if(typeof args.instruction!=='string'||!args.instruction.trim()||args.instruction.length>12000)throw Error('업무 지시를 다시 말씀해 주세요.');status.textContent='비서실장이 업무를 확인하고 있습니다…';output={ok:true,result:String(await options.run(args.instruction,thread,owner)).slice(0,40000)};}
   catch(e){output={ok:false,error:e.message||'업무 실행 확인이 필요합니다.'};}
   if(!current(run))return;
   send({type:'conversation.item.create',item:{type:'function_call_output',call_id:item.call_id,output:JSON.stringify(output)}});send({type:'response.create'});status.textContent='통화 중 · 말씀해 주세요';
  }
  function eventMessage(event,run){
   if(!current(run))return;var data;try{data=JSON.parse(event.data);}catch(e){return;}
   if(data.type==='error'){status.textContent='음성 오류: '+(data.error&&data.error.message||'다시 연결해 주세요.');return;}
   if(data.type==='input_audio_buffer.speech_started')status.textContent='듣고 있습니다…';
   if(data.type==='conversation.item.input_audio_transcription.completed'&&data.transcript){var userKey='u_'+data.item_id;if(!seen.has(userKey)){seen.add(userKey);line('user',data.transcript);}}
   if(data.type==='response.output_audio_transcript.done'&&data.transcript){var key='a_'+data.item_id;if(!seen.has(key)){seen.add(key);line('assistant',data.transcript);}status.textContent='통화 중 · 말씀해 주세요';}
   if(data.type==='response.done')for(var item of data.response&&data.response.output||[]){if(item.type==='function_call'&&!seen.has('f_'+item.call_id)){seen.add('f_'+item.call_id);queue=queue.catch(function(){}).then(function(item){return function(){return tool(item,run);};}(item));}}
  }
  async function connect(){
   cleanup();owner=options.owner();thread=options.thread();if(!owner){status.textContent='로그인 후 통화할 수 있습니다.';return;}
   if(!root.RTCPeerConnection||!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){status.textContent='이 브라우저는 음성 통화를 지원하지 않습니다. Chrome 또는 Safari에서 열어 주세요.';return;}
   if(options.busy()){status.textContent='진행 중인 답변이 끝난 뒤 연결해 주세요.';return;}
   var run=epoch;start.disabled=true;status.textContent='마이크 권한을 확인하고 연결합니다…';
   try{
    var acquired=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});if(!current(run)){acquired.getTracks().forEach(function(t){t.stop();});return;}stream=acquired;
    pc=new RTCPeerConnection();audio=audio||element('audio');audio.autoplay=true;audio.setAttribute('playsinline','');pc.ontrack=function(e){if(!current(run))return;audio.srcObject=e.streams[0];audio.play().catch(function(){status.textContent='소리 재생 버튼을 눌러 주세요.';});};stream.getTracks().forEach(function(t){pc.addTrack(t,stream);});
    channel=pc.createDataChannel('oai-events');channel.onmessage=function(e){eventMessage(e,run);};channel.onopen=function(){if(!current(run))return;status.textContent='통화 중 · 말씀해 주세요';mute.disabled=false;send({type:'response.create',response:{instructions:'한국어로 "비서실장입니다. 어떤 업무를 도와드릴까요?"라고 짧게 인사하세요.'}});};
    pc.onconnectionstatechange=function(){if(!current(run))return;if(['failed','closed'].includes(pc.connectionState)){cleanup();status.textContent='연결이 끊어졌습니다. 다시 연결해 주세요.';}};
    var offer=await pc.createOffer();await pc.setLocalDescription(offer);var value=await options.request('/voice/call',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:crypto.randomUUID(),sdp:offer.sdp})});if(!current(run))return;await pc.setRemoteDescription({type:'answer',sdp:value.sdp});
    timer=setTimeout(function(){if(current(run)){hangup();status.textContent='20분 통화를 마쳤습니다. 계속하려면 다시 연결해 주세요.';}},20*60*1000);
   }catch(e){if(!current(run))return;cleanup();status.textContent=e.name==='NotAllowedError'?'마이크 사용을 허용해 주세요. 브라우저 설정에서 변경할 수 있습니다.':e.message||'통화 연결에 실패했습니다.';}
  }
  var voiceStyles=element('link');voiceStyles.rel='stylesheet';voiceStyles.href='secretary-voice.css?v=2';document.head.append(voiceStyles);
  function build(){
   if(dialog)return;
   dialog=element('dialog');dialog.className='secretary-voice-dialog';dialog.setAttribute('aria-label','AI 비서실장 음성 통화');
   var head=element('div');head.className='voice-head';head.append(element('span','MOIDA · AI VOICE'),button('닫기',function(){hangup();dialog.close();}));
   var identity=element('div');identity.className='voice-identity';var avatar=element('img');avatar.src='secretary-avatar-office-v1.png';avatar.alt='모이다 비서 캐릭터';avatar.className='voice-avatar';identity.append(avatar,element('h2','모이다 비서실장'),element('p','의원님의 업무를 함께합니다'));
   status=element('p','통화 연결 중…');status.className='voice-call-status';status.setAttribute('role','status');
   var note=element('p','AI 음성 · 업무 기록은 대화와 작업실에 남습니다');note.className='voice-note';
   transcript=element('div');transcript.className='voice-transcript';var details=element('details');details.className='voice-records';details.append(element('summary','통화 내용 보기'),transcript);
   var controls=element('div');controls.className='voice-controls';
   speaker=button('오디오',function(){if(!audio)return;audio.muted=!audio.muted;speaker.classList.toggle('is-muted',audio.muted);speaker.setAttribute('aria-pressed',String(audio.muted));speaker.textContent=audio.muted?'오디오 켜기':'오디오';if(!audio.muted)audio.play().catch(function(){status.textContent='브라우저 소리 권한을 확인해 주세요.';});});speaker.className='voice-speaker';speaker.setAttribute('aria-pressed','false');
   mute=button('마이크 끄기',function(){muted=!muted;if(stream)stream.getAudioTracks().forEach(function(t){t.enabled=!muted;});mute.textContent=muted?'마이크 켜기':'마이크 끄기';mute.classList.toggle('is-muted',muted);mute.setAttribute('aria-pressed',String(muted));});mute.className='voice-mute';mute.disabled=true;mute.setAttribute('aria-pressed','false');
   var stop=button('통화 종료',function(){hangup();dialog.close();});stop.className='voice-hangup';stop.setAttribute('aria-label','통화 종료');
   controls.append(speaker,stop,mute);start=button('다시 연결',connect);start.className='voice-reconnect';
   dialog.append(head,identity,status,note,start,details,controls);dialog.addEventListener('cancel',hangup);document.body.append(dialog);
   new MutationObserver(function(){dialog.classList.toggle('is-listening',status.textContent.indexOf('듣고')!==-1);dialog.classList.toggle('is-working',status.textContent.indexOf('확인하고')!==-1);}).observe(status,{childList:true});
  }
  function open(){build();if(!dialog.open)dialog.showModal();if(!pc)connect();}
  var host=document.getElementById('aiSend');if(host){var call=button('☎',open);call.id='secretaryVoiceOpen';call.className='secretary-voice-launch';call.setAttribute('aria-label','비서실장과 음성 통화');call.title='비서실장과 통화';host.parentElement.insertBefore(call,host);}
  root.addEventListener('pagehide',cleanup);root.addEventListener('hashchange',function(){if(dialog&&dialog.open){hangup();dialog.close();}});var ownerTimer=setInterval(function(){if(pc&&options.owner()!==owner){hangup();dialog.close();}},1000);
  return {open:open,stop:hangup,dispose:function(){clearInterval(ownerTimer);cleanup();}};
 };
})(window);
