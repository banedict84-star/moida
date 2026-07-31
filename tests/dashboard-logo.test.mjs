import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../platform.html", import.meta.url), "utf8");

test("대시보드 브랜드는 MOIDA 점 세 개 연결 로고를 사용한다", () => {
  const sidebarHead = html.match(/<div class="sb-head"[\s\S]*?<div class="sb-brandtext"/)?.[0] || "";
  assert.match(sidebarHead, /aria-label="MOIDA"/);
  assert.match(sidebarHead, /M7 8\.5 12 14\.5 17 8\.5/);
  assert.match(sidebarHead, /<circle cx="7" cy="8" r="2\.6"/);
  assert.match(sidebarHead, /<circle cx="17" cy="8" r="2\.6"/);
  assert.match(sidebarHead, /<circle cx="12" cy="15\.5" r="3\.1"/);
});
