(function(root){
  'use strict';
  function createSecretaryClient(options){
    var running=new Map(), finished=new Map(), recovering=new Set(), disposed=false;
    function isActive(thread){return !options.thread||options.thread()===thread;}
    function activity(detail){if(isActive(detail.thread)&&typeof window!=='undefined')window.dispatchEvent(new CustomEvent('moida:activity',{detail:detail}));}
    function activeKey(thread){return options.owner()+'|'+thread;}
    function isBusy(thread){return thread===undefined?Array.from(running.values()).some(function(r){return r.owner===options.owner();}):running.has(activeKey(thread));}
    function refreshView(){selector.disabled=options.thread?isBusy(options.thread()):isBusy();if(!selector.disabled)selector.value=selectedModel();options.busy(selector.disabled);}
    var selector=typeof document!=='undefined'?document.createElement('select'):{style:{},setAttribute:function(){},addEventListener:function(){}};selector.id='secretaryModelSelect';selector.setAttribute('aria-label','비서실장 모델');selector.title='Sol·Astra는 Luna보다 사용 비용이 높습니다.';selector.style.cssText='width:126px;max-width:126px;flex-shrink:0;border:1px solid #d9e1ed;border-radius:8px;padding:6px;background:#fff;font:inherit;font-size:12px;color:#34557e';
    if(typeof document!=='undefined')[['gpt-6-luna','GPT 6 Luna'],['gpt-6.1-sol','GPT 6.1 Sol'],['gpt-6-astra','GPT 6 Astra']].forEach(function(item){var option=document.createElement('option');option.value=item[0];option.textContent=item[1];selector.append(option);});
    function modelKey(){return 'moida_secretary_model_'+options.owner();}
    function selectedModel(){var value;try{value=localStorage.getItem(modelKey());}catch(e){}return ['gpt-6-luna','gpt-6.1-sol','gpt-6-astra'].includes(value)?value:'gpt-6-luna';}
    selector.value=selectedModel();selector.addEventListener('change',function(){try{localStorage.setItem(modelKey(),selector.value);}catch(e){}});
    var composer=typeof document!=='undefined'&&document.getElementById('aiInput');if(composer){var phone=document.getElementById('secretaryVoiceOpen'),send=document.getElementById('aiSend');composer.parentElement.insertBefore(selector,phone||send);}

    var labels={pending:'에이전트가 답변을 준비합니다.',queued:'에이전트 실행을 기다립니다.',in_progress:'에이전트가 업무를 처리합니다.',waiting:'도구 결과를 기다립니다.',requires_action:'의원실 업무 도구를 실행합니다.'};
    function storeKey(thread){return 'moida_workspace1_pending_'+options.owner()+'_'+thread;}
    function read(thread){try{return JSON.parse(localStorage.getItem(storeKey(thread))||'null');}catch(e){return null;}}
    function write(thread,value){localStorage.setItem(storeKey(thread),JSON.stringify(value));}
    function post(path,body){body={...body,thread_id:'workspace1_'+body.thread_id};return options.request(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});}
    async function poll(thread,id){for(var attempt=0;attempt<3;attempt++){try{return await options.request('/secretary/poll?preview=1&thread_id='+encodeURIComponent('workspace1_'+thread)+(id?'&request_id='+encodeURIComponent(id):''),{method:'GET'});}catch(error){if(!(error.status>=500)||attempt===2)throw error;await new Promise(function(resolve){setTimeout(resolve,700);});}}}
    function sameOwner(saved){if(options.owner()!==saved.owner)throw Error('로그인 계정이 변경되어 실행 상태 확인을 중단했습니다.');}
    async function drive(thread,saved,state){
      var lastState=null,toolStates=new Map();
      for(var i=0;i<1200&&!disposed;i++){
        sameOwner(saved);
        state=state||await poll(thread,saved.request_id);
        sameOwner(saved);
        if(lastState!==state.status){activity({thread:thread,type:'state',status:state.status});lastState=state.status;}
        if(state.agents)activity({thread:thread,type:'staff',agents:state.agents});
        if(state.status==='ready'&&!state.request_id)throw Error('이 요청이 서버에 접수됐는지 확인할 수 없습니다. 같은 요청을 다시 보내지 않고 저장된 입력을 보관합니다.');
        if(state.status==='completed'){
          if(state.server_managed){try{var recovered=await options.request('/secretary/background?thread_id='+encodeURIComponent('workspace1_'+thread),{method:'GET'});sameOwner(saved);var done=(recovered.items||[]).find(function(item){return item.request_id===saved.request_id;});if(done&&options.executed)(done.results||[]).forEach(function(r){options.executed(r.name,r.result,thread);});}catch(e){sameOwner(saved);}}
          finished.set(activeKey(thread),state.request_id||saved.request_id);localStorage.removeItem(storeKey(thread));return state.output_text;
        }
        if(state.status==='failed'||state.status==='cancelled'){
          localStorage.removeItem(storeKey(thread));throw Error(state.error||'에이전트 실행이 중단됐습니다.');
        }
        if(state.status==='submission_uncertain')throw Error('메시지 접수 결과를 확인해야 합니다. 같은 메시지를 다시 접수하지 않습니다. 대화 기록에서 이 대화를 열어 상태를 확인해 주세요.');
        if(state.partial_text&&options.preview)options.preview(thread,state.partial_text);
        if(isActive(thread))options.status(labels[state.status]||'에이전트 실행 상태를 확인합니다.');
        if(state.server_managed)(state.actions||[]).forEach(function(a){if(toolStates.get(a.call_id)===a.status)return;toolStates.set(a.call_id,a.status);activity({thread:thread,type:'tool',id:a.call_id,name:a.name,status:a.status==='submitted'?(a.result&&a.result.ok===false?'failed':'completed'):a.status==='pending'?'pending':'running'});});
        if(state.server_managed&&state.runtime_status==='needs_attention')throw Error(state.runtime_error||'서버 업무를 확인해 주세요.');
        for(var action of [...(state.server_managed?[]:state.actions||[]),...(state.staff_actions||[])]){
          var actionKey=action.parent_call_id?action.parent_call_id+'_'+action.call_id:action.call_id;
          var actionBody={thread_id:thread,request_id:saved.request_id,call_id:action.call_id,...(action.parent_call_id?{parent_call_id:action.parent_call_id}:{})};
          var claimPath=action.parent_call_id?'/secretary/staff-claim':'/secretary/claim',resultPath=action.parent_call_id?'/secretary/staff-result':'/secretary/result';
          var cached=saved.results[actionKey];
          if(!cached&&action.result!==undefined){cached={result:action.result};saved.results[actionKey]=cached;write(thread,saved);}
          if(cached)activity({thread:thread,type:'tool',id:action.call_id,name:action.name,status:cached.result&&cached.result.ok===false?'failed':'completed'});
          if(cached&&options.executed){options.executed(action.name,cached.result,thread);for(var artifact of cached.result?.artifacts||[])options.executed(artifact.name,artifact.result,thread);}
          if(cached){
            await post(resultPath,{...actionBody,result:cached.result});
            delete saved.results[actionKey];write(thread,saved);continue;
          }
          if(action.name==='delegate_agent'&&action.status==='executing'&&action.result===undefined)continue;
          if(action.status!=='pending')throw Error('이 업무 도구는 이미 실행 중이거나 결과 확인이 필요합니다. 중복 실행을 막기 위해 중단했습니다.');
          var claim=await post(claimPath,actionBody);
          sameOwner(saved);
          if(!claim.claimed)throw Error('다른 화면에서 업무를 처리하고 있습니다. 잠시 뒤 대화를 다시 열어 주세요.');
          activity({thread:thread,type:'tool',id:action.call_id,name:action.name,status:'running'});
          if(claim.pending)continue;
          var result;
          try{result=claim.result!==undefined?claim.result:await options.execute(action.name,action.arguments,action.call_id);}
          catch(e){result={ok:false,error:e.message||'도구 실행 실패'};}
          sameOwner(saved);
          activity({thread:thread,type:'tool',id:action.call_id,name:action.name,status:result&&result.ok===false?'failed':'completed'});
          if(options.executed){options.executed(action.name,result,thread);for(var artifact of result?.artifacts||[])options.executed(artifact.name,artifact.result,thread);}
          // Save the actual result before posting it. Never execute the function again on reconnect.
          saved.results[actionKey]={result:result};write(thread,saved);
          await post(resultPath,{...actionBody,result:result});
          delete saved.results[actionKey];write(thread,saved);
        }
        var delay=state.server_managed?1500:i===0?0:700;
        state=null;if(delay)await new Promise(function(resolve){setTimeout(resolve,delay);});
      }
      var pendingError=Error('서버에서 업무를 계속 처리하고 있습니다. 대화를 다시 열면 진행 상황과 결과를 확인할 수 있습니다.');pendingError.serverPending=true;throw pendingError;
    }
    function run(thread,input,context){
      var runKey=activeKey(thread),existingRun=running.get(runKey);if(existingRun)return existingRun.promise;
      finished.delete(runKey);var runOwner=options.owner(),entry={owner:runOwner,promise:null};running.set(runKey,entry);
      selector.value=selectedModel();var model=selector.value;refreshView();
      activity({thread:thread,type:'start',input:input});
      entry.promise=(async function(){
      try{
        var saved=read(thread),state;
        if(!saved){
          var existing=await poll(thread);
          sameOwner({owner:runOwner});
          if(existing.request_id&&!['ready','completed','failed','cancelled'].includes(existing.status)){
            saved={request_id:existing.request_id,owner:options.owner(),results:{}};write(thread,saved);state=existing;
          }else{
            saved={request_id:crypto.randomUUID(),owner:runOwner,results:{},input:input,context:context,model:model};write(thread,saved);
            state=await post('/secretary/message',{thread_id:thread,request_id:saved.request_id,input:input,context:context,model:saved.model,server_runtime:true});
          }
        }
        return await drive(thread,saved,state);
      }catch(error){activity({thread:thread,type:'state',status:error.serverPending?'in_progress':'failed',error:error.message});throw error;}finally{running.delete(runKey);refreshView();}
      })();return entry.promise;
    }
    async function recover(thread){
      var owner=options.owner(),k=activeKey(thread);if(recovering.has(k)||isBusy(thread))return;
      recovering.add(k);
      try{
        var response=await options.request('/secretary/background?thread_id='+encodeURIComponent('workspace1_'+thread),{method:'GET'});
        if(options.owner()!==owner||disposed)return;
        for(var item of (response.items||[]).slice().reverse()){
          if(options.executed)(item.results||[]).forEach(function(r){options.executed(r.name,r.result,thread);});
          if(item.status==='completed'&&item.output_text){finished.set(k,item.request_id);if(options.recovered)options.recovered(thread,owner,item.output_text);}
          else if(item.runtime_status==='running'&&!['failed','cancelled','completed'].includes(item.status))write(thread,{request_id:item.request_id,owner:owner,results:{}});
          else if(item.runtime_status==='needs_attention'&&isActive(thread))options.status(item.runtime_error||'서버 업무 확인이 필요합니다.');
        }
      }finally{recovering.delete(k);}
    }
    return {recover:recover,resultId:function(thread){var id=finished.get(activeKey(thread));return id?"secretary_"+id:null;},run:run,isBusy:isBusy,refreshView:refreshView,hasPending:function(thread){return !!read(thread);},dispose:function(){disposed=true;}};
  }
  root.createSecretaryClient=createSecretaryClient;
})(typeof window==='undefined'?globalThis:window);
