import {telegramCrmMessage} from './crm-telegram.js';
// Telegram transport is independent of browser login. Never map Telegram IDs to Firebase IDs implicitly.
const HELP = 'CRM 연결 후: 홍길동 메모: 내용 — 사람별 메모 저장\n이름만 먼저 보내고 다음 메시지에 내용 입력도 가능합니다.\n/취소 — 메모 입력 취소\n모이다 AI비서실입니다.\n/메모 내용 — 업무 메모 저장\n/목록 — 내 의원실 메모 조회\n/도움말 — 사용 안내\n그 밖의 텍스트는 AI에게 질문합니다.\n현재 파일 분석·일정 연동·예약 보고는 지원하지 않습니다.';
const admins = env => new Set(String(env.TELEGRAM_ADMIN_IDS || '').split(',').map(x => x.trim()).filter(Boolean));
const statement = (env, sql, ...args) => env.AGENT_DB.prepare(sql).bind(...args);
const reply = (text, status = 200) => new Response(text, {status});

export function createTelegramBot({fetcher = fetch} = {}) {
 async function api(env, method, body) {
  const res = await fetcher(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
   method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body),
   signal:AbortSignal.timeout(15000), redirect:'manual'
  });
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error('telegram_delivery_failed');
  return data.result;
 }
 async function route(request, env, ctx) {
  if (request.method !== 'POST') return reply('Method not allowed',405);
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_WEBHOOK_SECRET || !env.AGENT_DB || !admins(env).size) return reply('Not configured',503);
  if (request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.TELEGRAM_WEBHOOK_SECRET) return reply('Unauthorized',401);
  if (Number(request.headers.get('Content-Length') || 0) > 65536) return reply('Too large',413);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > 65536) return reply('Too large',413);
  let update; try {update = JSON.parse(raw);} catch {return reply('Invalid JSON',400);}
  if (!Number.isSafeInteger(update.update_id)) return reply('Invalid update',400);
  const m = update.message;
  if (!m || m.chat?.type !== 'private' || !Number.isSafeInteger(m.from?.id) || m.from.is_bot || m.chat.id !== m.from.id) return reply('OK');
  const uid = String(m.from.id);
  // Persist before acknowledging Telegram. Cron recovers work even after an isolate restart.
  await statement(env, 'INSERT OR IGNORE INTO telegram_users(user_id) VALUES (?)',uid).run();
  await statement(env, `INSERT OR IGNORE INTO telegram_inbox(update_id,user_id,chat_id,text,created_at) VALUES (?,?,?,?,?)`,
   update.update_id,uid,String(m.chat.id),typeof m.text === 'string' ? m.text.slice(0,12000) : '/unsupported',Date.now()).run();
  // Durable event delivery starts work without waiting for the minute timer.
  // Queue consumers also allow AI work to outlive the webhook's short lifetime.
  let queued=false;
  if(env.AGENT_QUEUE){try{await env.AGENT_QUEUE.send({kind:'telegram-user',userId:uid});queued=true;}catch{}}
  if(!queued&&ctx?.waitUntil)ctx.waitUntil(tick(env,uid));
  return reply('OK');
 }
 async function answer(env, item) {
  const uid = item.user_id, text = item.text.trim(), admin = admins(env).has(uid);
  const user = await statement(env,'SELECT * FROM telegram_users WHERE user_id=?',uid).first();
  if (/^\/(start|id)(?:\s|$)/.test(text)) return `모이다 봇에 오신 것을 환영합니다.\n이용자 번호: ${uid}\n${admin ? '관리자입니다. /승인 이용자번호 의원실코드 로 승인하세요.\n/대기 — 미승인 목록\n/차단 이용자번호 — 이용 중지' : user?.approved ? HELP : '운영자에게 이 번호를 전달해 이용 승인을 받아 주세요.'}`;
  if (admin && text === '/대기') {
   const {results} = await statement(env,'SELECT user_id FROM telegram_users WHERE approved=0 ORDER BY user_id LIMIT 30').all();
   return results.map(x => x.user_id).join('\n') || '승인 대기자가 없습니다.';
  }
  if (admin && /^\/승인\s/.test(text)) {
   const match = text.match(/^\/승인\s+(\d+)\s+([A-Za-z0-9_-]{1,64})$/);
   if (!match) return '/승인 이용자번호 의원실코드 형식으로 입력하세요.';
   const existing = await statement(env,'SELECT * FROM telegram_users WHERE user_id=?',match[1]).first();
   if (!existing) return '이용자가 먼저 봇에서 시작을 눌러야 합니다.';
   if (existing.office_id && existing.office_id !== match[2]) return '기존 의원실 변경은 지원하지 않습니다. 운영자 설정을 확인하세요.';
   await statement(env,'UPDATE telegram_users SET approved=1,office_id=? WHERE user_id=?',match[2],match[1]).run();
   return `이용자 ${match[1]} 승인 완료. 의원실: ${match[2]}`;
  }
  if (admin && /^\/차단\s+\d+$/.test(text)) {
   await statement(env,'UPDATE telegram_users SET approved=0 WHERE user_id=?',text.split(/\s+/)[1]).run();
   return '이용 중지 처리했습니다.';
  }
  if (!user?.approved || !user.office_id) return `이용 승인이 필요합니다. 이용자 번호: ${uid}`;
  const crmReply=await telegramCrmMessage(env,item);if(crmReply!==null)return crmReply;
  if (text === '/도움말' || text === '/help') return HELP;
  if (!text || text === '/unsupported') return '첫 버전은 텍스트만 처리합니다. 요약할 내용을 텍스트로 보내 주세요.';
  if (/^\/메모\s/.test(text)) {
   const note = text.replace(/^\/메모\s+/, '').trim();
   if (!note) return '/메모 다음에 내용을 입력하세요.';
   await statement(env,'INSERT OR IGNORE INTO telegram_notes(update_id,office_id,user_id,text,created_at) VALUES (?,?,?,?,?)',item.update_id,user.office_id,uid,note,item.created_at).run();
   return '의원실 업무 메모에 저장했습니다.';
  }
  if (text === '/목록') {
   const {results} = await statement(env,'SELECT text FROM telegram_notes WHERE office_id=? ORDER BY created_at DESC,update_id DESC LIMIT 10',user.office_id).all();
   return results.map((x,i) => `${i+1}. ${x.text.slice(0,300)}`).join('\n') || '저장된 메모가 없습니다.';
  }
  if (text.startsWith('/')) return HELP;
  if (!env.OPENAI_API_KEY) return 'AI 연결 설정이 필요합니다. 메모 저장과 조회는 이용할 수 있습니다.';
  const count = await statement(env,'SELECT COUNT(*) AS n FROM telegram_inbox WHERE user_id=? AND created_at>?',uid,Date.now()-3600000).first();
  if (count.n > 30) return '시간당 요청 한도에 도달했습니다. 잠시 후 다시 이용해 주세요.';
  const res = await fetcher(`${String(env.OPENAI_BASE || 'https://api.openai.com/v1').replace(/\/$/,'')}/responses`, {
   method:'POST', headers:{Authorization:`Bearer ${env.OPENAI_API_KEY}`,'Content-Type':'application/json'},
   body:JSON.stringify({model:env.TELEGRAM_MODEL || env.AGENT_MODEL || 'gpt-4o-mini',store:false,max_output_tokens:1000,
    instructions:'당신은 모이다 AI비서실입니다. 한국어로 간결하게 답하세요. 현재 입력 텍스트의 요약과 초안 작성을 돕습니다. 외부 자료 검색, 일정 조회·등록, 파일 처리, 업무 실행 권한은 없습니다. 실행했다고 주장하지 마세요. 이전 대화는 제공되지 않습니다. 최신 사실은 확인이 필요하다고 밝히세요.',input:text}),
   signal:AbortSignal.timeout(45000),redirect:'manual'
  });
  if (!res.ok) throw new Error('ai_request_failed');
  const data = await res.json();
  return data.output?.flatMap(x => x.content || []).filter(x => x.type === 'output_text').map(x => x.text).join('\n') || '답변을 생성하지 못했습니다. 다시 요청해 주세요.';
 }
 async function tick(env,userId=null) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_WEBHOOK_SECRET || !env.AGENT_DB || !admins(env).size) return;
  for(let step=0;step<5;step++){
   const now=Date.now();
   // Serialize each person's conversation so a name is handled before its memo.
   const older="NOT EXISTS (SELECT 1 FROM telegram_inbox earlier WHERE earlier.user_id=telegram_inbox.user_id AND earlier.state='pending' AND earlier.attempts<4 AND earlier.update_id<telegram_inbox.update_id)";
   const item=await statement(env,`SELECT * FROM telegram_inbox WHERE state='pending' AND lease_until<? AND attempts<4 AND ${older} ${userId?'AND user_id=?':''} ORDER BY update_id LIMIT 1`,...([now,...(userId?[userId]:[])])).first();
   if(!item)break;
   const claim=await statement(env,`UPDATE telegram_inbox SET lease_until=?,attempts=attempts+1 WHERE update_id=? AND state='pending' AND lease_until<? AND ${older}`,Date.now()+300000,item.update_id,now).run();
   if (!claim.meta.changes) continue;
   try {
    // Recheck authorization even for cached replies: revocation must stop pending data delivery.
    const current = await statement(env,'SELECT approved FROM telegram_users WHERE user_id=?',item.user_id).first();
    const content = item.reply && (current?.approved || admins(env).has(item.user_id)) ? item.reply : await answer(env,item);
    const text = content.slice(0,3900);
    await statement(env,'UPDATE telegram_inbox SET reply=? WHERE update_id=?',text,item.update_id).run();
    await api(env,'sendMessage',{chat_id:item.chat_id,text});
    await statement(env,"UPDATE telegram_inbox SET state='done',text='',reply=NULL,lease_until=0 WHERE update_id=?",item.update_id).run();
   } catch {
    // Do not log request contents, bot token, or provider errors containing URLs.
    await statement(env,"UPDATE telegram_inbox SET state=?,lease_until=? WHERE update_id=?",item.attempts+1>=4?'failed':'pending',Date.now()+60000,item.update_id).run();
   }
  }
  await statement(env,"UPDATE telegram_inbox SET text='',reply=NULL WHERE created_at<? AND state='failed'",Date.now()-86400000).run();
  // Keep processed update IDs for duplicate suppression, but retain no message content.
 }
 return {route,tick};
}
