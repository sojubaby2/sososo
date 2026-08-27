// GET /api/match?title=...&summary=...
//
// The core of the "뉴스 → 관련주 자동 매칭" pipeline. Given a news
// headline (+ optional summary), asks Claude for two things:
//
//   A) matches — stocks DIRECTLY tied to the article, tiered:
//      - "confirmed": grounded in the company's actual disclosed business
//        (사업내용) — product/company named directly, or a policy/regulation
//        that hits their real business segment.
//      - "rumor": school/regional/personal-connection based, or an
//        unverified/single-source claim — no real business link.
//   B) themes — any of our 109 tracked investment themes the article is
//      clearly about (e.g. "해저케이블(전선)", "로봇"). We then pull in
//      that theme's other tracked stocks ourselves (tier: "theme") — so an
//      article about, say, a submarine-cable-laying robot surfaces the
//      whole cable basket AND the robot basket, not just the one company
//      literally named in the text.
//
// This mirrors the labeling the frontend already renders differently
// (see components/NewsCard.js).
//
// Claude is instructed to ONLY pick from our actual tracked company/theme
// lists (never invent a ticker or theme name) and to return empty results
// rather than force a connection when nothing genuinely fits.

import rawThemeData from "../../../lib/themeData.json";
import { buildSubsidiaryPromptBlock } from "../../../lib/subsidiaryMap";

function buildCompanyList() {
  const seen = new Map();
  for (const row of rawThemeData) {
    if (!seen.has(row.code)) seen.set(row.code, `${row.code}|${row.name}|${row.market}`);
  }
  return Array.from(seen.values()).join("\n");
}

function buildThemeList() {
  return Array.from(new Set(rawThemeData.map((r) => r.theme))).sort().join("\n");
}

// For each theme Claude flagged as relevant, pull in that theme's other
// tracked stocks (capped, and skipping anything already matched directly).
// Comparison strips whitespace so small formatting differences (e.g.
// "사이버보안" vs "사이버 보안") don't silently fail the match.
function normalizeThemeName(s) {
  return (s || "").replace(/\s+/g, "");
}

const MAX_STOCKS_PER_THEME = 6;
function expandThemeMatches(themeNames, existingCodes) {
  const added = [];
  for (const themeName of themeNames || []) {
    const target = normalizeThemeName(themeName);
    let count = 0;
    for (const row of rawThemeData) {
      if (normalizeThemeName(row.theme) !== target) continue;
      if (existingCodes.has(row.code)) continue;
      if (count >= MAX_STOCKS_PER_THEME) break;
      added.push({
        code: row.code,
        name: row.name,
        market: row.market,
        confidence: "theme",
        reason: `'${row.theme}' 테마 동반 종목`,
      });
      existingCodes.add(row.code);
      count++;
    }
  }
  return added;
}

// Safety net: extract just the balanced {...} portion even if Claude adds
// stray text after it despite instructions, instead of letting JSON.parse
// fail outright on trailing content.
function extractJsonObject(prefilledText) {
  let depth = 0;
  for (let i = 0; i < prefilledText.length; i++) {
    if (prefilledText[i] === "{") depth++;
    else if (prefilledText[i] === "}") {
      depth--;
      if (depth === 0) return prefilledText.slice(0, i + 1);
    }
  }
  return prefilledText;
}

const SYSTEM_PROMPT = `너는 한국 주식 뉴스와 종목/테마를 연결하는 분석가야.

너한테는 세 가지 목록이 주어져:
1. [테마 목록]: 우리가 추적하는 투자 테마 이름들
2. [종목 목록]: 코드|이름|시장 형식의 개별 종목들
3. [계열사-모회사 매핑]: 비상장(또는 목록에 코드가 없는) 자회사 이름 → 그 자회사를 소유한 상장 모회사

뉴스 기사 하나가 주어지면, 두 가지를 판단해:

**A. 직접 관련 종목 (matches)**: [종목 목록]에 있는 종목 중, 이 기사와 실제로 관련 있는 종목을 찾아 분류해. 목록에 없는 종목·코드는 절대 지어내면 안 돼.
- "confirmed" (사업근거 확인): 그 회사명·제품명이 기사에 직접 언급되거나, 정부 정책·규제·계약·사고 등이 그 회사의 실제 사업 영역(매출이 발생하는 사업)에 직접 영향을 미치는 경우.
- "rumor" (시장 추정): 구체적으로 존재하는 연결고리(예: 특정 인물과의 동창·지연 관계, 커뮤니티/SNS에 도는 특정 소문)가 있는 경우에만 사용해. "업종이 비슷해서 관련 있을 것 같다", "AI 관련 기업으로 추정된다" 같은 막연한 추측은 "rumor"가 아니야 — 그런 경우엔 matches에 아예 넣지 말고, 대신 아래 [B. 관련 테마]에서 해당 업종 테마를 골라서 처리해. 왜 관련되는지 한 문장으로 명확히 설명 못 하겠으면 애초에 넣지 마.

**비상장 자회사 처리 규칙**: 기사에 [계열사-모회사 매핑]에 있는 자회사 이름이 나오고, 그 자회사에 대한 사업적으로 의미 있는 소식이 있다면, 매핑에 적힌 모회사를 "confirmed"로 포함시켜. reason에 "자회사 OOO 관련 소식"이라고 명시해.

**주의**: 기사에 나온 회사가 [계열사-모회사 매핑]에는 없지만 [종목 목록]에 자기 자신의 코드로 이미 있다면, 모회사로 연결하지 말고 그 회사 자신의 코드로 매칭해. 모회사 연결은 오직 매핑 목록에 있는 자체 코드 없는 회사에만 적용해.

**B. 관련 테마 (themes)**: [테마 목록]에 있는 테마 이름 중, 이 기사 내용과 명확히 관련된 테마가 있으면 골라. 테마 이름은 목록에 있는 것과 정확히 똑같이 적어야 해(하나도 안 틀리게). 예를 들어 해저케이블 시공 확대 기사라면 "해저케이블(전선)"을, 매설로봇 관련 내용이 함께 있으면 "로봇"도 같이 골라 — 기사 하나에 관련 테마가 여러 개일 수 있어. 명확히 관련된 테마가 없으면 빈 배열로 둬. 억지로 테마를 끼워 맞추지 마.

진짜 관련된 게 없으면 matches와 themes 둘 다 빈 배열([])로 반환해.

중요한 제약 조건 (반드시 지켜):
- 너한테는 뉴스 제목과 요약만 주어져. 본문 전체는 주어지지 않고, 앞으로도 주어지지 않아. 정보가 부족하다고 본문을 요청하거나 되묻지 마. 주어진 정보만으로 최선의 판단을 내려.
- 응답에는 오직 아래 형식의 JSON 객체만 포함해야 해. 설명, 사과, 질문, 코드블록 표시(\`\`\`), 그 어떤 추가 텍스트도 앞뒤로 단 한 글자도 붙이면 안 돼. 이걸 어기면 시스템이 응답을 파싱하지 못해 완전히 실패해.

각 매치에는 reason에 왜 관련되는지 한국어로 한 문장, 20단어 이내로 설명해.

응답은 반드시 아래 JSON 객체 형식이어야 해:
{"matches":[{"code":"005930","name":"삼성전자","market":"코스피","confidence":"confirmed","reason":"..."}],"themes":["반도체"]}`;

export async function matchStocks(title, summary = "") {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.");
  }

  const staticContext = `${SYSTEM_PROMPT}\n\n[테마 목록]\n${buildThemeList()}\n\n[종목 목록]\n${buildCompanyList()}\n\n[계열사-모회사 매핑]\n${buildSubsidiaryPromptBlock()}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1536,
      system: [
        {
          type: "text",
          text: staticContext,
          cache_control: { type: "ephemeral", ttl: "1h" },
        },
      ],
      messages: [
        { role: "user", content: `뉴스 제목: ${title}\n뉴스 요약: ${summary}` },
        { role: "assistant", content: "{" },
      ],
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error("Claude API 오류: " + JSON.stringify(data));
  }

  const continuation = data?.content?.find((c) => c.type === "text")?.text || "}";
  const fullJson = extractJsonObject("{" + continuation);

  let parsed;
  try {
    parsed = JSON.parse(fullJson);
  } catch {
    throw new Error("Claude 응답 파싱 실패: " + fullJson);
  }

  const directMatches = Array.isArray(parsed.matches) ? parsed.matches : [];
  const existingCodes = new Set(directMatches.map((m) => m.code));
  const identifiedThemes = Array.isArray(parsed.themes) ? parsed.themes : [];
  const themeMatches = expandThemeMatches(identifiedThemes, existingCodes);

  return { matches: [...directMatches, ...themeMatches], identifiedThemes };
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
    const { matches, identifiedThemes } = await matchStocks(title, summary);
    return Response.json({ title, matches, identifiedThemes });
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 502 });
  }
}
