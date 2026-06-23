# 매일 아침 카카오톡 브리핑

매일 아침 7시(KST), **오늘 일정 + 관련 기사**를 정리해서 **내 카카오톡("나에게 보내기")** 으로 보내줍니다.
GitHub Actions(cron)로 자동 실행되며, 카카오 공식 메시지 API를 쓰기 때문에 **계정 정지 위험이 없습니다.**

```
매일 07:00 KST ─▶ GitHub Actions ─▶ briefing.mjs
                                       ├─ 네이버 뉴스 API (오늘 관련 기사)
                                       ├─ (선택) Firestore (오늘 일정)
                                       └─ 카카오 "나에게 보내기" ─▶ 내 카톡
```

---

## 설정 순서

### 1) 카카오 디벨로퍼스 — "나에게 보내기" 준비
1. https://developers.kakao.com → **내 애플리케이션 → 애플리케이션 추가**
2. **앱 키 → REST API 키** 복사 → GitHub Secret `KAKAO_REST_API_KEY`
3. **카카오 로그인 → 활성화 ON**, **Redirect URI**에 `https://localhost` 등록
4. **동의항목 → 카카오톡 메시지 전송(`talk_message`)** 사용 설정
5. **리프레시 토큰 1회 발급** (아래 참고) → GitHub Secret `KAKAO_REFRESH_TOKEN`

#### 리프레시 토큰 발급 (1회만)
브라우저 주소창에 아래 입력 (REST_API_KEY 교체):
```
https://kauth.kakao.com/oauth/authorize?client_id=REST_API_KEY&redirect_uri=https://localhost&response_type=code&scope=talk_message
```
→ 동의 후 이동된 주소의 `code=...` 값을 복사. 이어서 터미널에서:
```bash
curl -X POST "https://kauth.kakao.com/oauth/token" \
  -d "grant_type=authorization_code" \
  -d "client_id=REST_API_KEY" \
  -d "redirect_uri=https://localhost" \
  -d "code=방금복사한코드"
```
응답의 **`refresh_token`** 값을 `KAKAO_REFRESH_TOKEN` 시크릿에 저장. (리프레시 토큰은 약 2달 유효, 만료 시 위 과정 1회 반복)

### 2) 네이버 검색 API — 기사 가져오기
1. https://developers.naver.com/apps → **애플리케이션 등록**, **검색 API** 추가
2. **Client ID / Secret** → GitHub Secret `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`

### 3) GitHub 시크릿/변수 등록
저장소 **Settings → Secrets and variables → Actions**

**Secrets** (민감정보):
| 이름 | 값 |
|---|---|
| `KAKAO_REST_API_KEY` | 카카오 REST API 키 |
| `KAKAO_REFRESH_TOKEN` | 위에서 받은 리프레시 토큰 |
| `NAVER_CLIENT_ID` | 네이버 Client ID |
| `NAVER_CLIENT_SECRET` | 네이버 Client Secret |
| `FIREBASE_SERVICE_ACCOUNT` | (선택) 일정 연동 시, 서비스 계정 JSON 전체 |

**Variables** (비민감):
| 이름 | 값 |
|---|---|
| `BRIEFING_KEYWORDS` | 예: `장윤정 의원` (쉼표로 여러 개) |
| `BRIEFING_UID` | (선택) 일정 읽을 moida 사용자 uid |

### 4) (선택) 일정 연동 — Firestore 읽기
1. Firebase 콘솔 → **프로젝트 설정 → 서비스 계정 → 새 비공개 키 생성** → 받은 JSON 전체를 `FIREBASE_SERVICE_ACCOUNT` 시크릿에 붙여넣기
2. moida에서 내 `uid` 확인 후 `BRIEFING_UID` 변수에 입력
   - 미설정 시 일정 줄은 "(일정 연동 미설정)"으로 표시되고 뉴스만 발송됩니다.

---

## 테스트 / 실행
- **수동 테스트**: 저장소 **Actions → Daily Briefing → Run workflow**, `dry_run`을 `1`로 주면 **발송 없이 미리보기**(로그에서 결과 확인). `0`이면 실제 발송.
- **로컬 미리보기**: `cd briefing && DRY_RUN=1 NAVER_CLIENT_ID=.. NAVER_CLIENT_SECRET=.. BRIEFING_KEYWORDS="장윤정 의원" node briefing.mjs`
- **발송 시각 변경**: `.github/workflows/daily-briefing.yml`의 `cron` 수정 (UTC 기준, KST = UTC+9). 예) 08:00 KST → `0 23 * * *`

## 동작 메모
- 카카오 텍스트 메시지 200자 한계 때문에 브리핑이 길면 **여러 개로 나눠** 발송됩니다.
- 뉴스는 **오늘자 + 키워드 핵심어 포함** 기사만 최대 5건 추립니다. 동명이인·명단성 기사가 섞이면 `BRIEFING_KEYWORDS`를 더 구체적으로(예: `경기도의회 장윤정`) 조정하세요.
