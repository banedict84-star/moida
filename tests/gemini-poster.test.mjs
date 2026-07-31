import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker from "../gpt-worker.js";

const originalFetch = globalThis.fetch;

function request(path, body) {
  return new Request(`https://worker.example${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer firebase-token",
      "Origin": "https://banedict84-star.github.io",
    },
    body: JSON.stringify(body),
  });
}

function env() {
  return {
    FIREBASE_API_KEY: "firebase-key",
    GEMINI_API_KEY: "gemini-key",
    ALLOW_ORIGINS: "https://banedict84-star.github.io",
  };
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("Gemini 웹자보 문구를 인증 후 구조화해 반환한다", async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).includes("identitytoolkit.googleapis.com")) {
      return Response.json({ users: [{ localId: "member-1", email: "member@example.com" }] });
    }
    return Response.json({
      candidates: [{
        content: {
          parts: [{
            text: "```json\n" + JSON.stringify({
              title: "현장에서 답을 찾겠습니다",
              message: "주민의 목소리를 정책으로 잇겠습니다",
              body: "현장의 의견을 꼼꼼히 듣고 의정활동에 반영하겠습니다.",
              category: "현장소통",
            }) + "\n```",
          }],
        },
      }],
      usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 15, totalTokenCount: 35 },
    });
  };

  const response = await worker.fetch(request("/gemini/poster-copy", {
    title: "주민 간담회",
    place: "행정복지센터",
  }), env());
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(data.ok, true);
  assert.equal(data.result.category, "현장소통");
  assert.match(calls[1].url, /gemini-3\.6-flash:generateContent/);
  assert.equal(calls[1].options.headers["x-goog-api-key"], "gemini-key");
});

test("Gemini 웹자보 이미지를 데이터 URL로 반환한다", async () => {
  let geminiBody;
  globalThis.fetch = async (url, options) => {
    if (String(url).includes("identitytoolkit.googleapis.com")) {
      return Response.json({ users: [{ localId: "member-1" }] });
    }
    geminiBody = JSON.parse(options.body);
    return Response.json({
      status: "completed",
      steps: [{
        type: "model_output",
        content: [{ type: "image", mime_type: "image/jpeg", data: "aW1hZ2U=" }],
      }],
      usage: { total_input_tokens: 12, total_output_tokens: 24, total_tokens: 36 },
    });
  };

  const response = await worker.fetch(request("/gemini/poster-image", {
    title: "복지관 현장 방문",
    message: "현장에서 듣고 정책으로 답하겠습니다",
    category: "현장소통",
    ratio: "4:5",
  }), env());
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.equal(data.ok, true);
  assert.equal(data.image, "data:image/jpeg;base64,aW1hZ2U=");
  assert.match(geminiBody.input[0].text, /현장에서 듣고 정책으로 답하겠습니다/);
  assert.match(geminiBody.input[0].text, /현장소통/);
});

test("비서실장 웹자보는 단계별 질문 후 최종 확인에서 생성한다", () => {
  const html = readFileSync(new URL("../platform.html", import.meta.url), "utf8");
  assert.match(html, /1\/5 · 웹자보 내용/);
  assert.match(html, /2\/5 · 날짜와 시간/);
  assert.match(html, /3\/5 · 장소/);
  assert.match(html, /4\/5 · 핵심 메시지/);
  assert.match(html, /5\/5 · 디자인 분위기/);
  assert.match(html, /웹자보 생성 전 확인/);
  assert.match(html, /if\(posterWizard\)\{answerPosterWizard\(text\);return;\}/);
  assert.match(html, /if\(isPosterCreationRequest\(text\)\)\{startPosterWizard\(\);return;\}/);
});

test("Gemini 키가 없으면 설정 방법을 알린다", async () => {
  globalThis.fetch = async (url) => {
    if (String(url).includes("identitytoolkit.googleapis.com")) {
      return Response.json({ users: [{ localId: "member-1" }] });
    }
    throw new Error("Gemini API를 호출하면 안 됩니다.");
  };
  const missingKeyEnv = env();
  delete missingKeyEnv.GEMINI_API_KEY;

  const response = await worker.fetch(request("/gemini/poster-copy", { title: "행사" }), missingKeyEnv);
  const data = await response.json();

  assert.equal(response.status, 503);
  assert.match(data.error.message, /GEMINI_API_KEY/);
});
