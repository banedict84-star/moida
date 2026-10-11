const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const hash=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),x=>x.toString(16).padStart(2,'0')).join('');
export function locationPayload(value,now=Date.now()){
 if(value?._type!=='location')return null;
 if(!Number.isFinite(value.lat)||value.lat < -90||value.lat > 90||!Number.isFinite(value.lon)||value.lon < -180||value.lon > 180||!Number.isInteger(value.tst)||value.tst<=0||value.tst*1000>now+300000)fail(400,'위치 형식이 올바르지 않습니다.');
 return {lat:value.lat,lon:value.lon,tst:value.tst,accuracy:Number.isFinite(value.acc)&&value.acc>=0?value.acc:null};
}
export function createOfficeLocation(){
 const schemas=new WeakMap();
 const q=(env,sql,args=[])=>env.AGENT_DB.prepare(sql).bind(...args);
 async function schema(env){if(!env.AGENT_DB)fail(503,'위치 저장소가 준비되지 않았습니다.');if(!schemas.has(env.AGENT_DB)){const p=env.AGENT_DB.prepare('CREATE TABLE IF NOT EXISTS office_location_devices (id TEXT PRIMARY KEY, uid TEXT NOT NULL, label TEXT NOT NULL, secret_hash TEXT NOT NULL, created_at INTEGER NOT NULL, location_json TEXT, received_at INTEGER)').run();schemas.set(env.AGENT_DB,p);p.catch(()=>schemas.delete(env.AGENT_DB));}await schemas.get(env.AGENT_DB);}
 async function receive({env,request}){
  await schema(env);
  const match=/^Basic ([A-Za-z0-9+/=]+)$/i.exec(request.headers.get('Authorization')||'');if(!match)fail(401,'앱 연결 정보를 확인해 주세요.');
  let credentials;try{credentials=atob(match[1]);}catch{fail(401,'앱 연결 정보를 확인해 주세요.');}
  const split=credentials.indexOf(':'),id=credentials.slice(0,split),password=credentials.slice(split+1);
  if(split<1||!/^loc_[a-f0-9]{32}$/.test(id)||!password)fail(401,'앱 연결 정보를 확인해 주세요.');
  const device=await q(env,'SELECT secret_hash FROM office_location_devices WHERE id=?',[id]).first();
  if(!device||device.secret_hash!==await hash(password))fail(401,'연결이 해제되었거나 연결 정보가 다릅니다.');
  if(Number(request.headers.get('Content-Length'))>4096)fail(413,'위치 요청이 너무 큽니다.');
  const reader=request.body?.getReader();let length=0,chunks=[];if(reader){while(true){const{done,value}=await reader.read();if(done)break;length+=value.length;if(length>4096){await reader.cancel();fail(413,'위치 요청이 너무 큽니다.');}chunks.push(value);}}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  if(!length)return [];
  let body;try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{fail(400,'위치 요청을 읽지 못했습니다.');}
  const location=locationPayload(body);
  // Queued older fixes must never replace a more recent position. Store only the latest fix.
  if(location)await q(env,"UPDATE office_location_devices SET location_json=?,received_at=? WHERE id=? AND (location_json IS NULL OR json_extract(location_json,'$.tst') < ?)",[JSON.stringify(location),Date.now(),id,location.tst]).run();
  return [];
 }
 async function route({env,uid,request,body={}}){
  if(!uid)fail(401,'로그인이 필요합니다.');await schema(env);const path=new URL(request.url).pathname;
  if(path==='/office-location/devices'&&request.method==='GET'){
   const rows=(await q(env,'SELECT id,label,created_at,location_json,received_at FROM office_location_devices WHERE uid=? ORDER BY created_at',[uid]).all()).results||[];
   return {ok:true,devices:rows.map(r=>({id:r.id,label:r.label,createdAt:r.created_at,location:r.location_json?JSON.parse(r.location_json):null,receivedAt:r.received_at}))};
  }
  if(path==='/office-location/devices'&&request.method==='POST'){
   const label=String(body.label||'').trim();if(!label||label.length>40)fail(400,'휴대폰 이름을 40자 이내로 입력해 주세요.');
   const count=await q(env,'SELECT COUNT(*) AS count FROM office_location_devices WHERE uid=?',[uid]).first();if(count.count>=10)fail(409,'최대 10대까지 연결할 수 있습니다.');
   const id='loc_'+crypto.randomUUID().replace(/-/g,''),password=crypto.randomUUID().replace(/-/g,'')+crypto.randomUUID().replace(/-/g,'');
   await q(env,'INSERT INTO office_location_devices (id,uid,label,secret_hash,created_at) VALUES (?,?,?,?,?)',[id,uid,label,await hash(password),Date.now()]).run();
   return {ok:true,id,label,username:id,password,url:new URL('/owntracks/pub',request.url).href};
  }
  if(path==='/office-location/disconnect'&&request.method==='POST'){
   await q(env,'DELETE FROM office_location_devices WHERE id=? AND uid=?',[String(body.id||''),uid]).run();return {ok:true};
  }
  fail(405,'지원하지 않는 위치 요청입니다.');
 }
 return {route,receive};
}
