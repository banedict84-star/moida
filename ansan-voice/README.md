# 안산의 목소리 · 시민 이슈맵 (독립 사이트)

MOIDA 플랫폼과 **분리된 독립 정적 사이트**입니다. 이 폴더 하나가 곧 사이트 루트이며, 외부 빌드·서버 없이 동작합니다.

## 구성
- `index.html` — 이슈맵 페이지(단독, 자체 완결). 안산 단원구·상록구·대부도 SVG 지도 + 분야 필터 + 현안 목록 + 제보 폼
- `ansan_issues_data.json` — 현안 데이터(샘플 16건). 이 파일만 교체하면 내용이 바뀝니다.

페이지는 `ansan_issues_data.json`을 먼저 불러오고, 실패하면 `index.html` 내장 데이터로 자동 폴백합니다.

## 로컬에서 보기
```bash
cd ansan-voice
python3 -m http.server 8000
# http://localhost:8000  접속
```
> `file://`로 직접 열면 JSON fetch가 막혀 내장 샘플로만 표시됩니다. 데이터 파일까지 쓰려면 위처럼 http로 띄우세요.

## 별도 배포 (MOIDA main 과 무관하게)
이 폴더만 독립 호스팅하면 됩니다. 택1:
- **Cloudflare Pages / Netlify / Vercel** — 빌드 명령 없음, 배포 디렉터리를 `ansan-voice`로 지정
- **별도 GitHub 저장소** — 폴더 내용을 새 repo에 올리고 Pages 활성화
- **현재 repo의 다른 브랜치를 Pages 소스로** — Settings → Pages 에서 소스 브랜치/폴더 지정

## 데이터 교체
`ansan_issues_data.json`의 `issues` 배열을 실제 현안으로 바꾸면 됩니다.
- `category` 키: traffic·env·welfare·edu·safety·housing·culture·economy
- `status`: 접수 / 검토중 / 진행중 / 해결
- `x`,`y`: 지도 위 핀 위치(%, 0~100 / 좌상단 기준)
