# MOIDA AI 멀티에이전트 1단계

## 목표

경기도의원의 지시를 AI 비서실장이 의정활동과 지역활동으로 분류하고 전문 팀장에게 배정한다. 팀원이 초안을 만들면 각 팀장이 검수하고, 직속 검증팀을 통과한 결과만 비서실장이 통합한다.

1단계에서는 기존 연락처·일정·민원·정책 데이터를 변경하지 않는다. 멀티에이전트 실행 기록은 별도 컬렉션에 저장한다.

## 조직 구성

- 의정활동 본부
  - 조례·정책팀
  - 예산·행정사무감사팀
  - 의정활동 홍보팀
- 지역활동 본부
  - 일정·수행팀
  - 지역현안·민원팀
  - 지역조직·CRM팀
  - 지역활동 홍보팀
- 비서실장 직속
  - 행정·기록팀
  - 독립 검증팀

각 팀은 팀장 1명과 전문 팀원 3명으로 구성한다. AI 비서실장 1명, 팀장 9명, 전문 팀원 27명으로 총 37개 역할이 등록되며 지시에 필요한 팀만 소집한다.

## 데이터 구조

```text
tenants/{tenantId}/agent_runs/{runId}
  schemaVersion
  id
  tenantId
  instruction
  status            planning | running | reviewing | completed | failed
  taskIds[]
  summary
  error
  createdAt
  updatedAt

tenants/{tenantId}/agent_tasks/{taskId}
  schemaVersion
  id
  runId
  tenantId
  agent             schedule | policy | audit | civil | organization | assemblypr | localpr | records | verification
  title
  instruction
  status            queued | delegating | running | reviewing | reworking | completed | failed
  workerStatus      queued | running | reworking | completed | failed
  leadStatus        queued | delegating | monitoring | reviewing | approved | failed
  dependencies[]
  result
  review
  reviewFeedback
  reviewDecision
  reworkCount
  subtasks[]
    id
    workerId
    name
    role
    status
    result
    error
    updatedAt
  error
  createdAt
  updatedAt
```

각 작업을 개별 문서로 저장하므로 한 작업의 상태 변경이 다른 작업을 덮어쓰지 않는다. 브라우저가 오프라인이거나 Firestore 저장에 실패하면 의원실별 로컬 캐시에 동일한 실행 기록을 보관한다.

## 실행 흐름

1. 의원 지시 접수
2. AI 비서실장이 의정활동·지역활동을 구분하고 필요한 팀장에게 업무 배정
3. 팀장이 분야별 전문 팀원 3명에게 하위 작업을 병렬 배정
4. 팀원 3명이 앞선 팀의 결과를 참고해 각자 초안 작성
5. 각 팀장이 원지시·사실확인·안전 규칙 기준으로 결과 검수
6. 핵심 누락이 있으면 팀원에게 한 차례 재작업 요청
7. 각 팀 검수 승인 결과를 직속 검증팀이 사실·법률·개인정보 기준으로 재검증
8. 검증을 통과한 결과만 AI 비서실장에게 보고
9. AI 비서실장이 팀별 보고를 통합해 의원에게 전달

## 1단계 안전 제한

- 외부 SNS 게시 및 보도자료 발송 금지
- 문자·메일·메신저 발송 금지
- 일정 확정 및 기존 업무 데이터 자동 변경 금지
- 확인되지 않은 사실을 완료된 사실로 보고하지 않음
- 결과는 의원 승인 전까지 초안으로 취급

## 다음 단계

- Firebase ID 토큰을 검증하는 서버 작업 실행기
- 승인 대기 및 승인 후 실행 상태
- 백그라운드 작업 큐와 재시도
- 에이전트별 비용·사용량 제한
- Firestore 실시간 구독과 역할별 보안 규칙
