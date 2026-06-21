// MOIDA 뉴스 백그라운드 수집기 (Service Worker)
// 페이지를 떠나도 수집을 끝까지 진행하고 결과를 캐시에 저장 → 돌아오면 표시
const CACHE = 'moida-news-v1';
const NAVER_PROXY = 'https://moida-news.banedict84.workers.dev';
const GPROXY = (u) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u);

self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// 페이지에서 검색 요청을 받으면 백그라운드로 수집 (waitUntil로 페이지 이탈 후에도 완료 보장)
self.addEventListener('message', (e) => {
  const data = e.data || {};
  if (data.type === 'search' && data.q) {
    e.waitUntil(doSearch(data.q));
  }
});

async function doSearch(q) {
  q = (q || '').trim();
  if (!q) return;
  let items = [];
  try { items = await collect(q); } catch (err) { items = []; }
  const payload = { q, items, ts: Date.now(), status: 'done' };
  try {
    const c = await caches.open(CACHE);
    await c.put('news-result', new Response(JSON.stringify(payload), { headers: { 'Content-Type': 'application/json' } }));
  } catch (e) {}
  // 열려 있는 페이지가 있으면 즉시 알림
  const cls = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
  cls.forEach((c) => c.postMessage({ type: 'news-result', payload }));
}

async function collect(q) {
  const res = await Promise.all([naver(q).catch(() => []), google(q).catch(() => [])]);
  const merged = [], seen = {};
  const max = Math.max(...res.map((a) => a.length), 0);
  for (let i = 0; i < max; i++) {
    for (const arr of res) {
      const n = arr[i]; if (!n) continue;
      const key = (n.title || '').replace(/[^0-9a-z가-힣]/gi, '').slice(0, 40);
      if (!key || seen[key]) continue;
      seen[key] = 1; merged.push(n);
    }
  }
  merged.sort((a, b) => dnum(b.date) - dnum(a.date));
  return merged.slice(0, 40);
}
function dnum(d) { return d ? +(String(d).replace(/[^0-9]/g, '')) : 0; }

async function naver(q) {
  const r = await fetch(NAVER_PROXY + '/?q=' + encodeURIComponent(q));
  if (!r.ok) return [];
  const d = await r.json();
  return (d && d.items) || [];
}
async function google(q) {
  const rss = 'https://news.google.com/rss/search?q=' + encodeURIComponent(q) + '&hl=ko&gl=KR&ceid=KR:ko';
  const r = await fetch(GPROXY(rss));
  if (!r.ok) return [];
  return parseRss(await r.text());
}
function parseRss(xml) {
  const out = [];
  const blocks = xml.split(/<item>/i).slice(1, 21);
  for (const blk of blocks) {
    const g = (t) => { const m = blk.match(new RegExp('<' + t + '[^>]*>([\\s\\S]*?)<\\/' + t + '>', 'i')); return m ? m[1] : ''; };
    let title = decode(strip(g('title')));
    let link = decode(strip(g('link')));
    let src = decode(strip(g('source')));
    if (src && title.endsWith(' - ' + src)) title = title.slice(0, -(src.length + 3));
    else if (!src && title.includes(' - ')) { const p = title.split(' - '); src = p.pop(); title = p.join(' - '); }
    let desc = decode(strip(g('description')).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    let date = fmtDate(strip(g('pubDate')));
    if (title && link) out.push({ source: 'google', press: src || '뉴스', date, title, snippet: (desc || title).slice(0, 160), url: link });
  }
  return out;
}
function strip(s) { return (s || '').replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '').trim(); }
function decode(s) { return (s || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&'); }
function fmtDate(s) { const d = new Date(s); return isNaN(d) ? '' : d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0'); }
