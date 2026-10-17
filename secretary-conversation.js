// A visible conversation may have several independent, durable executions.
export const CONVERSATION_SCHEMA=[
 `CREATE TABLE IF NOT EXISTS secretary_conversations(tenant_id TEXT NOT NULL,conversation_id TEXT NOT NULL,execution_thread TEXT NOT NULL,request_id TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(tenant_id,execution_thread),UNIQUE(tenant_id,conversation_id,request_id))`,
 `CREATE TABLE IF NOT EXISTS secretary_previews(tenant_id TEXT NOT NULL,thread_id TEXT NOT NULL,request_id TEXT NOT NULL,text TEXT NOT NULL,PRIMARY KEY(tenant_id,thread_id,request_id))`
];
const q=(env,sql,args=[])=>env.AGENT_DB.prepare(sql).bind(...args);
export async function linkConversation(env,uid,conversation,execution,request){
 const existing=await q(env,'SELECT * FROM secretary_conversations WHERE tenant_id=? AND execution_thread=?',[uid,execution]).first();
 if(existing&&(existing.conversation_id!==conversation||existing.request_id!==request))throw Object.assign(Error('업무의 대화 연결을 변경할 수 없습니다.'),{status:409});
 await q(env,'INSERT OR IGNORE INTO secretary_conversations VALUES(?,?,?,?,?)',[uid,conversation,execution,request,Date.now()]).run();
 const actual=await q(env,'SELECT execution_thread FROM secretary_conversations WHERE tenant_id=? AND conversation_id=? AND request_id=?',[uid,conversation,request]).first();
 if(actual.execution_thread!==execution)throw Object.assign(Error('같은 요청은 기존 업무에서 확인해 주세요.'),{status:409});
 const rows=(await q(env,`SELECT t.input_json,t.output_text,t.status FROM secretary_turns t WHERE t.tenant_id=? AND t.thread_id!=? AND
 (t.thread_id=? OR t.thread_id IN(SELECT execution_thread FROM secretary_conversations WHERE tenant_id=? AND conversation_id=?)) ORDER BY t.created_at DESC LIMIT 8`,[uid,execution,conversation,uid,conversation]).all()).results;
 return rows.reverse().map(r=>{
  let input;try{input=JSON.parse(r.input_json);if(Array.isArray(input))input=input.flatMap(m=>(m.content||[]).filter(p=>p.type==='input_text').map(p=>p.text)).join('\n');}catch{input='';}
  return {user:String(input||'').slice(0,2000),status:r.status,answer:String(r.output_text||'').slice(0,3000)};
 });
}
export async function savePreview(env,uid,thread,id,text){
 if(!text)return;
 await q(env,'INSERT INTO secretary_previews VALUES(?,?,?,?) ON CONFLICT(tenant_id,thread_id,request_id) DO UPDATE SET text=excluded.text',[uid,thread,id,text.slice(0,60000)]).run();
}
export async function readPreview(env,uid,thread,id){
 return (await q(env,'SELECT text FROM secretary_previews WHERE tenant_id=? AND thread_id=? AND request_id=?',[uid,thread,id]).first())?.text||'';
}
