import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../news.html", import.meta.url), "utf8");

test("모바일 뉴스 검색창과 수집 버튼은 화면 폭 안에서 세로 배치된다", () => {
  assert.match(html, /@media\(max-width:700px\)[\s\S]*?\.news-search\{ display:grid;/);
  assert.match(html, /\.news-go\{ grid-column:1 \/ -1; width:100%/);
  assert.match(html, /\.news-chips\{ flex-wrap:nowrap; overflow-x:auto;/);
});

test("모바일 뉴스 상세는 기사 선택 전 숨기고 선택 후 표시한다", () => {
  assert.match(html, /\.ndetail\{ display:none;/);
  assert.match(html, /\.ndetail\.has-article\{ display:block;/);
  assert.match(html, /ndetail\.classList\.add\('has-article'\)/);
  assert.match(html, /ndetail\.classList\.remove\('has-article'\)/);
});

test("모바일에서 기사 선택 시 상세 영역으로 이동한다", () => {
  assert.match(html, /matchMedia\('\(max-width:700px\)'\)/);
  assert.match(html, /ndetail\.scrollIntoView\(\{behavior:'smooth',block:'start'\}\)/);
});
