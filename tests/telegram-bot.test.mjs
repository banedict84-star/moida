import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createTelegramBot} from '../telegram-bot.js';

function fixture() {
 const db=new DatabaseSync(':memory:');
 db.exec(readFileSync(new URL('../migrations/0005_telegram.sql',import.meta.url),'utf8'));
 const env={TELEGRAM_BOT_TOKEN:'fake',TELEGRAM_WEBHOOK_SECRET:'secret',TELEGRAM_ADMIN_IDS:'1',OPENAI_API_KEY:'fake',AGENT_DB:{prepare(sql){return{bind(...args){return{run:async()=>({meta:{changes:Number(db.prepare(sql).run(...args).changes)}}),first:async()=>db.prepare(sql).get(...args),all:async()=>({results:db.prepare(sql).all(...args)})};}};}}};
 const sent=[],ai=[];let fail=false;
 const bot=createTelegramBot({fetcher:async(url,init)=>{
  assert.equal(init.redirect,'manual','Cloudflare redirect mode'); const body=JSON.parse(init.body);
  if(url.includes('api.telegram.org')){if(fail)throw Error('timeout');sent.push(body);return Response.json({ok:true,result:{}});}
  ai.push(body);return Response.json({output:[{content:[{type:'output_text',text:'요약입니다.'}]}]});
 }});
 let id=0;
 const post=(uid,text,extra={})=>bot.route(new Request('https://example.com/telegram/webhook',{method:'POST',headers:{'X-Telegram-Bot-Api-Secret-Token':'secret'},body:JSON.stringify({update_id:++id,message:{from:{id:uid},chat:{id:uid,type:'private'},text},...extra})}),env);
 const send=async(uid,text)=>{await post(uid,text);await bot.tick(env);return sent.at(-1)?.text;};
 return {db,env,bot,sent,ai,post,send,setFail(v){fail=v;},close(){db.close();}};
}
test('webhook fails closed and rejects group traffic',async()=>{
 const f=fixture();try{
  assert.equal((await f.bot.route(new Request('https://e.test',{method:'POST',body:'{}'}),f.env)).status,401);
  assert.equal((await f.bot.route(new Request('https://e.test',{method:'POST'}),{})).status,503);
  await f.post(2,'secret',{message:{from:{id:2},chat:{id:-1,type:'group'},text:'secret'}});
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM telegram_inbox').get().n,0);
 }finally{f.close();}
});
test('approval, tenant isolation, and revocation are enforced',async()=>{
 const f=fixture();try{
  assert.match(await f.send(2,'hello'),/승인/);assert.equal(f.ai.length,0);
  await f.send(3,'/start');await f.send(1,'/승인 2 office-a');await f.send(1,'/승인 3 office-b');
  assert.match(await f.send(2,'/메모 A의 비공개 업무'),/저장/);
  assert.match(await f.send(2,'/목록'),/A의 비공개/);
  assert.doesNotMatch(await f.send(3,'/목록'),/A의 비공개/);
  assert.match(await f.send(2,'/승인 3 office-a'),/모이다/);
  assert.match(await f.send(1,'/승인 3 office-a'),/변경/);
  await f.send(1,'/차단 2');assert.match(await f.send(2,'/목록'),/승인/);
 }finally{f.close();}
});
test('duplicate updates and delivery retries do not duplicate notes',async()=>{
 const f=fixture();try{
  await f.send(2,'/start');await f.send(1,'/승인 2 a');
  const update={update_id:900,message:{from:{id:2},chat:{id:2,type:'private'},text:'/메모 하나'}};
  await f.post(2,'',{...update});await f.post(2,'',{...update});f.setFail(true);await f.bot.tick(f.env);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM telegram_notes').get().n,1);
  f.setFail(false);f.db.exec('UPDATE telegram_inbox SET lease_until=0');await f.bot.tick(f.env);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM telegram_notes').get().n,1);
  assert.equal(f.db.prepare('SELECT state,text,reply FROM telegram_inbox WHERE update_id=900').get().state,'done');
  assert.equal(f.db.prepare('SELECT text FROM telegram_inbox WHERE update_id=900').get().text,'');
 }finally{f.close();}
});
test('AI gets only current authorized input and no other office data',async()=>{
 const f=fixture();try{
  await f.send(2,'/start');await f.send(1,'/승인 2 a');
  await f.send(2,'/메모 비밀');assert.equal(await f.send(2,'안건 초안 작성'),'요약입니다.');
  assert.equal(f.ai[0].store,false);assert.equal(f.ai[0].input,'안건 초안 작성');
  assert.doesNotMatch(JSON.stringify(f.ai[0]),/비밀/);
  assert.match(await f.send(2,'',{ }),/텍스트/);
 }finally{f.close();}
});
test('revocation prevents cached reply delivery',async()=>{
 const f=fixture();try{
  await f.send(2,'/start');await f.send(1,'/승인 2 a');await f.send(2,'/메모 민감자료');
  f.setFail(true);await f.post(2,'/목록');await f.bot.tick(f.env);
  f.db.exec("UPDATE telegram_users SET approved=0 WHERE user_id='2'; UPDATE telegram_inbox SET lease_until=0");
  f.setFail(false);await f.bot.tick(f.env);
  assert.doesNotMatch(f.sent.at(-1).text,/민감자료/);assert.match(f.sent.at(-1).text,/승인/);
 }finally{f.close();}
});

test('webhook dispatches immediate durable work and queue/cron retries do not duplicate replies',async()=>{
 const f=fixture();try{
  const queued=[];f.env.AGENT_QUEUE={send:async body=>queued.push(body)};
  await f.post(1,'/start');assert.deepEqual(queued,[{kind:'telegram-user',userId:'1'}]);
  await Promise.all([f.bot.tick(f.env,'1'),f.bot.tick(f.env,'1'),f.bot.tick(f.env)]);
  assert.equal(f.sent.length,1);assert.equal(f.db.prepare("SELECT state FROM telegram_inbox").get().state,'done');
 }finally{f.close();}
});
test('failed queue dispatch falls back to webhook background work without waiting for cron',async()=>{
 const f=fixture();try{
  f.env.AGENT_QUEUE={send:async()=>{throw Error('unavailable')}};const tasks=[];
  const req=new Request('https://example.test/telegram/webhook',{method:'POST',headers:{'X-Telegram-Bot-Api-Secret-Token':'secret'},body:JSON.stringify({update_id:20,message:{from:{id:1},chat:{id:1,type:'private'},text:'/start'}})});
  const response=await f.bot.route(req,f.env,{waitUntil:p=>tasks.push(p)});assert.equal(response.status,200);assert.equal(tasks.length,1);await Promise.all(tasks);assert.equal(f.sent.length,1);
 }finally{f.close();}
});
test('a leased earlier message blocks following messages only for its own user',async()=>{
 const f=fixture();try{
  await f.post(1,'/start');await f.post(1,'/id');await f.post(2,'/start');
  f.db.prepare('UPDATE telegram_inbox SET lease_until=? WHERE update_id=1').run(Date.now()+60000);
  await f.bot.tick(f.env);assert.equal(f.sent.length,1);assert.equal(f.sent[0].chat_id,'2');
  f.db.prepare('UPDATE telegram_inbox SET lease_until=0 WHERE update_id=1').run();await f.bot.tick(f.env,'1');assert.equal(f.sent.length,3);
 }finally{f.close();}
});
