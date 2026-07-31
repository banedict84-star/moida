import test from "node:test";
import assert from "node:assert/strict";
import { parseAssemblyBillList, parseAssemblyBillLinks, parseAssemblyBillDetail } from "../gpt-worker.js";

test("parses Gyeonggi Assembly bill list rows", () => {
  const html = `
    <table><tbody><tr>
      <td>11</td><td>2029</td>
      <td><a href="/site/lwmkr/blog/app/motionBillList/DetailView/11033/9492">경기도 건강가정 기본 조례 일부개정조례안</a></td>
      <td>의원</td><td>여성가족평생교육위원회</td><td>2025-07-07</td>
    </tr></tbody></table>`;
  assert.deepEqual(parseAssemblyBillList(html), [{
    id: "9492",
    billNo: "2029",
    name: "경기도 건강가정 기본 조례 일부개정조례안",
    committee: "여성가족평생교육위원회",
    proposedAt: "2025-07-07",
    sourceUrl: "https://www.ggc.go.kr/site/lwmkr/blog/app/motionBillList/DetailView/11033/9492",
  }]);
});

test("parses bill links from the member home page fallback", () => {
  const html = '<ul><li><a href="/site/lwmkr/blog/app/motionBillList/DetailView/11017/9492">경기도 건강가정 기본 조례 일부개정조례안</a><span>2025.07.07</span></li></ul>';
  assert.deepEqual(parseAssemblyBillLinks(html), [{
    id: "9492", billNo: "", name: "경기도 건강가정 기본 조례 일부개정조례안", committee: "",
    proposedAt: "2025-07-07", sourceUrl: "https://www.ggc.go.kr/site/lwmkr/blog/app/motionBillList/DetailView/11017/9492",
  }]);
});

test("classifies the member as representative sponsor and reads result", () => {
  const html = `
    <h2>경기도 건강가정 기본 조례 일부개정조례안</h2>
    <table>
      <tr><th>의안번호</th><td>2029</td><th>의안종류</th><td>조례안</td></tr>
      <tr><th>소관위원회</th><td>여성가족평생교육위원회</td><th>제안일</th><td>2025-07-07</td></tr>
      <tr><th>발의구분</th><td>공동발의</td></tr>
      <tr><th>대표발의</th><td><a>장윤정</a></td></tr>
      <tr><th>공동발의</th><td>김동희 김영희 김옥순</td></tr>
      <tr><th>제안회기</th><td>제 11 대 - 385회</td></tr>
      <tr><th>처리결과</th><td>원안가결</td></tr>
    </table>
    <h3>의안요지</h3><p>가족센터의 안정적인 설치와 운영에 필요한 근거를 마련한다.</p>
    <div>원안파일 <a href="/site/agendaif/file/download/uu/example">2029. 조례안.hwpx</a></div>`;
  const result = parseAssemblyBillDetail(html, { sourceUrl: "https://example.com" }, "장윤정");
  assert.equal(result.kind, "대표발의");
  assert.equal(result.stage, "원안가결");
  assert.equal(result.progress, 100);
  assert.equal(result.billNo, "2029");
  assert.equal(result.proposalSession, "제 11 대 - 385회");
  assert.equal(result.coSponsors, "김동희 김영희 김옥순");
  assert.match(result.summary, /가족센터/);
  assert.deepEqual(result.files, [{
    name: "2029. 조례안.hwpx",
    url: "https://www.ggc.go.kr/site/agendaif/file/download/uu/example",
  }]);
});

test("keeps one-person proposals separate", () => {
  const html = `
    <h2>청원 소개의 건</h2>
    <dl><dt>발의구분</dt><dd>1인발의</dd><dt>대표발의</dt><dd>장윤정</dd></dl>`;
  const result = parseAssemblyBillDetail(html, {}, "장윤정");
  assert.equal(result.kind, "1인발의");
});
