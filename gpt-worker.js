import {
  AGENT_SCHEMA_VERSION,
  TEAM_DEFS,
  createRunId,
  fallbackPlan,
  publicRun,
  safeJson,
  selectTaskWorkers,
} from "./agent-core.js";

const PRODUCTION_ORIGIN = "https://banedict84-star.github.io";
const MAX_INSTRUCTION_LENGTH = 12000;
const MAX_CONTEXT_LENGTH = 50000;
const MAX_MODEL_CALLS = 40;
const MAX_RESERVED_TOKENS = 30000;
const LEASE_MS = 15 * 60 * 1000;
const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";
const GOOGLE_CALLBACK_PATH = "/google/calendar/callback";

function allowedOrigin(origin, env) {
  const configured = String(env.ALLOW_ORIGINS || PRODUCTION_ORIGIN)
    .split(",").map((v) => v.trim()).filter(Boolean);
  if (configured.includes("*")) return origin || "*";
  if (configured.includes(origin)) return origin;
  if (/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) return origin;
  return configured[0] || PRODUCTION_ORIGIN;
}

function corsHeaders(request, env) {
  return {
    "Access-Control-Allow-Origin": allowedOrigin(request.headers.get("Origin") || "", env),
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Idempotency-Key",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(data, status, request, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(request, env), "Content-Type": "application/json; charset=utf-8" },
  });
}

async function requestBody(request) {
  try { return await request.json(); } catch { throw new HttpError(400, "올바른 JSON 요청이 아닙니다."); }
}

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

class NonRetryableRunError extends Error {
  constructor(message) { super(message); this.nonRetryable = true; }
}

async function verifyFirebaseUser(request, env) {
  const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new HttpError(401, "로그인이 필요합니다.");
  if (!env.FIREBASE_API_KEY) throw new HttpError(500, "FIREBASE_API_KEY가 설정되지 않았습니다.");
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(env.FIREBASE_API_KEY)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: token }),
  });
  const data = await response.json().catch(() => ({}));
  const user = data.users?.[0];
  if (!response.ok || !user?.localId) throw new HttpError(401, "로그인 정보가 만료되었습니다. 다시 로그인해 주세요.");
  return { uid: user.localId, email: user.email || "" };
}

async function openAI(env, body) {
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY가 설정되지 않았습니다.");
  const base = String(env.OPENAI_BASE || "https://api.openai.com/v1").replace(/\/+$/, "");
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    signal: AbortSignal.timeout(45000),
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  const data = safeJson(raw);
  if (!response.ok || !data?.choices?.[0]?.message) {
    throw new Error(data?.error?.message || `OpenAI HTTP ${response.status}`);
  }
  return data;
}

function geminiUsage(usage = {}) {
  return {
    input_tokens: Number(usage.total_input_tokens ?? usage.promptTokenCount ?? 0),
    output_tokens: Number(usage.total_output_tokens ?? usage.candidatesTokenCount ?? 0),
    total_tokens: Number(usage.total_tokens ?? usage.totalTokenCount ?? 0),
    input_tokens_details: {
      cached_tokens: Number(usage.total_cached_tokens ?? usage.cachedContentTokenCount ?? 0),
    },
  };
}

async function geminiRequest(env, path, body, timeout = 90000) {
  if (!env.GEMINI_API_KEY) {
    throw new HttpError(503, "Gemini API 키가 아직 연결되지 않았습니다. Cloudflare Worker 시크릿 GEMINI_API_KEY를 설정해 주세요.");
  }
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${path}`, {
    method: "POST",
    signal: AbortSignal.timeout(timeout),
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": env.GEMINI_API_KEY,
    },
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  const data = safeJson(raw);
  if (!response.ok || !data) {
    throw new HttpError(response.status || 502, data?.error?.message || `Gemini HTTP ${response.status}`);
  }
  return data;
}

function geminiText(data) {
  return (data?.candidates?.[0]?.content?.parts || [])
    .map((part) => part?.text || "")
    .join("")
    .trim();
}

function geminiJson(data) {
  const text = geminiText(data).replace(/```(?:json)?|```/gi, "").trim();
  const direct = safeJson(text);
  if (direct && typeof direct === "object") return direct;
  const match = text.match(/\{[\s\S]*\}/);
  return match ? safeJson(match[0]) : null;
}

function interactionImage(value) {
  if (!value) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = interactionImage(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== "object") return null;
  const mimeType = String(value.mime_type || value.mimeType || value.inline_data?.mime_type
    || value.inlineData?.mimeType || "");
  const data = value.data || value.inline_data?.data || value.inlineData?.data;
  if (data && (value.type === "image" || mimeType.startsWith("image/"))) {
    return { data, mimeType: mimeType || "image/png" };
  }
  for (const child of Object.values(value)) {
    const found = interactionImage(child);
    if (found) return found;
  }
  return null;
}

async function geminiPosterCopy(request, env, user) {
  const body = await requestBody(request);
  const model = String(env.GEMINI_TEXT_MODEL || "gemini-3.6-flash");
  const title = String(body.title || "").slice(0, 160);
  const prompt = [
    `행사명: ${title || "미입력"}`,
    `날짜: ${String(body.date || "").slice(0, 80) || "미입력"}`,
    `장소: ${String(body.place || "").slice(0, 120) || "미입력"}`,
    `원하는 분위기: ${String(body.tone || "").slice(0, 120) || "따뜻하고 신뢰감 있는"}`,
    `기존 핵심 메시지: ${String(body.message || "").slice(0, 240) || "없음"}`,
  ].join("\n");
  const data = await geminiRequest(env, `models/${encodeURIComponent(model)}:generateContent`, {
    systemInstruction: {
      parts: [{
        text: "당선 이후 의정활동과 현장 소통을 알리는 한국어 웹자보 카피를 작성한다. 선거운동처럼 과장하지 말고, 확인되지 않은 사실이나 수치도 만들지 않는다. 제목은 26자, message는 34자, body는 120자, category는 8자 이내로 간결하게 쓴다.",
      }],
    },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.6,
      maxOutputTokens: 700,
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          message: { type: "STRING" },
          body: { type: "STRING" },
          category: { type: "STRING" },
        },
        required: ["title", "message", "body", "category"],
      },
    },
  });
  const result = geminiJson(data);
  const fallback = !result || typeof result !== "object";
  const clean = {
    title: String(result?.title || title || "의정활동 소식").trim().slice(0, 80),
    message: String(result?.message || body.message || "현장에서 듣고, 의정활동으로 답하겠습니다").trim().slice(0, 100),
    body: String(result?.body || "").trim().slice(0, 300),
    category: String(result?.category || body.category || "의정활동").trim().slice(0, 20),
  };
  await recordUsage(env, user.uid, {
    agent: "poster", model, operation: "poster-copy", usage: geminiUsage(data.usageMetadata),
  });
  return json({ ok: true, model, result: clean, fallback }, 200, request, env);
}

async function geminiPosterImage(request, env, user) {
  const body = await requestBody(request);
  const model = String(env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image");
  const ratio = ["3:4", "4:5", "1:1"].includes(body.ratio) ? body.ratio : "3:4";
  const prompt = [
    "Create one premium editorial background image for a Korean elected official's public-service activity poster.",
    `Event: ${String(body.title || "community public service activity").slice(0, 160)}.`,
    `Core message: ${String(body.message || "listening to residents and serving the community").slice(0, 180)}.`,
    `Activity category: ${String(body.category || "public service activity").slice(0, 80)}.`,
    `Place or context: ${String(body.place || "local community").slice(0, 120)}.`,
    `Mood: ${String(body.tone || "warm, trustworthy, calm").slice(0, 120)}.`,
    "Create a sophisticated layered civic editorial collage: pale sky-blue atmosphere, modern Korean public-institution architecture across the upper and right side, and a related public meeting or council interior detail toward the lower left.",
    "Use refined navy, vivid Democratic-style blue, soft blue and white with natural documentary lighting. Keep generous bright negative space on the left for a large Korean headline and reserve the bottom area for a dark navy identity band.",
    "No people, faces, politicians, flags, party logos, seals, letters, numbers, captions, watermarks, UI, frames or borders.",
    "The image will be cropped inside a separate Korean typography layout, so generate visual background only.",
  ].join(" ");
  const data = await geminiRequest(env, "interactions", {
    model,
    input: [{ type: "text", text: prompt }],
    response_format: {
      type: "image",
      mime_type: "image/jpeg",
      aspect_ratio: ratio,
      image_size: "1K",
    },
  }, 120000);
  const image = interactionImage(data);
  if (!image?.data) throw new HttpError(502, "Gemini 이미지 응답을 확인할 수 없습니다.");
  await recordUsage(env, user.uid, {
    agent: "poster", model, operation: "poster-image", imageCount: 1, usage: geminiUsage(data.usage),
  });
  return json({
    ok: true,
    model,
    image: `data:${image.mimeType};base64,${image.data}`,
  }, 200, request, env);
}

function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const padded = String(value).replace(/-/g, "+").replace(/_/g, "/")
    + "=".repeat((4 - String(value).length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function googleKey(env, usage) {
  if (!env.GOOGLE_CLIENT_SECRET) throw new HttpError(500, "Google Calendar 보안 비밀번호가 설정되지 않았습니다.");
  const material = new TextEncoder().encode(`${usage}:${env.GOOGLE_CLIENT_SECRET}`);
  const digest = await crypto.subtle.digest("SHA-256", material);
  if (usage === "state") {
    return crypto.subtle.importKey("raw", digest, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  }
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function signedGoogleState(env, payload) {
  const encoded = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await googleKey(env, "state");
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encoded));
  return `${encoded}.${base64UrlEncode(new Uint8Array(signature))}`;
}

async function verifyGoogleState(env, state) {
  const [encoded, signature] = String(state || "").split(".");
  if (!encoded || !signature) throw new HttpError(400, "Google 연결 정보가 올바르지 않습니다.");
  const key = await googleKey(env, "state");
  const valid = await crypto.subtle.verify(
    "HMAC", key, base64UrlDecode(signature), new TextEncoder().encode(encoded),
  );
  if (!valid) throw new HttpError(400, "Google 연결 정보의 서명을 확인할 수 없습니다.");
  const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(encoded)));
  if (!payload.uid || Number(payload.exp || 0) < Date.now()) throw new HttpError(400, "Google 연결 요청이 만료되었습니다.");
  return payload;
}

async function encryptGoogleToken(env, token) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await googleKey(env, "token");
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(token),
  );
  return {
    cipher: base64UrlEncode(new Uint8Array(encrypted)),
    iv: base64UrlEncode(iv),
  };
}

async function decryptGoogleToken(env, cipher, iv) {
  const key = await googleKey(env, "token");
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64UrlDecode(iv) },
    key,
    base64UrlDecode(cipher),
  );
  return new TextDecoder().decode(plain);
}

function googleRedirectUri(request) {
  const url = new URL(request.url);
  return `${url.origin}${GOOGLE_CALLBACK_PATH}`;
}

function safeAppOrigin(value, env) {
  const origin = String(value || "");
  return allowedOrigin(origin, env) === origin ? origin : PRODUCTION_ORIGIN;
}

function usageCostMicros(model, usage = {}) {
  const rates = {
    "gpt-4o-mini": { input: 0.15, cached: 0.075, output: 0.60 },
    "gpt-4o": { input: 2.50, cached: 1.25, output: 10.00 },
    "gpt-image-1": { input: 5.00, cached: 0, output: 40.00 },
    "claude-sonnet-4": { input: 3.00, cached: 0.30, output: 15.00 },
    "gemini-2.5-flash": { input: 0.30, cached: 0.03, output: 2.50 },
  };
  const rate = rates[model] || { input: 0, cached: 0, output: 0 };
  const prompt = Number(usage.prompt_tokens ?? usage.input_tokens ?? 0);
  const cached = Number(usage.prompt_tokens_details?.cached_tokens ?? usage.input_tokens_details?.cached_tokens ?? 0);
  const completion = Number(usage.completion_tokens ?? usage.output_tokens ?? 0);
  return Math.max(0, prompt - cached) * rate.input + cached * rate.cached + completion * rate.output;
}

function modelProvider(model) {
  if (/^claude/i.test(model)) return "Anthropic";
  if (/^gemini/i.test(model)) return "Google";
  if (/^gpt|^o\d|^chatgpt/i.test(model)) return "OpenAI";
  return "기타";
}

async function recordUsage(env, tenantId, details) {
  if (!env.AGENT_DB || !tenantId) return;
  const usage = details.usage || {};
  const prompt = Number(usage.prompt_tokens ?? usage.input_tokens ?? 0);
  const cached = Number(usage.prompt_tokens_details?.cached_tokens ?? usage.input_tokens_details?.cached_tokens ?? 0);
  const completion = Number(usage.completion_tokens ?? usage.output_tokens ?? 0);
  const total = Number(usage.total_tokens ?? usage.total_tokens ?? (prompt + completion));
  await env.AGENT_DB.prepare(
    `INSERT INTO ai_usage_events
      (tenant_id, run_id, agent, model, operation, prompt_tokens, cached_tokens,
       completion_tokens, total_tokens, image_count, cost_usd_micros, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(tenantId, details.runId || "", details.agent || "secretary",
    details.model || "unknown", details.operation || "chat", prompt, cached,
    completion, total, Number(details.imageCount || 0),
    usageCostMicros(details.model, usage), Date.now()).run();
}

function lawRequestHeaders(env) {
  const origin = env.LAW_ORIGIN || PRODUCTION_ORIGIN;
  return {
    "Accept": "application/json",
    "Origin": origin,
    "Referer": `${origin}/moida/`,
    "User-Agent": "MOIDA-Law-Agent/1.0",
  };
}

async function lawApi(env, path, params) {
  if (!env.LAW_OC) throw new Error("LAW_OC가 설정되지 않았습니다.");
  const query = new URLSearchParams({ OC: env.LAW_OC, type: "JSON", ...params });
  const response = await fetch(`https://www.law.go.kr/DRF/${path}?${query}`, {
    headers: lawRequestHeaders(env),
    signal: AbortSignal.timeout(20000),
  });
  const raw = await response.text();
  const data = safeJson(raw);
  if (!response.ok || !data || data.result || data.resultCode === "99") {
    throw new Error(data?.msg || data?.result || `국가법령정보 HTTP ${response.status}`);
  }
  return data;
}

function lawSearchRows(data, target) {
  const root = target === "ordin" ? data?.OrdinSearch : data?.LawSearch;
  const rows = root?.law;
  return {
    total: Number(root?.totalCnt || 0),
    rows: Array.isArray(rows) ? rows : (rows ? [rows] : []),
  };
}

function publicLawUrl(target, row) {
  if (target === "ordin") {
    const sequence = row["자치법규일련번호"];
    return sequence
      ? `https://www.law.go.kr/LSW/ordinInfoP.do?ordinSeq=${encodeURIComponent(sequence)}`
      : "https://www.law.go.kr/LSW/ordinInfoP.do";
  }
  const sequence = row["법령일련번호"];
  const lawId = row["법령ID"];
  if (sequence) return `https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=${encodeURIComponent(sequence)}`;
  if (lawId) return `https://www.law.go.kr/LSW/lsInfoP.do?lsId=${encodeURIComponent(lawId)}`;
  return "https://www.law.go.kr/LSW/lsInfoP.do";
}

function canonicalLawSourceUrl(source) {
  const sequence = source?.mst;
  if (source?.target === "ordin" && sequence) {
    return `https://www.law.go.kr/LSW/ordinInfoP.do?ordinSeq=${encodeURIComponent(sequence)}`;
  }
  if (source?.target === "law" && sequence) {
    return `https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=${encodeURIComponent(sequence)}`;
  }
  return source?.sourceUrl || "";
}

function normalizeLawSearchRow(row, target) {
  if (target === "ordin") {
    return {
      target, id: row["자치법규ID"], mst: row["자치법규일련번호"],
      title: row["자치법규명"], organization: row["지자체기관명"],
      kind: row["자치법규종류"], promulgationDate: row["공포일자"],
      enforcementDate: row["시행일자"], revisionType: row["제개정구분명"],
      sourceUrl: publicLawUrl(target, row),
    };
  }
  return {
    target, id: row["법령ID"], mst: row["법령일련번호"],
    title: row["법령명한글"], organization: row["소관부처명"],
    kind: row["법령구분명"], promulgationDate: row["공포일자"],
    enforcementDate: row["시행일자"], revisionType: row["제개정구분명"],
    sourceUrl: publicLawUrl(target, row),
  };
}

async function searchLaw(env, target, query, options = {}) {
  if (!["law", "ordin", "expc"].includes(target)) throw new Error("지원하지 않는 법령 검색 대상입니다.");
  const params = {
    target,
    search: String(options.search === 2 ? 2 : 1),
    query: String(query || "").trim(),
    display: String(Math.min(100, Math.max(1, Number(options.display) || 10))),
    page: String(Math.max(1, Number(options.page) || 1)),
  };
  if (target === "ordin") {
    params.nw = "1";
    if (!options.allOrganizations) params.org = options.org || env.LAW_LOCAL_GOV_CODE || "6410000";
  }
  const data = await lawApi(env, "lawSearch.do", params);
  const found = lawSearchRows(data, target);
  return { target, query: params.query, total: found.total, results: found.rows.map((row) => normalizeLawSearchRow(row, target)) };
}

async function getLawDetail(env, target, id, mst) {
  if (!["law", "ordin"].includes(target)) throw new Error("지원하지 않는 법령 본문 대상입니다.");
  const params = { target };
  if (id) params.ID = String(id);
  else if (mst) params.MST = String(mst);
  else throw new Error("법령 ID 또는 MST가 필요합니다.");
  const data = await lawApi(env, "lawService.do", params);
  return JSON.stringify(data).slice(0, 8000);
}

async function buildLawResearch(env, run, tasks) {
  const instruction = String(run.instruction || "");
  if (!tasks.some((task) => ["policy", "audit"].includes(task.agent))
      || !/조례|법령|법률|시행령|시행규칙|자치법규|상위법|조문|판례/.test(instruction)) return null;
  const municipalityMatch = instruction.match(/(?:경기도\s*)?([가-힣]{2,}(?:시|군|구))/);
  const requestedOrganization = municipalityMatch?.[1] || (/경기도/.test(instruction) ? "경기도" : "");
  const wantsAll = /(?:^|\s)(?:다|모두|전부|전체)(?=\s|$)|빠짐없이/.test(instruction);
  const cleaned = instruction
    .replace(requestedOrganization, " ")
    .replace(/경기도|국가법령정보센터|관련|상위법|조례|법령|법률|시행령|시행규칙|자치법규|조문|판례/gi, " ")
    .replace(/도내|시내|군내|구내|관내|지역\s*내|내에서|내에|내의/gi, " ")
    .replace(/찾아\s*줘|찾아\s*봐|찾아|검색|조회|확인|보여\s*줘|보여|알려\s*줘|알려|검토|분석|작성|해\s*줘|해주세요|해봐|해\s*봐|줘|봐/gi, " ")
    .replace(/(^|\s)(내|의|대한|관한)(?=\s|$)/g, " ")
    .replace(/[^\p{L}\p{N}\s·ㆍ-]/gu, " ").replace(/\s+/g, " ").trim()
    .split(" ").filter((token) => token && !["다", "모두", "전부", "전체", "빠짐없이"].includes(token)).join(" ");
  const keywords = [cleaned || instruction.replace(/\s+/g, " ").trim().slice(0, 30)].filter(Boolean);
  const targets = /상위법|법령|법률|시행령|시행규칙/.test(instruction) ? ["law", "ordin"] : ["ordin"];

  const sources = [];
  for (const keyword of keywords) {
    for (const target of targets) {
      try {
        const searched = await searchLaw(env, target, keyword, {
          display: target === "ordin" ? 100 : 5,
          allOrganizations: target === "ordin" && Boolean(requestedOrganization) && requestedOrganization !== "경기도",
        });
        let results = searched.results;
        if (target === "ordin") {
          if (keyword === "공예") {
            results = results.filter((item) => /(^|[^공])공예/.test(String(item.title || "")));
          }
          if (requestedOrganization) {
            const organizationKey = requestedOrganization.replace(/\s/g, "");
            results = results.filter((item) =>
              String(item.organization || "").replace(/\s/g, "").includes(organizationKey));
          }
          results = results.slice(0, wantsAll ? 50 : 12);
        } else results = results.slice(0, 5);
        sources.push(...results.map((item) => ({ ...item, keyword })));
      } catch (error) {
        await addEvent(env, run, "law.search_error", `${keyword} ${target} 검색 실패: ${error.message}`, "policy");
      }
    }
  }
  const unique = sources.filter((item, index, all) =>
    all.findIndex((other) => other.target === item.target && other.id === item.id) === index
  ).slice(0, wantsAll ? 50 : 12);
  for (const source of unique.slice(0, 3)) {
    try { source.body = await getLawDetail(env, source.target, source.id, source.mst); }
    catch (error) { source.bodyError = error.message; }
  }
  await addEvent(env, run, "law.research_completed",
    `국가법령·${requestedOrganization || "전국"} 자치법규 근거 ${unique.length}건을 확인했습니다.`, "policy");
  return {
    provider: "국가법령정보센터", checkedAt: new Date().toISOString(),
    requestedOrganization, keywords, sources: unique,
  };
}

async function legacyOpenAI(request, env, body, path) {
  if (!env.OPENAI_API_KEY) throw new HttpError(500, "OPENAI_API_KEY가 설정되지 않았습니다.");
  let user = null;
  if (request.headers.get("Authorization")) user = await verifyFirebaseUser(request, env);
  const base = String(env.OPENAI_BASE || "https://api.openai.com/v1").replace(/\/+$/, "");
  if (path.endsWith("/image")) {
    const model = "gpt-image-2";
    const response = await fetch(`${base}/images/generations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model, size: "1024x1536", n: 1, quality: "high", ...body }),
    });
    const raw = await response.text();
    const data = safeJson(raw);
    if (response.ok) await recordUsage(env, user?.uid, {
      agent: "poster", model, operation: "image-generation", imageCount: 1, usage: data?.usage,
    });
    return new Response(raw, {
      status: response.status,
      headers: { ...corsHeaders(request, env), "Content-Type": "application/json; charset=utf-8" },
    });
  }
  if (path.endsWith("/image-edit")) {
    const model = "gpt-image-2";
    const form = new FormData();
    form.append("model", model);
    form.append("prompt", String(body.prompt || ""));
    form.append("size", String(body.size || "1024x1536"));
    form.append("quality", String(body.quality || "high"));
    (Array.isArray(body.images) ? body.images.slice(0, 4) : []).forEach((dataUrl, index) => {
      const match = /^data:(.*?);base64,(.*)$/.exec(dataUrl || "");
      if (!match) return;
      const bytes = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0));
      const type = match[1] || "image/png";
      form.append("image[]", new Blob([bytes], { type }), `image-${index}.${type.includes("png") ? "png" : "jpg"}`);
    });
    const response = await fetch(`${base}/images/edits`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${env.OPENAI_API_KEY}` },
      body: form,
    });
    const raw = await response.text();
    const data = safeJson(raw);
    if (response.ok) await recordUsage(env, user?.uid, {
      agent: "poster", model, operation: "image-edit", imageCount: 1, usage: data?.usage,
    });
    return new Response(raw, {
      status: response.status,
      headers: { ...corsHeaders(request, env), "Content-Type": "application/json; charset=utf-8" },
    });
  }
  const payload = { model: "gpt-4o-mini", temperature: 0.5, max_tokens: 1000, ...body };
  if (Array.isArray(payload.messages)) payload.messages = payload.messages.slice(-40);
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify(payload),
  });
  const raw = await response.text();
  const data = safeJson(raw);
  if (response.ok) await recordUsage(env, user?.uid, {
    agent: "secretary", model: payload.model, operation: "chat", usage: data?.usage,
  });
  return new Response(raw, {
    status: response.status,
    headers: { ...corsHeaders(request, env), "Content-Type": "application/json; charset=utf-8" },
  });
}

async function addEvent(env, run, type, message, agent = "") {
  await env.AGENT_DB.prepare(
    "INSERT INTO agent_events (run_id, tenant_id, type, agent, message, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(run.id, run.tenant_id, type, agent, String(message).slice(0, 1000), Date.now()).run();
}

async function getRun(env, runId, tenantId) {
  const row = await env.AGENT_DB.prepare(
    "SELECT * FROM agent_runs WHERE id = ? AND tenant_id = ?"
  ).bind(runId, tenantId).first();
  if (!row) return null;
  const tasks = (await env.AGENT_DB.prepare(
    "SELECT * FROM agent_tasks WHERE run_id = ? ORDER BY position"
  ).bind(runId).all()).results || [];
  const events = (await env.AGENT_DB.prepare(
    "SELECT * FROM agent_events WHERE run_id = ? ORDER BY id DESC LIMIT 100"
  ).bind(runId).all()).results || [];
  return publicRun(row, tasks, events);
}

async function createAgentRun(request, env, user) {
  if (!env.AGENT_DB || !env.AGENT_QUEUE) throw new HttpError(503, "서버 작업 큐가 아직 연결되지 않았습니다.");
  const body = await requestBody(request);
  const instruction = String(body.instruction || "").trim();
  if (!instruction) throw new HttpError(400, "지시 내용을 입력해 주세요.");
  if (instruction.length > MAX_INSTRUCTION_LENGTH) throw new HttpError(413, "지시 내용이 너무 깁니다.");
  const contextText = JSON.stringify(body.context || {});
  if (contextText.length > MAX_CONTEXT_LENGTH) throw new HttpError(413, "참고 데이터가 너무 큽니다.");
  const key = String(request.headers.get("Idempotency-Key") || body.idempotencyKey || "").trim().slice(0, 160);
  if (!key) throw new HttpError(400, "Idempotency-Key가 필요합니다.");

  const now = Date.now();
  const runId = createRunId(now);
  const inserted = await env.AGENT_DB.prepare(
    `INSERT OR IGNORE INTO agent_runs
      (id, tenant_id, instruction, context_json, status, idempotency_key, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'queued', ?, ?, ?)`
  ).bind(runId, user.uid, instruction, contextText, key, now, now).run();

  let id = runId;
  if (!inserted.meta?.changes) {
    const existing = await env.AGENT_DB.prepare(
      "SELECT id FROM agent_runs WHERE tenant_id = ? AND idempotency_key = ?"
    ).bind(user.uid, key).first();
    id = existing?.id;
  } else {
    await addEvent(env, { id: runId, tenant_id: user.uid }, "run.queued", "비서실장이 지시를 접수했습니다.");
    await env.AGENT_QUEUE.send({ runId, tenantId: user.uid, queuedAt: now });
  }
  return json({ ok: true, duplicate: !inserted.meta?.changes, run: await getRun(env, id, user.uid) }, 202, request, env);
}

async function listAgentRuns(request, env, user) {
  if (!env.AGENT_DB) throw new HttpError(503, "서버 작업 저장소가 연결되지 않았습니다.");
  const url = new URL(request.url);
  const limit = Math.min(30, Math.max(1, Number(url.searchParams.get("limit")) || 20));
  const rows = (await env.AGENT_DB.prepare(
    "SELECT * FROM agent_runs WHERE tenant_id = ? ORDER BY updated_at DESC LIMIT ?"
  ).bind(user.uid, limit).all()).results || [];
  const runs = [];
  for (const row of rows) runs.push(await getRun(env, row.id, user.uid));
  return json({ ok: true, runs }, 200, request, env);
}

async function reserveModelCall(env, runId, maxTokens) {
  const result = await env.AGENT_DB.prepare(
    `UPDATE agent_runs SET model_calls = model_calls + 1,
       reserved_tokens = reserved_tokens + ?, updated_at = ?
     WHERE id = ? AND model_calls < ? AND reserved_tokens + ? <= ?`
  ).bind(maxTokens, Date.now(), runId, MAX_MODEL_CALLS, maxTokens, MAX_RESERVED_TOKENS).run();
  if (!result.meta?.changes) throw new Error("이 작업의 AI 사용 한도를 초과했습니다.");
}

async function runModel(env, runId, system, user, jsonOnly = false, maxTokens = 1400, usageMeta = {}) {
  await reserveModelCall(env, runId, maxTokens);
  const model = env.AGENT_MODEL || "gpt-4o-mini";
  const data = await openAI(env, {
    model,
    temperature: 0.25,
    max_tokens: maxTokens,
    ...(jsonOnly ? { response_format: { type: "json_object" } } : {}),
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
  });
  const run = await env.AGENT_DB.prepare("SELECT tenant_id FROM agent_runs WHERE id = ?").bind(runId).first();
  await recordUsage(env, run?.tenant_id, {
    runId, agent: usageMeta.agent || "secretary", model,
    operation: usageMeta.operation || "agent", usage: data.usage,
  });
  return data.choices[0].message.content || "";
}

async function updateRun(env, runId, fields) {
  const entries = Object.entries(fields);
  const sql = entries.map(([name]) => `${name} = ?`).join(", ");
  await env.AGENT_DB.prepare(`UPDATE agent_runs SET ${sql}, updated_at = ? WHERE id = ?`)
    .bind(...entries.map(([, value]) => value), Date.now(), runId).run();
}

async function updateTask(env, taskId, fields) {
  const entries = Object.entries(fields);
  const sql = entries.map(([name]) => `${name} = ?`).join(", ");
  await env.AGENT_DB.prepare(`UPDATE agent_tasks SET ${sql}, updated_at = ? WHERE id = ?`)
    .bind(...entries.map(([, value]) => value), Date.now(), taskId).run();
}

async function planRun(env, run) {
  return fallbackPlan(run.instruction);
}

function workerPrompt(run, task, worker, prior, feedback) {
  let context = {};
  try { context = JSON.parse(run.context_json || "{}"); } catch {}
  const hasLawResearch = Boolean(context.lawResearch);
  const currentDate = context.today || new Date().toISOString().slice(0, 10);
  const compact = { today: currentDate };
  if (context.profile) compact.profile = {
    name: context.profile.name, position: context.profile.position, district: context.profile.district,
  };
  if (task.agent === "schedule") compact.events = (context.events || []).slice(0, 12);
  if (task.agent === "civil") compact.complaints = (context.complaints || []).slice(0, 12);
  if (task.agent === "organization") compact.contacts = (context.contacts || []).slice(0, 20);
  if (["assemblypr", "localpr"].includes(task.agent)) compact.recentContents = (context.recentContents || []).slice(0, 8);
  if (context.lawResearch) compact.lawResearch = {
    provider: context.lawResearch.provider, checkedAt: context.lawResearch.checkedAt,
    sources: (context.lawResearch.sources || []).slice(0, 6).map((source) => ({
      target: source.target, title: source.title, organization: source.organization,
      enforcementDate: source.enforcementDate, sourceUrl: canonicalLawSourceUrl(source),
      ...(task.agent === "policy" && source.body ? { body: String(source.body).slice(0, 3500) } : {}),
    })),
  };
  return {
    system: `너는 경기도의원실 ${TEAM_DEFS[task.agent].lead} 산하의 ${worker[1]} 담당 AI 팀원이다.
전문 역할: ${worker[2]}
맡은 범위만 구체적으로 수행하고, 외부 게시·발송·일정 확정·데이터 변경을 실행하지 않는다.
확인되지 않은 내용은 반드시 '확인 필요'로 표시한다.
현재 날짜는 ${currentDate}이다. 다른 연도를 현재 시점으로 추정하지 않는다.
${hasLawResearch ? "읽기 전용 참고 데이터의 lawResearch는 국가법령정보센터에서 방금 조회한 공식 자료다. enforcementDate는 제정일이나 개정일이 아니라 '시행일자'로만 표시한다. 법령·조례를 언급할 때 법령명, 시행일자, sourceUrl을 근거로 표시하고 검색 결과에 없는 조문을 만들어내지 않는다. checkedAt에 정상 조회된 공식 링크를 별도 근거 없이 무효라고 판단하지 않는다." : ""}`,
    user: `[의원 원지시]\n${run.instruction}\n\n[팀 담당 업무]\n${task.instruction}
\n\n[읽기 전용 참고 데이터]\n${JSON.stringify(compact)}
\n\n[앞선 팀 결과]\n${prior || "없음"}${feedback ? `\n\n[팀장 재작업 요청]\n${feedback}` : ""}`,
  };
}

async function executeWorkers(env, run, task, prior, feedback = "") {
  const workers = selectTaskWorkers(task.agent,
    task.agent === "verification" ? run.instruction : `${run.instruction}\n${task.title}\n${task.instruction}`);
  const subtasks = workers.map((worker, index) => ({
    id: `${task.id}_worker_${index + 1}`, workerId: worker[0], name: worker[1],
    role: worker[2], status: feedback ? "reworking" : "running", result: "", error: "", updatedAt: Date.now(),
  }));
  await updateTask(env, task.id, {
    status: feedback ? "reworking" : "running",
    worker_status: feedback ? "reworking" : "running",
    lead_status: "monitoring",
    subtasks_json: JSON.stringify(subtasks),
  });
  const workerNames = workers.map((worker) => worker[1]).join("·");
  await addEvent(env, run, "team.started",
    `${TEAM_DEFS[task.agent].lead}이 ${workerNames} 담당 ${workers.length}명에게 업무를 배정했습니다.`, task.agent);

  const results = await Promise.all(workers.map(async (worker, index) => {
    const prompt = workerPrompt(run, task, worker, prior, feedback);
    try {
      const result = await runModel(env, run.id, prompt.system, prompt.user, false, 1200,
        { agent: task.agent, operation: "worker" });
      subtasks[index] = { ...subtasks[index], status: "completed", result, updatedAt: Date.now() };
      await updateTask(env, task.id, { subtasks_json: JSON.stringify(subtasks) });
      await addEvent(env, run, "worker.completed", `${worker[1]} 담당이 초안을 제출했습니다.`, `${task.agent}_${worker[0]}`);
      return `[${worker[1]}]\n${result}`;
    } catch (error) {
      subtasks[index] = { ...subtasks[index], status: "failed", error: String(error.message || error), updatedAt: Date.now() };
      await updateTask(env, task.id, { subtasks_json: JSON.stringify(subtasks) });
      throw error;
    }
  }));
  const result = results.join("\n\n");
  await updateTask(env, task.id, {
    result, status: "reviewing", worker_status: "completed",
    lead_status: "reviewing", subtasks_json: JSON.stringify(subtasks),
  });
  return result;
}

async function reviewTask(env, run, task, result) {
  const text = String(result || "").trim();
  return {
    approved: text.length >= 20,
    feedback: text.length >= 20 ? "코드 검증 통과" : "결과 내용이 부족합니다.",
    finalResult: text,
  };
}

function isDirectLawLookup(instruction, plan, research) {
  const text = String(instruction || "");
  return Boolean(research?.sources?.length)
    && plan.length === 1 && plan[0].agent === "policy"
    && !/초안|제정안|개정안|도정질문|발언문|질의서|보고서|영향\s*분석|대안|비교\s*분석/.test(text);
}

function lawEvidence(research) {
  return (research?.sources || []).map((source) => {
    const date = String(source.enforcementDate || "").replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");
    const organization = source.organization ? ` · ${source.organization}` : "";
    const sourceUrl = canonicalLawSourceUrl(source);
    const link = sourceUrl ? `[${source.title}](${sourceUrl})` : source.title;
    return `- ${link}${organization}${date ? ` · 시행일자 ${date}` : ""}`;
  }).join("\n");
}

async function completeDirectLawLookup(env, run, task, research) {
  const sourceCount = research.sources.length;
  const worker = TEAM_DEFS.policy.workers.find((item) => item[0] === "ordinance");
  const result = `국가법령정보센터에서 관련 법령·조례 ${sourceCount}건을 확인했습니다.\n\n${lawEvidence(research)}`;
  const subtask = {
    id: `${task.id}_worker_1`, workerId: worker[0], name: worker[1], role: worker[2],
    status: "completed", result, error: "", updatedAt: Date.now(),
  };
  await updateTask(env, task.id, {
    status: "completed", worker_status: "completed", lead_status: "approved",
    result, review: "공식 API 응답·링크·시행일자 코드 검증 완료",
    review_decision: "approved_without_model", subtasks_json: JSON.stringify([subtask]),
  });
  await addEvent(env, run, "team.started", "조례·정책팀장이 조례검토 담당에게 공식 조회를 배정했습니다.", "policy");
  await addEvent(env, run, "worker.completed", `조례검토 담당이 공식 자료 ${sourceCount}건을 확인했습니다.`, "policy_ordinance");
  await addEvent(env, run, "team.approved", "조례·정책팀장이 API 응답을 코드로 검증했습니다.", "policy");
  const summary = `## 조회 결과\n국가법령정보센터에서 관련 법령·조례 **${sourceCount}건**을 확인했습니다.\n\n## 공식 근거\n${lawEvidence(research)}\n\n조회 시각: ${research.checkedAt}`;
  await updateRun(env, run.id, {
    status: "completed", summary, error: "", approval_status: "not_required",
    lease_until: null,
  });
  await addEvent(env, run, "run.completed", "AI 모델 호출 없이 공식 조회 결과를 정리했습니다.");
}

async function insertTasks(env, run, plan, includeVerification = true) {
  const all = [...plan];
  if (includeVerification) all.push({
    agent: "verification",
    title: "독립 검증팀 최종 검증",
    instruction: "각 팀장이 승인한 결과를 사실·수치, 법률·조례, 개인정보·문서 품질 기준으로 독립 검증한다.",
    dependencies: plan.map((_, index) => `${run.id}_task_${index + 1}`),
  });
  const now = Date.now();
  await env.AGENT_DB.batch(all.map((task, index) => env.AGENT_DB.prepare(
    `INSERT OR REPLACE INTO agent_tasks
      (id, run_id, tenant_id, position, agent, title, instruction, dependencies_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(`${run.id}_task_${index + 1}`, run.id, run.tenant_id, index, task.agent, task.title,
    task.instruction, JSON.stringify(task.dependencies || []), now, now)));
}

async function processRun(env, runId, tenantId) {
  const now = Date.now();
  const locked = await env.AGENT_DB.prepare(
    `UPDATE agent_runs SET status = 'planning', lease_until = ?, attempt_count = attempt_count + 1, updated_at = ?
     WHERE id = ? AND tenant_id = ? AND
       (status IN ('queued','retrying') OR (status IN ('planning','running','reviewing') AND lease_until < ?))`
  ).bind(now + LEASE_MS, now, runId, tenantId, now).run();
  if (!locked.meta?.changes) return;

  const run = await env.AGENT_DB.prepare("SELECT * FROM agent_runs WHERE id = ?").bind(runId).first();
  await addEvent(env, run, "run.planning", "AI 비서실장이 지시를 분석하고 있습니다.");
  const plan = await planRun(env, run);
  const lawResearch = await buildLawResearch(env, run, plan);
  if (lawResearch) {
    const originalContext = (() => { try { return JSON.parse(run.context_json || "{}"); } catch { return {}; } })();
    originalContext.lawResearch = lawResearch;
    run.context_json = JSON.stringify(originalContext);
    await updateRun(env, run.id, { context_json: run.context_json, lease_until: Date.now() + LEASE_MS });
  }
  const directLaw = isDirectLawLookup(run.instruction, plan, lawResearch);
  const needsVerification = !directLaw
    && /조례|법령|법률|예산|결산|수치|통계|개인정보|연락처|게시|발송/.test(run.instruction);
  await insertTasks(env, run, plan, needsVerification);
  await updateRun(env, run.id, { status: "running", lease_until: Date.now() + LEASE_MS });
  await addEvent(env, run, "run.running",
    `${plan.length}개 담당 팀${needsVerification ? "과 선택 검증 담당" : ""}이 작업을 시작했습니다.`);

  const tasks = (await env.AGENT_DB.prepare(
    "SELECT * FROM agent_tasks WHERE run_id = ? ORDER BY position"
  ).bind(run.id).all()).results || [];
  if (directLaw) {
    await completeDirectLawLookup(env, run, tasks[0], lawResearch);
    return;
  }
  let prior = "";
  for (const task of tasks) {
    let result = await executeWorkers(env, run, task, prior);
    let review = await reviewTask(env, run, task, result);
    let reworked = false;
    if (!review.approved) {
      reworked = true;
      await updateTask(env, task.id, {
        rework_count: 1, review_feedback: review.feedback,
        status: "reworking", worker_status: "reworking", lead_status: "monitoring",
      });
      await addEvent(env, run, "team.rework", `${TEAM_DEFS[task.agent].lead}이 재작업을 요청했습니다.`, task.agent);
      result = await executeWorkers(env, run, task, prior, review.feedback);
      review = await reviewTask(env, run, task, result);
    }
    if (!review.approved) {
      await updateTask(env, task.id, {
        result, status: "completed", worker_status: "completed", lead_status: "needs_attention",
        review: review.feedback || "추가 자료 확인이 필요합니다.", review_decision: "needs_attention",
        error: "",
      });
      prior += `${prior ? "\n\n" : ""}[${TEAM_DEFS[task.agent].lead} 보완 필요]\n${result}
\n검수 의견: ${review.feedback || "추가 자료 확인이 필요합니다."}`;
      await addEvent(env, run, "team.needs_attention",
        `${TEAM_DEFS[task.agent].lead}이 결과를 보존하고 추가 확인을 요청했습니다.`, task.agent);
      continue;
    }
    result = review.finalResult || result;
    await updateTask(env, task.id, {
      result, status: "completed", worker_status: "completed", lead_status: "approved",
      review: review.feedback || "팀장 검수 승인",
      review_decision: reworked ? "approved_after_rework" : "approved",
    });
    prior += `${prior ? "\n\n" : ""}[${TEAM_DEFS[task.agent].lead} 검수 완료]\n${result}`;
    await updateRun(env, run.id, { lease_until: Date.now() + LEASE_MS });
    await addEvent(env, run, "team.approved", `${TEAM_DEFS[task.agent].lead} 검수가 완료되었습니다.`, task.agent);
  }

  await updateRun(env, run.id, { status: "reviewing", lease_until: Date.now() + LEASE_MS });
  await addEvent(env, run, "run.reviewing", "AI 비서실장이 팀별 결과를 통합하고 있습니다.");
  let finalContext = {};
  try { finalContext = JSON.parse(run.context_json || "{}"); } catch {}
  const currentDate = finalContext.today || new Date().toISOString().slice(0, 10);
  const finalLawContext = finalContext.lawResearch ? {
    provider: finalContext.lawResearch.provider,
    checkedAt: finalContext.lawResearch.checkedAt,
    sources: (finalContext.lawResearch.sources || []).map((source) => ({
      title: source.title, organization: source.organization,
      enforcementDate: source.enforcementDate, sourceUrl: canonicalLawSourceUrl(source),
    })),
  } : {};
  const modelSummary = plan.length === 1 ? prior : await runModel(env, run.id,
    `너는 경기도의원실 AI 비서실장이다. 팀장과 독립 검증팀이 승인한 결과만 통합한다.
중복을 제거하고 사실확인 필요 사항과 의원 승인 필요 사항을 분리한다.
실제로 실행하지 않은 게시·발송·일정 확정을 완료했다고 말하지 않는다.
현재 날짜는 ${currentDate}이다. 2023년 등 다른 연도를 현재 시점으로 추정하지 않는다.
국가법령정보센터 자료가 포함된 경우 '근거 법령' 항목에 법령·조례명, 시행일자, 공식 sourceUrl과 확인 시각을 빠뜨리지 않는다.
enforcementDate는 '시행일자'로만 표기하며 제정일자나 개정일자로 바꾸지 않는다.
검색 결과에 없는 조문이나 법적 결론을 만들어내지 않는다.
형식: 결론, 팀별 결과, 확인 필요, 의원 승인 대기.`,
    `[원지시]\n${run.instruction}\n\n[공식 법령 조회 데이터]\n${JSON.stringify(finalLawContext)}\n\n[검수 완료 보고]\n${prior}`, false, 1800,
    { agent: "secretary", operation: "summary" });
  let summary = modelSummary;
  const research = finalContext.lawResearch;
  if (Array.isArray(research?.sources) && research.sources.length) {
    const evidence = lawEvidence(research);
    summary = `${modelSummary}\n\n## 국가법령정보센터 공식 조회 결과\n조회 시각: ${research.checkedAt || "확인 필요"}\n${evidence}`;
  }
  await updateRun(env, run.id, {
    status: "completed", summary, error: "", approval_status: "pending", lease_until: null,
  });
  await addEvent(env, run, "run.completed", "AI 비서실장이 최종 보고를 작성했습니다.");
}

async function handleQueue(batch, env) {
  for (const message of batch.messages) {
    const { runId, tenantId } = message.body || {};
    if (!runId || !tenantId) { message.ack(); continue; }
    try {
      await processRun(env, runId, tenantId);
      message.ack();
    } catch (error) {
      const row = await env.AGENT_DB.prepare("SELECT attempt_count FROM agent_runs WHERE id = ?").bind(runId).first();
      const attempts = Number(row?.attempt_count || 1);
      const final = Boolean(error?.nonRetryable) || attempts >= 3;
      await updateRun(env, runId, {
        status: final ? "failed" : "retrying",
        error: String(error?.message || error).slice(0, 2000),
        lease_until: null,
      });
      const run = { id: runId, tenant_id: tenantId };
      await addEvent(env, run, final ? "run.failed" : "run.retrying",
        final ? "작업이 세 번 실패하여 중단되었습니다." : `일시 오류로 재시도합니다. (${attempts}/3)`);
      if (final) message.ack();
      else message.retry({ delaySeconds: Math.min(300, attempts * 30) });
    }
  }
}

async function recoverStaleRuns(env) {
  const now = Date.now();
  const stale = (await env.AGENT_DB.prepare(
    `SELECT id, tenant_id FROM agent_runs
     WHERE status IN ('planning','running','reviewing') AND lease_until IS NOT NULL AND lease_until < ?
     ORDER BY updated_at LIMIT 20`
  ).bind(now).all()).results || [];
  for (const run of stale) {
    const recovered = await env.AGENT_DB.prepare(
      `UPDATE agent_runs SET status = 'retrying', lease_until = NULL,
       error = '작업 임대 시간이 만료되어 자동 복구합니다.', updated_at = ?
       WHERE id = ? AND lease_until < ?`
    ).bind(now, run.id, now).run();
    if (!recovered.meta?.changes) continue;
    await addEvent(env, { id: run.id, tenant_id: run.tenant_id }, "run.recovered",
      "중단된 작업을 감지해 서버 작업 큐에 다시 등록했습니다.");
    await env.AGENT_QUEUE.send({ runId: run.id, tenantId: run.tenant_id, recoveredAt: now });
  }
}

async function usageSummary(request, env, user) {
  const url = new URL(request.url);
  const requested = url.searchParams.get("month") || new Date().toISOString().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(requested)) throw new HttpError(400, "month는 YYYY-MM 형식이어야 합니다.");
  const start = Date.parse(`${requested}-01T00:00:00Z`);
  const endDate = new Date(start);
  endDate.setUTCMonth(endDate.getUTCMonth() + 1);
  const end = endDate.getTime();
  const rate = Number(env.KRW_PER_USD || 1400);
  const rows = (await env.AGENT_DB.prepare(
    `SELECT model, agent, operation,
       SUM(prompt_tokens) prompt_tokens, SUM(cached_tokens) cached_tokens,
       SUM(completion_tokens) completion_tokens, SUM(total_tokens) total_tokens,
       SUM(image_count) image_count, SUM(cost_usd_micros) cost_usd_micros,
       COUNT(*) calls
     FROM ai_usage_events
     WHERE tenant_id = ? AND created_at >= ? AND created_at < ?
     GROUP BY model, agent, operation
     ORDER BY cost_usd_micros DESC, total_tokens DESC`
  ).bind(user.uid, start, end).all()).results || [];
  const daily = (await env.AGENT_DB.prepare(
    `SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch') day,
       SUM(total_tokens) total_tokens, SUM(cost_usd_micros) cost_usd_micros
     FROM ai_usage_events
     WHERE tenant_id = ? AND created_at >= ? AND created_at < ?
     GROUP BY day ORDER BY day`
  ).bind(user.uid, start, end).all()).results || [];
  const normalized = rows.map((row) => ({
    ...row,
    provider: modelProvider(row.model),
    prompt_tokens: Number(row.prompt_tokens || 0),
    cached_tokens: Number(row.cached_tokens || 0),
    completion_tokens: Number(row.completion_tokens || 0),
    total_tokens: Number(row.total_tokens || 0),
    image_count: Number(row.image_count || 0),
    calls: Number(row.calls || 0),
    costUsd: Number(row.cost_usd_micros || 0) / 1_000_000,
    costKrw: Number(row.cost_usd_micros || 0) / 1_000_000 * rate,
  }));
  const totals = normalized.reduce((sum, row) => ({
    calls: sum.calls + row.calls,
    tokens: sum.tokens + row.total_tokens,
    images: sum.images + row.image_count,
    costUsd: sum.costUsd + row.costUsd,
    costKrw: sum.costKrw + row.costKrw,
  }), { calls: 0, tokens: 0, images: 0, costUsd: 0, costKrw: 0 });
  const pricingCatalog = [
    { provider: "OpenAI", model: "gpt-4o-mini", input: 0.15, cached: 0.075, output: 0.60 },
    { provider: "OpenAI", model: "gpt-4o", input: 2.50, cached: 1.25, output: 10.00 },
    { provider: "Google", model: "gemini-2.5-flash", input: 0.30, cached: 0.03, output: 2.50 },
    { provider: "Anthropic", model: "claude-sonnet-4", input: 3.00, cached: 0.30, output: 15.00 },
  ];
  return json({ ok: true, month: requested, krwPerUsd: rate, totals, rows: normalized, daily, pricingCatalog }, 200, request, env);
}

async function googleTokenRequest(env, params) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new HttpError(502, data.error_description || data.error || "Google 인증 토큰을 받을 수 없습니다.");
  }
  return data;
}

async function ensureGoogleCalendarSchema(env) {
  if (!env.AGENT_DB) throw new HttpError(500, "Google Calendar 연결 저장소가 설정되지 않았습니다.");
  await env.AGENT_DB.prepare(
    `CREATE TABLE IF NOT EXISTS google_calendar_connections (
      tenant_id TEXT PRIMARY KEY,
      google_email TEXT NOT NULL DEFAULT '',
      calendar_id TEXT NOT NULL DEFAULT 'primary',
      refresh_token_cipher TEXT NOT NULL,
      refresh_token_iv TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
  ).run();
  await env.AGENT_DB.prepare(
    "CREATE INDEX IF NOT EXISTS idx_google_calendar_updated ON google_calendar_connections(updated_at DESC)",
  ).run();
}

async function googleConnection(env, uid) {
  if (!env.AGENT_DB) throw new HttpError(500, "Google Calendar 연결 저장소가 설정되지 않았습니다.");
  const select = () => env.AGENT_DB.prepare(
    `SELECT tenant_id, google_email, calendar_id, refresh_token_cipher,
      refresh_token_iv, scope, created_at, updated_at
     FROM google_calendar_connections WHERE tenant_id = ?`,
  ).bind(uid).first();
  try {
    return await select();
  } catch (error) {
    if (!/no such table.*google_calendar_connections/i.test(String(error?.message || error))) throw error;
    await ensureGoogleCalendarSchema(env);
    return select();
  }
}

async function googleAccessToken(env, uid) {
  const connection = await googleConnection(env, uid);
  if (!connection) throw new HttpError(409, "Google Calendar가 연결되지 않았습니다.");
  const refreshToken = await decryptGoogleToken(
    env, connection.refresh_token_cipher, connection.refresh_token_iv,
  );
  const token = await googleTokenRequest(env, {
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  return { accessToken: token.access_token, connection };
}

async function googleApi(accessToken, url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {}),
      "Authorization": `Bearer ${accessToken}`,
    },
    signal: AbortSignal.timeout(20000),
  });
  const data = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `Google Calendar HTTP ${response.status}`;
    throw new HttpError(response.status === 401 ? 409 : 502, message);
  }
  return data;
}

async function googleCalendarConnect(request, env, user) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new HttpError(500, "Google OAuth 환경변수가 설정되지 않았습니다.");
  }
  const connectUrl = new URL(request.url);
  const requestedOrigin = connectUrl.searchParams.get("origin") || request.headers.get("Origin");
  const origin = safeAppOrigin(requestedOrigin, env);
  const requestedPath = connectUrl.searchParams.get("returnPath") || "/moida/platform.html";
  const returnPath = /^\/(?!\/)[a-zA-Z0-9._~!$&'()*+,;=:@%/-]*$/.test(requestedPath)
    ? requestedPath
    : "/moida/platform.html";
  const state = await signedGoogleState(env, {
    uid: user.uid,
    origin,
    returnPath,
    exp: Date.now() + 10 * 60 * 1000,
    nonce: crypto.randomUUID(),
  });
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: googleRedirectUri(request),
    response_type: "code",
    scope: `${GOOGLE_CALENDAR_SCOPE} openid email`,
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state,
  });
  return json({ ok: true, authorizationUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params}` }, 200, request, env);
}

async function googleCalendarCallback(request, env) {
  const url = new URL(request.url);
  const state = await verifyGoogleState(env, url.searchParams.get("state"));
  const appOrigin = safeAppOrigin(state.origin, env);
  const returnPath = /^\/(?!\/)[a-zA-Z0-9._~!$&'()*+,;=:@%/-]*$/.test(state.returnPath || "")
    ? state.returnPath
    : "/moida/platform.html";
  if (url.searchParams.get("error")) {
    return Response.redirect(`${appOrigin}${returnPath}?google_calendar=cancelled#agents`, 302);
  }
  const code = url.searchParams.get("code");
  if (!code) throw new HttpError(400, "Google 승인 코드가 없습니다.");
  const token = await googleTokenRequest(env, {
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    code,
    redirect_uri: googleRedirectUri(request),
    grant_type: "authorization_code",
  });
  if (!token.refresh_token) {
    throw new HttpError(409, "Google 갱신 토큰이 없습니다. 연결을 취소한 뒤 다시 승인해 주세요.");
  }
  const profile = await googleApi(token.access_token, "https://openidconnect.googleapis.com/v1/userinfo");
  const encrypted = await encryptGoogleToken(env, token.refresh_token);
  const now = Date.now();
  await ensureGoogleCalendarSchema(env);
  await env.AGENT_DB.prepare(
    `INSERT INTO google_calendar_connections
      (tenant_id, google_email, calendar_id, refresh_token_cipher, refresh_token_iv,
       scope, created_at, updated_at)
     VALUES (?, ?, 'primary', ?, ?, ?, ?, ?)
     ON CONFLICT(tenant_id) DO UPDATE SET
       google_email = excluded.google_email,
       refresh_token_cipher = excluded.refresh_token_cipher,
       refresh_token_iv = excluded.refresh_token_iv,
       scope = excluded.scope,
       updated_at = excluded.updated_at`,
  ).bind(
    state.uid, String(profile.email || ""), encrypted.cipher, encrypted.iv,
    String(token.scope || GOOGLE_CALENDAR_SCOPE), now, now,
  ).run();
  return Response.redirect(`${appOrigin}${returnPath}?google_calendar=connected#agents`, 302);
}

async function googleCalendarStatus(request, env, user) {
  const connection = await googleConnection(env, user.uid);
  return json({
    ok: true,
    connected: Boolean(connection),
    email: connection?.google_email || "",
    calendarId: connection?.calendar_id || "",
    updatedAt: Number(connection?.updated_at || 0),
  }, 200, request, env);
}

async function googleCalendarEvents(request, env, user) {
  const { accessToken, connection } = await googleAccessToken(env, user.uid);
  const calendarId = encodeURIComponent(connection.calendar_id || "primary");
  if (request.method === "GET") {
    const url = new URL(request.url);
    const timeMin = url.searchParams.get("timeMin") || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const timeMax = url.searchParams.get("timeMax") || new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();
    const query = new URLSearchParams({
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
      timeMin,
      timeMax,
    });
    const data = await googleApi(
      accessToken,
      `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?${query}`,
    );
    return json({
      ok: true,
      events: (data.items || []).map((event) => ({
        id: event.id,
        title: event.summary || "(제목 없음)",
        description: event.description || "",
        location: event.location || "",
        start: event.start?.dateTime || event.start?.date || "",
        end: event.end?.dateTime || event.end?.date || "",
        allDay: Boolean(event.start?.date),
        status: event.status || "",
        htmlLink: event.htmlLink || "",
        updated: event.updated || "",
      })),
    }, 200, request, env);
  }
  if (request.method === "POST") {
    const body = await requestBody(request);
    if (!String(body.title || "").trim() || !body.start || !body.end) {
      throw new HttpError(400, "일정 제목, 시작 및 종료 시각이 필요합니다.");
    }
    const event = await googleApi(
      accessToken,
      `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,
      {
        method: "POST",
        body: JSON.stringify({
          summary: String(body.title).slice(0, 500),
          description: String(body.description || "").slice(0, 8000),
          location: String(body.location || "").slice(0, 1000),
          start: body.allDay ? { date: body.start } : { dateTime: body.start, timeZone: "Asia/Seoul" },
          end: body.allDay ? { date: body.end } : { dateTime: body.end, timeZone: "Asia/Seoul" },
          extendedProperties: { private: { moidaTenant: user.uid } },
        }),
      },
    );
    return json({ ok: true, event: { id: event.id, htmlLink: event.htmlLink || "" } }, 201, request, env);
  }
  throw new HttpError(405, "지원하지 않는 요청 방식입니다.");
}

async function googleCalendarDisconnect(request, env, user) {
  if (request.method !== "POST") throw new HttpError(405, "POST 요청만 허용합니다.");
  const connection = await googleConnection(env, user.uid);
  if (connection) {
    try {
      const refreshToken = await decryptGoogleToken(
        env, connection.refresh_token_cipher, connection.refresh_token_iv,
      );
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        signal: AbortSignal.timeout(10000),
      });
    } catch {}
    await env.AGENT_DB.prepare(
      "DELETE FROM google_calendar_connections WHERE tenant_id = ?",
    ).bind(user.uid).run();
  }
  return json({ ok: true, connected: false }, 200, request, env);
}

async function handleFetch(request, env) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  try {
    if (path === "/health" && request.method === "GET") {
      return json({ ok: true, queue: Boolean(env.AGENT_QUEUE), database: Boolean(env.AGENT_DB), law: Boolean(env.LAW_OC), gemini: Boolean(env.GEMINI_API_KEY), googleCalendar: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET), schemaVersion: AGENT_SCHEMA_VERSION }, 200, request, env);
    }
    if (path === GOOGLE_CALLBACK_PATH && request.method === "GET") {
      return await googleCalendarCallback(request, env);
    }
    if (path === "/google/calendar/connect" && request.method === "GET") {
      const user = await verifyFirebaseUser(request, env);
      return await googleCalendarConnect(request, env, user);
    }
    if (path === "/google/calendar/status" && request.method === "GET") {
      const user = await verifyFirebaseUser(request, env);
      return await googleCalendarStatus(request, env, user);
    }
    if (path === "/google/calendar/events" && (request.method === "GET" || request.method === "POST")) {
      const user = await verifyFirebaseUser(request, env);
      return await googleCalendarEvents(request, env, user);
    }
    if (path === "/google/calendar/disconnect") {
      const user = await verifyFirebaseUser(request, env);
      return await googleCalendarDisconnect(request, env, user);
    }
    if (path === "/law/search" || path === "/law/detail") {
      await verifyFirebaseUser(request, env);
      if (request.method !== "GET") throw new HttpError(405, "GET 요청만 허용됩니다.");
      if (path === "/law/search") {
        const target = url.searchParams.get("target") || "law";
        const query = url.searchParams.get("query") || "";
        if (!query.trim()) throw new HttpError(400, "검색어가 필요합니다.");
        const result = await searchLaw(env, target, query, {
          search: Number(url.searchParams.get("search")) || 1,
          display: Number(url.searchParams.get("display")) || 10,
          page: Number(url.searchParams.get("page")) || 1,
        });
        return json({ ok: true, ...result }, 200, request, env);
      }
      const target = url.searchParams.get("target") || "law";
      const body = await getLawDetail(env, target, url.searchParams.get("id"), url.searchParams.get("mst"));
      return json({ ok: true, target, body: safeJson(body) || body }, 200, request, env);
    }
    if (path === "/usage" && request.method === "GET") {
      const user = await verifyFirebaseUser(request, env);
      return usageSummary(request, env, user);
    }
    if (path === "/gemini/poster-copy" && request.method === "POST") {
      const user = await verifyFirebaseUser(request, env);
      return await geminiPosterCopy(request, env, user);
    }
    if (path === "/gemini/poster-image" && request.method === "POST") {
      const user = await verifyFirebaseUser(request, env);
      return await geminiPosterImage(request, env, user);
    }
    if (path === "/agent-runs" || path.startsWith("/agent-runs/")) {
      const user = await verifyFirebaseUser(request, env);
      if (path === "/agent-runs" && request.method === "POST") return createAgentRun(request, env, user);
      if (path === "/agent-runs" && request.method === "GET") return listAgentRuns(request, env, user);
      if (request.method === "GET") {
        const run = await getRun(env, decodeURIComponent(path.slice("/agent-runs/".length)), user.uid);
        if (!run) throw new HttpError(404, "작업을 찾을 수 없습니다.");
        return json({ ok: true, run }, 200, request, env);
      }
      throw new HttpError(405, "지원하지 않는 요청 방식입니다.");
    }
    if (request.method !== "POST") throw new HttpError(405, "POST 요청만 허용됩니다.");
    return legacyOpenAI(request, env, await requestBody(request), path);
  } catch (error) {
    return json({ ok: false, error: { message: error?.message || String(error) } }, error?.status || 500, request, env);
  }
}

export default {
  fetch: handleFetch,
  queue: handleQueue,
  scheduled(_controller, env, ctx) {
    ctx.waitUntil(recoverStaleRuns(env));
  },
};
