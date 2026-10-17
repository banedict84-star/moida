# 모이다 텔레그램 봇 — 클라우드 첫 버전

운영 구조: Telegram → 기존 moida-gpt Cloudflare Worker → D1 수신함 → 매분 작업 실행 → Telegram 응답.
이 PC는 개발·배포용이며 운영 중 켜 둘 필요가 없습니다. 2026-10-18 모이다 봇(@moida_office_bot)의 실제 배포·웹훅 등록 및 소유자 관리자 연결을 완료했습니다. 비밀값은 Cloudflare Worker secrets에서 관리합니다.

## 현재 지원 범위

- 개인 대화만 수신하고 미승인 이용자는 AI와 메모 기능 이용 불가.
- 관리자 승인·차단, 의원실 코드별 업무 메모 저장·최근 10건 조회.
- 현재 입력 텍스트를 바탕으로 AI 답변·요약·초안 작성. 이전 대화 기억은 아직 없음.
- 수신함 저장 후 응답, 중복 update_id 무시, 실패 최대 4회 시도.
- 성공한 메시지 본문은 수신함에서 제거. 메모는 별도 클라우드 테이블에 유지.

파일 분석, 캘린더 연결, 자동 아침 보고, 기존 웹 비서실 계정 연결, 관리자 웹 화면은 후속 범위입니다.
같은 의원실 코드를 부여한 이용자는 메모를 공유합니다. 혼자만 볼 자료라면 서로 다른 코드를 사용해야 합니다.
처리는 매분 실행되므로 대기 시간과 모델 처리 시간이 있습니다. 전송 성공 직후 DB 기록 전에 장애가 나면 답변이 중복될 수 있습니다.
실패 4회 이후 state='failed' 건은 운영자가 점검해야 합니다. 대규모 사용 전에는 전용 Queue와 모니터링을 추가하세요.
봇 대화는 종단간 암호화 비밀대화가 아닙니다. 초기 시험은 가상 자료로 진행하고 민감 자료의 처리·보관 범위는 운영 전에 정하세요.

## 연결 순서

1. Telegram 공식 @BotFather에서 `/newbot` 실행. 표시 이름은 `모이다 봇`, 사용자명은 사용 가능한 `...bot` 형식으로 선택.
2. Cloudflare moida-gpt Worker의 비밀 설정에 아래 값을 등록. 토큰은 채팅·소스·저장소에 적지 않습니다.
   - `TELEGRAM_BOT_TOKEN`: BotFather 토큰
   - `TELEGRAM_WEBHOOK_SECRET`: 임의 생성한 32자 이상의 영문·숫자·밑줄·대시 문자열
   - `TELEGRAM_ADMIN_IDS`: 신뢰할 수 있는 관리자의 Telegram 숫자 ID, 여러 명이면 쉼표 구분
   - `OPENAI_API_KEY`: 기존 설정 활용 가능
   - 선택: `TELEGRAM_MODEL` (미설정 시 기존 AGENT_MODEL 활용)
3. 관리자 ID는 신뢰하는 별도 봇으로 조회하지 말고, 본인 토큰으로 받은 Telegram `getUpdates`의 본인 `/start` 메시지 `from.id`를 확인합니다. 웹훅 등록 전 확인하세요. 사용자명은 관리자 ID로 쓰지 않습니다.
4. Cloudflare 인증된 환경에서 DB를 백업한 뒤 `wrangler d1 migrations apply moida-agent-queue --remote` 실행.
5. `node --test tests/telegram-bot.test.mjs`와 `node --check gpt-worker.js` 실행 후 `wrangler deploy`로 배포. 기존 wrangler.toml의 매분 Cron 필요.
6. 안전한 환경 변수에 토큰·동일한 웹훅 비밀값·실제 `TELEGRAM_WEBHOOK_URL`을 설정하고 `node scripts/setup-telegram.mjs` 실행. URL은 실제 Worker 도메인의 `/telegram/webhook`입니다.
7. 관리자와 시험 이용자가 각자 봇에서 시작을 누릅니다. 관리자가 `/대기`로 번호를 확인하고 `/승인 이용자번호 의원실코드`를 보냅니다. 본인도 업무 기능 사용 시 승인해야 합니다.
8. `/메모 다음 주 간담회 자료 준비`, `/목록`, 일반 질문을 시험. 다른 의원실 이용자에게 메모가 보이지 않는지와 `/차단 이용자번호` 후 접근이 막히는지 확인.

## 참고

- Telegram Bot API: https://core.telegram.org/bots/api
- Cloudflare Wrangler: https://developers.cloudflare.com/workers/wrangler/commands/
- OpenAI Responses: https://developers.openai.com/api/docs/quickstart
