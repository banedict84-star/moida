// The catalog describes availability, never authorization. Pending selections contain no credentials.
export const APP_CATALOG = [
 {id:'gmail',name:'Gmail',category:'메일',mark:'G',color:'#c64235',description:'검토한 메일 초안을 Gmail로 발송',kind:'google',service:'mail',statusKey:'gmail'},
 {id:'google_calendar',name:'Google Calendar',category:'일정',mark:'31',color:'#346de6',description:'일정 조회 · 겹치는 일정 확인 · 일정 등록',kind:'google',service:'',statusKey:'calendar'},
 {id:'google_drive',name:'Google Drive',category:'자료',mark:'D',color:'#178556',description:'자료 검색 · 폴더 조회 · 모이다 자료실로 가져오기',kind:'google',service:'drive',statusKey:'drive'},
 {id:'flow',name:'FLOW',category:'일정',mark:'F',color:'#7455cd',description:'프로젝트 일정 · 피드 조회 · 일정 등록',kind:'native',page:'schedule'},
 {id:'solapi',name:'SOLAPI',category:'소통',mark:'S',color:'#e06932',description:'문자 발송 · 예약 · 생일 문자 자동 발송',kind:'native',page:'messaging'},
 {id:'outlook',name:'Outlook Email',category:'메일',mark:'O',color:'#1672c5',description:'Outlook 메일 연결',kind:'pending',provider:'Microsoft',requirements:'Microsoft Entra에 모이다 앱 등록 · 메일 접근 권한 · 관리자 승인 여부 확인'},
 {id:'sharepoint',name:'SharePoint',category:'자료',mark:'S',color:'#087e82',description:'조직 문서와 자료 연결',kind:'pending',provider:'Microsoft',requirements:'Microsoft Entra 앱 등록 · 조직과 사이트 범위 지정 · 조직 관리자 승인'},
 {id:'dropbox',name:'Dropbox',category:'자료',mark:'D',color:'#1261fe',description:'보관한 파일과 폴더 연결',kind:'pending',provider:'Dropbox',requirements:'Dropbox 개발자 앱 등록 · 연결할 폴더 범위와 파일 읽기 권한 지정'},
 {id:'canva',name:'Canva',category:'제작',mark:'C',color:'#0b9da7',description:'홍보 디자인과 제작 자료 연결',kind:'pending',provider:'Canva',requirements:'Canva 개발자 연동 등록 · 사용 가능한 계정과 디자인 접근 권한 확인'},
 {id:'adobe',name:'Adobe Acrobat',category:'제작',mark:'A',color:'#d63d38',description:'PDF 문서 작업 연결',kind:'pending',provider:'Adobe',requirements:'Adobe 개발자 프로젝트 등록 · 사용할 PDF 서비스와 인증 방식 확인'},
 {id:'slack',name:'Slack',category:'소통',mark:'S',color:'#6d326b',description:'팀 채널과 업무 대화 연결',kind:'pending',provider:'Slack',requirements:'Slack 앱 등록 · 워크스페이스 승인 · 필요한 채널 접근 권한 지정'},
 {id:'teams',name:'Microsoft Teams',category:'소통',mark:'T',color:'#6258bd',description:'조직의 팀과 업무 대화 연결',kind:'pending',provider:'Microsoft',requirements:'Microsoft Entra 앱 등록 · 팀 접근 권한 지정 · 조직 관리자 승인'},
 {id:'github',name:'GitHub',category:'개발',mark:'GH',color:'#253142',description:'저장소 · 이슈 · 개발 작업 연결',kind:'pending',provider:'GitHub',requirements:'GitHub 앱 등록 · 사용할 저장소 지정 · 저장소 접근 권한 설정'},
 {id:'salesforce',name:'Salesforce',category:'고객',mark:'SF',color:'#159bd4',description:'고객 정보와 업무 자료 연결',kind:'pending',provider:'Salesforce',requirements:'Salesforce 외부 클라이언트 앱 등록 · 조직의 API 사용 가능 여부와 권한 확인'},
 {id:'zoom',name:'Zoom',category:'일정',mark:'Z',color:'#3776e9',description:'회의 일정과 회의 자료 연결',kind:'pending',provider:'Zoom',requirements:'Zoom Marketplace 앱 등록 · 사용할 회의와 녹화 접근 권한 지정'}
];
export function validateAppSelection(body) {
 if (!APP_CATALOG.some(app=>app.id===body.appId) || typeof body.selected!=='boolean') {
  const error=new Error('앱과 선택 여부를 확인해 주세요.');error.status=400;throw error;
 }
 return {appId:body.appId,selected:body.selected};
}
