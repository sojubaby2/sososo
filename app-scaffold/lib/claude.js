// lib/claude.js
//
// [2026-10-29 신설] AI(Claude) 부르기 — 사이트 전체가 이 한 곳을 거칩니다.
//
// 재성님: "Claude Haiku 5.5 버전을 사용할 수 있습니다 … 이거 업그레이드 하는게좋아?" → "엉 당연 바꿔줘"
//   Haiku 5.5는 4.5보다 똑똑하면서 값은 10분의 1입니다(100만 토큰당 입력 $1 → $0.10, 출력 $5 → $0.50,
//   캐시 재사용 $0.10 → $0.01). 같은 글이 토큰으로 약 30% 더 많이 세어지는 걸 감안해도 실제 비용은 7~8분의 1.
//
// 5.5로 바꾸면서 달라진 점(공식 안내 기준):
//   ① 답의 첫 글자를 미리 채워 주는 방식("{"를 먼저 넣어 두기)을 5.5는 오류(400)로 거절합니다.
//      → 대신 질문 끝에 "JSON 하나만, 맨 앞 글자는 {"라고 부탁하고, 받은 글에서 첫 "{"부터 잘라 씁니다.
//   ② 5.5는 기본으로 "생각하고 답하기"가 켜져 있고, 생각한 글자도 답 길이 제한(max_tokens)에 포함됩니다.
//      → 생각 강도를 "낮음(low)"으로 두고, 길이 제한을 넉넉히 늘립니다(실제로 쓴 만큼만 돈이 나감).
//   ③ 온도(temperature) 같은 값은 넣지 않습니다(원래도 안 넣었음).
//
// 안전장치: 5.5 호출이 실패하거나(오류·거절) 답에 JSON이 없으면, 그 자리에서 예전 4.5 방식으로 한 번 더 부릅니다.
//   혹시 5.5 쪽에 문제가 생겨도 속보 게재·브리핑이 멈추지 않게 하려는 것. 어느 쪽을 썼는지는 비용 계량기에 따로 셉니다
//   (단계 이름 뒤에 "55"가 붙으면 5.5 — lib/runStatus.js).

import { getRedis } from "./redis";
import { recordAiUsage } from "./runStatus";

export const MODEL_NEW = "claude-haiku-5-5";
export const MODEL_OLD = "claude-haiku-4-5-20251001";

const API = "https://api.anthropic.com/v1/messages";
const JSON_TAIL = "\n\n(답은 위에서 정한 형식의 JSON 객체 하나만 써. 맨 앞 글자는 반드시 { 이고, 설명·인사·코드블록 표시(```)는 붙이지 마.)";

function headers(apiKey) {
  return { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" };
}

// system: 글자(string) 그대로, cacheSystem이면 1시간 캐시 블록으로
function systemField(system, cacheSystem) {
  if (!system) return undefined;
  return cacheSystem ? [{ type: "text", text: system, cache_control: { type: "ephemeral", ttl: "1h" } }] : system;
}

// 받은 글에서 첫 "{"부터 — 코드블록 표시가 붙어 와도 괜찮게
function fromFirstBrace(text) {
  const t = String(text || "");
  const i = t.indexOf("{");
  return i >= 0 ? t.slice(i) : "";
}

/**
 * JSON으로 답을 받는 AI 호출.
 * @param {object} o
 * @param {string} o.system      지시문
 * @param {boolean} [o.cacheSystem]  지시문을 1시간 캐시에 올릴지(같은 지시문으로 자주 부르는 곳만)
 * @param {string} o.user        질문(기사 등)
 * @param {number} o.maxTokens   예전 4.5 기준 답 길이 제한 — 5.5는 생각할 몫을 더해 넉넉히 늘려서 씀
 * @param {string} o.stage       비용 계량기 단계 이름(filter, match, premarket …)
 * @returns {Promise<{ text: string, usage: object|null, model: string }>}  text는 "{"로 시작하는 JSON 글(못 받으면 "")
 */
export async function askJson({ system, cacheSystem = false, user, maxTokens = 1024, stage = "etc" }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.");
  const redis = getRedis();

  // ── 1) Haiku 5.5 ──
  let newError = "";
  try {
    const res = await fetch(API, {
      method: "POST",
      headers: headers(apiKey),
      body: JSON.stringify({
        model: MODEL_NEW,
        max_tokens: Math.max(maxTokens * 3, maxTokens + 4000),
        output_config: { effort: "low" },
        system: systemField(system, cacheSystem),
        messages: [{ role: "user", content: `${user}${JSON_TAIL}` }],
      }),
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data) {
      await recordAiUsage(redis, `${stage}55`, data.usage);
      const text = (data.content || [])
        .filter((c) => c?.type === "text")
        .map((c) => c.text || "")
        .join("");
      const json = fromFirstBrace(text);
      if (json) return { text: json, usage: data.usage || null, model: MODEL_NEW };
      newError = `JSON 없음(stop_reason: ${data.stop_reason || "?"})`;
    } else {
      newError = `HTTP ${res.status} ${JSON.stringify(data)?.slice(0, 200) || ""}`;
    }
  } catch (err) {
    newError = String(err?.message || err);
  }

  // ── 2) 안전장치: 예전 Haiku 4.5 방식(첫 글자 "{" 미리 채우기) ──
  console.warn(`[claude] Haiku 5.5 실패 → 4.5로 다시 시도 (${stage}): ${newError}`);
  const res = await fetch(API, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify({
      model: MODEL_OLD,
      max_tokens: maxTokens,
      system: systemField(system, cacheSystem),
      messages: [
        { role: "user", content: user },
        { role: "assistant", content: "{" },
      ],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Claude API 오류(5.5: ${newError.slice(0, 120)} / 4.5): ` + JSON.stringify(data).slice(0, 300));
  await recordAiUsage(redis, stage, data.usage);
  const continuation = data?.content?.find((c) => c.type === "text")?.text || "";
  return { text: "{" + continuation, usage: data.usage || null, model: MODEL_OLD };
}
