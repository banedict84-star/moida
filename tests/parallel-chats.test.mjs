import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const clientSource=readFileSync(new URL('../secretary-client.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../platform.html',import.meta.url),'utf8');

test('다른 대화는 동시에 실행하며 같은 대화 재진입은 원래 요청을 재사용한다',async()=>{
 const storage=new Map(),waiters=new Map(),posts=[],states=[],busy=[];let active='A',owner='owner';
 const sandbox={Map,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},crypto:{randomUUID:()=> 'id_'+posts.length},setTimeout:fn=>fn()};vm.runInNewContext(clientSource,sandbox);
 const request=async(path,options)=>{
   if(path==='/secretary/message'){const b=JSON.parse(options.body);posts.push(b);return new Promise(resolve=>waiters.set(b.thread_id,resolve));}
   return {status:'ready'};
 };
 const client=sandbox.createSecretaryClient({owner:()=>owner,thread:()=>active,request,status:s=>states.push([active,s]),busy:b=>busy.push(b),execute:()=>{}});
 const a=client.run('A','A 요청','');await new Promise(r=>setImmediate(r));assert.equal(client.isBusy('A'),true);
 active='B';client.refreshView();assert.equal(busy.at(-1),false);
 const b=client.run('B','B 요청','');await new Promise(r=>setImmediate(r));assert.equal(posts.length,2);assert.equal(client.isBusy('A'),true);assert.equal(client.isBusy('B'),true);
 assert.equal(client.run('A','중복 요청',''),a);assert.equal(posts.length,2);
 waiters.get('workspace1_A')({status:'completed',output_text:'A 답변'});assert.equal(await a,'A 답변');assert.equal(busy.at(-1),true,'A 완료가 현재 B의 전송 잠금을 풀지 않음');
 waiters.get('workspace1_B')({status:'completed',output_text:'B 답변'});assert.equal(await b,'B 답변');assert.equal(busy.at(-1),false);assert.equal(storage.size,0);assert.equal(states.length,0);
});

test('초기 조회 중 계정이 바뀌면 다른 계정으로 메시지를 접수하지 않는다',async()=>{
 let owner='first',resolve,posts=0;const store=new Map();const sandbox={localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},crypto:{randomUUID:()=> 'id'},setTimeout:fn=>fn()};vm.runInNewContext(clientSource,sandbox);
 const client=sandbox.createSecretaryClient({owner:()=>owner,busy:()=>{},status:()=>{},request:async(path)=>{if(path==='/secretary/message'){posts++;return{status:'completed'};}return new Promise(r=>resolve=r);}});
 const run=client.run('A','요청','');owner='second';resolve({status:'ready'});await assert.rejects(run,/계정이 변경/);assert.equal(posts,0);assert.equal(store.size,0);
});

test('대화 전환 뒤 성공·실패 답변은 원래 대화에만 저장하고 삭제·다른 계정에는 저장하지 않는다',async()=>{
 const start=html.indexOf('  function saveSecretaryReply('),end=html.indexOf("  var input=document.getElementById('aiInput'), sendBtn=",start);assert(start>0&&end>start);
 const saved=[],rendered=[],completions=[];let owner='owner';
 const sandbox={currentThreadId:'A',secretaryPreviews:{},M:{auth:{get currentUser(){return {uid:owner};}},esc:s=>s},chatThreads:[{id:'A'},{id:'B'}],history:[{role:'user',content:'A 요청'}],deletedChats:()=>({}),recordChatMessage:(role,text,id)=>saved.push({role,text,id}),addAI:(html,text,noRecord)=>rendered.push({text,noRecord}),mdToHtml:s=>s,sysPrompt:()=>'',setChatStatus:()=>{},officeToolkit:null,expectingPromotionCopy:false,secretaryClient:{run:()=>new Promise((resolve,reject)=>completions.push({resolve,reject}))}};
 vm.createContext(sandbox);vm.runInContext(html.slice(start,end),sandbox);
 sandbox.runLoop({remove(){}},0,0,false,false);sandbox.currentThreadId='B';sandbox.history=[{role:'user',content:'B 요청'}];completions[0].resolve('A 답변');await new Promise(r=>setImmediate(r));assert.equal(saved[0].id,'A');assert.equal(rendered.length,0);assert.equal(sandbox.history.length,1);
 sandbox.currentThreadId='A';sandbox.runLoop({remove(){}},0,0,false,false);sandbox.currentThreadId='B';completions[1].reject(Error('A 오류'));await new Promise(r=>setImmediate(r));assert.equal(saved[1].id,'A');assert.match(saved[1].text,/A 오류/);assert.equal(rendered.length,0);
 sandbox.chatThreads=[{id:'B'}];sandbox.saveSecretaryReply('A','owner','삭제된 답변');assert.equal(saved.length,2);
 owner='other';sandbox.saveSecretaryReply('B','owner','다른 계정 답변');assert.equal(saved.length,2);
});

test('새 대화와 기존 대화 이동은 전체 실행 잠금으로 차단하지 않는다',()=>{
 const navigation=html.slice(html.indexOf('  function resetChat(){'),html.indexOf('  function loadLocalChats(){'));
 assert.doesNotMatch(navigation,/처리 중인 대화를 먼저/);assert.match(navigation,/syncChatExecution\(\)/);assert.match(navigation,/isBusy\(currentThreadId\)/);
});
