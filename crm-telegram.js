const q=(env,sql,...args)=>env.AGENT_DB.prepare(sql).bind(...args);
const schemas=[
 'CREATE TABLE IF NOT EXISTS crm_tg_index(uid TEXT PRIMARY KEY, contacts TEXT NOT NULL, updated INTEGER NOT NULL)',
 'CREATE TABLE IF NOT EXISTS crm_tg_codes(hash TEXT PRIMARY KEY,uid TEXT NOT NULL,expires INTEGER NOT NULL)',
 'CREATE TABLE IF NOT EXISTS crm_tg_links(user_id TEXT PRIMARY KEY,uid TEXT NOT NULL)',
 'CREATE TABLE IF NOT EXISTS crm_tg_pending(user_id TEXT PRIMARY KEY,uid TEXT NOT NULL,payload TEXT NOT NULL,expires INTEGER NOT NULL)',
 'CREATE TABLE IF NOT EXISTS crm_tg_notes(update_id INTEGER PRIMARY KEY,uid TEXT NOT NULL,contact_id TEXT NOT NULL,text TEXT NOT NULL,created INTEGER NOT NULL)',
 'CREATE INDEX IF NOT EXISTS crm_tg_contact_notes ON crm_tg_notes(uid,contact_id,update_id)'
];
async function ensure(env){for(const sql of schemas)await q(env,sql).run();}
async function digest(s){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function crmTelegramRoute({env,uid,request}){
 await ensure(env);const path=new URL(request.url).pathname;
 if(request.method==='GET'){
  if(path==='/crm-telegram/status'){const r=await q(env,'SELECT user_id FROM crm_tg_links WHERE uid=?',uid).first();const idx=await q(env,'SELECT updated FROM crm_tg_index WHERE uid=?',uid).first();return {connected:!!r,updated:idx?.updated||0};}
  if(path==='/crm-telegram/notes'){const id=new URL(request.url).searchParams.get('id');const before=Number(new URL(request.url).searchParams.get('before'))||Number.MAX_SAFE_INTEGER;const r=await q(env,'SELECT update_id AS id,text,created FROM crm_tg_notes WHERE uid=? AND contact_id=? AND update_id<? ORDER BY update_id DESC LIMIT 100',uid,id||'',before).all();return {notes:r.results};}
 }
 if(request.method!=='POST')throw Error('지원하지 않는 요청입니다.');
 const raw=await request.text();if(raw.length>3000000)throw Error('목록이 너무 큽니다.');const body=JSON.parse(raw||'{}');
 if(path==='/crm-telegram/index'){
  if(!Array.isArray(body.contacts)||body.contacts.length>20000)throw Error('연락처 목록은 최대 20,000명입니다.');
  const seen=new Set();const contacts=body.contacts.map(c=>{const id=String(c.id||''),name=String(c.name||'').trim();if(!id||id.length>150||!name||name.length>100||seen.has(id))throw Error('연락처 ID와 이름을 확인해 주세요.');seen.add(id);const phone=String(c.phone||'').trim();if(phone.length>40)throw Error('연락처 길이를 확인해 주세요.');return {id,name,phone,last4:phone.replace(/\D/g,'').slice(-4)};});
  await q(env,'INSERT INTO crm_tg_index VALUES (?,?,?) ON CONFLICT(uid) DO UPDATE SET contacts=excluded.contacts,updated=excluded.updated',uid,JSON.stringify(contacts),Date.now()).run();return {ok:true,count:contacts.length};
 }
 if(path==='/crm-telegram/code'){
  const code=crypto.randomUUID().replace(/-/g,'').slice(0,16).toUpperCase();await q(env,'DELETE FROM crm_tg_codes WHERE uid=? OR expires<?',uid,Date.now()).run();await q(env,'INSERT INTO crm_tg_codes VALUES (?,?,?)',await digest(code),uid,Date.now()+600000).run();return {code,expiresIn:600};
 }
 if(path==='/crm-telegram/disconnect'){
  await q(env,'DELETE FROM crm_tg_links WHERE uid=?',uid).run();await q(env,'DELETE FROM crm_tg_codes WHERE uid=?',uid).run();await q(env,'DELETE FROM crm_tg_pending WHERE uid=?',uid).run();return {ok:true};
 }
 throw Error('지원하지 않는 요청입니다.');
}
export async function telegramCrmMessage(env,item){
 await ensure(env);const text=item.text.trim(),user=item.user_id;
 if(/^\/CRM\s+/i.test(text)){
  const hash=await digest(text.replace(/^\/CRM\s+/i,'').trim().toUpperCase());
  const code=await q(env,'DELETE FROM crm_tg_codes WHERE hash=? AND expires>? RETURNING uid',hash,Date.now()).first();
  if(!code)return '연결 코드가 만료되었거나 올바르지 않습니다. CRM 담당자 보기에서 다시 발급해 주세요.';
  await q(env,'DELETE FROM crm_tg_pending WHERE user_id=?',user).run();
  await q(env,'INSERT INTO crm_tg_links VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET uid=excluded.uid',user,code.uid).run();
  return 'CRM 연결 완료. “홍길동 메모: 다음 주 연락하기” 또는 이름을 먼저 보내고 다음 메시지에 내용을 적어 주세요. /취소로 입력을 취소할 수 있습니다.';
 }
 const isMemo=/^(?:\/메모\s+)?[^\n]{1,100}?\s+메모(?:\s|[:：]|$)/.test(text);
 const lookup=isMemo?null:(text.match(/^\/(?:조회|검색)\s+(.+)$/)||text.match(/^(?:CRM(?:에서)?\s*)?(.+?)\s*(?:님(?:의)?\s*)?(?:연락처|전화번호|휴대폰|휴대전화)(?:\s*(?:좀\s*)?(?:조회(?:해\s*줘|해\s*주세요)?|검색(?:해\s*줘|해\s*주세요)?|알려\s*줘|알려주세요|보여\s*줘|보여주세요|찾아\s*줘))?[?.!]*$/i)||text.match(/^(?:CRM(?:에서)?\s*)?(?:연락처|전화번호)\s+(?:조회\s+)?(.+?)$/i)||text.match(/^CRM\s+(.+?)\s+(?:조회|검색|찾아\s*줘)[?.!]*$/i));
 const query=lookup?.[1]?.trim().replace(/님의?$/,'').trim();
 const link=await q(env,'SELECT uid FROM crm_tg_links WHERE user_id=?',user).first();
 if(!link)return lookup||/메모[:：]|^\/CRM|^\/선택|^\/취소/.test(text)?'CRM 담당자 보기에서 연결 코드를 발급받아 /CRM 코드 를 보내 주세요.':null;
 const uid=link.uid;
 const saved=await q(env,'SELECT contact_id FROM crm_tg_notes WHERE update_id=? AND uid=?',item.update_id,uid).first();
 if(saved)return 'CRM 메모에 저장했습니다.';
 const index=await q(env,'SELECT contacts,updated FROM crm_tg_index WHERE uid=?',uid).first();const contacts=JSON.parse(index?.contacts||'[]');
 const pending=await q(env,'SELECT payload FROM crm_tg_pending WHERE user_id=? AND uid=? AND expires>?',user,uid,Date.now()).first();
 if(text==='/취소'){await q(env,'DELETE FROM crm_tg_pending WHERE user_id=?',user).run();return '메모 입력을 취소했습니다.';}
 async function remember(data){await q(env,'INSERT INTO crm_tg_pending VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET uid=excluded.uid,payload=excluded.payload,expires=excluded.expires',user,uid,JSON.stringify(data),Date.now()+600000).run();}
 async function save(c,note){
  if(!note.trim())return '저장할 메모 내용을 입력해 주세요.';
  if(note.length>4000)return '메모는 4,000자 이내로 입력해 주세요.';
  await q(env,'INSERT OR IGNORE INTO crm_tg_notes VALUES (?,?,?,?,?)',item.update_id,uid,c.id,note.trim(),item.created_at).run();
  await q(env,'DELETE FROM crm_tg_pending WHERE user_id=?',user).run();
  return `${c.name}님의 CRM 메모에 저장했습니다.\n${note.trim().slice(0,300)}`;
 }
 async function showContact(c){
  await q(env,'DELETE FROM crm_tg_pending WHERE user_id=?',user).run();
  const phone=c.phone&&c.phone.replace(/\D/g,'').length>=7?c.phone:'번호가 아직 동기화되지 않았습니다. CRM 담당자 보기 → 연락처 목록 갱신을 눌러 주세요.';
  return `${c.name}\n연락처: ${phone}\nCRM 동기화: ${new Date(index.updated).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}`;
 }
 if(lookup){
  if(!query)return '이름을 함께 입력해 주세요. 예: /조회 홍길동';
  await q(env,'DELETE FROM crm_tg_pending WHERE user_id=?',user).run();
  let found=contacts.filter(c=>c.name===query);if(!found.length)found=contacts.filter(c=>c.name.includes(query));
  if(!found.length)return `CRM에서 “${query}”을 찾지 못했습니다. CRM 담당자 보기에서 연락처 목록을 갱신해 주세요.`;
  if(found.length>10)return '검색 결과가 10명보다 많습니다. 이름을 더 자세히 입력해 주세요.';
  if(found.length===1)return showContact(found[0]);
  await remember({mode:'lookup',candidates:found.map(c=>c.id)});
  return '조회할 사람의 번호를 보내 주세요. (10분 이내, 취소: /취소)\n'+found.map((c,i)=>`${i+1}. ${c.name} · 연락처 끝 ${c.last4||'정보 없음'} · ID ${c.id.slice(-6)}`).join('\n');
 }
 if(/^(?:CRM|연락처|전화번호)(?:\s*(?:조회|검색))?[?.!]*$/i.test(text)||/^\/(조회|검색)$/.test(text))return '이름을 함께 입력해 주세요. 예: “홍길동 연락처 알려줘” 또는 “/조회 홍길동”';
 if(!isMemo&&/(연락처|전화번호)/.test(text)&&/(알려|조회|검색|보여|찾아)/.test(text))return '이름과 조회 요청을 함께 입력해 주세요. 예: “홍길동 연락처 알려줘” 또는 “/조회 홍길동”. 메모로 저장하지 않았습니다.';
 if(pending&&!/^\/(?!선택\s)/.test(text)){
  const p=JSON.parse(pending.payload);
  if(p.candidates){
   const n=text.match(/^(?:\/선택\s+)?([1-9]\d*)$/);if(!n)return '대상 번호를 보내 주세요. 취소하려면 /취소';
   const c=contacts.find(c=>c.id===p.candidates[Number(n[1])-1]);if(!c)return '목록에 있는 번호를 선택해 주세요.';
   if(p.mode==='lookup')return showContact(c);
   if(p.note)return save(c,p.note);await remember({contact:c.id});return `${c.name}님에게 남길 메모 내용을 보내 주세요. (10분 이내, 취소: /취소)`;
  }
  const c=contacts.find(c=>c.id===p.contact);if(!c){await q(env,'DELETE FROM crm_tg_pending WHERE user_id=?',user).run();return '대상 연락처가 변경되었습니다. 이름부터 다시 입력해 주세요.';}return save(c,text);
 }
 let name='',note='';const explicit=text.match(/^(?:\/메모\s+)?(.{1,100}?)\s+메모\s*[:：]?\s*([\s\S]*)$/);
 if(explicit){name=explicit[1].trim();note=explicit[2].trim();}
 else{
  const c=[...contacts].sort((a,b)=>b.name.length-a.name.length).find(c=>text===c.name||text.startsWith(c.name+' ')||text.startsWith(c.name+':'));
  if(!c)return text.startsWith('/선택')?'선택 대기가 만료되었습니다. 이름부터 다시 입력해 주세요.':null;
  name=c.name;note=text.slice(name.length).replace(/^\s*[:：]?\s*/,'');
 }
 const matches=contacts.filter(c=>c.name===name);
 if(!matches.length)return `CRM에서 “${name}”을 찾지 못했습니다. CRM 화면에서 목록을 갱신한 뒤 다시 입력해 주세요. 저장하지 않았습니다.`;
 if(matches.length>10)return '동명이인이 10명보다 많습니다. CRM에서 대상을 확인해 주세요. 저장하지 않았습니다.';
 if(matches.length>1){await remember({candidates:matches.map(c=>c.id),note});return '동명이인이 있습니다. 저장할 대상 번호를 보내 주세요. (10분 이내)\n'+matches.map((c,i)=>`${i+1}. ${c.name} · 연락처 끝 ${c.last4||'정보 없음'} · ID ${c.id.slice(-6)}`).join('\n');}
 if(!note){await remember({contact:matches[0].id});return `${name}님에게 남길 메모 내용을 보내 주세요. (10분 이내, 취소: /취소)`;}
 return save(matches[0],note);
}
