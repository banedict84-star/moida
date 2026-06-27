/****************************************************************
 * 가죽공예 단체수업 — 신청 접수 엔진 (Google Apps Script)
 *
 * 하는 일:
 *  1) 신청 페이지(apply.html)에서 보낸 신청을 구글시트에 자동 정리
 *  2) 신청자가 적은 이메일로 견적서를 자동 발송
 *
 * 설치 방법 (한 번만, 약 5분):
 *  1. 구글 드라이브에서 새 '구글 시트' 생성 → 메뉴 [확장프로그램] > [Apps Script]
 *  2. 기본 코드 지우고 이 파일 내용을 통째로 붙여넣기
 *  3. 아래 CONFIG의 공방 정보·단가를 실제 값으로 수정
 *  4. 오른쪽 위 [배포] > [새 배포] > 유형 '웹 앱' 선택
 *       - 실행 계정: 나
 *       - 액세스 권한: '모든 사용자'
 *     → [배포] → 권한 허용(본인 구글 계정) → '웹 앱 URL' 복사
 *  5. apply.html 의 ENDPOINT 에 그 URL 붙여넣기 → 끝!
 ****************************************************************/

const CONFIG = {
  bizName: '우리가죽공방',        // 공방/업체명
  owner: '',                      // 대표자명
  phone: '010-0000-0000',         // 대표 연락처
  bizEmail: '',                   // 회신받을 이메일(선택)
  vat: 10,                        // 부가세 %
  perTeacher: 15,                 // 강사 1명당 담당 인원
  travel: 50000,                  // 강사 1인 출장비
  notifyMe: '',                   // 새 신청 알림 받을 내 이메일(선택, 비우면 알림 안감)
};

// 단가표 — 신청 페이지(apply.html)의 PRICES 와 똑같이 맞추세요
const PRICES = {
  '키링/팔찌':      { kit: 8000,  fee: 12000, level: '쉬움' },
  '카드지갑':        { kit: 12000, fee: 18000, level: '쉬움' },
  '반지갑':          { kit: 20000, fee: 25000, level: '보통' },
  '장지갑':          { kit: 35000, fee: 35000, level: '어려움' },
  '에코백/토트백':   { kit: 40000, fee: 40000, level: '어려움' },
};

function won(n){ return (Math.round(n)||0).toLocaleString('ko-KR') + '원'; }

function quote(people, itemName){
  const p = PRICES[itemName] || Object.values(PRICES)[0];
  people = Number(people) || 0;
  const need = Math.max(1, Math.ceil(people / CONFIG.perTeacher));
  const kitTotal = p.kit * people;
  const feeTotal = p.fee * people;
  const travel = need * CONFIG.travel;
  const supply = kitTotal + feeTotal + travel;
  const vat = Math.round(supply * CONFIG.vat / 100);
  return { p, people, need, kitTotal, feeTotal, travel, supply, vat, total: supply + vat };
}

// 신청 페이지에서 POST로 들어옴
function doPost(e){
  try{
    const d = e.parameter;
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    // 헤더 자동 생성
    if (sheet.getLastRow() === 0){
      sheet.appendRow(['접수일시','단체/기관명','담당자','연락처','이메일','인원','희망날짜','품목','지역','요청사항','예상견적','상태']);
    }
    const q = quote(d.people, d.item);
    sheet.appendRow([
      new Date(), d.org||'', d.mgr||'', d.contact||'', d.email||'',
      d.people||'', d.date||'', d.item||'', d.loc||'', d.memo||'',
      q.total, '신규접수'
    ]);

    // 신청자에게 견적 자동 발송
    if (d.email){
      MailApp.sendEmail({
        to: d.email,
        subject: `[${CONFIG.bizName}] 가죽공예 단체수업 견적 안내`,
        htmlBody: quoteHtml(d, q),
        name: CONFIG.bizName,
      });
    }
    // 나에게 새 신청 알림
    if (CONFIG.notifyMe){
      MailApp.sendEmail(CONFIG.notifyMe,
        `🧵 새 신청: ${d.org} (${d.people}명, ${d.item})`,
        `단체: ${d.org}\n담당: ${d.mgr} / ${d.contact} / ${d.email}\n인원: ${d.people}\n품목: ${d.item}\n날짜: ${d.date}\n지역: ${d.loc}\n요청: ${d.memo}\n예상견적: ${won(q.total)}`);
    }
    return ContentService.createTextOutput(JSON.stringify({ok:true})).setMimeType(ContentService.MimeType.JSON);
  }catch(err){
    return ContentService.createTextOutput(JSON.stringify({ok:false, error:String(err)})).setMimeType(ContentService.MimeType.JSON);
  }
}

// 배포 확인용 (브라우저로 URL 열면 보임)
function doGet(){
  return ContentService.createTextOutput('가죽공예 신청 엔진이 정상 작동 중입니다. ✅');
}

function quoteHtml(d, q){
  return `
  <div style="font-family:'Apple SD Gothic Neo',Malgun Gothic,sans-serif;max-width:560px;color:#2a221d">
    <div style="background:#7a4f2c;color:#fff;padding:20px;border-radius:14px 14px 0 0">
      <div style="font-size:22px;font-weight:800">가죽공예 단체수업 견적 안내</div>
      <div style="opacity:.85;font-size:13px;margin-top:4px">${CONFIG.bizName}</div>
    </div>
    <div style="border:1px solid #eee;border-top:0;padding:20px;border-radius:0 0 14px 14px">
      <p>안녕하세요, <b>${d.org||''}</b> ${d.mgr||''}님.<br>문의 주신 가죽공예 단체수업 견적 안내드립니다.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin:14px 0">
        <tr><td style="padding:8px;color:#888">품목 / 인원</td><td style="padding:8px;text-align:right"><b>${d.item} · ${d.people}명</b></td></tr>
        <tr><td style="padding:8px;color:#888">희망 일정</td><td style="padding:8px;text-align:right">${d.date||'협의'}</td></tr>
        <tr><td style="padding:8px;color:#888">재료키트</td><td style="padding:8px;text-align:right">${won(q.kitTotal)}</td></tr>
        <tr><td style="padding:8px;color:#888">수업료</td><td style="padding:8px;text-align:right">${won(q.feeTotal)}</td></tr>
        <tr><td style="padding:8px;color:#888">강사 ${q.need}명 출장비</td><td style="padding:8px;text-align:right">${won(q.travel)}</td></tr>
        <tr><td style="padding:8px;color:#888">부가세(${CONFIG.vat}%)</td><td style="padding:8px;text-align:right">${won(q.vat)}</td></tr>
        <tr style="border-top:2px solid #7a4f2c"><td style="padding:10px 8px;font-size:17px;font-weight:800;color:#7a4f2c">합계</td><td style="padding:10px 8px;text-align:right;font-size:17px;font-weight:800;color:#7a4f2c">${won(q.total)}</td></tr>
      </table>
      <p style="font-size:13px;color:#666">· 재료키트·강사·도구 일체 포함 출장수업입니다.<br>· 세금계산서 발행 가능하며, 일정 확정 시 정식 견적서를 보내드립니다.</p>
      <p style="margin-top:16px">${CONFIG.bizName} ${CONFIG.owner}<br>☎ ${CONFIG.phone} ${CONFIG.bizEmail?('· ✉ '+CONFIG.bizEmail):''}</p>
    </div>
  </div>`;
}
