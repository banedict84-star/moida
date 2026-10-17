// Durable scheduling only. Provider and tool permissions remain in secretary-agent.
export const RUNTIME_SCHEMA = [
 `CREATE TABLE IF NOT EXISTS secretary_runtime (
 tenant_id TEXT NOT NULL, thread_id TEXT NOT NULL, request_id TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'running', next_at INTEGER NOT NULL DEFAULT 0,
 lease TEXT, lease_until INTEGER NOT NULL DEFAULT 0, steps INTEGER NOT NULL DEFAULT 0,
 failures INTEGER NOT NULL DEFAULT 0, error TEXT, updated_at INTEGER NOT NULL,
 PRIMARY KEY(tenant_id,thread_id,request_id))`,
 `CREATE INDEX IF NOT EXISTS secretary_runtime_due ON secretary_runtime(status,next_at,lease_until)`
];
const q=(env,sql,args=[])=>env.AGENT_DB.prepare(sql).bind(...args);
export async function registerRuntime(env,uid,thread,id){
 await q(env,'INSERT OR IGNORE INTO secretary_runtime(tenant_id,thread_id,request_id,updated_at) VALUES(?,?,?,?)',[uid,thread,id,Date.now()]).run();
}
export async function runtimeRow(env,uid,thread,id){
 return q(env,'SELECT * FROM secretary_runtime WHERE tenant_id=? AND thread_id=? AND request_id=?',[uid,thread,id]).first();
}
export async function runtimeHistory(env,uid,thread){
 const items=(await q(env,`SELECT r.thread_id AS execution_thread,r.request_id,r.status AS runtime_status,r.error AS runtime_error,t.status,t.output_text,t.error
 FROM secretary_runtime r JOIN secretary_turns t USING(tenant_id,thread_id,request_id)
 WHERE r.tenant_id=? AND (r.thread_id=? OR r.thread_id IN(SELECT execution_thread FROM secretary_conversations WHERE tenant_id=? AND conversation_id=?)) ORDER BY t.created_at DESC LIMIT 50`,[uid,thread,uid,thread]).all()).results;
 for(const item of items){
  const rows=(await q(env,`SELECT name,result_json FROM secretary_calls WHERE tenant_id=? AND thread_id=? AND request_id=? AND result_json IS NOT NULL LIMIT 100`,[uid,item.execution_thread,item.request_id]).all()).results;
  item.results=rows.flatMap(row=>{try{
   const r=JSON.parse(row.result_json);
   const candidates=[{name:row.name,result:r},...(Array.isArray(r.artifacts)?r.artifacts:[])];
   return candidates.filter(a=>a.result&&(a.result.saved||a.result.job_id||a.result.files)).map(a=>({name:a.name,result:Object.fromEntries(['ok','saved','id','file_id','title','format','category','job_id','status','files'].filter(k=>a.result[k]!==undefined).map(k=>[k,a.result[k]]))}));
  }catch{return [];}});
 }
 return {ok:true,items};
}
export async function runRuntimeBatch(env,advance,{now=Date.now(),limit=10,uid,thread}={}){
 const filter=uid&&thread?' AND tenant_id=? AND thread_id=?':'';
 const rows=(await q(env,`SELECT * FROM secretary_runtime WHERE status='running' AND next_at<=? AND lease_until<=?${filter} ORDER BY next_at,updated_at LIMIT ?`,[now,now,...(filter?[uid,thread]:[]),limit]).all()).results;
 const outcomes=[];
 for(const row of rows){
  const keys=[row.tenant_id,row.thread_id,row.request_id],lease=crypto.randomUUID();
  const claim=await q(env,`UPDATE secretary_runtime SET lease=?,lease_until=? WHERE tenant_id=? AND thread_id=? AND request_id=? AND status='running' AND lease_until<=?`,[lease,now+300000,...keys,now]).run();
  if(claim.meta.changes!==1)continue;
  let status='running',error=null,failures=0;
  try{
   if(row.steps>=240){status='needs_attention';error='서버 실행 한도에 도달했습니다. 업무를 확인해 주세요.';}
   else {const result=await advance(row);status=result.status||'running';error=result.error||null;}
  }catch(e){failures=row.failures+1;error='서버 상태 확인에 실패했습니다. 잠시 후 다시 확인합니다.';if([400,401,403,409].includes(e.status)){status='needs_attention';error='업무 권한 또는 실행 상태를 확인해야 합니다.';}else if(failures>=5){status='needs_attention';error='반복된 서버 오류로 확인이 필요합니다.';}}
  await q(env,`UPDATE secretary_runtime SET status=?,error=?,failures=?,steps=steps+1,next_at=?,updated_at=?,lease=NULL,lease_until=0 WHERE tenant_id=? AND thread_id=? AND request_id=? AND lease=?`,[status,error,failures,now+Math.min(300000,failures?30000*2**failures:1000),now,...keys,lease]).run();
  outcomes.push({request_id:row.request_id,status});
 }
 return outcomes;
}
