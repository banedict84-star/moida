// Standard short-context prices, USD per million tokens. Verified 2026-10-13.
export const PRICING_SOURCE = 'https://developers.openai.com/api/docs/pricing';
export const PRICING_CHECKED = '2026-10-13';
export const TEXT_PRICES = [
  {model:'gpt-6-luna',label:'GPT 6 Luna',description:'빠른 일상 업무',input:0.1,cached:0.01,output:0.5,longInput:0.2,longOutput:0.75},
  {model:'gpt-6.1-sol',label:'GPT 6.1 Sol',description:'문서·분석·복잡한 업무',input:2,cached:0.1,output:10,longInput:4,longOutput:15},
  {model:'gpt-6-astra',label:'GPT 6 Astra',description:'심층 조사·고난도 업무',input:10,cached:1,output:50,longInput:20,longOutput:75},
];
export function aiModelInfo(env){
  return {
    checkedAt:PRICING_CHECKED,source:PRICING_SOURCE,currency:'USD',unit:'100만 토큰',tier:'Standard · 짧은 문맥',
    models:TEXT_PRICES,
    configured:[
      {name:'모아 기본 대화',model:env.SECRETARY_MODEL||'gpt-6-luna',note:'대화창에서 Luna·Sol·Astra 선택 가능'},
      {name:'웹페이지·데이터 분석·예약 작업',model:env.BUILTIN_TEXT_MODEL||'gpt-6.1-sol'},
      {name:'심층 조사',model:env.BUILTIN_RESEARCH_MODEL||'gpt-6-astra'},
      {name:'이미지 생성·편집',model:env.BUILTIN_IMAGE_MODEL||'gpt-image-2',note:'요청을 처리하는 대화 모델 비용도 별도 발생'},
      {name:'음성 대화',model:env.SECRETARY_VOICE_MODEL||'gpt-realtime-2.1'},
      {name:'녹음 전사',model:'gpt-4o-mini-transcribe'},
    ],
    toolPrices:[
      {name:'인터넷 검색',price:'$0.01 / 호출',note:'검색 결과를 읽는 토큰 비용 별도'},
      {name:'데이터 분석',price:'1GB $0.03 / 20분 컨테이너 세션',note:'메모리·실행 시간에 따라 달라짐. 대화 토큰 별도'},
      {name:'이미지 생성·편집 · GPT Image 2',price:'이미지 입력 $4 · 캐시 $1 · 출력 $15 / 100만 토큰',note:'텍스트 입력 $2.50 · 캐시 $0.625. 크기·품질에 따라 이미지당 비용 변동'},
      {name:'음성 대화 · GPT Realtime 2.1',price:'오디오 입력 $32 · 캐시 $0.40 · 출력 $64 / 100만 토큰',note:'텍스트 입력 $4 · 캐시 $0.40 · 출력 $24. 이미지 입력 $5 · 캐시 $0.50'},
      {name:'녹음 전사',price:'약 $0.003 / 분',note:'GPT 4o Mini Transcribe 기준 예상 단가'},
      {name:'심층 조사·예약 작업',price:'실행한 모델·도구 사용량에 따라 과금',note:'심층 조사는 검색 호출 비용도 포함. 예약 설정 자체는 AI 호출 없음'},
    ],
    coverage:'이 화면은 모이다 사용 기록에 저장된 호출만 집계합니다. 모아 Agents 대화·기본 도구의 백그라운드 작업·음성·전사·검색 및 컨테이너 추가 요금은 아직 전체 집계되지 않습니다. 총 청구액은 OpenAI 결제 화면에서 확인하세요.',
    estimateNote:'현재 공개 Standard 짧은 문맥 단가로 계산한 참고 예상치입니다. 긴 문맥·처리 등급·캐시 쓰기·도구 추가 요금·환율·세금에 따라 실제 청구액이 달라집니다.',
  };
}
