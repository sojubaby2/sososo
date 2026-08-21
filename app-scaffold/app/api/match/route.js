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

const SYSTEM_PROMPT = `너는 한국 주식 뉴스와 종목을 연결하는 분석가야.

아래 [종목 목록]에 있는 종목 중에서만 골라야 해. 목록에 없는 종목이나 코드를 절대 지어내면 안 돼.

뉴스 기사 하나가 주어지면, 이 종목들 중 실제로 관련 있는 종목을 찾아서 다음 두 기준 중 하나로 분류해:

- "confirmed" (사업근거 확인): 기사에 그 회사명·제품명이 직접 언급되거나, 정부 정책·규제·계약·사고 등이 그 회사의 실제 사업 영역(매출이 발생하는 사업)에 직접 영향을 미치는 경우.
- "rumor" (시장 추정): 인맥·동창·지연 등 사업과 무관한 개인적 연결이거나, 출처가 불분명하거나 단일 커뮤니티/SNS발 추정성 정보인 경우.

진짜 관련된 종목이 없으면 반드시 빈 배열 []을 반환해. 어떻게든 연결을 만들어내려고 하지 마 — 이게 가장 중요한 규칙이야.

각 매치에는 reason에 왜 관련되는지 한국어로 한 문장, 20단어 이내로 설명해.

응답은 반드시 아래 JSON 배열 형식이어야 하고, 그 외의 텍스트(설명, 인사말, 코드블록 표시 등)는 절대 포함하지 마:
[{"code":"005930","name":"삼성전자","market":"코스피","confidence":"confirmed","reason":"..."}]`;

export async function GET(request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다." },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const title = searchParams.get("title");
  const summary = searchParams.get("summary") || "";
  if (!title) {
    return Response.json(
      { error: "title 파라미터가 필요합니다. 예: /api/match?title=삼성전자+실적+발표" },
      { status: 400 }
    );
  }

  const companyList = buildCompanyList();
  const userMessage = `[종목 목록]\n${companyList}\n\n---\n뉴스 제목: ${title}\n뉴스 요약: ${summary}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      // The assistant turn is prefilled with "[" so Claude continues
      // directly into a JSON array instead of adding preamble text —
      // makes the response reliably parseable.
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
      return Response.json({ error: "Claude API 오류", detail: data }, { status: res.status });
    }

    const continuation = data?.content?.find((c) => c.type === "text")?.text || "]";
    const fullJson = "[" + continuation;

    let matches;
    try {
      matches = JSON.parse(fullJson);
    } catch {
      return Response.json({ error: "Claude 응답 파싱 실패", raw: fullJson }, { status: 502 });
    }

    return Response.json({ title, matches });
  } catch (err) {
    return Response.json({ error: "Claude API 호출 실패", detail: String(err) }, { status: 502 });
  }
}
