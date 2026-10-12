import test from "node:test";
import assert from "node:assert/strict";
import worker from "../gpt-worker.js";

const originalFetch = globalThis.fetch;

function usageDb(rows, dailyRows) {
  return {
    prepare(sql) {
      return {
        bind() {
          return {
            async all() {
              return { results: sql.includes("GROUP BY day, model") ? dailyRows : rows };
            },
          };
        },
      };
    },
  };
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("기존 Gemini 사용 기록도 현재 공개 단가로 다시 계산한다", async () => {
  globalThis.fetch = async () => Response.json({
    users: [{ localId: "member-1", email: "member@example.com" }],
  });
  const rows = [
    {
      model: "gemini-3.6-flash",
      agent: "secretary",
      operation: "poster-copy",
      prompt_tokens: 1000,
      cached_tokens: 0,
      completion_tokens: 500,
      total_tokens: 1500,
      image_count: 0,
      cost_usd_micros: 0,
      calls: 2,
    },
    {
      model: "gemini-3.1-flash-image",
      agent: "secretary",
      operation: "poster-image",
      prompt_tokens: 971,
      cached_tokens: 0,
      completion_tokens: 2240,
      total_tokens: 3211,
      image_count: 2,
      cost_usd_micros: 0,
      calls: 2,
    },
  ];
  const response = await worker.fetch(new Request("https://worker.example/usage?month=2026-07", {
    headers: {
      Authorization: "Bearer firebase-token",
      Origin: "https://banedict84-star.github.io",
    },
  }), {
    FIREBASE_API_KEY: "firebase-key",
    ALLOW_ORIGINS: "https://banedict84-star.github.io",
    KRW_PER_USD: "1400",
    AGENT_DB: usageDb(rows, rows.map((row) => ({ ...row, day: "2026-07-31" }))),
  });
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.ok(Math.abs(data.rows[0].costKrw - 7.35) < 0.001);
  assert.equal(Math.round(data.rows[1].costKrw), 189);
  assert.equal(Math.round(data.totals.costKrw), 196);
  assert.equal(Math.round(data.daily[0].cost_usd_micros), 140136);
  assert.equal(data.pricingCatalog.find((item) => item.model === "gemini-3.1-flash-image").image1k, 0.067);
});

test('Luna·Sol·Astra 단가와 캐시 입력을 적용하고 미확인 모델을 무료로 표시하지 않는다',async()=>{
  globalThis.fetch=async()=>Response.json({users:[{localId:'owner'}]});
  const rows=['gpt-6-luna','gpt-6.1-sol','gpt-6-astra','unknown-model'].map(model=>({model,calls:1,prompt_tokens:1000000,cached_tokens:500000,completion_tokens:1000000,total_tokens:2000000,cost_usd_micros:0}));
  const bindings=[];const db={prepare(sql){return{bind(...args){bindings.push(args);return{all:async()=>({results:sql.includes('GROUP BY day, model')?[]:rows})};}};}};
  const response=await worker.fetch(new Request('https://worker.example/usage?month=2026-03',{headers:{Authorization:'Bearer token'}}),{FIREBASE_API_KEY:'public',AGENT_DB:db,OPENAI_API_KEY:'secret-must-not-leak',BUILTIN_TEXT_MODEL:'custom-analysis'});
  const data=await response.json();assert.equal(response.status,200);
  assert.equal(data.rows[0].costUsd,.555);assert.equal(data.rows[1].costUsd,11.05);assert.equal(data.rows[2].costUsd,55.5);
  assert.equal(data.rows[3].costKrw,null);assert.equal(data.rows[3].priceKnown,false);assert.equal(data.totals.unpricedCalls,1);
  assert.equal(data.ai.configured[1].model,'custom-analysis');assert.equal(data.ai.models.length,3);assert.match(data.ai.coverage,/전체 집계되지/);
  assert.doesNotMatch(JSON.stringify(data),/secret-must-not-leak/);
  assert.deepEqual(bindings[0],['owner',Date.parse('2026-03-01T00:00:00+09:00'),Date.parse('2026-04-01T00:00:00+09:00')]);
});

test('잘못된 월은 DB 조회 전에 거절하고 로그인이 없는 사용량 요청을 막는다',async()=>{
  globalThis.fetch=async()=>Response.json({users:[{localId:'owner'}]});let reads=0;
  const env={FIREBASE_API_KEY:'public',AGENT_DB:{prepare(){reads++;throw Error('unexpected');}}};
  const bad=await worker.fetch(new Request('https://worker.example/usage?month=2026-13',{headers:{Authorization:'Bearer token'}}),env);assert.equal(bad.status,400);assert.equal(reads,0);
  const unauth=await worker.fetch(new Request('https://worker.example/usage?month=2026-10'),env);assert.equal(unauth.status,401);
});
