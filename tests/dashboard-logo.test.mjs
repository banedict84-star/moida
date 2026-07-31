import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../platform.html", import.meta.url), "utf8");

test("대시보드 브랜드는 MOIDA 점 세 개 연결 로고를 사용한다", () => {
  const sidebarHead = html.match(/<div class="sb-head"[\s\S]*?<div class="sb-brandtext"/)?.[0] || "";
  assert.match(sidebarHead, /class="moida-brand-box"/);
  assert.match(sidebarHead, /aria-label="MOIDA"/);
  assert.match(sidebarHead, /M6\.5 7\.5 12 15\.5 17\.5 7\.5/);
  assert.equal((sidebarHead.match(/r="2\.55"/g) || []).length, 3);
});

test("펼침과 접힘 상태에서 MOIDA 로고 위치와 크기를 동일하게 유지한다", () => {
  assert.match(html, /\.moida-brand-box\{width:36px;height:36px;/);
  assert.match(html, /\.moida-brand-box svg\{display:block;width:22px;height:22px;/);
  assert.match(html, /#sideBar\.collapsed \.sb-head\{position:relative;justify-content:flex-start;padding:20px 18px 16px\}/);
});
