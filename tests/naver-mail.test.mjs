import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {probeNaver,validateNaverCredentials,createNaverMail} from '../naver-mail.js';
function transport(rejectLogin=false){
 const commands=[];let closed=false;
 const connect=(host,options)=>{
  assert.deepEqual(host,{hostname:'imap.naver.com',port:993});assert.equal(options.secureTransport,'on');
  let controller;const emit=s=>{const b=new TextEncoder().encode(s);controller.enqueue(b.slice(0,3));controller.enqueue(b.slice(3));};
  return {opened:Promise.resolve(),closed:Promise.resolve(),readable:new ReadableStream({start(c){controller=c;emit('* OK ready\r\n');}}),writable:new WritableStream({write(bytes){const s=new TextDecoder().decode(bytes);commands.push(s);if(s.startsWith('A1'))emit(rejectLogin?'A1 NO password failed\r\n':'A1 OK logged in\r\n');else emit('* 42 EXISTS\r\nA2 OK [READ-ONLY] done\r\n');}}),close:async()=>{closed=true;controller.close();}};
 };
 return {connect,commands,get closed(){return closed;}};
}
test('TLS IMAP handles split replies, uses read-only EXAMINE and closes socket',async()=>{
 const t=transport();assert.deepEqual(await probeNaver({mailbox:'office@naver.com',password:'test-secret',connect:t.connect}),{inboxCount:42});assert(t.closed);assert.match(t.commands[1],/EXAMINE INBOX/);assert.equal(t.commands.length,2);
});
test('invalid credentials and IMAP injection are rejected; errors do not echo password',async()=>{
 assert.throws(()=>validateNaverCredentials({mailbox:'x@other.test',password:'test-secret'}));
 assert.throws(()=>validateNaverCredentials({mailbox:'x@naver.com',password:'secret\r\nA2 DELETE INBOX'}));
 const t=transport(true);await assert.rejects(probeNaver({mailbox:'x@naver.com',password:'test-secret',connect:t.connect}),e=>e.status===502&&!e.message.includes('test-secret'));assert(t.closed);
});
test('network diagnostic sends no credentials and failures identify their stage without raw server data',async()=>{
 const t=transport();assert.equal((await probeNaver({connect:t.connect,networkOnly:true})).reachable,true);assert.equal(t.commands.length,0);
 await assert.rejects(probeNaver({connect:()=>{throw Error('private transport detail');},networkOnly:true}),e=>e.message.includes('NAVER_NETWORK')&&!e.message.includes('private'));
 const rejected=transport(true);await assert.rejects(probeNaver({connect:rejected.connect,mailbox:'x@naver.com',password:'test-secret'}),/NAVER_LOGIN/);
});
test('connection storage isolates owners, encrypts secrets, and only saves after verification',async()=>{
 const db=new DatabaseSync(':memory:');const env={AGENT_DB:{prepare(sql){const bind=(...args)=>({run:async()=>db.prepare(sql).run(...args),first:async()=>db.prepare(sql).get(...args)||null});return {bind,...bind()};}}};
 const vault=new Map();let seq=0;const encrypt=async(_,plain)=>{const cipher='encrypted-'+ ++seq;vault.set(cipher,plain);return {cipher,iv:'random-iv'};},decrypt=async(_,cipher)=>vault.get(cipher);
 const route=createNaverMail({...transport(),encrypt,decrypt});const request=new Request('https://moida.test/naver-mail',{method:'POST'});
 const body={action:'connect',mailbox:'office@naver.com',password:'test-secret'};
 const result=await route({env,uid:'owner',request,body});assert.equal(result.connected,true);assert.equal(result.automatic,false);assert(!JSON.stringify(result).includes('test-secret'));
 assert(!JSON.stringify(db.prepare('SELECT * FROM naver_mail_connections').all()).includes('test-secret'));
 assert.equal((await route({env,uid:'other',request:new Request(request.url)})).connected,false);
 await assert.rejects(route({env,uid:'other',request,body:{action:'test'}}));
 const failed=createNaverMail({...transport(true),encrypt,decrypt});await assert.rejects(failed({env,uid:'owner',request,body}));assert.equal(db.prepare('SELECT count(*) AS n FROM naver_mail_connections').get().n,1);
 await route({env,uid:'owner',request,body:{action:'disconnect'}});assert.equal(db.prepare('SELECT count(*) AS n FROM naver_mail_connections').get().n,0);db.close();
});
