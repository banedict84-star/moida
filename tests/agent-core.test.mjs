import test from "node:test";
import assert from "node:assert/strict";
import {
  AGENT_SCHEMA_VERSION,
  fallbackPlan,
  normalizePlan,
  publicRun,
  safeJson,
  selectTaskWorkers,
} from "../agent-core.js";

test("한국어 지시를 관련 팀으로 분류한다", () => {
  const plan = fallbackPlan("지역 행사 일정을 정리하고 주민에게 알릴 홍보 글을 작성해줘");
  assert.deepEqual(plan.map((task) => task.agent), ["schedule", "localpr"]);
});

test("법령과 조례 검토 지시는 정책팀으로 분류한다", () => {
  const plan = fallbackPlan("경기도 청소년 지원 조례와 관련 상위법을 찾아서 검토해줘");
  assert.deepEqual(plan.map((task) => task.agent), ["policy"]);
});

test("조례 검색은 조례검토 에이전트만 선택한다", () => {
  const workers = selectTaskWorkers("policy", "경기도 청소년 조례와 상위법을 찾아서 검토해줘");
  assert.deepEqual(workers.map((worker) => worker[0]), ["ordinance"]);
});

test("복합 정책 지시는 필요한 정책팀원만 선택한다", () => {
  const workers = selectTaskWorkers("policy", "청소년 조례를 검토하고 정책 영향 분석과 도정질문을 작성해줘");
  assert.deepEqual(workers.map((worker) => worker[0]), ["ordinance", "analysis", "speech"]);
});

test("일정 확인은 일정관리 담당만 선택한다", () => {
  const workers = selectTaskWorkers("schedule", "내일 일정을 확인해줘");
  assert.deepEqual(workers.map((worker) => worker[0]), ["calendar"]);
});

test("법령 검증은 법률·조례검토 담당만 선택한다", () => {
  const workers = selectTaskWorkers("verification", "조례와 상위법 충돌을 검증해줘");
  assert.deepEqual(workers.map((worker) => worker[0]), ["legal"]);
});

test("허용되지 않은 팀을 제거하고 최대 8개로 제한한다", () => {
  const plan = normalizePlan({
    tasks: [
      { agent: "unknown", title: "위험" },
      { agent: "audit", title: "행감 준비", instruction: "자료를 검토" },
    ],
  }, "행정사무감사를 준비해");
  assert.equal(plan.length, 1);
  assert.equal(plan[0].agent, "audit");
});

test("코드 펜스로 감싼 JSON을 읽는다", () => {
  assert.deepEqual(safeJson("```json\n{\"approved\":true}\n```"), { approved: true });
});

test("D1 내부 필드를 공개 작업 형태로 변환한다", () => {
  const run = publicRun({
    schema_version: 5, id: "run_1", tenant_id: "tenant_1", instruction: "검토해",
    status: "completed", summary: "완료", error: "", approval_status: "pending",
    created_at: 1, updated_at: 2,
  }, [{
    id: "task_1", run_id: "run_1", agent: "policy", title: "정책 검토",
    instruction: "검토해", status: "completed", worker_status: "completed",
    lead_status: "approved", dependencies_json: "[]", subtasks_json: "[]",
    created_at: 1, updated_at: 2,
  }], []);
  assert.equal(run.schemaVersion, AGENT_SCHEMA_VERSION);
  assert.equal(run.tasks[0].leadStatus, "approved");
  assert.equal(run.approvalStatus, "pending");
});

test('의정 질문·행감·민원 후속 업무를 전문 담당과 산출물로 분리한다',()=>{
 assert.deepEqual(fallbackPlan('도정질문 발언문 작성').map(t=>t.agent),['policy']);
 assert.deepEqual(fallbackPlan('행감 질의서 준비').map(t=>t.agent),['audit']);
 const plan=fallbackPlan('민원 회신과 후속 확인 목록 작성');assert.deepEqual(plan.map(t=>t.agent),['civil','records']);
 assert.notEqual(plan[0].instruction,plan[1].instruction);assert.match(plan[0].instruction,/담당기관/);assert.match(plan[1].instruction,/미결/);
});

test('명시한 담당만 배정하며 관계없는 키워드로 팀을 추가하지 않는다',async()=>{
 const {assignmentPlan}=await import('../agent-core.js');
 const plan=assignmentPlan('민원 회신을 준비하되 법령 근거와 일정은 확인 필요',[{agent:'civil',instruction:'민원 회신 초안'},{agent:'organization',instruction:'간담회 의제'},{agent:'records',instruction:'후속 확인 목록'}]);
 assert.deepEqual(plan.map(t=>t.agent),['civil','organization','records']);
 assert.deepEqual(selectTaskWorkers('organization',plan[1].instruction).map(w=>w[0]),['meeting']);
 assert.throws(()=>assignmentPlan('업무',[{agent:'unknown',instruction:'작업'}]),/담당 팀/);
 assert.throws(()=>assignmentPlan('업무',[{agent:'civil',instruction:'작업'},{agent:'civil',instruction:'중복'}]),/담당 팀/);
});
