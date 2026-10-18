// Fixed-host, TLS-only IMAP connection. No mail changes or outgoing mail.
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
const quote=value=>'"'+value.replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"';
export function validateNaverCredentials(body){
 const mailbox=String(body.mailbox||'').trim().toLowerCase();
 const password=String(body.password||'');
 if(!/^[a-z0-9._-]+@naver\.com$/.test(mailbox))fail(400,'네이버 메일 주소를 확인해 주세요.');
 if(!/^[\x21-\x7e]{8,128}$/.test(password))fail(400,'네이버 애플리케이션 비밀번호를 입력해 주세요.');
 return {mailbox,password};
}
export async function probeNaver({mailbox,password,connect,timeoutMs=15000,networkOnly=false}){
 let socket,timer,stage='network';
 const work=async()=>{
  socket=connect({hostname:'imap.naver.com',port:993},{secureTransport:'on'});
  socket.closed.catch(()=>{});
  await socket.opened;
  stage='greeting';
  const reader=socket.readable.getReader(),writer=socket.writable.getWriter();
  const decoder=new TextDecoder();let buffer='',total=0;
  async function line(){
   while(!buffer.includes('\r\n')){const {value,done}=await reader.read();if(done)throw Error('closed');total+=value.length;if(total>65536)throw Error('limit');buffer+=decoder.decode(value,{stream:true});}
   const end=buffer.indexOf('\r\n'),result=buffer.slice(0,end);buffer=buffer.slice(end+2);return result;
  }
  async function command(tag,text){
   await writer.write(new TextEncoder().encode(tag+' '+text+'\r\n'));
   const lines=[];while(true){const next=await line();if(next.startsWith(tag+' ')){if(!next.startsWith(tag+' OK'))throw Error('rejected');return lines;}if(next.startsWith('* BYE'))throw Error('closed');lines.push(next);}
  }
  if(!/^\* OK\b/.test(await line()))throw Error('greeting');
  if(networkOnly)return {ok:true,reachable:true,message:'모이다 서버에서 네이버 IMAP 서버까지 TLS 접속이 정상입니다. 계정 인증은 별도로 확인해야 합니다.'};
  stage='login';
  await command('A1','LOGIN '+quote(mailbox.split('@')[0])+' '+quote(password));
  stage='inbox';
  const lines=await command('A2','EXAMINE INBOX');
  const exists=lines.find(l=>/^\* \d+ EXISTS$/.test(l));
  return {inboxCount:exists?Number(exists.split(' ')[1]):null};
 };
 try{return await Promise.race([work(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),timeoutMs);})]);}
 catch(e){
  const label={network:'서버 접속',greeting:'서버 응답',login:'계정 인증',inbox:'받은메일함 읽기'}[stage];
  const reason=e.message==='timeout'?'시간 초과':e.message==='rejected'?'네이버 서버가 요청을 거절함':'연결 종료 또는 통신 오류';
  const guide=stage==='login'?'IMAP 사용 설정과 네이버 앱 비밀번호, 계정 보안 알림을 확인해 주세요.':stage==='inbox'?'로그인은 성공했지만 메일함을 읽지 못했습니다.':'모이다 서버와 네이버 사이의 접속 문제입니다. 비밀번호 오류로 확인된 것은 아닙니다.';
  fail(502,`[NAVER_${stage.toUpperCase()}] ${label} 실패: ${reason}. ${guide}`);
 }
 finally{clearTimeout(timer);if(socket)await socket.close().catch(()=>{});}
}
async function schema(env){
 if(!env.AGENT_DB)fail(503,'메일 연결 저장소가 준비되지 않았습니다.');
 await env.AGENT_DB.prepare('CREATE TABLE IF NOT EXISTS naver_mail_connections(uid TEXT PRIMARY KEY,mailbox TEXT NOT NULL,cipher TEXT NOT NULL,iv TEXT NOT NULL,verified_at INTEGER NOT NULL,inbox_count INTEGER)').run();
}
export async function naverMailStatus(env,uid){
 await schema(env);
 const row=await env.AGENT_DB.prepare('SELECT mailbox,verified_at,inbox_count FROM naver_mail_connections WHERE uid=?').bind(uid).first();
 return {ok:true,connected:!!row,mailbox:row?.mailbox||null,verifiedAt:row?.verified_at||null,inboxCount:row?.inbox_count??null,automatic:false};
}
export function createNaverMail({connect,encrypt,decrypt}){
 return async function route({env,uid,request,body={}}){
  if(!uid)fail(401,'로그인이 필요합니다.');await schema(env);
  if(request.method==='GET')return naverMailStatus(env,uid);
  if(request.method!=='POST')fail(405,'지원하지 않는 요청입니다.');
  if(body.action==='diagnose')return probeNaver({connect,networkOnly:true});
  if(body.action==='disconnect'){
   await env.AGENT_DB.prepare('DELETE FROM naver_mail_connections WHERE uid=?').bind(uid).run();
   return {ok:true,connected:false,automatic:false,message:'네이버 연결 정보를 삭제했습니다.'};
  }
  let credentials;
  if(body.action==='test'){
   const row=await env.AGENT_DB.prepare('SELECT * FROM naver_mail_connections WHERE uid=?').bind(uid).first();
   if(!row)fail(409,'네이버 메일을 먼저 연결해 주세요.');
   const stored=JSON.parse(await decrypt(env,row.cipher,row.iv));
   if(stored.uid!==uid||stored.mailbox!==row.mailbox)fail(409,'연결 정보를 다시 등록해 주세요.');
   credentials=validateNaverCredentials(stored);
  }else if(body.action==='connect'){credentials=validateNaverCredentials(body);}
  else fail(400,'지원하지 않는 연결 요청입니다.');
  // Encrypt before network access, so missing encryption configuration fails closed.
  const encrypted=await encrypt(env,JSON.stringify({uid,...credentials}));
  const result=await probeNaver({...credentials,connect});
  const verifiedAt=Date.now();
  await env.AGENT_DB.prepare('INSERT INTO naver_mail_connections VALUES(?,?,?,?,?,?) ON CONFLICT(uid) DO UPDATE SET mailbox=excluded.mailbox,cipher=excluded.cipher,iv=excluded.iv,verified_at=excluded.verified_at,inbox_count=excluded.inbox_count').bind(uid,credentials.mailbox,encrypted.cipher,encrypted.iv,verifiedAt,result.inboxCount).run();
  return {ok:true,connected:true,mailbox:credentials.mailbox,verifiedAt,...result,automatic:false,message:'네이버 인증과 받은메일함 읽기 검사를 완료했습니다. 자동 전달·일정 등록은 아직 시작되지 않았습니다.'};
 };
}
