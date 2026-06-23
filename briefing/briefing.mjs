// 매일 아침 카카오톡 "나에게 보내기" 브리핑
// 일정(moida) + 오늘 관련 기사(네이버 뉴스) → 카카오톡으로 발송
//
// 필요한 환경변수(GitHub Secrets/Variables):
//   KAKAO_REST_API_KEY     카카오 디벨로퍼스 REST API 키
//   KAKAO_REFRESH_TOKEN    카카오 로그인으로 1회 발급받은 리프레시 토큰(talk_message 동의)
//   NAVER_CLIENT_ID        네이버 검색 API Client ID
//   NAVER_CLIENT_SECRET    네이버 검색 API Client Secret
//   BRIEFING_KEYWORDS      기사 검색 키워드(쉼표 구분). 기본 "장윤정 의원"
//   FIREBASE_SERVICE_ACCOUNT (선택) 서비스 계정 JSON 문자열 → 있으면 일정도 포함
//   BRIEFING_UID           (선택) moida 사용자 uid (일정 읽기용)
//
// 테스트: DRY_RUN=1 이면 카톡 발송 없이 콘솔에 브리핑만 출력

const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY || '';
const KAKAO_REFRESH_TOKEN = process.env.KAKAO_REFRESH_TOKEN || '';
const NAVER_ID = process.env.NAVER_CLIENT_ID || '';
const NAVER_SECRET = process.env.NAVER_CLIENT_SECRET || '';
const KEYWORDS = (process.env.BRIEFING_KEYWORDS || '장윤정 의원').split(',').map(s => s.trim()).filter(Boolean);
const DRY_RUN = process.env.DRY_RUN === '1' || process.argv.includes('--dry');
const KAKAO_TEXT_LIMIT = 190; // 카카오 텍스트 템플릿 200자 한계 대비 여유

const DOWS = ['일', '월', '화', '수', '목', '금', '토'];

function kstNow() {
  const k = new Date(Date.now() + 9 * 3600 * 1000);
  const y = k.getUTCFullYear(), m = k.getUTCMonth() + 1, d = k.getUTCDate();
  return { ymd: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, md: `${m}/${d}`, dow: DOWS[k.getUTCDay()] };
}

function stripHtml(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// 기사의 발행일(KST)이 오늘인지
function isTodayKST(pubDate, todayYmd) {
  const t = new Date(pubDate);
  if (isNaN(t)) return false;
  const k = new Date(t.getTime() + 9 * 3600 * 1000);
  const ymd = `${k.getUTCFullYear()}-${String(k.getUTCMonth() + 1).padStart(2, '0')}-${String(k.getUTCDate()).padStart(2, '0')}`;
  return ymd === todayYmd;
}

async function fetchNews(today) {
  if (!NAVER_ID || !NAVER_SECRET) { console.warn('네이버 API 키 없음 → 뉴스 생략'); return []; }
  const seen = new Set();
  const out = [];
  for (const kw of KEYWORDS) {
    const core = kw.split(/\s+/)[0]; // 핵심 토큰(예: "장윤정")으로 관련성 필터
    const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(kw)}&display=20&sort=date`;
    try {
      const r = await fetch(url, { headers: { 'X-Naver-Client-Id': NAVER_ID, 'X-Naver-Client-Secret': NAVER_SECRET } });
      if (!r.ok) { console.warn('네이버 응답 오류', r.status, await r.text()); continue; }
      const j = await r.json();
      for (const it of (j.items || [])) {
        const title = stripHtml(it.title);
        const desc = stripHtml(it.description);
        const key = title.slice(0, 30);
        if (seen.has(key)) continue;
        if (!isTodayKST(it.pubDate, today.ymd)) continue;           // 오늘 기사만
        if (core && !(title.includes(core) || desc.includes(core))) continue; // 관련성
        seen.add(key);
        out.push({ title, desc, link: it.originallink || it.link });
      }
    } catch (e) { console.warn('뉴스 검색 실패', kw, e.message); }
  }
  return out.slice(0, 5); // 최대 5건
}

async function fetchSchedule(today) {
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  const uid = process.env.BRIEFING_UID;
  if (!sa || !uid) return null; // 미설정 시 일정 생략
  try {
    const admin = (await import('firebase-admin')).default;
    if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(JSON.parse(sa)) });
    const snap = await admin.firestore().collection('moida_users').doc(uid).get();
    if (!snap.exists) return [];
    const events = JSON.parse(snap.data().events || '[]');
    return events
      .filter(e => e && e.date === today.ymd)
      .sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
  } catch (e) { console.warn('일정 읽기 실패', e.message); return null; }
}

function buildBriefing(today, schedule, news) {
  const lines = [];
  lines.push(`🌅 아침 브리핑 · ${today.ymd.replace(/-/g, '.')} (${today.dow})`);
  lines.push('');
  lines.push('📅 오늘 일정');
  if (schedule === null) lines.push(' (일정 연동 미설정)');
  else if (schedule.length === 0) lines.push(' 등록된 일정 없음');
  else for (const e of schedule) lines.push(` ${e.time || ''} ${e.title}${e.star ? ' ⭐' : ''}`.trim());
  lines.push('');
  lines.push(`📰 오늘의 관련 기사 (${news.length}건)`);
  if (news.length === 0) lines.push(' 오늘자 관련 기사 없음');
  else news.forEach((n, i) => { lines.push(`${i + 1}. ${n.title}`); if (n.link) lines.push(n.link); });
  return lines.join('\n');
}

// 200자 한계 → 줄 단위로 여러 메시지로 분할
function chunk(text, limit) {
  const blocks = [];
  let cur = '';
  for (const line of text.split('\n')) {
    if ((cur + '\n' + line).length > limit && cur) { blocks.push(cur); cur = line; }
    else cur = cur ? cur + '\n' + line : line;
  }
  if (cur) blocks.push(cur);
  // 한 줄이 한계를 넘는 경우(긴 URL 등) 강제로 잘라 한계 초과 방지
  const safe = [];
  for (const b of blocks) {
    if (b.length <= limit) { safe.push(b); continue; }
    for (let i = 0; i < b.length; i += limit) safe.push(b.slice(i, i + limit));
  }
  return safe;
}

async function kakaoAccessToken() {
  const body = new URLSearchParams({ grant_type: 'refresh_token', client_id: KAKAO_REST_API_KEY, refresh_token: KAKAO_REFRESH_TOKEN });
  const r = await fetch('https://kauth.kakao.com/oauth/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('카카오 토큰 갱신 실패: ' + JSON.stringify(j));
  return j.access_token;
}

async function sendKakaoMemo(token, text) {
  const template = { object_type: 'text', text, link: { web_url: 'https://search.naver.com', mobile_web_url: 'https://search.naver.com' } };
  const r = await fetch('https://kapi.kakao.com/v2/api/talk/memo/default/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'template_object=' + encodeURIComponent(JSON.stringify(template))
  });
  const j = await r.json().catch(() => ({}));
  if (j.result_code !== 0) throw new Error('카카오 발송 실패: ' + JSON.stringify(j));
}

async function main() {
  const today = kstNow();
  const [schedule, news] = await Promise.all([fetchSchedule(today), fetchNews(today)]);
  const briefing = buildBriefing(today, schedule, news);

  console.log('──── 브리핑 미리보기 ────\n' + briefing + '\n─────────────────────');

  if (DRY_RUN) { console.log('DRY_RUN: 발송 생략'); return; }
  if (!KAKAO_REST_API_KEY || !KAKAO_REFRESH_TOKEN) throw new Error('카카오 키/리프레시 토큰 미설정');

  const token = await kakaoAccessToken();
  const parts = chunk(briefing, KAKAO_TEXT_LIMIT);
  for (let i = 0; i < parts.length; i++) {
    await sendKakaoMemo(token, parts[i]);
    if (i < parts.length - 1) await new Promise(r => setTimeout(r, 600));
  }
  console.log(`발송 완료: ${parts.length}개 메시지`);
}

main().catch(e => { console.error(e); process.exit(1); });
