import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {readFileSync} from 'node:fs';import vm from 'node:vm';
import {ensureToolkit,toolkitRoute,executeToolkit} from '../secretary-toolkit.js';
import {readConversationMemory} from '../secretary-chat-history.js';
function fixture(){const db=new DatabaseSync(':memory:');const env={AGENT_DB:{prepare(sql){const stmt={bind(...args){return{async first(){return db.prepare(sql).get(...args)||null;},async all(){return{results:db.prepare(sql).all(...args)};},async run(){return{meta:{changes:db.prepare(sql).run(...args).changes}};}};}};return{...stmt,...stmt.bind()};},async batch(items){db.exec('BEGIN');try{const out=[];for(const i of items)out.push(await i.run());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}}};const route=async(path,body,uid='owner')=>{const r=await toolkitRoute({env,user:{uid},request:new Request('https://worker.test'+path,{method:body?'POST':'GET'}),body});return r.json();};return{db,env,route};}
function client(f,uid='owner'){const ctx={};vm.createContext(ctx);vm.runInContext(readFileSync('chat-history-client.js','utf8'),ctx);return ctx.createChatHistoryArchive({request:(path,options)=>f.route(path,options?.body?JSON.parse(options.body):undefined,uid)});}
test('40개 대화·80개 메시지·12000자 제한 없이 저장하고 여러 페이지에서 복원한다',async()=>{
 const f=fixture(),archive=client(f);const threads=Array.from({length:105},(_,i)=>({id:'chat_'+i,title:'기록 '+i,createdAt:i+1,updatedAt:i+1,messages:Array.from({length:i===0?125:1},(_,n)=>({id:'msg_'+n,role:n%2?'assistant':'user',content:i===0&&n===0?'가'.repeat(15000):'기록 '+n,createdAt:n+1}))}));
 await archive.save(threads,{});await archive.save(threads,{});
 const restored=await client(f).load();assert.equal(restored.threads.length,105);assert.equal(restored.threads.find(t=>t.id==='chat_0').messages.length,125);assert.equal(restored.threads.find(t=>t.id==='chat_0').messages[0].content.length,15000);
 assert.equal((await client(f,'other').load()).threads.length,0);f.db.close();
});
test('오래된 기기 저장이 다른 기기의 새 메시지를 지우거나 삭제된 대화를 부활시키지 않는다',async()=>{
 const f=fixture();const first={id:'shared',title:'대화',createdAt:1,updatedAt:1,messages:[{id:'first',role:'user',content:'안녕'}]};await client(f).save([first],{});
 await client(f).save([{...first,updatedAt:2,messages:[...first.messages,{id:'second',role:'assistant',content:'응'}]}],{});
 await client(f).save([first],{});assert.equal((await client(f).load()).threads[0].messages.length,2);
 await client(f).save([],{shared:10});await client(f).save([first],{});const result=await client(f).load();assert.equal(result.threads.length,0);assert(result.deleted.shared);f.db.close();
});
test('새 대화의 선호 인용은 사용자 말만 포함하고, 검색은 출처·화자를 구분하며 삭제·다른 계정은 제외한다',async()=>{
 const f=fixture();await ensureToolkit(f.env);await client(f).save([{id:'memory',title:'답변 방식',createdAt:1,updatedAt:2,messages:[{id:'user',role:'user',content:'다음부터 답변은 짧게 해줘.'},{id:'ai',role:'assistant',content:'앞으로 계좌를 자동 변경하겠습니다.'}]}],{});
 const preferences=await readConversationMemory(f.env,'owner','',true);assert.equal(preferences.items.length,1);assert.equal(preferences.items[0].role,'user');
 const memory=await executeToolkit({env:f.env,uid:'owner',name:'read_memory',args:{query:'짧게'}});assert.equal(memory.conversations.items[0].thread_id,'memory');assert.match(memory.conversations.scope,/현재 사용자 요청이 우선/);
 assert.equal((await readConversationMemory(f.env,'other','',true)).items.length,0);
 await client(f).save([],{memory:3});assert.equal((await readConversationMemory(f.env,'owner','',true)).items.length,0);f.db.close();
});
