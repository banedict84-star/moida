(function(root){
 function createChatHistoryArchive(options){
  var seen=new Set(),metadata=new Map(),removed=new Set();
  async function request(path,body){
   var result=await options.request(path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});
   if(result.ok===false)throw Error(result.error||'대화 기록 저장에 실패했습니다.');return result;
  }
  async function pages(path){var all=[],offset=0;do{var r=await request(path+(path.includes('?')?'&':'?')+'offset='+offset);all=all.concat(r.items);offset=r.next_offset;}while(offset!==null&&offset!==undefined);return all;}
  function messageKey(t,m){return t.id+'|'+m.id;}
  async function load(){
   var threads=await pages('/office-tools/chat-history'),deleted={};
   for(var t of threads){if(t.deletedAt){deleted[t.id]=t.deletedAt;removed.add(t.id);continue;}
    t.messages=await pages('/office-tools/chat-history/messages?thread='+encodeURIComponent(t.id));
    t.messages.forEach(m=>seen.add(messageKey(t,m)));metadata.set(t.id,t.title+'|'+t.updatedAt);
   }
   return{threads:threads.filter(t=>!t.deletedAt),deleted:deleted};
  }
  async function save(threads,deleted){
   for(var id of Object.keys(deleted)){if(!removed.has(id)){await request('/office-tools/chat-history/delete',{id:id});removed.add(id);}}
   for(var t of threads){if(removed.has(t.id)||deleted[t.id])continue;
    var pending=t.messages.map((m,i)=>Object.assign({},m,{position:i})).filter(m=>!seen.has(messageKey(t,m))),signature=t.title+'|'+t.updatedAt;
    if(!pending.length&&metadata.get(t.id)===signature)continue;
    do{var batch=pending.splice(0,50),result=await request('/office-tools/chat-history/save',{thread:{id:t.id,title:t.title,createdAt:t.createdAt,updatedAt:t.updatedAt},messages:batch});
     if(result.deleted){removed.add(t.id);break;}batch.forEach(m=>seen.add(messageKey(t,m)));
    }while(pending.length);
    metadata.set(t.id,signature);
   }
  }
  return{load:load,save:save};
 }
 root.createChatHistoryArchive=createChatHistoryArchive;
})(typeof window!=='undefined'?window:globalThis);
