// Official Responses API transport for public documentation only. No user credentials forwarded.
const SERVER='https://developers.openai.com/mcp';
function canonical(value){return JSON.stringify(value&&typeof value==='object'?Array.isArray(value)?value.map(v=>JSON.parse(canonical(v))):Object.fromEntries(Object.keys(value).sort().map(k=>[k,JSON.parse(canonical(value[k]))])):value);}
export async function docsMcpRelay(env,fetcher,method,params){
 if(!env.OPENAI_API_KEY)throw Object.assign(new Error('서버 OpenAI API 연결이 필요합니다.'),{status:503});
 async function request(input,previous){const r=await fetcher('https://api.openai.com/v1/responses',{method:'POST',redirect:'manual',signal:AbortSignal.timeout(55000),headers:{Authorization:'Bearer '+env.OPENAI_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({model:'gpt-4.1-mini',max_output_tokens:300,input,tools:[{type:'mcp',server_label:'openai_docs',server_url:SERVER,require_approval:'always',...(method==='tools/call'?{allowed_tools:[params.name]}:{})}],...(previous?{previous_response_id:previous}:{})})});if(!r.ok)throw Object.assign(new Error('OpenAI 공식 MCP 중계 요청 실패 ('+r.status+'). 서버 API 연결을 확인하세요.'),{status:502});const text=await r.text();if(text.length>1000000)throw new Error('공식 MCP 결과가 너무 큽니다.');const d=JSON.parse(text);if(d.error||d.status==='failed')throw new Error('공식 MCP 중계 요청을 처리하지 못했습니다.');return d;}
 const initial=await request(method==='tools/list'?'List available documentation tools only. Do not invoke any tool.':'Call exactly this documentation tool once, with these exact JSON arguments. Do not change the arguments: '+JSON.stringify({name:params.name,arguments:params.arguments}));
 if(method==='tools/list'){const list=initial.output?.find(o=>o.type==='mcp_list_tools'&&o.server_label==='openai_docs');if(!Array.isArray(list?.tools)||list.error)throw new Error('OpenAI 공식 문서 도구 목록을 확인하지 못했습니다.');return{tools:list.tools.map(t=>({...t,inputSchema:t.inputSchema||t.input_schema}))};}
 const approval=initial.output?.find(o=>o.type==='mcp_approval_request'&&o.server_label==='openai_docs');let args;try{args=JSON.parse(approval?.arguments||'null');}catch{}
 if(!approval||approval.name!==params.name||canonical(args)!==canonical(params.arguments)||!initial.id)throw new Error('요청한 도구와 중계 실행 내용이 일치하지 않아 실행하지 않았습니다.');
 const completed=await request([{type:'mcp_approval_response',approval_request_id:approval.id,approve:true}],initial.id);
 const call=completed.output?.find(o=>o.type==='mcp_call'&&o.server_label==='openai_docs'&&o.name===params.name);
 if(!call||call.error)throw new Error('공식 문서 도구 실행 결과를 확인하지 못했습니다.');return{content:[{type:'text',text:typeof call.output==='string'?call.output:JSON.stringify(call.output)}]};
}
