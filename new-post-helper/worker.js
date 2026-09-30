import puppeteer from '@cloudflare/puppeteer';
import { DurableObject } from 'cloudflare:workers';
import './core.js';
import browserScripts from './browser-scripts.js';
import publicKey from './public-key.js';
const C = globalThis.NewPostsCore;
const DAY = 86400000, BUDGET = 540000;
const encoder = new TextEncoder();
const json = (value, status=200) => Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
const from64 = s => Uint8Array.from(atob(s), c=>c.charCodeAt(0));
const to64 = a => btoa(String.fromCharCode(...new Uint8Array(a)));
const nextDay = () => (Math.floor(Date.now()/DAY)+1)*DAY+5000;
export default {
  async fetch(request,env) {
    if(new URL(request.url).pathname==='/health') return json({service:'new-post-helper',ready:true});
    if(request.method!=='POST'||new URL(request.url).pathname!=='/command') return json({error:'Not found'},404);
    const body=await request.text();
    if(body.length>30000)return json({error:'Too large'},413);
    const at=request.headers.get('x-helper-at'), nonce=request.headers.get('x-helper-nonce'), sig=request.headers.get('x-helper-signature');
    if(!at||!nonce||!sig||!/^\d{13}$/.test(at)||! /^[a-f0-9-]{36}$/.test(nonce)||Math.abs(Date.now()-Number(at))>60000)return json({error:'Unauthorized'},401);
    try {
      const key=await crypto.subtle.importKey('jwk',publicKey,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
      if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,from64(sig),encoder.encode(`${at}\n${nonce}\n${body}`)))return json({error:'Unauthorized'},401);
    }catch{return json({error:'Unauthorized'},401);}
    return env.HELPER.get(env.HELPER.idFromName('owner')).fetch(new Request('https://helper/command',{method:'POST',headers:{'x-helper-nonce':nonce},body}));
  }
};
export class Helper extends DurableObject {
  constructor(ctx,env) {
    super(ctx,env);this.ctx=ctx;this.env=env;this.busy=false;this.browser=null;this.cancel=false;
    this.sql=ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS meta (id INTEGER PRIMARY KEY, value TEXT NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS posts (key TEXT PRIMARY KEY, target TEXT NOT NULL, seen INTEGER NOT NULL, value TEXT NOT NULL)');
    this.sql.exec('CREATE INDEX IF NOT EXISTS posts_target ON posts(target)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS nonces (id TEXT PRIMARY KEY, at INTEGER NOT NULL)');
    const row=this.sql.exec('SELECT value FROM meta WHERE id=1').toArray()[0];
    this.state=row?JSON.parse(row.value):{...C.defaultState(),posts:undefined,quota:{day:'',used:0},nextRunAt:null,connection:{connected:false},login:null};
    if(this.state.job?.running){this.state.job=null;this.state.settings.dailyEnabled=false;this.event('실행이 중단되어 자동 확인을 껐습니다. 기록을 확인한 뒤 다시 시작해 주세요.','warning');}
    for(const row of this.sql.exec("SELECT key,value FROM posts WHERE json_extract(value,'$.status')='attempting'").toArray()){const p=JSON.parse(row.value);p.status='uncertain';p.note='서버가 재시작되어 결과를 확인해야 합니다.';this.putPost(p);}
    this.save();
  }
  event(message,level='info'){this.state.events.unshift({at:Date.now(),message,level});this.state.events=this.state.events.slice(0,150);}
  save(){this.sql.exec('INSERT OR REPLACE INTO meta(id,value) VALUES(1,?)',JSON.stringify(this.state));}
  putPost(p){this.sql.exec('INSERT OR REPLACE INTO posts(key,target,seen,value) VALUES(?,?,?,?)',p.key,p.targetId,p.lastSeenAt||p.firstSeenAt||Date.now(),JSON.stringify(p));}
  post(key){const row=this.sql.exec('SELECT value FROM posts WHERE key=?',key).toArray()[0];return row?JSON.parse(row.value):null;}
  quota(){const day=new Date().toISOString().slice(0,10);if(this.state.quota.day!==day)this.state.quota={day,used:0};return Math.max(0,BUDGET-this.state.quota.used);}
  publicState(){
    this.quota();const {login,encryptedSession,...s}=this.state;
    const posts=this.sql.exec('SELECT value FROM posts ORDER BY seen DESC LIMIT 300').toArray().map(r=>JSON.parse(r.value));
    return {...s,posts:Object.fromEntries(posts.map(p=>[p.key,p])),busy:this.busy,login:login?{expiresAt:login.expiresAt}:null,quota:{...s.quota,budget:BUDGET,resetsAt:nextDay()}};
  }
  async schedule(){
    const times=[this.state.login?.expiresAt,this.state.job?.dueAt,!this.state.job&&this.state.settings.dailyEnabled?this.state.nextRunAt:null].filter(x=>Number.isFinite(x));
    if(times.length)await this.ctx.storage.setAlarm(Math.max(Date.now()+1000,Math.min(...times)));else await this.ctx.storage.deleteAlarm();
  }
  async fetch(request){
    try {
      const nonce=request.headers.get('x-helper-nonce');this.sql.exec('DELETE FROM nonces WHERE at<?',Date.now()-120000);
      if(this.sql.exec('SELECT id FROM nonces WHERE id=?',nonce).toArray().length)return json({ok:false,error:'중복 요청입니다.'},409);
      this.sql.exec('INSERT INTO nonces(id,at) VALUES(?,?)',nonce,Date.now());
      const m=await request.json();
      if(m.type==='get')return json({ok:true,result:this.publicState()});
      if(m.type==='stop'){
        this.cancel=true;this.state.settings.dailyEnabled=false;this.state.nextRunAt=null;this.state.job=null;this.event('모든 작업과 자동 확인을 중단했습니다.');this.save();
        if(this.browser)await this.browser.close().catch(()=>{});await this.schedule();return json({ok:true,result:true});
      }
      if(this.busy)throw new Error('현재 작업이 끝난 뒤 다시 시도해 주세요.');
      this.busy=true;
      try {const result=await this.action(m);this.save();await this.schedule();return json({ok:true,result});}
      finally {this.busy=false;}
    }catch(e){return json({ok:false,error:this.safeError(e)},400);}
  }
  safeError(e){const msg=String(e?.message||e);if(/429|limit|quota/i.test(msg))return '오늘의 무료 실행량을 다 썼습니다. 다음 초기화 이후 다시 실행해 주세요.';if(/401|403|captcha|challenge/i.test(msg))return '접근 또는 인증 확인이 필요합니다. 페이스북 로그인 상태를 확인해 주세요.';return msg.slice(0,350).replace(/https?:\/\/\S*(?:jwt|token|signature)\S*/gi,'[보호된 주소]');}
  async action(m){
    const s=this.state;
    if(m.type==='loginStart')return this.loginStart();
    if(m.type==='loginFinish')return this.loginFinish();
    if(m.type==='logout'){
      await this.closeLogin();delete s.encryptedSession;s.connection={connected:false};s.settings.dailyEnabled=false;s.nextRunAt=null;s.job=null;this.event('서버에 보관한 페이스북 로그인 상태를 삭제했습니다.');return true;
    }
    if(s.job||s.login)throw new Error('진행 중인 작업 또는 로그인을 먼저 마치거나 중단해 주세요.');
    if(m.type==='addTarget'){
      const name=String(m.name||'').trim().slice(0,60),url=C.profileURL(m.url);if(!name||!url)throw new Error('이름과 페이스북 프로필 주소를 확인해 주세요.');
      if(s.targets.length>=200)throw new Error('현재 버전은 동료 200명까지 등록할 수 있습니다.');if(s.targets.some(t=>t.url===url))throw new Error('이미 등록된 동료입니다.');
      const i=s.removedTargets.findIndex(t=>t.url===url);const t=i<0?{id:crypto.randomUUID(),baselineAt:null}:s.removedTargets.splice(i,1)[0];delete t.removedAt;s.targets.push({...t,name,url,enabled:true});return true;
    }
    if(['removeTarget','restoreTarget','toggleTarget'].includes(m.type)){
      const list=m.type==='restoreTarget'?s.removedTargets:s.targets,i=list.findIndex(t=>t.id===m.id);if(i<0)throw new Error('해당 동료가 없습니다.');const t=list[i];
      if(m.type==='toggleTarget')t.enabled=!t.enabled;
      else if(m.type==='removeTarget'){list.splice(i,1);s.removedTargets.push({...t,removedAt:Date.now()});this.event(`${t.name}: 동료 목록에서 삭제했습니다. 기록은 보관합니다.`);}
      else {if(s.targets.length>=200)throw new Error('200명까지 등록할 수 있습니다.');list.splice(i,1);delete t.removedAt;s.targets.push(t);}
      if(!s.targets.some(t=>t.enabled)){s.settings.dailyEnabled=false;s.nextRunAt=null;}return true;
    }
    if(m.type==='settings'){
      const v=m.settings,actorName=String(v.actorName||'').trim(),actorUrl=C.profileURL(v.actorUrl),interval=Number(v.checkIntervalMinutes),max=Number(v.maxPerRun);
      if(!actorName||actorName.length>60||!actorUrl||!C.CHECK_INTERVALS.includes(interval)||!Number.isInteger(max)||max<1||max>30)throw new Error('설정 값을 확인해 주세요.');
      if(this.sql.exec('SELECT key FROM posts LIMIT 1').toArray().length&&(actorName!==s.settings.actorName||actorUrl!==s.settings.actorUrl))throw new Error('기록이 있는 상태에서는 반응 계정을 바꿀 수 없습니다.');
      if(v.dailyEnabled&&!s.connection.connected)throw new Error('페이스북 로그인을 먼저 연결해 주세요.');
      const changed=s.settings.checkIntervalMinutes!==interval||!s.settings.dailyEnabled;
      s.settings={actorName,actorUrl,checkIntervalMinutes:interval,maxPerRun:max,dailyEnabled:v.dailyEnabled===true,autoLike:v.autoLike===true};
      s.nextRunAt=s.settings.dailyEnabled?(changed?Date.now()+interval*60000:s.nextRunAt):null;return true;
    }
    if(m.type==='runTargetLatest'||m.type==='run'){
      if(!s.connection.connected)throw new Error('페이스북 로그인을 먼저 연결해 주세요.');
      const mode=m.type==='runTargetLatest'?'latest':m.mode;if(!['latest','scan','auto','selected'].includes(mode))throw new Error('지원하지 않는 실행 방식입니다.');
      const keys=mode==='selected'?m.keys:[];if(mode==='selected'&&(!Array.isArray(keys)||!keys.length||keys.length>30||keys.some(k=>{const p=this.post(k);return !p||p.status!=='new'||!s.targets.some(t=>t.id===p.targetId&&t.enabled);})))throw new Error('현재 동료의 새 글을 선택해 주세요.');
      const ids=s.targets.filter(t=>mode==='latest'?t.id===m.targetId:t.enabled&&(mode!=='selected'||keys.some(k=>this.post(k)?.targetId===t.id))).map(t=>t.id);
      if(!ids.length)throw new Error('확인할 동료가 없습니다.');s.job={id:crypto.randomUUID(),mode,ids,keys,index:0,used:0,dueAt:Date.now()+1000,running:false};this.event(`${ids.length}명 확인을 예약했습니다.`);return true;
    }
    if(m.type==='skip'){for(const k of (m.keys||[]).slice(0,300)){const p=this.post(k);if(p&&['new','review'].includes(p.status)){p.status='skipped';this.putPost(p);}}return true;}
    throw new Error('지원하지 않는 요청입니다.');
  }
  async reserve(ms){if(this.quota()<ms)throw new Error('오늘의 무료 실행량이 부족합니다. 내일 다시 시도해 주세요.');this.state.quota.used+=ms;this.save();return {day:this.state.quota.day,ms,at:Date.now()};}
  settle(reservation,closed){if(closed&&reservation?.day===this.state.quota.day){const used=Math.min(reservation.ms,Date.now()-reservation.at+5000);this.state.quota.used=Math.max(0,this.state.quota.used-(reservation.ms-used));this.save();}}
  async launch(){return puppeteer.launch(this.env.BROWSER,{keep_alive:60000,guardrails:{allowedDomains:['facebook.com','*.facebook.com','*.fbcdn.net','*.fbsbx.com','*.facebook.net']}});}
  async crypt(value,decrypt=false){
    if(!this.env.FB_SESSION_KEY)throw new Error('서버 연결 설정이 아직 완료되지 않았습니다.');
    const raw=Uint8Array.from(this.env.FB_SESSION_KEY.match(/.{2}/g),x=>parseInt(x,16));
    const key=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,[decrypt?'decrypt':'encrypt']);
    if(decrypt)return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:from64(value.iv)},key,from64(value.data))));
    const iv=crypto.getRandomValues(new Uint8Array(12));return {iv:to64(iv),data:to64(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,encoder.encode(JSON.stringify(value))))};
  }
  async loginStart(){
    if(this.state.job)throw new Error('먼저 진행 중인 작업을 중단해 주세요.');if(this.state.login)throw new Error('이미 열린 로그인 화면을 완료해 주세요.');
    if(!this.env.FB_SESSION_KEY)throw new Error('서버 연결 설정이 아직 완료되지 않았습니다.');
    const reservation=await this.reserve(240000);let browser;
    try {
      browser=await this.launch();const page=await browser.newPage();await page.setViewport({width:1280,height:900});await page.goto('https://www.facebook.com/login/?locale=ko_KR',{waitUntil:'domcontentloaded',timeout:30000});
      const cdp=await page.createCDPSession();const {devtoolsFrontendUrl}=await cdp.send('Cloudflare.getLiveView',{mode:'tab',expiresInMs:180000});
      this.state.login={sessionId:browser.sessionId(),expiresAt:Date.now()+180000,reservation};this.save();await this.schedule();await browser.disconnect();return {url:devtoolsFrontendUrl,expiresAt:this.state.login.expiresAt};
    }catch(e){let closed=false;if(browser){try{await browser.close();closed=true;}catch{}}this.settle(reservation,closed);throw e;}
  }
  async closeLogin(){const l=this.state.login;if(!l)return;let closed=false;try{const b=await puppeteer.connect(this.env.BROWSER,l.sessionId);await b.close();closed=true;}catch{}this.settle(l.reservation,closed);this.state.login=null;this.save();}
  async loginFinish(){
    const l=this.state.login;if(!l||Date.now()>l.expiresAt){await this.closeLogin();throw new Error('로그인 시간이 만료됐습니다. 다시 연결해 주세요.');}
    const b=await puppeteer.connect(this.env.BROWSER,l.sessionId);
    try {
      const page=(await b.pages()).find(p=>p.url().startsWith('https://www.facebook.com/'));
      if(!page)throw new Error('페이스북 로그인 화면을 찾지 못했습니다.');
      const cookies=(await page.cookies('https://www.facebook.com/')).filter(c=>/(^|\.)facebook\.com$/.test(c.domain));
      if(!cookies.some(c=>c.name==='c_user'))throw new Error('페이스북 로그인이 아직 완료되지 않았습니다. 로그인 화면에서 먼저 완료해 주세요.');
      this.state.encryptedSession=await this.crypt(cookies);this.state.connection={connected:true,connectedAt:Date.now()};this.event('페이스북 로그인 상태를 연결했습니다. 실제 반응 계정은 매번 확인합니다.');
      await b.close();this.settle(l.reservation,true);this.state.login=null;return true;
    }catch(e){await b.disconnect();throw e;}
  }
  async alarm(){
    if(this.busy){await this.ctx.storage.setAlarm(Date.now()+10000);return;}
    this.busy=true;
    try {
      if(this.state.login){if(Date.now()>=this.state.login.expiresAt)await this.closeLogin();return;}
      if(!this.state.job&&this.state.settings.dailyEnabled&&Date.now()>=this.state.nextRunAt){
        const ids=this.state.targets.filter(t=>t.enabled).map(t=>t.id);
        if(ids.length)this.state.job={id:crypto.randomUUID(),mode:this.state.settings.autoLike?'auto':'scan',ids,keys:[],index:0,used:0,dueAt:Date.now(),running:false};
        this.state.nextRunAt=Date.now()+this.state.settings.checkIntervalMinutes*60000;
      }
      if(this.state.job&&Date.now()>=this.state.job.dueAt)await this.runBatch();
    }catch(e){this.event(this.safeError(e),'error');this.state.settings.dailyEnabled=false;this.state.nextRunAt=null;this.state.job=null;}
    finally {this.busy=false;this.save();await this.schedule();}
  }
  async runBatch(){
    const job=this.state.job;
    if(this.quota()<90000){job.dueAt=nextDay();this.event('오늘의 무료 실행량을 다 사용해 남은 동료는 다음 날 이어서 확인합니다.');return;}
    const reservation=await this.reserve(Math.min(180000,this.quota()));const activeMs=reservation.ms-60000;
    let browser,closed=false;const deadline=Date.now()+activeMs;let timer;this.cancel=false;job.running=true;this.save();
    try {
      browser=await this.launch();this.browser=browser;
      timer=setTimeout(()=>{this.cancel=true;browser.close().catch(()=>{});},activeMs);
      if(!this.state.encryptedSession)throw new Error('페이스북 로그인을 다시 연결해 주세요.');
      const page=await browser.newPage();await page.setCookie(...await this.crypt(this.state.encryptedSession,true));await page.setViewport({width:1440,height:1000});
      while(job.index<job.ids.length&&!this.cancel&&Date.now()<deadline-25000){
        const target=this.state.targets.find(t=>t.id===job.ids[job.index]);if(!target){job.index++;continue;}
        job.target=target.name;this.save();await this.processTarget(page,target,job,deadline);job.index++;this.save();
      }
    }catch(e){
      if(this.cancel&&this.state.job!==job)return;
      if(/429|quota|time limit/i.test(String(e))){this.state.quota.used=BUDGET;job.dueAt=nextDay();this.event('무료 실행 한도에 도달해 남은 작업은 다음 날 이어갑니다.');}
      else throw e;
    }finally{if(timer)clearTimeout(timer);if(browser){try{await browser.close();closed=true;}catch{}}this.browser=null;this.settle(reservation,closed);job.running=false;}
    if(this.state.job!==job)return;
    if(job.index>=job.ids.length){this.event(`${job.ids.length}명 확인을 마쳤습니다.`);this.state.lastRunAt=Date.now();this.state.job=null;}
    else job.dueAt=Math.max(job.dueAt,Date.now()+25000);
  }
  ensure(job){if(this.cancel||this.state.job!==job)throw new Error('작업을 중단했습니다.');}
  async processTarget(page,target,job,deadline){
    this.ensure(job);const started=Date.now();await page.goto(target.url+'?locale=ko_KR',{waitUntil:'domcontentloaded',timeout:25000});await page.addScriptTag({content:browserScripts});
    const args={target:structuredClone(target),actor:this.state.settings};
    const scan=await page.evaluate(async args=>globalThis.NewPostsFacebook.scan(args),args);this.ensure(job);
    if(!scan.posts.length)throw new Error(`${target.name}: 게시물을 읽지 못했습니다. 페이스북 로그인이나 화면을 확인해 주세요.`);
    const first=!target.baselineAt,posts={};for(const p of scan.posts){const old=this.post(`${target.id}|${p.id}`);if(old)posts[old.key]=old;}
    const merged={posts};const totals=C.mergeScan(merged,target,scan.posts,started,Date.now());for(const p of Object.values(posts))this.putPost(p);this.event(`${target.name}: ${totals.seen}개 확인 · ${first?'첫 기준 저장':`새 글 ${totals.new||0}개`}`);this.save();
    let queue=[];
    if(job.mode==='latest'){
      const latest=C.latestPost(scan.posts);if(!latest){this.event(`${target.name}: 게시물 순서를 확정할 수 없어 좋아요를 누르지 않았습니다.`,'warning');return;}
      const p=posts[`${target.id}|${latest.id}`];
      if(latest.reaction==='reacted'){if(p.status!=='done')p.status='already';this.putPost(p);return;}
      if(!['done','already','skipped','attempting','uncertain'].includes(p.status)&&C.canReact(latest,target.baselineAt,'latest'))queue=[p];
    }else if(!first&&['auto','selected'].includes(job.mode))queue=Object.values(posts).filter(p=>p.status==='new'&&(job.mode!=='selected'||job.keys.includes(p.key)));
    for(const p of queue){
      if(job.used>=this.state.settings.maxPerRun||Date.now()>deadline-15000)break;this.ensure(job);
      p.status='attempting';p.attemptedAt=Date.now();this.putPost(p);job.used++;this.save();
      let r;try{r=await page.evaluate(async args=>globalThis.NewPostsFacebook.react(args),{...args,postId:p.id,intent:job.mode==='latest'?'latest':'new'});}catch{r={status:'uncertain',message:'클릭 후 결과를 확인할 수 없습니다.'};}
      p.status=['done','already','review'].includes(r.status)?r.status:'uncertain';p.note=p.status==='uncertain'?'반응 결과를 확인할 수 없어 다시 누르지 않습니다.':r.message||'반응 상태 확인 완료';p.completedAt=Date.now();this.putPost(p);this.event(`${target.name}: ${p.status==='done'?'좋아요 완료':p.note}`);
      if(p.status==='uncertain')throw new Error(`${target.name}: 결과 확인이 필요해 자동 실행을 중단했습니다.`);
    }
  }
}
