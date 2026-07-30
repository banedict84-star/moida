import {
  AGENT_SCHEMA_VERSION,
  TEAM_DEFS,
  createRunId,
  normalizePlan,
  publicRun,
  safeJson,
} from "./agent-core.js";

const PRODUCTION_ORIGIN = "https://banedict84-star.github.io";
const MAX_INSTRUCTION_LENGTH = 12000;
const MAX_CONTEXT_LENGTH = 50000;
const MAX_MODEL_CALLS = 40;
const MAX_RESERVED_TOKENS = 30000;
const LEASE_MS = 15 * 60 * 1000;

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
  return data.choices[0].message.content || "";
}

async function legacyOpenAI(request, env, body, path) {
  if (!env.OPENAI_API_KEY) throw new HttpError(500, "OPENAI_API_KEY가 설정되지 않았습니다.");
  const base = String(env.OPENAI_BASE || "https://api.openai.com/v1").replace(/\/+$/, "");
  if (path.endsWith("/image")) {
    const response = await fetch(`${base}/images/generations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: "gpt-image-1", size: "1024x1536", n: 1, quality: "high", ...body }),
    });
    return new Response(await response.text(), {
      status: response.status,
      headers: { ...corsHeaders(request, env), "Content-Type": "application/json; charset=utf-8" },
    });
  }
  if (path.endsWith("/image-edit")) {
    const form = new FormData();
    form.append("model", "gpt-image-1");
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
    return new Response(await response.text(), {
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
  return new Response(await response.text(), {
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

async function runModel(env, runId, system, user, jsonOnly = false, maxTokens = 1400) {
  await reserveModelCall(env, runId, maxTokens);
  return openAI(env, {
    model: env.AGENT_MODEL || "gpt-4o-mini",
    temperature: 0.25,
    max_tokens: maxTokens,
    ...(jsonOnly ? { response_format: { type: "json_object" } } : {}),
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
  });
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
  const system = `너는 경기도의원실 AI 비서실장이다. 지시를 전문 팀 작업으로 분해한다.
허용 agent: schedule, policy, audit, civil, organization, assemblypr, localpr, records.
외부 게시·발송·일정 확정은 하지 않고 검토 가능한 초안만 만든다.
JSON만 반환: {"tasks":[{"agent":"policy","title":"","instruction":"","dependencies":[]}]}`;
  let value;
  try { value = safeJson(await runModel(env, run.id, system, run.instruction, true, 1000)); } catch { value = null; }
  return normalizePlan(value, run.instruction);
}

function workerPrompt(run, task, worker, prior, feedback) {
  return {
    system: `너는 경기도의원실 ${TEAM_DEFS[task.agent].lead} 산하의 ${worker[1]} 담당 AI 팀원이다.
전문 역할: ${worker[2]}
맡은 범위만 구체적으로 수행하고, 외부 게시·발송·일정 확정·데이터 변경을 실행하지 않는다.
확인되지 않은 내용은 반드시 '확인 필요'로 표시한다.`,
    user: `[의원 원지시]\n${run.instruction}\n\n[팀 담당 업무]\n${task.instruction}
\n\n[읽기 전용 참고 데이터]\n${run.context_json || "{}"}
\n\n[앞선 팀 결과]\n${prior || "없음"}${feedback ? `\n\n[팀장 재작업 요청]\n${feedback}` : ""}`,
  };
}

async function executeWorkers(env, run, task, prior, feedback = "") {
  const workers = TEAM_DEFS[task.agent].workers;
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
  await addEvent(env, run, "team.started", `${TEAM_DEFS[task.agent].lead}이 팀원 3명에게 업무를 배정했습니다.`, task.agent);

  const results = await Promise.all(workers.map(async (worker, index) => {
    const prompt = workerPrompt(run, task, worker, prior, feedback);
    try {
      const result = await runModel(env, run.id, prompt.system, prompt.user, false, 1200);
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
  const system = `너는 경기도의원실 ${TEAM_DEFS[task.agent].lead}이다.
팀원 결과가 원지시를 충족하는지 검수한다. 사실 미확인, 과장, 누락, 외부 실행 허위 주장을 엄격히 찾는다.
JSON만 반환: {"approved":true,"feedback":"","finalResult":""}`;
  const raw = await runModel(env, run.id, system,
    `[원지시]\n${run.instruction}\n\n[담당 업무]\n${task.instruction}\n\n[팀원 결과]\n${result}`, true, 1200);
  const value = safeJson(raw) || {};
  const review = {
    approved: value.approved !== false,
    feedback: String(value.feedback || ""),
    finalResult: String(value.finalResult || result),
  };
  // 독립 검증팀의 지적은 숨기거나 전체 작업을 재실행하지 않고 최종 보고의
  // 확인 필요 항목으로 전달한다. 실제 외부 행동은 어차피 승인 전까지 실행되지 않는다.
  if (task.agent === "verification" && !review.approved) {
    review.approved = true;
    review.feedback = `검증 결과 보완 필요: ${review.feedback || "근거와 표현을 최종 확인해야 합니다."}`;
  }
  return review;
}

async function insertTasks(env, run, plan) {
  const all = [...plan, {
    agent: "verification",
    title: "독립 검증팀 최종 검증",
    instruction: "각 팀장이 승인한 결과를 사실·수치, 법률·조례, 개인정보·문서 품질 기준으로 독립 검증한다.",
    dependencies: plan.map((_, index) => `${run.id}_task_${index + 1}`),
  }];
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
  await insertTasks(env, run, plan);
  await updateRun(env, run.id, { status: "running", lease_until: Date.now() + LEASE_MS });
  await addEvent(env, run, "run.running", `${plan.length}개 담당 팀과 독립 검증팀이 작업을 시작했습니다.`);

  const tasks = (await env.AGENT_DB.prepare(
    "SELECT * FROM agent_tasks WHERE run_id = ? ORDER BY position"
  ).bind(run.id).all()).results || [];
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
  const summary = await runModel(env, run.id,
    `너는 경기도의원실 AI 비서실장이다. 팀장과 독립 검증팀이 승인한 결과만 통합한다.
중복을 제거하고 사실확인 필요 사항과 의원 승인 필요 사항을 분리한다.
실제로 실행하지 않은 게시·발송·일정 확정을 완료했다고 말하지 않는다.
형식: 결론, 팀별 결과, 확인 필요, 의원 승인 대기.`,
    `[원지시]\n${run.instruction}\n\n[검수 완료 보고]\n${prior}`, false, 1800);
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

async function handleFetch(request, env) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  try {
    if (path === "/health" && request.method === "GET") {
      return json({ ok: true, queue: Boolean(env.AGENT_QUEUE), database: Boolean(env.AGENT_DB), schemaVersion: AGENT_SCHEMA_VERSION }, 200, request, env);
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
