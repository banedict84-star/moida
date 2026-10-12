# 모이다 도구 연결 확대 — 2026-10-13

사용자가 지정한 1차 목록을 우선 처리하고 나머지 전체 목록을 후속 범위로 유지한다. 설정 UI와 코드가 있다는 사실, 계정 인증 완료, 실제 도구 실행 성공을 구분한다. 현재 사용자 계정의 로그인·외부 권한 승인·유료 도구 실행은 검증하지 않았다.

| 서비스 | 구현 경로 | 실제 계정 연결에 남은 조건 |
|---|---|---|
| Google Calendar·Drive·Gmail | 기존 Google OAuth·API | 사용자 승인. Gmail은 발송만 지원. Drive의 Docs·Sheets·Slides는 읽기·가져오기 범위 |
| Google Contacts | Google OAuth·People API 읽기 | 주소록 권한 승인, Google Cloud 프로젝트 People API 활성화 여부 확인 |
| FLOW | 기존 공식 MCP·OAuth, 도구 연결 화면 로그인 버튼 추가 | 사용자 승인 |
| SOLAPI | 공식 API·HMAC, 도구 연결 화면 키 입력 추가 | 사용자 API Key·Secret 및 인증한 발신번호. 공식 MCP는 로컬 stdio 패키지여서 웹 서버에 그대로 설치할 수 없음 |
| Canva | 공식 MCP·등록 앱 OAuth | Canva 앱 생성·MCP 활성화·콜백 등록 후 Client ID·Secret 입력 |
| Slack | 공식 MCP·등록 앱 OAuth | 내부 앱 또는 Marketplace 앱, 사용자 권한·콜백 등록·워크스페이스 승인 |
| GitHub | 공식 원격 MCP·개인 액세스 토큰 | 저장소·권한을 제한한 토큰 입력. OAuth 앱 경로는 미구현 |
| Figma | 공식 MCP·승인된 클라이언트 OAuth | 모이다 클라이언트 등록 승인 필요. 일반 Figma 토큰으로 대체 불가 |
| OpenAI Developers | 공개 공식 문서 MCP | 로그인 불필요. 문서 검색·읽기만 제공하며 API 키·잔액 관리는 포함하지 않음 |
| Booking.com | 공식 제휴 MCP·전용 헤더 | 제휴 온보딩 후 Affiliate ID·Demand API key 발급 |
| Linear | 공식 MCP·동적 등록 OAuth | 사용자 승인 |
| Firecrawl | 공식 MCP·동적 등록 OAuth | 사용자 팀 승인, 서비스 요금·크레딧 |
| ChatGPT Ads Manager | 공식 Advertiser API에 대한 모이다 어댑터 | 광고 전용 API 키. 계정·캠페인 조회, 중지 상태 캠페인 생성. ChatGPT 전용 플러그인 전체 기능·광고 활성화는 미구현 |

1차 외의 Notion·Higgsfield 기존 연결을 유지하고, Asana·Miro·monday.com 공식 MCP 연결도 추가했다. Asana는 MCP 앱 등록이 필요하고 monday.com은 계정 관리자 동적 연결 승인이 필요하다.

## 검증

- Linear·Firecrawl·Miro·monday.com은 운영 모이다 콜백 주소로 공식 동적 클라이언트 등록 성공. 이 검증은 사용자 계정 승인을 대신하지 않는다.
- OpenAI 문서 서버에서 initialize → notifications/initialized → tools/list 실제 응답 확인.
- 모든 비밀 값은 기존 서버 암호화로 UID별 D1 저장. 토큰·제휴 키는 URL·상태 응답·모델 프롬프트에 넣지 않는다.
- 키 방식은 실제 MCP 도구 목록 또는 광고 계정 조회에 성공해야 저장. OAuth도 토큰 교환 후 MCP 도구 목록 확인에 성공해야 연결 저장.
- AI 사용은 별도 명시적 설정. 외부 실행 요청은 내용 확인·승인 후 실행하며 같은 요청을 다시 실행하지 않는다.
- 광고 생성은 항상 paused, 요청 ID를 Idempotency-Key로 사용. 광고 활성화·예산 증액 도구 없음.
- 연결 해제는 모이다 저장 인증·AI 사용 권한·미실행 요청을 제거한다. 외부 서비스의 전체 권한 철회는 해당 서비스 계정 설정에서 별도 수행해야 한다.

## 전체 확대의 남은 범위

카탈로그에 있는 나머지 항목도 요청 범위다. 아직 구현되지 않은 항목은 연결 완료로 표시하지 않는다. ChatGPT 앱 디렉터리는 외부 호스팅 MCP 주소·인증 정보를 보장하지 않으며, 일부 항목은 계정 연결 대상이 아닌 개발 스킬이다. 서비스별 공식 외부 인터페이스, 웹에서 쓸 수 있는 전송 방식, 등록·심사 조건을 확인한 뒤 서버 어댑터와 UI를 구현해야 한다.

유지할 원칙: 공개된 공식 MCP는 공통 클라이언트에 추가, API만 있는 서비스는 명시적인 모이다 어댑터, 로컬 stdio만 있는 서비스는 별도 실행 브리지, 외부 공개가 확인되지 않은 서비스는 확인 전 연결 버튼을 활성화하지 않는다. 임의 MCP URL이나 비공식 프록시에 사용자의 토큰을 보내지 않는다.

공식 근거:

- [Linear](https://linear.app/docs/mcp)
- [Firecrawl](https://docs.firecrawl.dev/mcp-server)
- [Slack](https://docs.slack.dev/ai/slack-mcp-server)
- [GitHub](https://github.com/github/github-mcp-server)
- [Canva](https://www.canva.dev/docs/apps/mcp/access/)
- [Figma](https://developers.figma.com/docs/figma-mcp-server/remote-server-installation/)
- [Booking.com](https://developers.booking.com/mcp-server/docs/implementation-guide)
- [OpenAI 문서 MCP](https://developers.openai.com/learn/docs-mcp)
- [OpenAI 광고 API](https://developers.openai.com/ads/api-overview)
- [FLOW](https://flow.team/ai/mcp/docs?lang=en)
- [SOLAPI](https://solapi.com/developers/sdk/mcp)
- [Google Contacts](https://developers.google.com/people/api/rest/v1/people.connections/list)
- [Asana](https://developers.asana.com/docs/integrating-with-asanas-mcp-server)
- [Miro](https://developers.miro.com/docs/connecting-to-miro-mcp)
- [monday.com](https://developer.monday.com/api-reference/docs/integrate-with-monday-mcp)
