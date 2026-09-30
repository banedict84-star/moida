import accessHash from './access-key-hash.js';

const encoder = new TextEncoder();
const COOKIE = '__Host-helper-session';
const TTL = 30 * 86400000;
const headers = {'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
const json = (value,status=200,extra={}) => Response.json(value,{status,headers:{...headers,...extra}});
const hex = bytes => Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');
const sameOrigin = request => {
  const url = new URL(request.url);
  return url.protocol==='https:' && request.headers.get('Origin')===url.origin;
};
async function mac(payload,env){
  if(!/^[a-f0-9]{64}$/i.test(env.FB_SESSION_KEY||''))throw new Error('Server configuration incomplete');
  const key=await crypto.subtle.importKey('raw',encoder.encode(env.FB_SESSION_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
  return {key,bytes:encoder.encode('web-session\n'+payload)};
}
async function makeSession(env){
  const payload=`${Date.now()}.${crypto.randomUUID()}.${accessHash}`;
  const {key,bytes}=await mac(payload,env);
  return payload+'.'+hex(await crypto.subtle.sign('HMAC',key,bytes));
}
async function authorized(request,env){
  const cookie=(request.headers.get('Cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
  const match=cookie?.match(/^(\d{13})\.([a-f0-9-]{36})\.([a-f0-9]{64})\.([a-f0-9]{64})$/);
  if(!match||match[3]!==accessHash||Number(match[1])>Date.now()||Date.now()-Number(match[1])>TTL)return false;
  try {
    const payload=match.slice(1,4).join('.'),{key,bytes}=await mac(payload,env);
    return crypto.subtle.verify('HMAC',key,Uint8Array.from(match[4].match(/../g),s=>parseInt(s,16)),bytes);
  }catch{return false;}
}
export async function handleWebAccess(request,env){
  const path=new URL(request.url).pathname;
  if(!['/access/claim','/api/command'].includes(path))return null;
  if(request.method!=='POST')return json({ok:false,error:'지원하지 않는 요청입니다.'},405);
  if(!sameOrigin(request))return json({ok:false,error:'접근할 수 없습니다.'},403);
  if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))return json({ok:false,error:'요청 형식을 확인해 주세요.'},415);
  const body=await request.text();
  if(body.length>30000)return json({ok:false,error:'요청이 너무 큽니다.'},413);
  if(path==='/access/claim'){
    let token;try{token=JSON.parse(body).key;}catch{return json({ok:false,error:'전용 주소를 확인해 주세요.'},400);}
    if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token)||hex(await crypto.subtle.digest('SHA-256',encoder.encode(token)))!==accessHash)return json({ok:false,error:'전용 주소를 확인해 주세요.'},401);
    try {
      const session=await makeSession(env);
      return json({ok:true},200,{'Set-Cookie':`${COOKIE}=${session}; Path=/; Max-Age=${TTL/1000}; Secure; HttpOnly; SameSite=Strict`});
    }catch{return json({ok:false,error:'서버 연결을 준비하고 있습니다.'},503);}
  }
  if(!await authorized(request,env))return json({ok:false,error:'받으신 전용 주소로 다시 열어 주세요.'},401);
  try {JSON.parse(body);}catch{return json({ok:false,error:'요청 형식을 확인해 주세요.'},400);}
  const response=await env.HELPER.get(env.HELPER.idFromName('owner')).fetch(new Request('https://helper/command',{method:'POST',headers:{'x-helper-nonce':crypto.randomUUID()},body}));
  const result=new Response(response.body,response);
  Object.entries(headers).forEach(([k,v])=>result.headers.set(k,v));
  return result;
}
