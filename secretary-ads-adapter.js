// Moida adapter for the official Advertiser API, not the private ChatGPT plugin.
export const ADS_TOOLS=[
 {name:'ads_account',description:'현재 광고 계정 정보와 검토 상태 조회',inputSchema:{type:'object',properties:{},additionalProperties:false}},
 {name:'ads_campaigns',description:'광고 캠페인 목록 조회',inputSchema:{type:'object',properties:{},additionalProperties:false}},
 {name:'ads_create_paused_campaign',description:'사용자 승인 후 중지 상태의 캠페인 초안 생성. 광고를 활성화하지 않음.',inputSchema:{type:'object',properties:{campaign:{type:'object'}},required:['campaign'],additionalProperties:false}}
];
export async function adsRpc(fetcher,access,method,params,key){
 if(method==='tools/list')return{tools:ADS_TOOLS};
 const name=params.name,args=params.arguments||{};if(!ADS_TOOLS.some(t=>t.name===name))throw new Error('지원하지 않는 광고 도구입니다.');
 const create=name==='ads_create_paused_campaign';
 if(create&&(!args.campaign||typeof args.campaign!=='object'||Array.isArray(args.campaign)||typeof args.campaign.name!=='string'||!args.campaign.name.trim()))throw new Error('캠페인 이름과 설정이 필요합니다.');
 const response=await fetcher('https://api.ads.openai.com/v1/'+(name==='ads_account'?'ad_account':'campaigns'),{method:create?'POST':'GET',redirect:'manual',signal:AbortSignal.timeout(30000),headers:{Authorization:'Bearer '+access,'Content-Type':'application/json',...(create?{'Idempotency-Key':key}:{})},...(create?{body:JSON.stringify({...args.campaign,status:'paused'})}:{})});
 if(!response.ok)throw Object.assign(new Error('광고 API 요청 실패 ('+response.status+'). 광고 전용 API 키와 계정 권한을 확인하세요.'),{status:response.status===401?409:502});
 const text=await response.text();if(text.length>1000000)throw new Error('광고 응답이 너무 큽니다.');const result=JSON.parse(text);
 return{content:[{type:'text',text:JSON.stringify(result)}],structuredContent:result};
}
