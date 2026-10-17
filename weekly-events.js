const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
export function normalizeWeeklyConfig(input){
 const mailbox=String(input.mailbox||'').trim().toLowerCase();
 if(!/^[a-z0-9._-]+@naver\.com$/.test(mailbox))fail(400,'확인할 네이버 메일 주소를 입력해 주세요.');
 const senders=[...new Set((Array.isArray(input.senders)?input.senders:[]).map(s=>String(s).trim().toLowerCase()).filter(Boolean))];
 if(!senders.length||senders.length>20||senders.some(s=>!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(s)))fail(400,'허용할 발신자 이메일을 정확히 입력해 주세요.');
 const keywords=[...new Set((Array.isArray(input.keywords)?input.keywords:[]).map(s=>String(s).trim()).filter(Boolean))];
 if(keywords.length>20||keywords.some(k=>k.length>100))fail(400,'제목 조건이 너무 깁니다.');
 const projectName=String(input.projectName||'').trim();if(!projectName||projectName.length>150)fail(400,'플로우 프로젝트 이름을 입력해 주세요.');
 if(input.enabled===true)fail(409,'메일 연결과 프로젝트 검증이 완료되지 않아 자동 등록을 켤 수 없습니다.');
 return {mailbox,senders,keywords,projectName,match:'sender_and_optional_title',timezone:'Asia/Seoul',enabled:false};
}
export function matchesWeeklyMail(config,mail){
 const sender=String(mail.from||'').trim().toLowerCase();
 return config.senders.includes(sender)&&(!config.keywords.length||config.keywords.some(k=>String(mail.subject||'').toLocaleLowerCase().includes(k.toLocaleLowerCase())));
}
export async function weeklyEventsRoute({env,uid,request,body={}}){
 if(!uid)fail(401,'로그인이 필요합니다.');if(!env.AGENT_DB)fail(503,'직원 설정 저장소가 연결되지 않았습니다.');
 await env.AGENT_DB.prepare('CREATE TABLE IF NOT EXISTS weekly_events_config(uid TEXT PRIMARY KEY,config_json TEXT NOT NULL,updated_at INTEGER NOT NULL)').run();
 if(request.method==='POST'){
  const config=normalizeWeeklyConfig(body);
  await env.AGENT_DB.prepare('INSERT INTO weekly_events_config VALUES(?,?,?) ON CONFLICT(uid) DO UPDATE SET config_json=excluded.config_json,updated_at=excluded.updated_at').bind(uid,JSON.stringify(config),Date.now()).run();
 }else if(request.method!=='GET')fail(405,'지원하지 않는 요청입니다.');
 const row=await env.AGENT_DB.prepare('SELECT config_json,updated_at FROM weekly_events_config WHERE uid=?').bind(uid).first();
 return {ok:true,employee:'weekly_events',status:'setup_required',enabled:false,config:row?JSON.parse(row.config_json):null,updated_at:row?.updated_at||null,
  checks:[{id:'mail',ready:false,message:'네이버 메일 수신 연결이 아직 준비되지 않았습니다. 현재 메일을 읽고 있지 않습니다.'},{id:'flow',ready:false,message:'등록 프로젝트의 실제 ID와 쓰기 권한을 확인해야 합니다.'},{id:'attachments',ready:false,message:'실제 첨부파일 형식으로 날짜·시간 추출을 검증해야 합니다.'}],
  message:'담당 조건만 저장되었습니다. 메일 감시·일정 자동 등록은 아직 시작되지 않았습니다.'};
}
