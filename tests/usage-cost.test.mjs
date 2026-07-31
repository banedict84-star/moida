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
