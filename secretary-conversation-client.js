(function(root){
  'use strict';
  root.createSecretaryConversationClient=function(options){
    var aliases=new Map(),recovering=new Set(),finished=new Map(),disposed=false;
    function key(thread){return options.owner()+'|'+thread;}
    function entry(thread){return aliases.get(key(thread));}
    function visible(thread){return entry(thread)?.thread||thread;}
    var base=root.createSecretaryClient({...options,thread:undefined,concurrent:true,
      activityThread:visible,
      activityLabel:function(alias){return entry(alias)?.label||'복구된 업무';},
      busy:function(){options.busy(false);},
      status:function(){},
      preview:function(alias,text){var item=entry(alias);if(item?.preview)item.preview(text);},
      executed:function(name,result,alias){if(options.executed)options.executed(name,result,visible(alias));},
      request:function(path,init){
        if(path==='/secretary/message'){
          var body=JSON.parse(init.body),alias=body.thread_id.replace(/^workspace1_/,'');
          body.conversation_id='workspace1_'+visible(alias);
          init={...init,body:JSON.stringify(body)};
        }
        return options.request(path,init);
      }
    });
    async function runDetailed(thread,input,context,preview){
      var owner=options.owner(),alias='exec_'+crypto.randomUUID().replace(/-/g,'');
      var label=typeof input==='string'?input:input.flatMap(m=>(m.content||[]).filter(p=>p.type==='input_text').map(p=>p.text)).join(' ');
      aliases.set(key(alias),{thread:thread,preview:preview,label:label.slice(0,32)});
      var output=await base.run(alias,input,context);
      if(options.owner()!==owner||disposed)throw Error('로그인 계정이 변경되었습니다.');
      var resultId=base.resultId(alias);finished.set(key(thread),resultId);
      return {output:output,resultId:resultId};
    }
    async function recover(thread){
      var owner=options.owner(),k=key(thread);if(recovering.has(k)||disposed)return;
      recovering.add(k);
      try{
        var response=await options.request('/secretary/background?thread_id='+encodeURIComponent('workspace1_'+thread),{method:'GET'});
        if(options.owner()!==owner||disposed)return;
        for(var item of (response.items||[]).slice().reverse()){
          var alias=(item.execution_thread||'workspace1_'+thread).replace(/^workspace1_/,'');
          if(base.isBusy(alias))continue;
          if(options.executed)(item.results||[]).forEach(function(r){options.executed(r.name,r.result,thread);});
          if(item.status==='completed'&&item.output_text){
            if(options.recovered)options.recovered(thread,owner,item.output_text,'secretary_'+item.request_id);
          }else if(item.runtime_status==='running'&&!['completed','failed','cancelled'].includes(item.status)){
            aliases.set(key(alias),{thread:thread});
            // Resume a known request directly: never POST a new message during recovery.
            base.resume(alias,item.request_id).then(function(output){
              if(options.owner()===owner&&!disposed&&options.recovered)options.recovered(thread,owner,output,base.resultId(this));
            }.bind(alias)).catch(function(error){if(options.owner()===owner&&options.thread()===thread)options.status(error.message);});
          }else if(item.runtime_status==='needs_attention'&&options.thread()===thread)options.status(item.runtime_error||'서버 업무 확인이 필요합니다.');
        }
      }finally{recovering.delete(k);}
    }
    return {allowsConcurrent:true,runDetailed:runDetailed,run:async function(thread,input,context){return (await runDetailed(thread,input,context)).output;},
      recover:recover,resultId:function(thread){return finished.get(key(thread))||null;},
      isBusy:function(thread){return Array.from(aliases.entries()).some(function(pair){return pair[0].startsWith(options.owner()+'|')&&pair[1].thread===thread&&base.isBusy(pair[0].slice(options.owner().length+1));});},
      hasPending:function(){return false;},refreshView:base.refreshView,dispose:function(){disposed=true;base.dispose();}
    };
  };
})(typeof window==='undefined'?globalThis:window);
