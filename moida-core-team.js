(function(root){'use strict';
 var roles=[
  ['moa','모아','AI 비서실장','요청을 정리하고 담당자를 연결해 결과와 다음 할 일을 모아요.','요청 정리, 담당자 배정, 결과 요약','records',/모아|총괄|배정|도와|무엇|정리해/],
  ['tick','째깍','일정·업무','일정·할 일·마감과 준비사항을 정리해요.','일정표, 충돌 확인, 준비·마감 목록','schedule',/째깍|일정|약속|마감|할\s*일|동선|캘린더|행사\s*준비/],
  ['duri','두리','조사','제공한 자료와 연결된 자료함을 조사하고 근거를 비교해요.','자료 조사, 출처 목록, 비교표','records',/두리|조사|검색|찾아|자료|비교|근거/],
  ['glim','글림','글쓰기','문서·보고서·메일·안내문을 목적과 독자에 맞게 작성해요.','보고서, 메일, 안내문, 글 초안','records',/글림|글|작성|문서|보고서|메일|안내문|보도자료/],
  ['dami','담이','기록','전사와 회의 자료에서 결정사항·요약·후속 할 일을 정리해요.','회의록, 통화 요약, 결정·후속 목록','records',/담이|기록|통화|녹음|전사|회의록|요약/],
  ['semi','셈이','분석','표·수치·데이터를 비교하고 계산 근거와 누락을 확인해요.','데이터 비교, 계산 근거, 분석 보고','records',/셈이|분석|엑셀|수치|통계|계산|매출|비용|데이터/],
  ['bitna','빛나','콘텐츠','이미지를 제작·수정하고 SNS 문안과 연결 서비스의 콘텐츠 제작을 맡아요.','SNS 초안, 이미지 구성안, 영상 대본','records',/빛나|콘텐츠|홍보|SNS|영상|이미지|디자인|게시글/],
  ['ieum','이음','소통','문의·연락 내용을 정리하고 답변과 메시지 초안을 준비해요.','문의 답변, 연락 문안, 메시지 초안','records',/이음|소통|문의|고객|연락|답변|문자|메시지/]
 ];
 root.MOIDA_CORE_TEAM=Object.freeze(roles.map(function(r,i){return Object.freeze({id:'core_'+r[0],person:r[1],name:r[2],group:'기본 팀',description:r[3],duties:r[3],output:r[4],toolTeam:r[5],pattern:r[6],core:true,workMode:i===0?'업무 배정·결과 통합':'독립 에이전트 · 역할별 도구 실행',trigger:'사용자가 이름이나 업무로 요청하면 모아가 배정',portraitIndex:i,requirements:'사용자가 제공한 자료와 현재 계정에 연결된 도구. 연결되지 않은 자료에는 접근하지 않습니다.',approval:'외부 발송·게시·등록은 실제 연결 도구와 사용자 확인이 필요합니다.',tools:[[['직원 업무 배정','secretary'],['연결 도구 관리','connections']],[['일정 조회·예약 작업','connections']],[['웹 검색·심층 조사','connections']],[['문서 작성·저장','knowledge']],[['파일·전사 분석','knowledge']],[['계산·데이터 분석','connections']],[['이미지·콘텐츠 제작','connections']],[['연락처·문자·메일','connections']]][i]});}));
 root.MOIDA_CORE_ROLE=function(id){return root.MOIDA_CORE_TEAM.find(function(r){return r.id===id;});};
 root.MOIDA_CORE_SCORE=function(role,text){return String(text).includes(role.person)?100:role.pattern.test(text)?20:0;};
})(typeof window==='undefined'?globalThis:window);
