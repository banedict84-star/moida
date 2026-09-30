/* Shared, dependency-free rules. No Facebook network calls or credentials. */
(() => {
  'use strict';
  const DAY = 86400000;
  const CHECK_INTERVALS = Object.freeze([60, 180, 360, 720, 1440]);
  const hosts = new Set(['facebook.com', 'www.facebook.com', 'm.facebook.com']);
  function facebookURL(value) {
    try {
      const u = new URL(value, 'https://www.facebook.com');
      if (u.protocol !== 'https:' || !hosts.has(u.hostname) || u.username || u.password || u.port) return null;
      u.hostname = 'www.facebook.com';
      return u;
    } catch { return null; }
  }
  function profileURL(value) {
    const u = facebookURL(value);
    if (!u) return null;
    if (u.pathname === '/profile.php' && /^\d+$/.test(u.searchParams.get('id') || '')) {
      return `https://www.facebook.com/profile.php?id=${u.searchParams.get('id')}`;
    }
    const match = u.pathname.match(/^\/([\w.-]+)\/?$/);
    if (!match || /^(home\.php|profile\.php|permalink\.php|story\.php|photo\.php|reel|reels|watch|groups|pages|share|login|checkpoint|settings|photo|photos|marketplace|gaming|notifications|friends|help|privacy|policies|search)$/i.test(match[1])) return null;
    return `https://www.facebook.com/${match[1].toLowerCase()}`;
  }
  function postURL(value) {
    const u = facebookURL(value);
    if (!u || u.searchParams.has('comment_id') || u.searchParams.has('reply_comment_id')) return null;
    let m = u.pathname.match(/^\/([\w.-]+)\/posts\/([\w]+)\/?$/);
    if (m) return { id: `post:${m[2]}`, url: `https://www.facebook.com/${m[1]}/posts/${m[2]}` };
    m = u.pathname.match(/^\/(?:[\w.-]+\/)?(?:reel|videos)\/(\d+)\/?$/);
    if (m) return { id: `video:${m[1]}`, url: `https://www.facebook.com${u.pathname.replace(/\/$/, '')}/` };
    if (/^\/(permalink|story)\.php$/.test(u.pathname)) {
      const id = u.searchParams.get('story_fbid');
      const owner = u.searchParams.get('id');
      if (id && /^[\w]+$/.test(id) && /^\d+$/.test(owner || '')) return { id: `post:${id}`, url: `https://www.facebook.com/permalink.php?story_fbid=${id}&id=${owner}` };
    }
    return null;
  }
  // A range is used because labels such as "1시간" are rounded, not exact times.
  function dateRange(label, now = Date.now()) {
    let s = String(label || '').replace(/[\u200b-\u200f\u202a-\u202e\ufeff]/g, '').trim();
    if (!s) return null;
    if (/^(just now|방금|방금 전)$/i.test(s)) return { min: now - 120000, max: now, label: s };
    let m = s.match(/^(?:약\s*)?(\d+)\s*(초|분|시간|일|주)(?:\s*전)?$/);
    let n, unit;
    if (m) { n = Number(m[1]); unit = ({ 초: 1000, 분: 60000, 시간: 3600000, 일: DAY, 주: DAY * 7 })[m[2]]; }
    else {
      m = s.match(/^(?:about\s+)?(\d+)\s*(s|m|h|d|w|seconds?|minutes?|hours?|days?|weeks?)(?:\s+ago)?$/i);
      if (m) { n = Number(m[1]); unit = ({ s: 1000, m: 60000, h: 3600000, d: DAY, w: DAY * 7 })[m[2][0].toLowerCase()]; }
    }
    if (unit) {
      const range = { min: now - (n + 1) * unit, max: Math.min(now, now - Math.max(0, n - 1) * unit), label: s };
      // Baseline detection keeps its original conservative bounds. For ordering,
      // "1일 전" denotes a completed day, not a post from the current hour.
      if (!/^(약|about)\s*/i.test(s)) {
        range.orderMin = now - (n + 1) * unit + 1;
        range.orderMax = now - n * unit;
      }
      return range;
    }
    const kst = new Date(now + 9 * 3600000);
    const thisYear = kst.getUTCFullYear();
    m = s.match(/^(?:(\d{4})년\s*)?(\d{1,2})월\s*(\d{1,2})일/);
    if (m) {
      let year = Number(m[1] || thisYear);
      const month = Number(m[2]), day = Number(m[3]);
      if (month < 1 || month > 12 || day < 1 || day > 31) return null;
      let start = Date.UTC(year, month - 1, day) - 9 * 3600000;
      if (!m[1] && start > now + DAY) { year--; start = Date.UTC(year, month - 1, day) - 9 * 3600000; }
      const check = new Date(start + 9 * 3600000);
      if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
      const clock = s.match(/(오전|오후)\s*(\d{1,2}):(\d{2})/);
      if (clock) {
        const h = Number(clock[2]), minute = Number(clock[3]);
        if (h < 1 || h > 12 || minute > 59) return null;
        start += ((h % 12) + (clock[1] === '오후' ? 12 : 0)) * 3600000 + minute * 60000;
        return { min: start, max: start + 59999, label: s };
      }
      return { min: start, max: start + DAY - 1, label: s };
    }
    // Unknown formats remain review-only; never guess a creation time.
    return null;
  }
  function reactionState(buttons) {
    const selected = buttons.filter(b => (b.pressed === 'true' && /^(좋아요|like)$/i.test(b.label || '')) || /좋아요\s*(?:취소|삭제)|공감\s*(?:취소|변경)|취소.*공감|remove (?:like|reaction)|^unlike$|^liked$|^you reacted/i.test(b.label || ''));
    if (selected.length) return { state: 'reacted', button: null };
    const candidates = buttons.filter(b => /^(좋아요|like)$/i.test((b.label || '').trim()) && !b.disabled);
    return candidates.length === 1 ? { state: 'available', button: candidates[0] } : { state: 'unknown', button: null };
  }
  function classify(post, baselineAt, existing) {
    if (existing && ['baseline', 'old', 'done', 'already', 'skipped', 'attempting', 'uncertain'].includes(existing.status)) return existing.status;
    if (!baselineAt) return 'baseline';
    if (post.reaction === 'reacted') return 'already';
    if (!post.range) return 'review';
    if (post.range.max <= baselineAt) return 'old';
    if (post.range.min <= baselineAt || post.reaction !== 'available') return 'review';
    return 'new';
  }
  function latestPost(posts) {
    const unique = [...new Map(posts.map(p => [p.id, p])).values()];
    const dated = unique.map(post => ({ post, min: post.range?.orderMin ?? post.range?.min, max: post.range?.orderMax ?? post.range?.max }));
    if (!dated.length || dated.some(p => !Number.isFinite(p.min) || !Number.isFinite(p.max) || p.min > p.max)) return null;
    dated.sort((a, b) => b.min - a.min);
    const latest = dated[0];
    // DOM order may place an old pinned post first. Overlapping times do not prove order.
    return dated.slice(1).every(p => latest.min > p.max) ? latest.post : null;
  }
  function canReact(post, baselineAt, intent = 'new') {
    if (intent === 'new') return classify(post, baselineAt) === 'new';
    return intent === 'latest' && post.reaction === 'available' && !!latestPost([post]);
  }
  function mergeScan(state, target, posts, startedAt, finishedAt) {
    const first = !target.baselineAt;
    const totals = { baseline: 0, new: 0, review: 0, old: 0, already: 0, seen: 0 };
    for (const p of posts) {
      const key = `${target.id}|${p.id}`;
      const prev = state.posts[key];
      const status = first ? 'baseline' : classify(p, target.baselineAt, prev);
      state.posts[key] = { ...prev, ...p, key, targetId: target.id, targetName: target.name, status,
        firstSeenAt: prev?.firstSeenAt || finishedAt, lastSeenAt: finishedAt };
      totals[status] = (totals[status] || 0) + 1;
      totals.seen++;
    }
    // An empty or failed scan cannot initialize a profile.
    if (first && posts.length) target.baselineAt = startedAt;
    target.lastScanAt = finishedAt;
    target.lastCount = posts.length;
    return totals;
  }
  function defaultState() {
    return { schema: 1, settings: { actorName: '장윤정', actorUrl: 'https://www.facebook.com/jang.yunjeong.487238', dailyEnabled: false, checkIntervalMinutes: 1440, autoLike: false, maxPerRun: 10 },
      targets: [{ id: 'daeho.hwang.3', name: '황대호', url: 'https://www.facebook.com/daeho.hwang.3', enabled: true, baselineAt: null }],
      removedTargets: [], posts: {}, events: [], job: null, lastRunAt: null };
  }
  globalThis.NewPostsCore = Object.freeze({ CHECK_INTERVALS, facebookURL, profileURL, postURL, dateRange, reactionState, classify, latestPost, canReact, mergeScan, defaultState });
})();
