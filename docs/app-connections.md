# 모이다 앱 연결

`platform.html#connections` 또는 사이드바 **앱 연결**. 비서실장 + 메뉴의 연결 관리도 이 화면으로 이동한다.

15개 앱을 검색·분류하고 계정별 선택 목록에 저장한다. 선택은 연결 승인과 별개이며, 선택을 해제해도 외부 계정의 권한을 철회하지 않는다.

Google Calendar / Drive / Gmail은 기존 Google OAuth를 재사용한다. 현재 Gmail은 **발송**만 지원한다. Google 승인에서는 기본 캘린더 권한과 선택한 서비스의 추가 권한을 요청한다. FLOW와 SOLAPI는 실제 상태를 조회하고 기존 설정 화면으로 이동한다. 상태 조회 실패는 ‘확인 필요’로 표시한다.

Outlook, SharePoint, Dropbox, Canva, Adobe Acrobat, Slack, Teams, GitHub, Salesforce, Zoom은 **앱 등록 필요**다. 이 단계에서는 연결 준비 안내와 선택 저장만 제공하며, 계정 승인과 자료 접근은 구현되지 않았다. 서비스별 개발자 앱 등록, 서버 인증·조회 어댑터, 필요한 검증/조직 승인이 완료되어야 실제 연결을 제공할 수 있다. ChatGPT에 설치한 플러그인이나 계정 인증은 모이다로 이전되지 않는다.

선택 저장 API: 로그인된 사용자의 `/office-tools/apps` (GET), `/office-tools/apps/select` (POST: appId, selected). D1 `office_app_selections`에 Firebase UID별로 저장한다. 알려진 앱 ID와 불리언 값만 허용한다. 비밀번호·토큰·개발자 앱 비밀 값은 받거나 저장하지 않는다.
