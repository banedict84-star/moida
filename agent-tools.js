const fn=(name,description,properties={},required=[])=>({type:'function',function:{name,description,parameters:{type:'object',properties,required}}});
const string={type:'string'};
const COMMON=['office_search_files','office_read_file','office_read_context'];
const ACCESS={schedule:['office_calendar'],policy:['office_search_law','office_read_law'],audit:['office_search_law','office_read_law'],civil:['office_search_law'],organization:[],assemblypr:['office_notices'],localpr:['office_notices'],records:['office_notices'],verification:['office_search_law','office_read_law','office_notices','office_calendar']};
const DEFINITIONS=[
 fn('office_search_files','현재 의원실 계정의 자료실에서 제목·본문을 검색한다.',{query:string}),
 fn('office_read_file','검색된 자료 ID의 저장된 본문을 읽는다. 원본 분석 결과가 요약이면 원문이라고 주장하지 않는다.',{file_id:string,offset:{type:'integer',minimum:0}},['file_id']),
 fn('office_read_context','이번 업무에 전달된 내부 자료를 검색한다. 실시간 명부 전체가 아니며 누락은 확인 필요로 보고한다.',{query:string}),
 fn('office_search_law','국가법령정보센터에서 공식 법령·조례를 조회한다.',{query:string,target:{type:'string',enum:['law','ordin']}},['query']),
 fn('office_read_law','공식 검색 결과의 ID로 법령·조례 본문을 읽는다.',{target:{type:'string',enum:['law','ordin']},id:string,mst:string},['target']),
 fn('office_calendar','현재 계정의 Google 캘린더를 직접 조회한다. 조회 실패는 연결 필요로 표시한다.',{start:string,end:string}),
 fn('office_notices','모이다에 수집된 공식 공지 목록과 원문 링크를 조회한다.',{query:string})
];
export function teamTools(team){const allowed=new Set([...COMMON,...(ACCESS[team]||[])]);return DEFINITIONS.filter(t=>allowed.has(t.function.name));}
export async function executeTeamTool({env,run,team,name,args={},services={},fetcher=fetch}){
 if(!teamTools(team).some(t=>t.function.name===name))throw Error('이 팀에 연결되지 않은 도구입니다.');
 if(!run.tenant_id)throw Error('의원실 계정 확인이 필요합니다.');
 const query=String(args.query||'').slice(0,200),uid=run.tenant_id;
 if(name==='office_search_files'||name==='office_read_file'){
  try{
   if(name==='office_search_files')return{files:(await env.AGENT_DB.prepare('SELECT id,title,format,substr(content,1,500) AS preview FROM office_files WHERE tenant_id=? AND (instr(title,?)>0 OR instr(content,?)>0) ORDER BY created_at DESC LIMIT 12').bind(uid,query,query).all()).results};
   const file=await env.AGENT_DB.prepare('SELECT id,title,content,provider_file_id,source_url FROM office_files WHERE tenant_id=? AND id=?').bind(uid,String(args.file_id||'')).first();
   if(!file)throw Error('현재 계정의 자료를 찾지 못했습니다.');
   const offset=Math.max(0,Math.floor(Number(args.offset)||0));return{file_id:file.id,title:file.title,content:file.content.slice(offset,offset+12000),source_url:file.source_url,next_offset:offset+12000<file.content.length?offset+12000:null,scope:file.provider_file_id?'업로드 원본의 분석·요약 참고 내용':'저장된 본문'};
  }catch(e){if(/no such table.*office_files/i.test(e.message))throw Error('자료실 도구 배포가 아직 완료되지 않았습니다.');throw e;}
 }
 if(name==='office_read_context'){
  let c={};try{c=JSON.parse(run.context_json||'{}');}catch{}
  const kinds={schedule:['events'],policy:['policies','lawResearch'],audit:['policies','lawResearch'],civil:['complaints'],organization:['crm','contacts'],assemblypr:['recentContents','events'],localpr:['recentContents','events'],records:['policies','events','complaints'],verification:['policies','events','complaints','lawResearch']}[team]||[];
  const result={scope:'이번 업무 접수 시 전달된 자료'};for(const k of kinds){if(c[k])result[k]=Array.isArray(c[k])?c[k].filter(x=>!query||JSON.stringify(x).includes(query)).slice(0,40):c[k];}return result;
 }
 if(name==='office_search_law'){if(!query)throw Error('법령 검색어가 필요합니다.');if(!['law','ordin'].includes(args.target||'law'))throw Error('법령 조회 종류가 올바르지 않습니다.');return services.searchLaw(args.target||'law',query);}
 if(name==='office_read_law'){if(!['law','ordin'].includes(args.target)||(!args.id&&!args.mst))throw Error('공식 검색 결과의 법령 ID가 필요합니다.');return services.readLaw(args.target,args.id,args.mst);}
 if(name==='office_calendar'){
  const start=args.start?Date.parse(args.start):Date.now(),end=args.end?Date.parse(args.end):start+7*86400000;
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>31*86400000)throw Error('조회 기간은 시작 이후 31일 이내로 지정해 주세요.');
  return {...await services.calendar(new Date(start).toISOString(),new Date(end).toISOString()),checked_start:new Date(start).toISOString(),checked_end:new Date(end).toISOString(),timezone:'Asia/Seoul'};
 }
 if(name==='office_notices'){
  const results=await Promise.allSettled(['notices_data.json','central_data.json','council_data.json'].map(async file=>{const r=await fetcher('https://banedict84-star.github.io/moida/'+file,{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error(file+' 조회 실패');const d=await r.json();return{source:file,updated:d.updated,items:(d.items||[]).filter(x=>!query||JSON.stringify(x).includes(query)).slice(0,8)};}));
  return{sources:results.filter(r=>r.status==='fulfilled').map(r=>r.value),errors:results.filter(r=>r.status==='rejected').map(r=>r.reason.message)};
 }
}
export async function runToolConversation({messages,tools,invoke,execute,onTool=()=>{},maxRounds=2}){
 const history=[...messages];let calls=0;
 for(let round=0;round<=maxRounds;round++){
  const data=await invoke(history,round<maxRounds?tools:[]),choice=data.choices?.[0],message=choice?.message;
  if(choice?.finish_reason==='stop'&&!message?.tool_calls?.length)return message.content||'';
  if(choice?.finish_reason!=='tool_calls'||!message?.tool_calls?.length||round===maxRounds)throw Error('AI 도구 응답이 완성되지 않았습니다.');
  history.push(message);
  for(const call of message.tool_calls){
   let result;try{if(++calls>4)throw Error('조회 횟수 한도입니다. 추가 확인 필요로 보고하세요.');if(!tools.some(t=>t.function.name===call.function.name))throw Error('허용되지 않은 도구입니다.');result=await execute(call.function.name,JSON.parse(call.function.arguments||'{}'));}catch(e){result={ok:false,error:e.message,requires_confirmation:true};}
   await onTool(call.function.name,result);
   const raw=JSON.stringify(result);history.push({role:'tool',tool_call_id:call.id,content:raw.length>18000?JSON.stringify({truncated:true,content:raw.slice(0,18000)}):raw});
  }
 }
}
