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

      // OpenAI 호출 베이스 URL.
      //  · 기본: 직접 호출(https://api.openai.com/v1) — 일부 지역에서 "Country not supported" 발생
      //  · 권장: Cloudflare AI Gateway 경유(지역 차단 회피). 워커 변수 OPENAI_BASE에
      //    게이트웨이 OpenAI 엔드포인트를 넣으면 자동 적용.
      //    예: https://gateway.ai.cloudflare.com/v1/<계정ID>/<게이트웨이>/openai
      const OPENAI_BASE = (env.OPENAI_BASE || "https://api.openai.com/v1").replace(/\/+$/, "");
      const path = new URL(request.url).pathname;

      // 이미지 생성 경로: POST /image → OpenAI Images(gpt-image-1) 중계 (텍스트 프롬프트만)
      if (path.endsWith("/image")) {
        const imgPayload = Object.assign(
          { model: "gpt-image-1", size: "1024x1536", n: 1 },
          body
        );
        const ir = await fetch(`${OPENAI_BASE}/images/generations`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.OPENAI_API_KEY}` },
          body: JSON.stringify(imgPayload),
        });
        const iraw = await ir.text();
        return new Response(iraw, { status: ir.status, headers: { ...cors, "Content-Type": "application/json" } });
      }

      // 이미지 편집/합성 경로: POST /image-edit → 첨부 사진을 참조로 gpt-image-1이 포스터 전체 생성
      //  · body: { prompt, images:[dataURL...], size } → multipart(images/edits)로 변환해 중계
      if (path.endsWith("/image-edit")) {
        const fd = new FormData();
        fd.append("model", "gpt-image-1");
        fd.append("prompt", String(body.prompt || ""));
        fd.append("size", String(body.size || "1024x1536"));
        const imgs = Array.isArray(body.images) ? body.images.slice(0, 4) : [];
        imgs.forEach((durl, i) => {
          const m = /^data:(.*?);base64,(.*)$/.exec(durl || "");
          if (!m) return;
          const bin = atob(m[2]);
          const arr = new Uint8Array(bin.length);
          for (let j = 0; j < bin.length; j++) arr[j] = bin.charCodeAt(j);
          const type = m[1] || "image/png";
          const ext = type.indexOf("png") >= 0 ? "png" : (type.indexOf("webp") >= 0 ? "webp" : "jpg");
          fd.append("image[]", new Blob([arr], { type }), `img${i}.${ext}`);
        });
        const ir = await fetch(`${OPENAI_BASE}/images/edits`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${env.OPENAI_API_KEY}` }, // Content-Type은 fetch가 boundary와 함께 설정
          body: fd,
        });
        const iraw = await ir.text();
        return new Response(iraw, { status: ir.status, headers: { ...cors, "Content-Type": "application/json" } });
      }

      // 완전 투명 프록시: 클라이언트가 보낸 본문을 그대로 OpenAI로 전달.
      //  · 도구(tools)·모델·파라미터 등 모든 기능은 "사이트 코드"에서 제어되고
      //    자동 배포되므로, 이 워커는 이후 다시 수정할 필요가 없습니다.
      const payload = Object.assign({ model: "gpt-4o-mini", temperature: 0.5, max_tokens: 1000 }, body);
      if (Array.isArray(payload.messages)) payload.messages = payload.messages.slice(-40);

      const r = await fetch(`${OPENAI_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify(payload),
      });

      // OpenAI 응답을 그대로 통과(tool_calls 포함). 처리는 클라이언트가 담당.
      const raw = await r.text();
      return new Response(raw, {
        status: r.status,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: { message: "프록시 오류: " + (e && e.message || e) } }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
  },
};
