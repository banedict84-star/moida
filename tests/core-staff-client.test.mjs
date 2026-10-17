import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
test('직원 비동기 배정은 브라우저 대체 실행 없이 기다리고 보고만 모아에게 전달한다',async()=>{
 const storage=new Map(),sandbox={localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},crypto:{randomUUID:()=> 'request_A'},setTimeout:fn=>fn()};vm.runInNewContext(readFileSync(new URL('../secretary-client.js',import.meta.url),'utf8'),sandbox);
 let started=false,polls=0,posted=false,executions=0,claims=0;const seen=[];
 const action={call_id:'delegate_A',name:'delegate_agent',arguments:{agent_id:'core_semi',instruction:'계산'},status:'pending'};
 const request=async(path,init)=>{if(path==='/secretary/message'){started=true;return {status:'requires_action',actions:[action]};}if(path==='/secretary/claim'){claims++;return {claimed:true,pending:true};}if(path==='/secretary/result'){const b=JSON.parse(init.body);assert.equal(b.result.agent_name,'셈이');posted=true;return {ok:true};}if(!started)return {status:'ready'};if(posted)return {status:'completed',output_text:'실제 보고'};polls++;return {status:'requires_action',request_id:'request_A',agents:[{name:'셈이',status:polls<2?'in_progress':'completed'}],actions:[{...action,status:'executing',...(polls>=2?{result:{ok:true,agent_name:'셈이',report:'42',artifacts:[{name:'create_document',result:{saved:true,file_id:'report'}}]}}:{})}]};};
 const c=sandbox.createSecretaryClient({owner:()=> 'owner',request,status:()=>{},busy:()=>{},execute:async()=>{executions++;},executed:(name)=>seen.push(name)});assert.equal(await c.run('chat_A','계산해줘',''),'실제 보고');assert.equal(executions,0);assert.equal(claims,1);assert.deepEqual(seen,['delegate_agent','create_document']);
});
