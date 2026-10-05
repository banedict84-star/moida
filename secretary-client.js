(function(root){
  'use strict';
  function createSecretaryClient(options){
    var busy=false, disposed=false;
    var labels={pending:'에이전트가 답변을 준비합니다.',queued:'에이전트 실행을 기다립니다.',in_progress:'에이전트가 업무를 처리합니다.',waiting:'도구 결과를 기다립니다.',requires_action:'의원실 업무 도구를 실행합니다.'};
    function storeKey(thread){return 'moida_secretary_pending_'+options.owner()+'_'+thread;}
    function read(thread){try{return JSON.parse(localStorage.getItem(storeKey(thread))||'null');}catch(e){return null;}}
    function write(thread,value){localStorage.setItem(storeKey(thread),JSON.stringify(value));}
    function post(path,body){return options.request(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});}
    function poll(thread,id){return options.request('/secretary/poll?thread_id='+encodeURIComponent(thread)+(id?'&request_id='+encodeURIComponent(id):''),{method:'GET'});}
    function sameOwner(saved){if(options.owner()!==saved.owner)throw Error('로그인 계정이 변경되어 실행 상태 확인을 중단했습니다.');}
    async function drive(thread,saved,state){
      for(var i=0;i<120&&!disposed;i++){
        sameOwner(saved);
        state=state||await poll(thread,saved.request_id);
        sameOwner(saved);
        if(state.status==='ready'&&!state.request_id)throw Error('이 요청이 서버에 접수됐는지 확인할 수 없습니다. 같은 요청을 다시 보내지 않고 저장된 입력을 보관합니다.');
        if(state.status==='completed'){
          localStorage.removeItem(storeKey(thread));return state.output_text;
        }
        if(state.status==='failed'||state.status==='cancelled'){
          localStorage.removeItem(storeKey(thread));throw Error(state.error||'에이전트 실행이 중단됐습니다.');
        }
        if(state.status==='submission_uncertain')throw Error('메시지 접수 결과를 확인해야 합니다. 같은 메시지를 다시 접수하지 않습니다. 대화 기록에서 이 대화를 열어 상태를 확인해 주세요.');
        options.status(labels[state.status]||'에이전트 실행 상태를 확인합니다.');
        for(var action of state.actions||[]){
          var cached=saved.results[action.call_id];
          if(cached){
            await post('/secretary/result',{thread_id:thread,request_id:saved.request_id,call_id:action.call_id,result:cached.result});
            delete saved.results[action.call_id];write(thread,saved);continue;
          }
          if(action.status!=='pending')throw Error('이 업무 도구는 이미 실행 중이거나 결과 확인이 필요합니다. 중복 실행을 막기 위해 중단했습니다.');
          var claim=await post('/secretary/claim',{thread_id:thread,request_id:saved.request_id,call_id:action.call_id});
          sameOwner(saved);
          if(!claim.claimed)throw Error('다른 화면에서 업무를 처리하고 있습니다. 잠시 뒤 대화를 다시 열어 주세요.');
          var result;
          try{result=await options.execute(action.name,action.arguments,action.call_id);}
          catch(e){result={ok:false,error:e.message||'도구 실행 실패'};}
          sameOwner(saved);
          // Save the actual result before posting it. Never execute the function again on reconnect.
          saved.results[action.call_id]={result:result};write(thread,saved);
          await post('/secretary/result',{thread_id:thread,request_id:saved.request_id,call_id:action.call_id,result:result});
          delete saved.results[action.call_id];write(thread,saved);
        }
        state=null;await new Promise(function(resolve){setTimeout(resolve,1800);});
      }
      throw Error('처리가 길어지고 있습니다. 이 대화를 다시 열면 같은 요청의 상태를 이어 확인합니다.');
    }
    async function run(thread,input,context){
      if(busy)throw Error('이전 요청을 처리하고 있습니다.');
      busy=true;options.busy(true);
      try{
        var saved=read(thread),state;
        if(!saved){
          var existing=await poll(thread);
          if(existing.request_id&&!['ready','completed','failed','cancelled'].includes(existing.status)){
            saved={request_id:existing.request_id,owner:options.owner(),results:{}};write(thread,saved);state=existing;
          }else{
            saved={request_id:crypto.randomUUID(),owner:options.owner(),results:{},input:input,context:context};write(thread,saved);
            state=await post('/secretary/message',{thread_id:thread,request_id:saved.request_id,input:input,context:context});
          }
        }
        return await drive(thread,saved,state);
      }finally{busy=false;options.busy(false);}
    }
    return {run:run,isBusy:function(){return busy;},hasPending:function(thread){return !!read(thread);},dispose:function(){disposed=true;}};
  }
  root.createSecretaryClient=createSecretaryClient;
})(typeof window==='undefined'?globalThis:window);
