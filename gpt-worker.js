/* ──────────────────────────────────────────────────────────────────────────
 * MOIDA AI 비서실장 — OpenAI(GPT) 프록시 (Cloudflare Worker)
 *
 * 목적: API 키를 클라이언트(공개 정적 사이트)에 노출하지 않기 위한 서버 프록시.
 *       키는 Cloudflare 시크릿(OPENAI_API_KEY)으로만 보관됩니다.
 *
 * 배포 방법:
 *   1) Cloudflare 계정에서 Worker 생성 (이름 예: moida-gpt)
 *   2) 이 파일 내용을 Worker 코드로 붙여넣기
 *   3) 키를 시크릿으로 등록 (절대 코드/깃에 넣지 말 것):
 *        wrangler secret put OPENAI_API_KEY
 *      또는 대시보드 → Settings → Variables and Secrets → Add → Encrypt
 *   4) 배포 후 URL을 platform.html의 GPT_ENDPOINT(또는 설정)에 입력
 *        예: https://moida-gpt.<계정>.workers.dev
 *
 * 보안: 아래 ALLOW_ORIGIN을 본인 사이트 도메인으로 제한해 두면,
 *       다른 사이트가 이 워커로 무단 호출(=요금 도용)하는 것을 막습니다.
 * ────────────────────────────────────────────────────────────────────────── */

const ALLOW_ORIGIN = "https://banedict84-star.github.io"; // 필요 시 "*"로 변경 가능

function corsHeaders(origin) {
  const allow = (ALLOW_ORIGIN === "*" || origin === ALLOW_ORIGIN) ? (origin || ALLOW_ORIGIN) : ALLOW_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin);

    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ reply: "POST 요청만 허용됩니다." }), {
        status: 405, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    if (!env.OPENAI_API_KEY) {
      return new Response(JSON.stringify({ reply: "서버에 OPENAI_API_KEY 시크릿이 설정되지 않았습니다." }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    try {
      const body = await request.json();
      const messages = Array.isArray(body.messages) ? body.messages.slice(-20) : [];
      const model = body.model || "gpt-4o-mini";

      // OpenAI 호출 베이스 URL.
      //  · 기본: 직접 호출(https://api.openai.com/v1) — 일부 지역에서 "Country not supported" 발생
      //  · 권장: Cloudflare AI Gateway 경유(지역 차단 회피). 워커 변수 OPENAI_BASE에
      //    게이트웨이 OpenAI 엔드포인트를 넣으면 자동 적용.
      //    예: https://gateway.ai.cloudflare.com/v1/<계정ID>/<게이트웨이>/openai
      const OPENAI_BASE = (env.OPENAI_BASE || "https://api.openai.com/v1").replace(/\/+$/, "");

      const r = await fetch(`${OPENAI_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({ model, messages, temperature: 0.6, max_tokens: 900 }),
      });

      const data = await r.json();
      const reply = data?.choices?.[0]?.message?.content ?? (data?.error?.message || "GPT 응답을 받지 못했습니다.");
      return new Response(JSON.stringify({ reply }), {
        status: r.ok ? 200 : 502,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    } catch (e) {
      return new Response(JSON.stringify({ reply: "프록시 오류: " + (e && e.message || e) }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
  },
};
