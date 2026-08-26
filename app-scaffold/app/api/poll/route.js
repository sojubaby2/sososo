// GET /api/poll
//
// This is the endpoint the external scheduler (cron-job.org) hits once a
// minute. For each watched keyword:
//   1. Fetch latest articles from Naver News Search (sort=date)
//   2. Skip already-processed articles (dedup via Redis, keyed on title)
//   3. Cheaply pre-filter out low-value articles (obituaries, event promos,
//      celebrity news, mechanical price-only reports, etc.) before spending
//      money on the expensive full match step
//   4. For articles that pass, ask Claude for:
//      - directly-named stocks (now pickable from the FULL KOSPI/KOSDAQ
//        universe, not just our curated ~750-stock theme database — so a
//        company outside our theme DB can still show up if it's actually
//        named in the article)
//      - a single PRIMARY theme (the article's real core focus — e.g.
//        "원자재(리튬)" for a lithium-supply story, not the broader
//        "2차전지" it's adjacent to) and up to 2 SECONDARY themes
//   5. Expand primary theme first, then secondary themes, using our
//      curated theme→stock groupings (this is the one thing the curated DB
//      is still needed for — the full KRX list has no theme structure)
//   6. Sort everything by today's price change% (today's strongest movers
//      first) — this naturally pushes sluggish mega-caps like 삼성전자·
//      SK하이닉스 down the list without needing a hardcoded blacklist,
//      since they rarely move as much % as smaller reactive names on the
//      same news. (True multi-day momentum/"대장주" ranking would need an
//      accumulated price-history database — not built yet, this is a
//      same-day proxy for it.)
//   7. Cap at 9 stocks total
//   8. Save to the published feed

import { getRedis } from "../../../lib/redis";
import rawThemeData from "../../../lib/themeData.json";

const WATCHED_KEYWORDS = ["증권"];
const ARTICLES_PER_KEYWORD = 5;
const SEEN_TTL_SECONDS = 60 * 60 * 24 * 7; // remember an article for 7 days
const FEED_MAX_LENGTH = 100;
const MAX_STOCKS_PER_PRIMARY_THEME = 6;
const MAX_STOCKS_PER_SECONDARY_THEME = 3;
const MAX_TOTAL_MATCHES = 9;

function stripHtml(str = "") {
  return str
    .replace(/<b>/g, "")
    .replace(/<\/b>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'");
}

async function fetchNaverNews(query) {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 환경변수가 설정되지 않았습니다.");
  }
  const qs = new URLSearchParams({ query, display: String(ARTICLES_PER_KEYWORD), sort: "date", format: "json" });
  const url = `https://naverapihub.apigw.ntruss.com/search/v1/news?${qs.toString()}`;
  const res = await fetch(url, {
    headers: { "X-NCP-APIGW-API-KEY-ID": clientId, "X-NCP-APIGW-API-KEY": clientSecret },
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) throw new Error("네이버 뉴스 API 오류: " + JSON.stringify(data));
  return (data.items || []).map((it) => ({
    title: stripHtml(it.title),
    summary: stripHtml(it.description),
    link: it.originallink || it.link,
    pubDate: it.pubDate,
  }));
}

// ---------------------------------------------------------------------------
// Full KOSPI/KOSDAQ universe, fetched fresh once per poll cycle (not per
// article). Same "try the most recent business day, walk back if that
// day's data isn't published yet" logic as app/api/stocks/route.js —
// duplicated here (rather than imported) so this file stays self-contained.
// ---------------------------------------------------------------------------
function toBasDt(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${dd}`;
}

function* businessDaysBackFrom(from) {
  const d = new Date(from);
  while (true) {
    d.setDate(d.getDate() - 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) yield toBasDt(d);
  }
}

async function fetchStockPage(serviceKey, basDt, numOfRows, pageNo) {
  const qs = new URLSearchParams({ numOfRows, pageNo, resultType: "json", basDt });
  const url = `https://apis.data.go.kr/1160100/service/GetStockSecuritiesInfoService/getStockPriceInfo?serviceKey=${serviceKey}&${qs.toString()}`;
  const res = await fetch(url, { cache: "no-store" });
  return res.json();
}

// Returns { items: [{srtnCd,itmsNm,mrktCtg,clpr,fltRt,...}], basDt } or null.
async function fetchAllStocksToday() {
  const serviceKey = process.env.KRX_SERVICE_KEY;
  if (!serviceKey) return null;
  const gen = businessDaysBackFrom(new Date());
  for (let i = 0; i < 5; i++) {
    const basDt = gen.next().value;
    const data = await fetchStockPage(serviceKey, basDt, "3000", "1");
    const items = data?.response?.body?.items?.item ?? [];
    if (items.length > 0) return { items, basDt };
  }
  return null;
}

function marketLabel(mrktCtg) {
  if (mrktCtg === "KOSPI") return "코스피";
  if (mrktCtg === "KOSDAQ") return "코스닥";
  return mrktCtg || "";
}

// Builds the full-universe "code|name|market" list Claude picks direct
// matches from, plus a code -> {price, change} lookup used for sorting.
function buildUniverseFromKrx(krxItems) {
  const lines = [];
  const priceMap = new Map();
  for (const it of krxItems) {
    if (!it.srtnCd || !it.itmsNm) continue;
    lines.push(`${it.srtnCd}|${it.itmsNm}|${marketLabel(it.mrktCtg)}`);
    priceMap.set(it.srtnCd, { price: Number(it.clpr), change: Number(it.fltRt) });
  }
  return { companyList: lines.join("\n"), priceMap };
}

function buildThemeList() {
  return Array.from(new Set(rawThemeData.map((r) => r.theme))).sort().join("\n");
}

function normalizeThemeName(s) {
  return (s || "").replace(/\s+/g, "");
}

// tier: "primary" | "secondary" — controls both the per-theme stock cap and
// the reason text, so the frontend/ordering can tell them apart.
function expandThemeMatches(themeNames, tier, cap, existingCodes) {
  const added = [];
  for (const themeName of themeNames || []) {
    const target = normalizeThemeName(themeName);
    let count = 0;
    for (const row of rawThemeData) {
      if (normalizeThemeName(row.theme) !== target) continue;
      if (existingCodes.has(row.code)) continue;
      if (count >= cap) break;
      added.push({
        code: row.code,
        name: row.name,
        market: row.market,
        confidence: "theme",
        tier,
        reason: `'${row.theme}' 테마 동반 종목${tier === "primary" ? " (핵심 테마)" : ""}`,
      });
      existingCodes.add(row.code);
      count++;
    }
  }
  return added;
}

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

너한테는 두 가지 목록이 주어져:
1. [전체 상장 종목]: 코스피·코스닥에 상장된 전체 종목 (코드|이름|시장 형식)
2. [테마 목록]: 우리가 관리하는 투자 테마 이름들

뉴스 기사 하나가 주어지면, 세 가지를 판단해:

**A. 직접 관련 종목 (matches)**: [전체 상장 종목] 중에서, 이 기사와 실제로 관련 있는 종목을 찾아. 목록에 없는 종목·코드는 절대 지어내면 안 돼.

[전체 상장 종목]에는 [테마 목록]에서 다루는 회사들보다 훨씬 많은 회사가 들어있어. 테마 목록에 없는 회사라도 절대 무시하지 마 — 네가 원래 알고 있는 배경지식(그 회사가 실제로 어떤 사업을 하는지, 무슨 제품을 만드는지)을 적극적으로 활용해서 [전체 상장 종목] 전체를 대상으로 판단해. 익숙한 대기업이 아니거나 우리가 미리 분류해두지 않은 회사라는 이유로 후보에서 제외하지 마 — 실제로 관련 있다면 반드시 포함시켜.

- "confirmed" (사업근거 확인): 그 회사명·제품명이 기사에 직접 언급되거나, 정부 정책·규제·계약·사고 등이 그 회사의 실제 사업 영역에 직접 영향을 미치는 경우.
- "rumor" (시장 추정): 구체적으로 존재하는 연결고리(특정 인물과의 동창·지연 관계, 커뮤니티에 도는 특정 소문)가 있을 때만. 막연한 업종 추측은 여기 넣지 말고 아예 빼.

**B. 핵심 테마 (primary_theme)**: [테마 목록] 중, 이 기사의 "가장 좁고 정확한 핵심 초점" 딱 하나만 골라. 예를 들어 전기차 배터리에 쓰이는 리튬 공급 얘기라면 "2차전지"가 아니라 "원자재(리튬)"을 골라야 해 — 기사가 진짜 말하고 있는 게 뭔지가 기준이야. 명확한 핵심이 없으면 null.

**C. 부가 테마 (secondary_themes)**: 핵심만큼은 아니지만 함께 언급되거나 부차적으로 관련된 테마들. 최대 2개까지만, 배열로. 없으면 빈 배열.

우선순위 판단 예시: "리튬 공급 부족으로 배터리 업체 비상"이라는 기사라면 → primary_theme: "원자재(리튬)", secondary_themes: ["2차전지"]. 자동차 완성차 얘기가 기사에 없다면 자동차 테마는 넣지 마.

진짜 관련된 게 없으면 matches는 빈 배열, primary_theme은 null, secondary_themes는 빈 배열.

중요한 제약 조건 (반드시 지켜):
- 너한테는 뉴스 제목과 요약만 주어져. 본문을 요청하거나 되묻지 마. 주어진 정보만으로 최선의 판단을 내려.
- 응답에는 오직 아래 형식의 JSON 객체만 포함해야 해. 설명, 사과, 코드블록 표시 등 그 어떤 추가 텍스트도 붙이면 안 돼.

각 matches 항목의 reason은 한국어 한 문장, 20단어 이내.

응답은 반드시 아래 JSON 객체 형식이어야 해:
{"matches":[{"code":"005930","name":"삼성전자","market":"코스피","confidence":"confirmed","reason":"..."}],"primary_theme":"반도체","secondary_themes":[]}`;

const FILTER_SYSTEM_PROMPT = `너는 한국 주식시장 뉴스 큐레이터야. 주어진 뉴스 제목·요약이 "주가에 실질적 영향을 줄 수 있는 구체적 재료(촉매) 뉴스"인지 판단해.

**포함해야 할 것** (예시 — 이런 성격의 뉴스):
- 대기업의 중소기업 인수·투자
- 신약 임상시험(FDA 등) 결과, 기술수출 계약
- 대통령·정부 고위 인사의 특정 산업 관련 정책·관세 발언
- 빅테크 리더(예: 젠슨황)의 산업에 영향력 있는 발언
- 해킹, 개인정보 유출 등 보안 사고
- 감염병 확산 등 공중보건 이슈
- 대규모 공급계약·수주·기술수출
- 반도체 등 핵심 부품 공급망 리스크
- 대규모 투자유치·IPO·자금조달
- 시장 예상과 크게 다른 실적이고 그 구체적 이유가 설명된 경우
- 해외 대규모 공장 투자·진출
- 신기술 인증 등 사업적으로 유의미한 이벤트
- 횡령·대규모 소송·심각한 경영 위기 등으로 인한 주가 급변동

**제외해야 할 것** (예시 — 이런 건 걸러내):
- 부고, 인사동정 등 개인 신상 소식
- 경품·이벤트·프로모션 홍보성 뉴스
- 연예인이 등장하거나 주요 소재인 뉴스 (그 연예인이 투자·주식 얘기를 하더라도)
- "OO기업 주가 X원 X% 상승/하락" 식으로 숫자만 있고 구체적 이유(재료)가 없는 기계적 시세 리포트
- 일반적 시황 칼럼, 기고, 사설, 거시경제 논평
- 특정 종목과 무관한 일반 서비스 홍보(예: 은행의 시니어 돌봄서비스 출시 등)
- 경영상 심각한 문제 없이 발생한 소소한 주가 등락

애매하면 포함시키지 말고 제외하는 쪽으로 판단해.

응답은 반드시 아래 형식의 JSON 객체 하나만, 다른 텍스트 없이:
{"include":true}`;

async function isMarketMovingHeadline(title, summary) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 32,
      system: FILTER_SYSTEM_PROMPT,
      messages: [
        { role: "user", content: `뉴스 제목: ${title}\n뉴스 요약: ${summary}` },
        { role: "assistant", content: "{" },
      ],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error("Claude API(필터) 오류: " + JSON.stringify(data));
  const continuation = data?.content?.find((c) => c.type === "text")?.text || "\"include\":false}";
  try {
    const parsed = JSON.parse(extractJsonObject("{" + continuation));
    return parsed.include === true;
  } catch {
    return false; // if we can't parse it, don't spend more money on the full match — skip.
  }
}

async function matchStocks(title, summary, universeCompanyList) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.");

  // The company/theme list is identical across every call in a poll cycle
  // (and usually across cycles within the same trading day, since KRX data
  // doesn't change intraday). Putting it in a cached system block means we
  // only pay full price once per cache window — every other call within
  // that hour reads it back at 10% of the normal input price instead of
  // resending ~2,800 companies at full price every single time.
  const staticContext = `${SYSTEM_PROMPT}\n\n[전체 상장 종목]\n${universeCompanyList}\n\n[테마 목록]\n${buildThemeList()}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
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
  if (!res.ok) throw new Error("Claude API 오류: " + JSON.stringify(data));
  const continuation = data?.content?.find((c) => c.type === "text")?.text || "}";

  let parsed;
  try {
    parsed = JSON.parse(extractJsonObject("{" + continuation));
  } catch {
    throw new Error("Claude 응답 파싱 실패");
  }

  const directMatches = (Array.isArray(parsed.matches) ? parsed.matches : []).map((m) => ({ ...m, tier: "direct" }));
  const existingCodes = new Set(directMatches.map((m) => m.code));

  const primaryThemeMatches = parsed.primary_theme
    ? expandThemeMatches([parsed.primary_theme], "primary", MAX_STOCKS_PER_PRIMARY_THEME, existingCodes)
    : [];
  const secondaryThemeMatches = expandThemeMatches(
    parsed.secondary_themes,
    "secondary",
    MAX_STOCKS_PER_SECONDARY_THEME,
    existingCodes
  );

  return [...directMatches, ...primaryThemeMatches, ...secondaryThemeMatches];
}

// Final ordering + cap. Tier order (direct → primary theme → secondary
// theme) comes first; within each tier, sort by today's change% descending.
// That second pass is what naturally pushes sluggish mega-caps down without
// a hardcoded blacklist — a stock that barely moved today just sorts lower
// than one that's actually reacting to the news, tier for tier.
const TIER_ORDER = { direct: 0, primary: 1, secondary: 2 };
function finalizeMatches(matches, priceMap) {
  const withPrices = matches.map((m) => {
    const p = priceMap.get(m.code);
    return { ...m, price: p?.price, change: p?.change };
  });
  withPrices.sort((a, b) => {
    const tierDiff = (TIER_ORDER[a.tier] ?? 9) - (TIER_ORDER[b.tier] ?? 9);
    if (tierDiff !== 0) return tierDiff;
    const changeA = typeof a.change === "number" ? a.change : -Infinity;
    const changeB = typeof b.change === "number" ? b.change : -Infinity;
    return changeB - changeA;
  });
  return withPrices.slice(0, MAX_TOTAL_MATCHES).map(({ tier, ...rest }) => rest); // tier was only for sorting
}

function articleKey(article) {
  // Dedup by TITLE, not link — wire-service reposts (obituaries, routine
  // briefs) often get a brand-new URL each time even though the headline
  // is identical, which was defeating link-based dedup.
  const normalized = article.title.trim().toLowerCase().replace(/\s+/g, "");
  return "seen:" + Buffer.from(normalized).toString("base64url").slice(0, 120);
}

// Vercel terminates a function that runs past this many seconds.
export const maxDuration = 60;

async function processArticle(keyword, article, redis, universeCompanyList, priceMap) {
  const key = articleKey(article);

  const alreadySeen = await redis.get(key);
  if (alreadySeen) {
    return { keyword, title: article.title, skipped: "이미 처리됨" };
  }

  let passesFilter = false;
  try {
    passesFilter = await isMarketMovingHeadline(article.title, article.summary);
  } catch (err) {
    return { keyword, title: article.title, error: "필터링 실패: " + String(err.message || err) };
  }

  if (!passesFilter) {
    await redis.set(key, "1", { ex: SEEN_TTL_SECONDS });
    return { keyword, title: article.title, published: false, reason: "재료성 부족으로 필터링됨" };
  }

  let rawMatches = [];
  try {
    rawMatches = await matchStocks(article.title, article.summary, universeCompanyList);
  } catch (err) {
    return { keyword, title: article.title, error: String(err.message || err) };
  }

  await redis.set(key, "1", { ex: SEEN_TTL_SECONDS });

  const matches = finalizeMatches(rawMatches, priceMap);

  if (matches.length > 0) {
    const feedItem = {
      id: key,
      keyword,
      title: article.title,
      summary: article.summary,
      link: article.link,
      pubDate: article.pubDate,
      matches,
      savedAt: new Date().toISOString(),
    };
    await redis.lpush("feed", JSON.stringify(feedItem));
    await redis.ltrim("feed", 0, FEED_MAX_LENGTH - 1);
    return { keyword, title: article.title, published: true, matchCount: matches.length };
  }
  return { keyword, title: article.title, published: false, reason: "관련 종목/테마 없음" };
}

export async function GET(request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const { searchParams } = new URL(request.url);
    const provided =
      searchParams.get("secret") ||
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (provided !== cronSecret) {
      return Response.json({ error: "인증되지 않은 요청입니다." }, { status: 401 });
    }
  }

  const redis = getRedis();
  if (!redis) {
    return Response.json({ error: "Redis(Upstash) 환경변수가 아직 설정되지 않았습니다." }, { status: 500 });
  }

  // Fetch the full KOSPI/KOSDAQ universe once per poll cycle (not per
  // article) — used both as Claude's direct-match candidate pool and as
  // the price/change lookup for sorting.
  const krx = await fetchAllStocksToday();
  if (!krx) {
    return Response.json(
      { error: "KRX_SERVICE_KEY 환경변수가 없거나 시세 데이터를 가져오지 못했습니다." },
      { status: 500 }
    );
  }
  const { companyList: universeCompanyList, priceMap } = buildUniverseFromKrx(krx.items);

  const log = [];

  for (const keyword of WATCHED_KEYWORDS) {
    let articles;
    try {
      articles = await fetchNaverNews(keyword);
    } catch (err) {
      log.push({ keyword, error: String(err.message || err) });
      continue;
    }

    const results = await Promise.all(
      articles.map((article) => processArticle(keyword, article, redis, universeCompanyList, priceMap))
    );
    log.push(...results);
  }

  return Response.json({ checkedAt: new Date().toISOString(), basDt: krx.basDt, log });
}
