export const AGENT_SCHEMA_VERSION = 5;
export const ALLOWED_AGENTS = new Set([
  "schedule", "policy", "audit", "civil", "organization",
  "assemblypr", "localpr", "records",
]);

export const TEAM_DEFS = {
  schedule: { lead: "일정·수행팀장", workers: [
    ["calendar", "일정관리", "날짜·시간·장소와 일정 충돌을 정리한다."],
    ["protocol", "의전·동선", "행사 의전, 이동 동선, 준비사항을 점검한다."],
    ["coordination", "연락·조율", "관계자 연락과 확인·조율 항목을 정리한다."],
  ]},
  policy: { lead: "조례·정책팀장", workers: [
    ["ordinance", "조례검토", "조례안과 상위법·유사 조례를 비교한다."],
    ["analysis", "정책분석", "정책 쟁점, 영향, 대안을 분석한다."],
    ["speech", "도정질문·발언", "도정질문과 자유발언 초안을 작성한다."],
  ]},
  audit: { lead: "예산·행감팀장", workers: [
    ["budget", "예산·결산", "경기도 예산과 결산 수치를 분석한다."],
    ["request", "요구자료", "행정사무감사 요구자료 목록과 목적을 작성한다."],
    ["question", "행감질의", "실적과 과거 지적사항을 바탕으로 질의서를 작성한다."],
  ]},
  civil: { lead: "민원팀장", workers: [
    ["triage", "민원분류", "민원 분야·긴급도·담당기관을 분류한다."],
    ["response", "답변초안", "민원인에게 전달할 답변 초안을 작성한다."],
    ["followup", "처리추적", "현장 확인과 담당 부서 처리기한을 정리한다."],
  ]},
  organization: { lead: "조직팀장", workers: [
    ["contacts", "연락처관리", "주민·단체·기관 관계 정보를 정리한다."],
    ["meeting", "간담회관리", "간담회 대상·의제·후속조치를 정리한다."],
    ["opinion", "지역여론", "지역별 현안과 주민 의견을 요약한다."],
  ]},
  assemblypr: { lead: "의정홍보팀장", workers: [
    ["briefing", "의정성과정리", "조례·예산·행감·도정질문 성과를 정리한다."],
    ["press", "의정보도자료", "의정활동 중심의 보도자료 초안을 작성한다."],
    ["content", "의정SNS", "본회의·위원회 활동을 SNS 콘텐츠로 구성한다."],
  ]},
  localpr: { lead: "지역홍보팀장", workers: [
    ["field", "현장소식", "현장방문·간담회·지역행사 소식을 작성한다."],
    ["solution", "민원해결홍보", "민원 해결 과정과 성과를 주민 관점으로 정리한다."],
    ["channel", "지역채널", "지역 커뮤니티와 SNS용 콘텐츠를 작성한다."],
  ]},
  records: { lead: "기록팀장", workers: [
    ["minutes", "회의록", "회의와 간담회 내용을 구조화해 기록한다."],
    ["documents", "공문·보고서", "공문과 내부 보고서 초안을 작성한다."],
    ["archive", "자료보관", "업무 결과와 근거자료의 분류 기준을 정리한다."],
  ]},
  verification: { lead: "검증팀장", workers: [
    ["facts", "사실·수치검증", "근거, 날짜, 수치, 인용을 검증한다."],
    ["legal", "법률·조례검토", "법률·조례 충돌과 권한 범위를 점검한다."],
    ["privacy", "개인정보·품질", "개인정보 노출, 표현 위험, 문서 품질을 확인한다."],
  ]},
};

export function selectTaskWorkers(agent, instruction) {
  const workers = TEAM_DEFS[agent]?.workers || [];
  const text = String(instruction || "");
  const selectedIds = [];
  const add = (id) => { if (!selectedIds.includes(id)) selectedIds.push(id); };
  const rules = {
    policy: [
      ["ordinance", /조례|법령|법률|시행령|시행규칙|자치법규|상위법|조문|판례/],
      ["analysis", /정책\s*(분석|검토|평가|대안)|영향\s*분석|사업\s*(분석|평가)|공약\s*(분석|검토)/],
      ["speech", /도정\s*질문|도정질문|자유\s*발언|발언문|질의서|질문서/],
    ],
    schedule: [
      ["calendar", /일정|시간|날짜|캘린더|충돌/], ["protocol", /의전|동선|수행|방문/], ["coordination", /연락|조율|참석자/],
    ],
    audit: [
      ["budget", /예산|결산|금액|집행/], ["request", /요구자료|자료\s*목록/], ["question", /행감|행정사무감사|질의|질문/],
    ],
    civil: [
      ["triage", /분류|긴급도|담당기관/], ["response", /답변|회신/], ["followup", /처리|추적|기한|현장\s*확인/],
    ],
    organization: [
      ["contacts", /연락처|CRM|명부/], ["meeting", /간담회|회의/], ["opinion", /여론|주민\s*의견|현안/],
    ],
    assemblypr: [
      ["briefing", /성과|브리핑|요약/], ["press", /보도자료|언론/], ["content", /SNS|게시글|콘텐츠|카드뉴스/],
    ],
    localpr: [
      ["field", /현장|방문|행사|간담회/], ["solution", /민원|해결|성과/], ["channel", /SNS|게시글|커뮤니티|콘텐츠/],
    ],
    records: [
      ["minutes", /회의록|간담회\s*기록/], ["documents", /공문|보고서|문서/], ["archive", /보관|아카이브|분류/],
    ],
    verification: [
      ["legal", /조례|법령|법률|권한/], ["facts", /수치|통계|예산|날짜|인용|사실/], ["privacy", /개인정보|연락처|민감|표현/],
    ],
  };
  (rules[agent] || []).forEach(([id, pattern]) => { if (pattern.test(text)) add(id); });

  return selectedIds.length
    ? selectedIds.map((id) => workers.find((worker) => worker[0] === id)).filter(Boolean)
    : workers.slice(0, 1);
}

export function createRunId(now = Date.now(), random = Math.random()) {
  return `run_${now.toString(36)}_${Math.floor(random * 0xffffff).toString(36).padStart(5, "0")}`;
}

export function fallbackPlan(instruction) {
  const text = String(instruction || "");
  const agents = [];
  const add = (name) => { if (!agents.includes(name)) agents.push(name); };
  if (/일정|행사|시간|장소|방문|회의/.test(text)) add("schedule");
  if (/정책|법안|조례|질의|공약|법령|법률|시행령|시행규칙|자치법규|조문|상위법|판례/.test(text)) add("policy");
  if (/예산|결산|행정사무감사|행감|요구자료|피감기관/.test(text)) add("audit");
  if (/민원|지역현안|현장확인|처리기한|담당부서/.test(text)) add("civil");
  if (/조직|단체|연락처|CRM|간담회|지역여론/.test(text)) add("organization");
  if (/홍보|보도|SNS|사진|웹자보|콘텐츠|언론/.test(text)) {
    if (/조례|예산|행감|도정질문|본회의|상임위|의정/.test(text)) add("assemblypr");
    if (/지역|현장|민원|간담회|행사|주민/.test(text)) add("localpr");
    if (!agents.includes("assemblypr") && !agents.includes("localpr")) add("assemblypr");
  }
  if (/회의록|공문|보고서|기록|보관|아카이브/.test(text)) add("records");
  if (!agents.length) add("policy");
  return agents.map((agent) => ({
    agent,
    title: `${TEAM_DEFS[agent].lead} 담당 업무`,
    instruction: text,
    dependencies: [],
  }));
}

export function normalizePlan(value, instruction) {
  const tasks = Array.isArray(value?.tasks) ? value.tasks : [];
  const normalized = tasks
    .filter((task) => task && ALLOWED_AGENTS.has(task.agent))
    .slice(0, 8)
    .map((task) => ({
      agent: task.agent,
      title: String(task.title || `${TEAM_DEFS[task.agent].lead} 담당 업무`).slice(0, 160),
      instruction: String(task.instruction || instruction).slice(0, 8000),
      dependencies: Array.isArray(task.dependencies) ? task.dependencies.map(String).slice(0, 8) : [],
    }));
  return normalized.length ? normalized : fallbackPlan(instruction);
}

export function safeJson(text) {
  const cleaned = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(cleaned); } catch {}
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch {}
  }
  return null;
}

export function publicRun(row, tasks = [], events = []) {
  return {
    schemaVersion: Number(row.schema_version || AGENT_SCHEMA_VERSION),
    id: row.id,
    tenantId: row.tenant_id,
    instruction: row.instruction,
    status: row.status,
    summary: row.summary || "",
    error: row.error || "",
    approvalStatus: row.approval_status || "not_required",
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    tasks: tasks.map((task) => ({
      schemaVersion: AGENT_SCHEMA_VERSION,
      id: task.id,
      runId: task.run_id,
      agent: task.agent,
      title: task.title,
      instruction: task.instruction,
      status: task.status,
      workerStatus: task.worker_status,
      leadStatus: task.lead_status,
      result: task.result || "",
      review: task.review || "",
      reviewFeedback: task.review_feedback || "",
      reviewDecision: task.review_decision || "",
      reworkCount: Number(task.rework_count || 0),
      error: task.error || "",
      dependencies: parseStoredJson(task.dependencies_json, []),
      subtasks: parseStoredJson(task.subtasks_json, []),
      createdAt: Number(task.created_at),
      updatedAt: Number(task.updated_at),
    })),
    events: events.map((event) => ({
      id: event.id,
      type: event.type,
      agent: event.agent || "",
      message: event.message,
      createdAt: Number(event.created_at),
    })),
  };
}

export function parseStoredJson(value, fallback) {
  try { return JSON.parse(value || ""); } catch { return fallback; }
}
