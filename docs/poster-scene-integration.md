# 장윤정 AI비서실: 실제 AI scene API 인계

작성: 2026-10-04. 상태: 로컬 구현 및 mock 검증 완료, 배포/실제 Gemini 호출/Site 연결은 미완료.
Site 코드는 수정하지 않았다. 기존 전역 CORS, Firebase 설정, Cloudflare secrets, 원격 DB는 변경하지 않았다.

## 연결 경로와 승인 경계

가장 작은 경로는 Site에서 기존 Firebase 프로젝트 `jjj2195-1bd15`에 사용자가 직접 로그인한 뒤 ID 토큰으로 기존 Worker를 호출하는 것이다. Site 자체의 비공개 로그인은 Firebase 인증이 아니다. 다른 앱의 쿠키/토큰을 복사하거나 JS에 AI/admin secret을 넣지 않는다. 공개 Firebase 클라이언트 설정은 secret이 아니지만 새 도메인에서 기존 프로젝트를 사용하도록 하는 변경은 승인 후 진행한다. 초기 권장은 Firebase in-memory persistence이며 로그인 방식과 현재 계정 접근 여부를 운영자가 확인해야 한다.

승인/배포 작업(이 작업에서는 수행하지 않음):

1. 새 Site에 기존 Firebase 로그인 추가 및 필요 시 authorized domain 추가. 로그인 성공만으로 AI 사용 권한을 주지 않으며 아래 UID 허용 목록도 필요하다.
2. 기존 Worker에 아래 코드와 추가 D1 migration 배포, 경로 전용 설정 활성화. 기존 `ALLOW_ORIGINS`는 변경하지 않는다.
3. 기존 Worker의 `GEMINI_API_KEY`로 사진과 행사내용을 Google에 전송/과금하는 사용 승인 및 실제 키/청구 상태 확인. 키가 이미 Worker에 있으면 같은 서버에서 재사용 가능하며 Site나 새 서버에 복사할 필요가 없다. 없으면 비밀값은 채팅으로 받지 말고 운영자가 기존 secret 저장소에서 설정해야 한다.
4. 결과 scene(행사 문구 포함)과 UID/요청 hash/사용량은 기존 D1에 남는다. 사진 bytes/ID token은 코드에서 저장·로깅하지 않는다. 로컬에 7일 결과 정리를 구현했다. POSTER_SCENE_RETENTION_DAYS=7과 기능 활성화가 모두 설정된 경우에만 작동한다. 설정은 승인 전 적용하지 않는다. 원문 텍스트/사진의 provider 보관 정책과 유료 프로젝트 여부도 확인한다.

필요 설정 이름(값을 실제로 설정하지 않았음):

- `POSTER_SCENE_ENABLED`: 정확히 문자열 `true`일 때만 AI 실행.
- `POSTER_SCENE_ORIGINS`: 승인된 정확한 origin의 CSV. 예정값은 `https://yoonjung-ai-office.benedict.chatgpt.site`; wildcard/localhost 자동 허용 없음.
- `POSTER_SCENE_RETENTION_DAYS`: 문자열 `7`이면 생성 7일 후 결과 scene을 제거한다. 기존 5분 cron과 인증된 API 접근 시 정리한다. request hash/UID/idempotency tombstone/사용량 기록은 중복 과금 방지를 위해 유지한다. 원문 scene만 제거하며 상태는 failed/RESULT_EXPIRED가 된다.
- `POSTER_SCENE_USER_IDS`: 승인된 기존 Firebase UID CSV. 이메일이나 표시이름은 사용하지 않는다.
- 기존 `FIREBASE_API_KEY`, `GEMINI_API_KEY`, `AGENT_DB` binding 유지.
- `migrations/0004_poster_scene.sql`: 기존 테이블을 수정하지 않는 추가 migration.

모델은 이 경로에만 `gemini-2.5-flash`를 고정했다. 기존 Gemini 문구/이미지 경로의 모델은 변경하지 않았다. 모델 가용성·키 권한·유료 사용 여부는 실제로 검증하지 않았다. 실제 호출 실패를 템플릿 성공으로 대체하지 않는다.

## API 계약 v1

예정 base: `https://moida-gpt.banedict84.workers.dev` (배포 전에는 사용 가능한 새 endpoint가 아님).

`POST /poster-scene` headers:

```http
Authorization: Bearer <current Firebase ID token>
Content-Type: application/json
Idempotency-Key: <crypto.randomUUID() generated once per user action>
```

```json
{
  "schemaVersion": 1,
  "consentToAI": true,
  "facts": {"event": "주민 간담회", "date": "2026-10-04", "place": "회의실", "details": "사용자가 확인한 행사 내용"},
  "approvedFooter": "사용자가 승인한 하단 문구",
  "tone": "차분하고 따뜻한",
  "ratio": "4:5",
  "currentCopy": {"title": "현재 제목", "subtitle": "현재 부제"},
  "photos": [{
    "id": "photo_1",
    "width": 1200,
    "height": 1600,
    "mimeType": "image/jpeg",
    "data": "<base64 only, no data URL prefix>",
    "cropLocked": true,
    "crop": {"x": 0.1, "y": 0.1, "width": 0.8, "height": 0.8}
  }]
}
```

1–3장, 각각 긴 변 최대 2048px, base64 길이 최대 1,300,000자, 전체 요청 최대 4 MiB. JPEG/PNG/WebP만 수용하며 MIME signature를 확인한다. 클라이언트는 EXIF 방향을 반영해 canvas에서 재인코딩하여 메타데이터를 제거하고 축소본만 보낸다. 원본은 로컬 PNG 렌더용으로 유지한다. 서버의 width/height는 클라이언트 신고값 검증이며 이미지 decoder로 실제 치수를 검사하는 것은 아니다. 원격 이미지 URL/임의 파일 fetch는 지원하지 않는다. 사진 ID는 영숫자/밑줄/하이픈 1–64자이며 중복 불가. crop은 **원본 기준 정규화 좌표**, 잠금이 없으면 생략 가능.

성공 응답(200):

```json
{
  "ok": true,
  "jobId": "<uuid>",
  "status": "succeeded",
  "provider": "Google",
  "model": "gemini-2.5-flash",
  "scene": {
    "schemaVersion": 1,
    "title": "현장의 목소리를 듣다",
    "subtitle": "주민 간담회",
    "date": "2026-10-04",
    "place": "회의실",
    "approvedFooter": "사용자가 승인한 하단 문구",
    "ratio": "4:5",
    "layout": "single",
    "photos": [{"id": "photo_1", "focal": {"x": 0.5, "y": 0.5}, "crop": {"x": 0.1, "y": 0.1, "width": 0.8, "height": 0.8}, "cropLocked": true, "reason": "피사체 보존"}],
    "warnings": []
  },
  "usage": {"input_tokens": 100, "output_tokens": 50, "total_tokens": 150, "input_tokens_details": {"cached_tokens": 0}}
}
```

사진 배열 순서가 배치 순서다. `single`=1장, `split`=2장, `hero-grid`=3장(첫 사진이 hero). 프런트는 이 이름들을 실제 슬롯 배치로 매핑한다. 사진 ID는 제출한 것만 정확히 한번씩 반환되며 새 사진/얼굴/URL은 없다. footer/date/place는 모델 결과가 아니라 입력에서 복사한다. AI title/subtitle의 사실 정확성은 사람의 확인이 여전히 필요하다. 구조 검증이 환각의 의미적 부재를 보장하지 않는다.

crop 직사각형이 슬롯 비율과 다르면 그 영역이 보존되도록 contain/letterbox로 렌더하거나 사용자에게 조정하도록 한다. 다시 무조건 중앙 cover를 적용해 제안을 무효화하면 안 된다. 잠긴 crop은 유지한다. focal은 정규화된 피사체 중심이다. 최종 PNG는 Site의 기존 renderer에서 생성한다; 서버는 PNG나 이미지 URL을 만들지 않는다.

## 작업 수명과 오류

- POST는 최대 45초 provider 호출을 기다리는 동기형 최소 구현이다. D1에 pending을 먼저 남긴다. 새 Queue/백그라운드 작업자는 만들지 않았다.
- 동일 사용자 + 동일 Idempotency-Key + 동일 정규화 payload 재전송은 같은 작업을 반환한다. 진행 중이면 HTTP 202/pending, 완료된 실패도 다시 호출하지 않는다. 다른 payload이면 409.
- 네트워크가 끊겨 jobId를 못 받았으면 **같은 body/key**로 POST를 재전송해 ID를 회수한다. 무조건 새 key로 재시도하면 안 된다.
- `GET /poster-scene/{jobId}`: 같은 Bearer 인증과 Origin, 소유자만 조회. 성공 상태 조회는 HTTP 200이며 `status`로 판별한다. 120초 이상 pending인 작업은 failed/INTERRUPTED로 마감하고 자동 AI 재호출하지 않는다.
- `POST /poster-scene/{jobId}/cancel`: pending만 cancelled로 변경. 이미 실행 중인 provider 요청 중단/환불을 보장하지 않는다. 늦게 도착한 결과도 cancelled를 succeeded로 바꾸지 않는다.
- terminal: succeeded, failed, cancelled. pending에만 2–3초 간격으로 조회하고 120초 이후 한 번 조회하여 종료 상태를 확인한다. 다른 사용자 작업은 404.
- 사용자별 rolling 24시간 10건으로 제한한다. 실패/취소 포함, replay 제외. 원자적 SQL claim으로 동시 요청 제한 및 중복 방지.
- 400 입력/동의/key 오류, 401 로그인, 403 origin/UID 권한, 409 key 충돌, 413 크기, 415 JSON 형식, 429 일일 한도, 502 AI 실패/잘못된 scene, 503 비활성/설정/DB 문제. `{ok:false,error:{code}}`로 알린다. provider 원문 오류는 노출하지 않는다.
- 모델 오류/부적절한 출력/차단/불완전 JSON은 실패로 처리한다. mock 또는 템플릿 결과를 AI 성공으로 반환하지 않는다.

## 프런트 구현 요구

사용자 로그인 및 사진 AI 전송 안내/동의 → 행사 facts와 원사진 IDs 스냅샷 생성 → 한 번의 생성 액션에 한 key → 요청 → 응답 scene을 현재 편집 모델에 merge → preview/PNG 렌더 → 동일 화면에서 결과 표시/다운로드.

토큰은 `currentUser.getIdToken()`으로 얻고 401 때 로그인 갱신을 안내한다. API key/admin credential을 넣지 않는다. 제출 시 field revision을 캡처하고 응답 시 그 이후 사용자가 수정한 텍스트/사진 순서/crop은 덮어쓰지 않는다. 요청 후 잠금 상태가 바뀐 crop도 유지한다. scene 문구는 textContent/canvas 텍스트로만 렌더하며 HTML 실행을 허용하지 않는다. AI 생성 중/완료/실패를 구별하고 네트워크 실패를 성공으로 표시하지 않는다. 결과 회신은 이 화면의 PNG이며 Kakao 발송은 포함하지 않는다.

## 조사 근거와 한계

- moida 기준 HEAD `5d39f65`. 기존 `verifyFirebaseUser`는 Firebase accounts:lookup으로 ID token을 확인한다. 기존 `/gemini/poster-copy`는 텍스트만 받고 사진 배치를 기획하지 않는다.
- 저장된 전역 `ALLOW_ORIGINS`에 새 Site origin은 없다. 일부 legacyOpenAI는 Authorization을 선택사항으로 처리한다. 이번 경로는 그 프록시로 fallthrough하지 않는다. 다른 기존 기능 보존을 위해 해당 구형 경로 자체는 변경하지 않았다.
- jjj2195 로컬 HEAD `35675b1`에는 poster 모듈이 없다. 원격 `claude/kakao-google-calendar-auth-gamu2x`의 `02469e5`를 fetch 후 checkout 없이 읽었다. posterWorker/testPoster 핸들러에서 앱 수준 Firebase 인증 검사를 확인하지 못했다(실제 IAM/배포 정책은 미확인). 결과를 공개 저장하고 Kakao callback/나에게 보내기를 수행하므로 Site 연결에 재사용하지 않는다. PR1의 다중사진 코드나 live 배포를 전제하지 않았다.
- Worker health/CORS 읽기 요청은 실행환경 outbound proxy의 CONNECT 403으로 막혔다. 이 응답은 Worker 자체의 인증/CORS 오류 증거가 아니다. live key/모델/청구/배포 상태 미확인.
- `/workspace`와 저장소에서 AGENTS.md 및 .agents/skills 파일은 발견되지 않았다.

## 비용과 검증

2026-10-04 Google 공식 가격표의 Gemini 2.5 Flash Standard: 입력(text/image) $0.30/1M tokens, 출력 $2.50/1M tokens. 예시 입력 5,000 + 출력 1,800 = $0.006/건, 원화 1,400원/USD 가정 시 약 8.4원. 이는 예시이며 실제 이미지 토큰/플랫폼 요금/환율을 포함한 보장 견적이 아니다. 하루 10건 및 출력 1,800 tokens 제한은 있으나 입력 토큰을 사전 계량하지 않으므로 절대 USD 예산 상한은 아니다. 유료 API 실호출은 0회.

공식 근거:
- https://ai.google.dev/gemini-api/docs/pricing
- https://ai.google.dev/gemini-api/docs/structured-output
- https://ai.google.dev/gemini-api/docs/thinking

검증: `node --test tests/poster-scene.test.mjs` 14/14 통과(실제 SQLite migration/원자 SQL, provider와 Firebase 네트워크만 mock). `npm run check:worker` 통과. 전체 기존 테스트에서 4개 실패(단독발의 분리/로고 2개/웹자보 wizard HTML)는 수정 전 HEAD를 /tmp에 archive해 실행해도 동일하게 실패했다. Cloudflare D1 실제 런타임/실제 Firebase 로그인/모델 품질/브라우저 PNG까지의 E2E는 미검증.

## 추가 인계: Firebase 로그인 및 일괄 승인 항목

기존 public Firebase config의 정확한 값은 `index.html:194–201` 또는 `platform.html:955`에 이미 있다. 프런트 담당자가 그 public config를 재사용하면 되며 별도 AI secret은 필요 없다. 기존 로그인 화면은 `signInWithPopup(auth, new GoogleAuthProvider())`와 `signInWithEmailAndPassword`를 제공한다(`index.html:244,269`). 이 사실은 코드 조사 결과이며 콘솔에서 현재 켜진 provider/사용자 로그인 성공을 확인한 것은 아니다. Google 로그인 경로를 유지하면 Firebase Console → Authentication → Settings → Authorized domains에 hostname `yoonjung-ai-office.benedict.chatgpt.site`가 없을 때 추가 승인이 필요하다. `https://`나 path를 넣지 않는다. `authDomain`은 기존 `jjj2195-1bd15.firebaseapp.com`을 유지한다. 신규 OAuth client, OAuth scope, Google Calendar 권한은 이 기능에 필요 없다. 공개 Firebase key의 HTTP referrer 제한이 이미 있다면 운영자가 확인하고 정확한 새 Site만 허용해야 한다; 제한 제거/무제한 확대는 요청하지 않는다.

일괄 승인에 포함할 정확한 범위:

- 해당 Site에서 기존 Firebase Google 로그인과 공개 config 재사용, 필요 시 정확한 hostname의 authorized domain/referrer 허용. 승인받은 계정 UID만 Worker 새 경로에 허용.
- 기존 Worker에 로컬 변경 3개(모듈/라우팅/migration) 배포, 추가 D1 테이블 적용, 새 경로 전용 origin/UID/enable 설정. 전역 CORS/Firestore Rules/기존 데이터/기존 Kakao 경로는 변경 대상 아님.
- 기존 Worker의 Gemini secret 존재 여부를 값 노출 없이 확인하고 같은 Worker 안에서 재사용. 없거나 유효하지 않으면 이 승인으로 새 secret 생성/새 billing 가입까지 포괄하지 말고 운영자 설정을 별도로 확정.
- 허용된 샘플 사진/행사 내용으로 최초 1회만 실제 Gemini 2.5 Flash 검증. 예상 $0.006 내외는 입력 5k/출력 1.8k 예시이며 실제 token 사용에 따라 변동. 예산 승인은 예를 들어 총 $0.02 한도로 제안하되, 현 구현은 달러 금액을 강제 차단하지 않으므로 엄격한 상한이 필요하면 provider 예산 제어 또는 사전 token 계량이 추가로 필요하다. 실패 시 자동 유료 재시도 없음.
- 결과 scene과 UID/요청 hash/사용량을 기존 D1에 보관. 원사진/토큰을 DB에 저장하지 않음. 보관기간은 승인에서 명시.

현재 키 존재 확인: `GEMINI_API_KEY`라는 binding을 코드가 참조한다는 사실만 확인했다. secrets 목록/값은 조회하지 않았고 live `/health`도 프록시가 차단했다. 따라서 '키 있음' 또는 '유료 플랜 연결됨'으로 보고하면 안 된다.


승인 대기 업데이트: 사용자에게 제안한 초기 실테스트 예산은 총 $1이며 운영 지속과금은 별도 결정이다. 아직 승인 응답 없음. 현 서버는 일일 10건/출력 1800 tokens 제한만 강제한다. $1 누적 금액의 hard cap을 구현한 것은 아니므로 승인 후 실행자는 소수의 샘플 호출을 개별 확인하고 자동 반복하지 않아야 한다. 실제 provider 예산 상한을 반드시 강제해야 한다면 별도 작업이 필요하다. 원사진은 요청 처리 메모리에서만 취급하며 D1/Storage에 저장하지 않는다; Google 처리/보관 정책은 별개다.

## 승인 후 접근 확인 (2026-10-04)

사용자의 '해봐'로 새 Site 로그인/대표님 UID 허용/기존 Worker 배포/Gemini 사진 전송/결과 7일 보관/최초 실테스트 총 $1 범위를 승인받았다. 지속 운영과금은 승인 범위가 아니다. 이전 승인대기 문장은 당시 상태 기록이며 현재 승인은 확보됐다.

현재 실행환경에는 Cloudflare 직접 관리 credential이나 Firebase admin credential이 없고, GitHub REST와 Worker 직접 접속은 프록시 403으로 차단됐다(네트워크 escalation 후에도 동일). GitHub connector에서 연결 사용자는 banedict84-star로 확인됐고 git remote 읽기는 가능하다. 기존 main push 배포 workflow는 Cloudflare token을 GitHub secret으로 사용하지만 그 secret의 존재/현재 동작 여부는 확인하지 못했다. 기존 workflow에는 D1 migration 적용 단계가 없으므로, 실제 배포 전에 0004 적용 경로를 확보해야 한다. 새 CI는 외부 API/secret 없이 해당 모듈 테스트만 수행한다.

대표님 Firebase UID는 저장소에서 검증할 수 없었다. admin.html의 t1/이메일/전화번호는 데모 자료이므로 사용하지 않는다. Git 작성자나 GitHub 소유자도 Firebase 대표 계정의 증거가 아니다. 새 Site의 실제 Firebase 로그인에서 얻은 UID를 계정 소유자 확인과 함께 전달하거나 운영자가 Firebase 콘솔에서 확인해야 한다. UID는 비밀번호/ID token이 아니며 credential을 채팅으로 요구하지 않는다. UID와 도메인 설정이 검증될 때까지 route는 비활성으로 유지한다.
