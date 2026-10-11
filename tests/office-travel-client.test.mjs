import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../office-travel-client.js',import.meta.url),'utf8');
async function fixture(connection,storedOwner='alice'){
 let uid=null,changed,removed=0,current=connection;
 const calls=[];
 const element=()=>({value:'',append(){},setAttribute(){},replaceChildren(){}});
 const subscription={endpoint:'https://fcm.googleapis.com/test',async unsubscribe(){removed++;}};
 const local=new Map([['moida_push_owner',storedOwner]]);
 const indexedDB={open(){const r={};queueMicrotask(()=>{r.result={close(){},transaction(){const tx={objectStore(){return {get(){const q={result:current};queueMicrotask(()=>tx.oncomplete());return q;},put(v){current=v;queueMicrotask(()=>tx.oncomplete());},delete(){current=null;queueMicrotask(()=>tx.oncomplete());}};}};return tx;}};r.onsuccess();});return r;}};
 const context={window:{PushManager:{},Notification:{}},navigator:{serviceWorker:{async register(){return {pushManager:{async getSubscription(){return subscription;}}};}}},indexedDB,document:{createElement:element},Option:function(t,v){this.value=v;},localStorage:{getItem:k=>local.get(k),setItem:(k,v)=>local.set(k,v),removeItem:k=>local.delete(k)},setInterval(){},setTimeout(){},clearTimeout(){},Uint8Array,atob,Date};
 vm.runInNewContext(source,context);
 context.window.setupOfficeTravel(element(),{owner:()=>uid,events:()=>[],subscribe:fn=>changed=fn,async request(path){calls.push(path);if(path.endsWith('/status'))return {publicKey:'key',enabled:true};if(path.endsWith('/device'))return {registered:true};if(path.endsWith('/subscribe'))return {token:'recovered'};return {};}});
 const flush=()=>new Promise(resolve=>setImmediate(resolve));
 await flush();
 return {get connection(){return current;},get removed(){return removed;},calls,async login(value){uid=value;changed();await flush();await flush();}};
}
test('auth restoration preserves the saved push credential across page refresh',async()=>{
 const saved={uid:'alice',token:'saved',api:'https://moida-gpt.banedict84.workers.dev'};
 const f=await fixture(saved);
 assert.deepEqual(f.connection,saved);
 await f.login('alice');
 assert.deepEqual(f.connection,saved);
 assert.equal(f.removed,0);
 assert.ok(!f.calls.includes('/office-travel/subscribe'));
});
test('existing registered device recovers a lost credential without a new push subscription',async()=>{
 const f=await fixture(null);await f.login('alice');
 assert.equal(f.connection.token,'recovered');assert.equal(f.connection.uid,'alice');
 assert.equal(f.removed,0);assert.equal(f.calls.filter(p=>p.endsWith('/subscribe')).length,1);
});
test('logout clears the device credential and subscription',async()=>{
 const f=await fixture(null);await f.login('alice');await f.login(null);
 assert.equal(f.connection,null);assert.equal(f.removed,1);
});
test('another account cannot recover the previous account device credential',async()=>{
 const f=await fixture({uid:'alice',token:'saved'});await f.login('bob');
 assert.equal(f.connection,null);assert.equal(f.removed,1);
 assert.ok(!f.calls.includes('/office-travel/subscribe'));
});
