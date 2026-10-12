import {MCP_PROVIDERS,publicMcpConfig} from './secretary-mcp-providers.js';
// The catalog describes availability, never authorization. Pending selections contain no credentials.
import {APP_DIRECTORY} from './secretary-app-directory.js';
import {APP_LOGOS} from './secretary-app-logos.js';
export const APP_CATALOG = [
 {id:'notion',name:'Notion',category:'자료',mark:'N',color:'#222222',description:'공식 MCP · 페이지·업무 자료 조회 및 작성',kind:'mcp'},
 {id:'higgsfield',name:'Higgsfield',category:'제작',mark:'H',color:'#192133',description:'공식 MCP · 이미지·영상 도구 · 계정 로그인으로 연결',kind:'mcp'},
 {id:'gmail',name:'Gmail',category:'메일',mark:'G',color:'#c64235',description:'검토한 메일 초안을 Gmail로 발송',kind:'google',service:'mail',statusKey:'gmail'},
 {id:'google_calendar',name:'Google Calendar',category:'일정',mark:'31',color:'#346de6',description:'일정 조회 · 겹치는 일정 확인 · 일정 등록',kind:'google',service:'',statusKey:'calendar'},
 {id:'google_drive',name:'Google Drive',category:'자료',mark:'D',color:'#178556',description:'자료 검색 · 폴더 조회 · 모이다 자료실로 가져오기',kind:'google',service:'drive',statusKey:'drive'},
 {id:'flow',name:'FLOW',category:'일정',mark:'F',color:'#7455cd',description:'프로젝트 일정 · 피드 조회 · 일정 등록',kind:'native',page:'schedule'},
 {id:'solapi',name:'SOLAPI',category:'소통',mark:'S',color:'#e06932',description:'문자 발송 · 예약 · 생일 문자 자동 발송',kind:'native',page:'messaging'},
 {id:'outlook',name:'Outlook Email',category:'메일',mark:'O',color:'#1672c5',description:'Outlook 메일 연결',kind:'pending',provider:'Microsoft',requirements:'Microsoft Entra에 모이다 앱 등록 · 메일 접근 권한 · 관리자 승인 여부 확인'},
 {id:'sharepoint',name:'SharePoint',category:'자료',mark:'S',color:'#087e82',description:'조직 문서와 자료 연결',kind:'pending',provider:'Microsoft',requirements:'Microsoft Entra 앱 등록 · 조직과 사이트 범위 지정 · 조직 관리자 승인'},
 {id:'dropbox',name:'Dropbox',category:'자료',mark:'D',color:'#1261fe',description:'보관한 파일과 폴더 연결',kind:'pending',provider:'Dropbox',requirements:'Dropbox 개발자 앱 등록 · 연결할 폴더 범위와 파일 읽기 권한 지정'},
 {id:'canva',name:'Canva',category:'제작',mark:'C',color:'#0b9da7',description:'공식 MCP · 디자인 조회·편집·내보내기',kind:'mcp'},
 {id:'adobe',name:'Adobe Acrobat',category:'제작',mark:'A',color:'#d63d38',description:'PDF 문서 작업 연결',kind:'pending',provider:'Adobe',requirements:'Adobe 개발자 프로젝트 등록 · 사용할 PDF 서비스와 인증 방식 확인'},
 {id:'slack',name:'Slack',category:'소통',mark:'S',color:'#6d326b',description:'팀 채널과 업무 대화 연결',kind:'pending',provider:'Slack',requirements:'Slack 앱 등록 · 워크스페이스 승인 · 필요한 채널 접근 권한 지정'},
 {id:'teams',name:'Microsoft Teams',category:'소통',mark:'T',color:'#6258bd',description:'조직의 팀과 업무 대화 연결',kind:'pending',provider:'Microsoft',requirements:'Microsoft Entra 앱 등록 · 팀 접근 권한 지정 · 조직 관리자 승인'},
 {id:'github',name:'GitHub',category:'개발',mark:'GH',color:'#253142',description:'저장소 · 이슈 · 개발 작업 연결',kind:'pending',provider:'GitHub',requirements:'GitHub 앱 등록 · 사용할 저장소 지정 · 저장소 접근 권한 설정'},
 {id:'salesforce',name:'Salesforce',category:'고객',mark:'SF',color:'#159bd4',description:'고객 정보와 업무 자료 연결',kind:'pending',provider:'Salesforce',requirements:'Salesforce 외부 클라이언트 앱 등록 · 조직의 API 사용 가능 여부와 권한 확인'},
 {id:'zoom',name:'Zoom',category:'일정',mark:'Z',color:'#3776e9',description:'회의 일정과 회의 자료 연결',kind:'pending',provider:'Zoom',requirements:'Zoom Marketplace 앱 등록 · 사용할 회의와 녹화 접근 권한 지정'}
];
const groups = [
 ['메일', /Mail|Resend|Outlook Email|Gmail/i, '메일과 연락 업무'],
 ['일정', /Calendar|Calendly|TickTick|Todoist|Zoom$|Otter|Read AI|Granola|Fathom|Wispr|Trello|Asana|monday|ClickUp|Smartsheet|Linear|Atlassian/i, '일정 · 업무 · 회의 자료'],
 ['자료', /Drive|Dropbox|SharePoint|Box$|Notion|Coda|Airtable|Docusign|GitBook|Readwise/i, '문서와 업무 자료'],
 ['제작', /Figma|Canva|Adobe|MagicPath|Gamma|Miro|tldraw|Runway|HeyGen|Higgsfield|Descript|OpenArt|vidIQ/i, '디자인 · 이미지 · 영상 제작'],
 ['소통', /Slack|Teams|Quo$|RingCentral|Google Contacts/i, '연락처와 팀 소통'],
 ['고객', /CRM|HubSpot|HighLevel|Attio|Close$|Salesforce|Gong|ZoomInfo|Clay|Lusha|Apollo/i, '고객과 영업 자료'],
 ['분석', /Analytics|Amplitude|ThoughtSpot|Alation|Mixpanel|PostHog|Deepnote|Statsig|BigQuery|Hex$|dbt$|Tableau|MotherDuck|Snowflake|ClickHouse|WisdomAI|Databricks/i, '데이터와 성과 분석'],
 ['홍보', /HYPD|Metricool|Ads Manager|Klaviyo|Windsor|GSC|Supermetrics|Ahrefs|Ubersuggest|Similarweb|Semrush/i, '홍보 · 광고 · 채널 성과'],
 ['조사', /Firecrawl|Consensus|Scite|Exa$|Parallel Search|Tavily|Acumen|Legal Data|TinyFish|G2 MCP/i, '검색과 조사 자료'],
 ['여행', /Booking|Tripadvisor|Skyscanner/i, '여행과 출장 정보'],
 ['교육', /Certified|Udemy/i, '학습 자료와 교육'],
 ['건강', /Tredict|FitAI|Caliber|COROS|CalorieCam/i, '운동과 건강 기록'],
 ['운영', /Mercury|Stripe|Shopify|NetSuite|Gusto|Ashby/i, '사업 · 결제 · 인사 업무'],
 ['보안', /Security|Vanta|Datadog/i, '보안과 서비스 점검']
];
for (const entry of APP_DIRECTORY) {
 const existing=APP_CATALOG.find(a=>a.name===entry.name || (a.id==='teams' && entry.name==='Teams'));
 if(existing){existing.sourceId=entry.sourceId;existing.keywords=entry.keywords;continue;}
 const group=groups.find(g=>g[1].test(entry.name)) || ['개발',null,'개발과 서비스 운영'];
 APP_CATALOG.push({id:'directory_'+entry.sourceId,name:entry.name,category:group[0],mark:entry.name.replace(/[^A-Za-z0-9]/g,'').slice(0,2).toUpperCase(),color:'#345676',description:group[2]+' · 모이다 연동 준비',kind:'pending',provider:entry.name,requirements:'서비스의 외부 API 또는 MCP 제공 여부 · 인증 방식 · 이용 조건을 확인하고 모이다용 연동을 구현합니다.',sourceId:entry.sourceId,keywords:entry.keywords,sourceStatus:entry.sourceStatus});
}
// Promote the priority providers without leaving duplicate directory cards.
for(const [id,c] of Object.entries(MCP_PROVIDERS)){
 let app=APP_CATALOG.find(a=>a.name===c.name);
 if(!app){app={id,name:c.name,category:id==='booking'?'여행':id==='firecrawl'?'조사':id==='linear'?'일정':'개발',mark:c.name.slice(0,2),color:'#345676'};APP_CATALOG.push(app);}
 app.legacyId=app.id!==id?app.id:null;app.id=id;app.kind='mcp';app.mcp=publicMcpConfig(id);
 if(!app.description||app.description.includes('연동 준비'))app.description='공식 MCP · 계정 권한에 따라 도구 사용';
}
const contacts=APP_CATALOG.find(a=>a.name==='Google Contacts');contacts.legacyId=contacts.id;Object.assign(contacts,{id:'google_contacts',kind:'google',service:'contacts',statusKey:'contacts',description:'Google 주소록 · 이름·이메일·전화번호·소속 조회'});
const ads=APP_CATALOG.find(a=>a.id==='chatgpt_ads');ads.description='공식 광고 API · 계정·캠페인 조회 · 중지 상태 초안 생성';
const priorityNames=['Gmail','Google Calendar','Google Drive','Google Contacts','FLOW','SOLAPI','Canva','Slack','GitHub','Figma','OpenAI Developers','Booking.com','Linear','Firecrawl','ChatGPT Ads Manager'];
for(const app of APP_CATALOG){const i=priorityNames.indexOf(app.name);app.priority=i<0?0:1;app.priorityOrder=i<0?100:i;}
APP_CATALOG.sort((a,b)=>b.priority-a.priority||a.priorityOrder-b.priorityOrder);
for (const app of APP_CATALOG) app.logo=APP_LOGOS[app.name] || '';
export function validateAppSelection(body) {
 if (!APP_CATALOG.some(app=>app.id===body.appId) || typeof body.selected!=='boolean') {
  const error=new Error('앱과 선택 여부를 확인해 주세요.');error.status=400;throw error;
 }
 return {appId:body.appId,selected:body.selected};
}
