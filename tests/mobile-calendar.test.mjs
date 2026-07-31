import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../schedule.html", import.meta.url), "utf8");

test("모바일 캘린더는 가로 7열 대신 날짜별 일정 목록을 사용한다", () => {
  assert.match(html, /<div class="cal-mobile-list" id="calMobileList"><\/div>/);
  assert.match(html, /@media\(max-width:700px\)[\s\S]*?\.cal-grid\{display:none\}/);
  assert.match(html, /\.cal-mobile-list\{display:flex;flex-direction:column\}/);
  assert.match(html, /mobileDays\.push\('<div class="cal-mobile-day"/);
});

test("모바일 일정과 생일 항목은 기존 상세 보기를 연다", () => {
  assert.match(html, /mobileList\.addEventListener\('click'/);
  assert.match(html, /showBirthdayDetail\(birthday\.getAttribute\('data-birthday-key'\)\)/);
  assert.match(html, /rows\[i\]\.click\(\)/);
});
