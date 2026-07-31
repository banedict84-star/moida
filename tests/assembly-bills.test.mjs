import test from "node:test";
import assert from "node:assert/strict";
import { parseAssemblyBillList, parseAssemblyBillDetail } from "../gpt-worker.js";

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

test("classifies the member as representative sponsor and reads result", () => {
  const html = `
    <h2>경기도 건강가정 기본 조례 일부개정조례안</h2>
    <table>
      <tr><th>의안번호</th><td>2029</td><th>의안종류</th><td>조례안</td></tr>
      <tr><th>소관위원회</th><td>여성가족평생교육위원회</td><th>제안일</th><td>2025-07-07</td></tr>
      <tr><th>발의구분</th><td>공동발의</td></tr>
      <tr><th>대표발의</th><td><a>장윤정</a></td></tr>
      <tr><th>처리결과</th><td>원안가결</td></tr>
    </table>`;
  const result = parseAssemblyBillDetail(html, { sourceUrl: "https://example.com" }, "장윤정");
  assert.equal(result.kind, "대표발의");
  assert.equal(result.stage, "원안가결");
  assert.equal(result.progress, 100);
  assert.equal(result.billNo, "2029");
});

test("keeps one-person proposals separate", () => {
  const html = `
    <h2>청원 소개의 건</h2>
    <dl><dt>발의구분</dt><dd>1인발의</dd><dt>대표발의</dt><dd>장윤정</dd></dl>`;
  const result = parseAssemblyBillDetail(html, {}, "장윤정");
  assert.equal(result.kind, "1인발의");
});
