// GET /api/match?title=...&summary=...
//
// The core of the "뉴스 → 관련주 자동 매칭" pipeline. Given a news
// headline (+ optional summary), asks Claude to find which of our tracked
// stocks are genuinely related, and at what confidence tier:
//   - "confirmed": grounded in the company's actual disclosed business
//     (사업내용) — product/company named directly, or a policy/regulation
//     that hits their real business segment.
//   - "rumor": school/regional/personal-connection based, or an
//     unverified/single-source claim — no real business link.
// This mirrors the labeling the frontend already renders differently
// (see components/NewsCard.js — dashed border + "시장 추정" badge for rumor).
//
// Claude is instructed to ONLY pick from our actual tracked company list
// (never invent a ticker) and to return an empty list rather than force a
// connection when nothing genuinely fits.

import rawThemeData from "../../../lib/themeData.json";

function buildCompanyList() {
  const seen = new Map();
  for (const row of rawThemeData) {
    if (!seen.has(row.code)) {
      seen.set(row.code, `${row.code}|${row.name}|${row.market}`);
    }
  }
  return Array.from(seen.values()).join("\n");
}

// Safety net: extract just the balanced [...] portion even if Claude adds
// stray text after it despite instructions, instead of letting JSON.parse
// fail outright on trailing content.
function extractJsonArray(prefilledText) {
  let depth = 0;
  for (let i = 0; i < prefilledText.length; i++) {
    if (prefilledText[i] === "[") depth++;
    else if (prefilledText[i] === "]") {
      depth--;
      if (depth === 0) return prefilledText.slice(0, i + 1);
    }
  }
  return prefilledText;
}

const SYSTEM_PROMPT = `너는 한국 주식 뉴스와 종목을 연결하는 분석가야.

아래 [종목 목록]에 있는 종목 중에서만 골라야 해. 목록에 없는 종목이나 코드를 절대 지어내면 안 돼.

뉴스 기사 하나가 주어지면, 이 종목들 중 실제로 관련 있는 종목을 찾아서 다음 두 기준 중 하나로 분류해:

- "confirmed" (사업근거 확인): 기사에 그 회사명·제품명이 직접 언급되거나, 정부 정책·규제·계약·사고 등이 그 회사의 실제 사업 영역(매출이 발생하는 사업)에 직접 영향을 미치는 경우.
- "rumor" (시장 추정): 인맥·동창·지연 등 사업과 무관한 개인적 연결이거나, 출처가 불분명하거나 단일 커뮤니티/SNS발 추정성 정보인 경우.

진짜 관련된 종목이 없으면 반드시 빈 배열 []을 반환해. 어떻게든 연결을 만들어내려고 하지 마 — 이게 가장 중요한 규칙이야.

중요한 제약 조건 (반드시 지켜):
- 너한테는 뉴스 제목과 요약만 주어져. 본문 전체는 주어지지 않고, 앞으로도 주어지지 않아. 정보가 부족하다고 본문을 요청하거나 "정확한 판단이 어렵다"는 식으로 되묻지 마. 주어진 정보만으로 최선의 판단을 내려. 정말 판단이 안 서면 그냥 빈 배열 []을 반환해.
- 응답에는 오직 JSON 배열만 포함해야 해. 설명, 사과, 질문, 코드블록 표시(\`\`\`), 그 어떤 추가 텍스트도 앞뒤로 단 한 글자도 붙이면 안 돼. 이걸 어기면 시스템이 응답을 파싱하지 못해 완전히 실패해.

각 매치에는 reason에 왜 관련되는지 한국어로 한 문장, 20단어 이내로 설명해.

응답은 반드시 아래 JSON 배열 형식이어야 해:
[{"code":"005930","name":"삼성전자","market":"코스피","confidence":"confirmed","reason":"..."}]`;

export async function matchStocks(title, summary = "") {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.");
  }

  const companyList = buildCompanyList();
  const userMessage = `[종목 목록]\n${companyList}\n\n---\n뉴스 제목: ${title}\n뉴스 요약: ${summary}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: userMessage },
        { role: "assistant", content: "[" },
      ],
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error("Claude API 오류: " + JSON.stringify(data));
  }

  const continuation = data?.content?.find((c) => c.type === "text")?.text || "]";
  const fullJson = extractJsonArray("[" + continuation);

  try {
    return JSON.parse(fullJson);
  } catch {
    throw new Error("Claude 응답 파싱 실패: " + fullJson);
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get("title");
  const summary = searchParams.get("summary") || "";
  if (!title) {
    return Response.json(
      { error: "title 파라미터가 필요합니다. 예: /api/match?title=삼성전자+실적+발표" },
      { status: 400 }
    );
  }

  try {
    const matches = await matchStocks(title, summary);
    return Response.json({ title, matches });
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 502 });
  }
}
