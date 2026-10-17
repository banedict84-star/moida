import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function fixture(){
 const storage=new Map(),posts=[],restored=[],busy=[],results=new Map();let sequence=0,owner='owner';
 const sandbox={Map,Set,crypto:{randomUUID:()=>`id_${++sequence}`},setTimeout:(fn)=>setTimeout(fn,1),localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}};
 for(const file of ['secretary-client.js','secretary-conversation-client.js'])vm.runInNewContext(readFileSync(new URL('../'+file,import.meta.url),'utf8'),sandbox);
 const client=sandbox.createSecretaryConversationClient({owner:()=>owner,thread:()=> 'chat',status:()=>{},busy:v=>busy.push(v),recovered:(...args)=>restored.push(args),request:async(path,init)=>{
  if(path==='/secretary/message'){const body=JSON.parse(init.body);posts.push(body);results.set(body.thread_id,{request_id:body.request_id,status:'in_progress',server_managed:true});return results.get(body.thread_id);}
  if(path.startsWith('/secretary/background'))return{items:Array.from(results.entries()).map(([execution_thread,r])=>({...r,execution_thread,runtime_status:r.status==='completed'?'completed':'running'}))};
  const thread=new URL('https://test'+path).searchParams.get('thread_id');return results.get(thread)||{status:'ready'};
 }});
 return {client,posts,restored,busy,results,setOwner:v=>owner=v};
}
async function until(fn){for(let i=0;i<100&&!fn();i++)await new Promise(r=>setTimeout(r,2));assert(fn());}
test('같은 대화에서 짧은 요청이 먼저 완료되고 결과 ID와 입력은 섞이지 않는다',async()=>{
 const f=fixture(),first=f.client.runDetailed('chat','긴 보고서',''),second=f.client.runDetailed('chat','짧은 질문','');
 await until(()=>f.posts.length===2);
 assert.notEqual(f.posts[0].thread_id,f.posts[1].thread_id);assert(f.posts.every(p=>p.conversation_id==='workspace1_chat'));
 const shorter=f.results.get(f.posts[1].thread_id);Object.assign(shorter,{status:'completed',output_text:'짧은 답변'});
 const answer=await second;assert.equal(answer.output,'짧은 답변');assert.equal(answer.resultId,'secretary_'+f.posts[1].request_id);assert(f.client.isBusy('chat'));assert(f.busy.every(v=>v===false));
 Object.assign(f.results.get(f.posts[0].thread_id),{status:'completed',output_text:'보고서'});
 assert.equal((await first).output,'보고서');assert.equal(f.client.isBusy('chat'),false);f.client.dispose();
});
test('서버 업무를 복구할 때 새 요청을 생성하지 않고 완료 결과를 원래 대화에 연결한다',async()=>{
 const f=fixture();f.results.set('workspace1_exec_saved',{request_id:'saved',status:'in_progress',server_managed:true});
 await f.client.recover('chat');assert.equal(f.posts.length,0);
 Object.assign(f.results.get('workspace1_exec_saved'),{status:'completed',output_text:'복구된 보고서'});
 await until(()=>f.restored.length===1);assert.deepEqual(f.restored[0],['chat','owner','복구된 보고서','secretary_saved']);assert.equal(f.posts.length,0);f.client.dispose();
});
test('진행 중 계정이 바뀌면 이전 계정 답변을 전달하지 않는다',async()=>{
 const f=fixture();const pending=f.client.runDetailed('chat','질문','');
 await until(()=>f.posts.length===1);f.setOwner('other');
 await assert.rejects(pending,/계정/);assert.equal(f.restored.length,0);f.client.dispose();
});
