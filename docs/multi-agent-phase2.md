# MOIDA 멀티에이전트 2단계: 서버 작업 큐

## 목표

AI 비서실장 화면에서 받은 지시를 브라우저가 아니라 Cloudflare Worker가 처리한다.
브라우저를 닫거나 새로고침해도 Cloudflare Queue의 소비자가 작업을 이어서 실행한다.
기존 Firestore `agent_runs`, `agent_tasks` 및 로컬 캐시는 삭제하거나 변경하지 않는다.

## 구성

```text
AI 비서실장 입력
  → POST /agent-runs (Firebase ID 토큰 검증)
  → D1에 queued 상태와 멱등성 키 저장
  → Cloudflare Queue에 runId 전달
  → Worker 소비자가 작업 잠금
  → 비서실장 계획
  → 팀원 3명 병렬 실행
  → 팀장 검수 및 최대 1회 재작업
  → 독립 검증팀
  → 비서실장 최종 통합
  → D1에 결과와 이벤트 저장
  → 브라우저가 진행 상태 조회
```

## 안전장치

- Firebase ID 토큰으로 사용자 확인
- `(tenant_id, idempotency_key)` 고유 제약으로 중복 접수 방지
- 작업 임대 시간으로 동시에 같은 작업을 실행하는 상황 방지
- 5분 주기 복구 감시가 임대 시간이 지난 고아 작업을 Queue에 재등록
- Queue 전달 실패 자동 재시도와 Dead Letter Queue
- 애플리케이션 수준 최대 3회 실행
- 작업당 모델 호출 40회, 예약 출력 토큰 30,000 제한
- 외부 게시, 발송, 일정 확정 및 원본 업무 데이터 변경 금지
- 최종 결과는 `approval_status = pending`으로 저장
- 모든 상태 변경을 `agent_events`에 기록

## API

### 작업 접수

`POST /agent-runs`

필수 헤더:

- `Authorization: Bearer <Firebase ID token>`
- `Idempotency-Key: <브라우저가 생성한 고유 키>`

본문:

```json
{
  "instruction": "다음 주 현장 방문 일정과 홍보 초안을 준비해",
  "context": {
    "profile": {},
    "events": [],
    "complaints": [],
    "policies": []
  }
}
```

### 목록 및 상태

- `GET /agent-runs?limit=20`
- `GET /agent-runs/{runId}`
- `GET /health`

## 최초 Cloudflare 준비

아래 작업은 Cloudflare 계정에 리소스를 실제로 생성하므로 배포 직전에 한 번만 수행한다.

```powershell
npx wrangler d1 create moida-agent-queue
npx wrangler queues create moida-agent-jobs
npx wrangler queues create moida-agent-jobs-dlq
```

첫 번째 명령이 출력한 D1 `database_id`를 `wrangler.toml`의
`REPLACE_WITH_D1_DATABASE_ID` 자리에 넣는다.

그다음 스키마와 Worker를 배포한다.

```powershell
npx wrangler d1 migrations apply moida-agent-queue --remote
npx wrangler deploy
```

`OPENAI_API_KEY`는 기존 Cloudflare 암호를 그대로 사용한다. 일반 변수
`FIREBASE_API_KEY`는 Firebase 웹 설정에 공개되는 식별자로, 사용자 인증은 실제
Firebase ID 토큰 검증을 통해 처리한다.

## 로컬 개발

실제 Queue 소비 동작은 Cloudflare 리소스 연결 후 확인한다. 순수 계획 정규화,
한국어 분류, JSON 정리 및 공개 응답 변환은 `tests/agent-core.test.mjs`에서
Cloudflare 연결 없이 검증한다.
