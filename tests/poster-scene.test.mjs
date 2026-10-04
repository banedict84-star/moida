import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handlePosterScene, validateInput, validateScene, expirePosterScenes } from '../poster-scene.js';
import worker from '../gpt-worker.js';
const origin = 'https://yoonjung-ai-office.benedict.chatgpt.site';
const input = () => ({ schemaVersion: 1, consentToAI: true, facts: { event: '주민 간담회', date: '2026-10-04', place: '회의실', details: '' }, approvedFooter: '승인된 문구', ratio: '4:5', photos: [{ id: 'p1', width: 1, height: 1, mimeType: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6rH0AAAAASUVORK5CYII=' }] });
const scene = () => ({ title: '현장의 목소리를 듣다', subtitle: '주민 간담회', layout: 'single', photos: [{ id: 'p1', focal: { x: 0.3, y: 0.4 }, crop: { x: 0, y: 0, width: 1, height: 1 }, reason: '모든 피사체 보존' }], warnings: [] });
function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../migrations/0004_poster_scene.sql', import.meta.url), 'utf8'));
  const db = { prepare(sql) { const stmt = sqlite.prepare(sql); return { bind(...values) { return { async run() { return stmt.run(...values); }, async first() { return stmt.get(...values); } }; } }; } };
  let calls = 0, uid = 'user-1', output = scene();
  const env = { POSTER_SCENE_ENABLED: 'true', POSTER_SCENE_ORIGINS: origin, POSTER_SCENE_USER_IDS: 'user-1,user-2', GEMINI_API_KEY: 'test-only', AGENT_DB: db };
  const deps = { async verifyUser() { return { uid }; }, async generate(_env, path, body) { calls++; assert.equal(path, 'models/gemini-2.5-flash:generateContent'); assert.equal(body.contents[0].parts[2].inlineData.data, input().photos[0].data); return { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(output) }] } }] }; }, usage: () => ({ total_tokens: 20 }), async recordUsage() {} };
  const req = (body = input(), key = 'request_key_123456', path = '/poster-scene', method = 'POST', extra = {}) => new Request(`https://worker.example${path}`, { method, headers: { Origin: origin, Authorization: 'Bearer test', 'Content-Type': 'application/json', 'Idempotency-Key': key, ...extra }, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) });
  return { env, deps, req, sqlite, calls: () => calls, user: v => uid = v, output: v => output = v, run: r => handlePosterScene(r, env, deps) };
}
test('successful multimodal scene preserves facts/footer and replays with exactly one charge', async () => {
  const f = fixture(); const a = await f.run(f.req()); const body = await a.json();
  assert.equal(a.status, 200); assert.equal(body.status, 'succeeded'); assert.equal(body.scene.approvedFooter, input().approvedFooter); assert.equal(body.scene.date, input().facts.date);
  const b = await f.run(f.req()); assert.deepEqual(await b.json(), body); assert.equal(f.calls(), 1);
  const modified = input(); modified.facts.event = '다른 행사'; assert.equal((await f.run(f.req(modified))).status, 409); assert.equal(f.calls(), 1);
});
test('disabled, untrusted origin, unauthenticated and unauthorized requests never call AI', async () => {
  const f = fixture(); f.env.POSTER_SCENE_ENABLED = 'false'; assert.equal((await f.run(f.req())).status, 503);
  f.env.POSTER_SCENE_ENABLED = 'true'; assert.equal((await f.run(f.req(undefined, undefined, undefined, undefined, { Origin: 'https://evil.example' }))).status, 403);
  assert.equal((await f.run(f.req(undefined, undefined, undefined, undefined, { Authorization: '' }))).status, 401);
  f.user('outsider'); assert.equal((await f.run(f.req())).status, 403); assert.equal(f.calls(), 0);
});
test('job ownership applies to reads and cancellation', async () => {
  const f = fixture(); const body = await (await f.run(f.req())).json(); f.user('user-2');
  assert.equal((await f.run(f.req(undefined, undefined, `/poster-scene/${body.jobId}`, 'GET'))).status, 404);
  assert.equal((await f.run(f.req({}, undefined, `/poster-scene/${body.jobId}/cancel`))).status, 404);
});
test('invalid AI output fails visibly without template fallback or second charge', async () => {
  const f = fixture(); const output = scene(); output.photos[0].id = 'invented'; f.output(output);
  const response = await f.run(f.req()); assert.equal(response.status, 502); const body = await response.json(); assert.equal(body.error.code, 'INVALID_AI_SCENE'); assert.equal(body.scene, undefined);
  await f.run(f.req()); assert.equal(f.calls(), 1);
});
test('locked crop wins, unknown URLs/HTML properties are not reflected', () => {
  const body = input(); body.photos[0].cropLocked = true; body.photos[0].crop = { x: 0.1, y: 0.2, width: 0.5, height: 0.5 };
  const output = scene(); output.photos[0].url = 'https://evil.example'; output.html = '<script>'; output.approvedFooter = 'invented';
  const parsed = validateScene(output, validateInput(body)); assert.deepEqual(parsed.photos[0].crop, body.photos[0].crop); assert.equal(parsed.photos[0].url, undefined); assert.equal(parsed.html, undefined); assert.equal(parsed.approvedFooter, body.approvedFooter);
});
test('daily limit is atomic and replay does not consume new quota', async () => {
  const f = fixture(); for (let n = 0; n < 10; n++) assert.equal((await f.run(f.req(input(), `request_key_1234_${n}`))).status, 200);
  assert.equal((await f.run(f.req(input(), 'request_key_1234_10'))).status, 429); assert.equal((await f.run(f.req(input(), 'request_key_1234_0'))).status, 200); assert.equal(f.calls(), 10);
});
test('in-flight duplicate returns pending, cancellation stays terminal', async () => {
  const f = fixture(); let release, entered; const ready = new Promise(r => entered = r); const hold = new Promise(r => release = r); const generate = f.deps.generate;
  f.deps.generate = async (...args) => { entered(); await hold; return generate(...args); };
  const first = f.run(f.req()); await ready;
  const duplicate = await f.run(f.req()); assert.equal(duplicate.status, 202); const pending = await duplicate.json();
  const cancelled = await (await f.run(f.req({}, undefined, `/poster-scene/${pending.jobId}/cancel`))).json(); assert.equal(cancelled.status, 'cancelled');
  release(); const done = await (await first).json(); assert.equal(done.status, 'cancelled'); assert.equal(done.scene, undefined); assert.equal(f.calls(), 1);
});
test('invalid inputs reject consent, excessive photos, duplicate ids, URLs and out-of-range crop', () => {
  for (const mutate of [b => b.consentToAI = false, b => b.photos = [], b => b.photos.push(b.photos[0]), b => b.photos[0].data = 'https://example.com/photo.jpg', b => { b.photos[0].cropLocked = true; b.photos[0].crop = { x: 0.5, y: 0, width: 1, height: 1 }; }]) {
    const b = input(); mutate(b); assert.throws(() => validateInput(b));
  }
});
test('provider errors are sanitized and failed idempotency keys do not retry', async () => {
  const f = fixture(); f.deps.generate = async () => { throw new Error('secret-key-photo-content'); };
  const a = await f.run(f.req()); assert.equal(a.status, 502); assert.doesNotMatch(await a.text(), /secret-key-photo-content/);
  const b = await f.run(f.req()); assert.equal((await b.json()).status, 'failed');
});
test('real Worker routing cannot fall through to unauthenticated legacy proxy', async () => {
  const f = fixture(); const old = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('No external calls allowed'); };
  try {
    assert.equal((await worker.fetch(f.req(), {})).status, 403);
    assert.equal((await worker.fetch(f.req(undefined, undefined, undefined, 'OPTIONS'), f.env)).status, 204);
    assert.equal((await worker.fetch(f.req(undefined, undefined, '/poster-scene/unknown'), f.env)).status, 401);
  } finally { globalThis.fetch = old; }
});
test('three-photo ordering is preserved and all source ids are required exactly once', () => {
  const body = input(); body.photos = ['p1', 'p2', 'p3'].map(id => ({ ...body.photos[0], id }));
  const output = scene(); output.layout = 'hero-grid'; output.photos = ['p3', 'p1', 'p2'].map(id => ({ ...output.photos[0], id }));
  assert.deepEqual(validateScene(output, validateInput(body)).photos.map(p => p.id), ['p3', 'p1', 'p2']);
  output.photos[2].id = 'p1'; assert.throws(() => validateScene(output, validateInput(body)), /INVALID_AI_SCENE/);
});
test('oversized requests never reach provider and stale jobs become terminal without retry', async () => {
  const f = fixture(); const oversized = f.req(undefined, undefined, undefined, undefined, { 'Content-Length': '5000000' });
  assert.equal((await f.run(oversized)).status, 413); assert.equal(f.calls(), 0);
  const body = await (await f.run(f.req())).json();
  f.sqlite.prepare("UPDATE poster_scene_jobs SET status='pending', result_json=NULL, created_at=? WHERE id=?").run(Date.now() - 180000, body.jobId);
  const stale = await (await f.run(f.req(undefined, undefined, `/poster-scene/${body.jobId}`, 'GET'))).json();
  assert.equal(stale.status, 'failed'); assert.equal(stale.error.code, 'INTERRUPTED'); assert.equal(f.calls(), 1);
});
test('actual Worker authenticates, calls Gemini with images, and records token usage without photo storage', async () => {
  const f = fixture(); f.env.FIREBASE_API_KEY = 'public-test-config';
  f.sqlite.exec(readFileSync(new URL('../migrations/0002_ai_usage.sql', import.meta.url), 'utf8'));
  const old = globalThis.fetch; const urls = [];
  globalThis.fetch = async (url, options) => {
    urls.push(String(url));
    if (String(url).includes('identitytoolkit')) return Response.json({ users: [{ localId: 'user-1' }] });
    assert.equal(JSON.parse(options.body).contents[0].parts[2].inlineData.mimeType, 'image/png');
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(scene()) }] } }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50, totalTokenCount: 150 } });
  };
  try {
    const response = await worker.fetch(f.req(), f.env); assert.equal(response.status, 200); assert.equal((await response.json()).status, 'succeeded');
    assert.equal(urls.length, 2); assert.match(urls[1], /models\/gemini-2.5-flash:generateContent$/);
    assert.equal(f.sqlite.prepare('SELECT total_tokens FROM ai_usage_events').get().total_tokens, 150);
    const stored = JSON.stringify(f.sqlite.prepare('SELECT * FROM poster_scene_jobs').all());
    assert.doesNotMatch(stored, /iVBOR|Bearer|test-only/);
  } finally { globalThis.fetch = old; }
});

test('seven-day retention is opt-in, removes scene content and keeps idempotency tombstone', async () => {
  const f = fixture(); const result = await (await f.run(f.req())).json();
  const now = Date.now();
  f.sqlite.prepare('UPDATE poster_scene_jobs SET created_at=? WHERE id=?').run(now - 7 * 86400000, result.jobId);
  await expirePosterScenes(f.env, now);
  assert.notEqual(f.sqlite.prepare('SELECT result_json FROM poster_scene_jobs').get().result_json, null);
  f.env.POSTER_SCENE_RETENTION_DAYS = '7';
  await expirePosterScenes(f.env, now);
  const row = f.sqlite.prepare('SELECT * FROM poster_scene_jobs').get();
  assert.equal(row.result_json, null); assert.equal(row.error_code, 'RESULT_EXPIRED');
  assert.equal(row.status, 'failed'); assert.equal(row.id, result.jobId);
  const replay = await (await f.run(f.req())).json();
  assert.equal(replay.error.code, 'RESULT_EXPIRED'); assert.equal(replay.scene, undefined); assert.equal(f.calls(), 1);
});

test('one-attempt trial limit persists beyond day rollover and permits replay only', async () => {
  const f = fixture(); f.env.POSTER_SCENE_TOTAL_LIMIT = '1';
  const first = await (await f.run(f.req())).json(); assert.equal(first.status, 'succeeded');
  f.sqlite.prepare('UPDATE poster_scene_jobs SET created_at=?').run(Date.now() - 2 * 86400000);
  const next = await f.run(f.req(input(), 'another_request_key')); assert.equal(next.status, 429);
  assert.equal((await next.json()).error.code, 'TRIAL_LIMIT');
  assert.equal((await (await f.run(f.req())).json()).jobId, first.jobId); assert.equal(f.calls(), 1);
});
