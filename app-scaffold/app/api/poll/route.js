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
import { buildSubsidiaryPromptBlock } from "../../../lib/subsidiaryMap";

const WATCHED_KEYWORDS = ["특징주", "수주", "공시", "속보", "단독", "코스피", "코스닥", "잭팟"];
const ARTICLES_PER_KEYWORD = 5;
const SEEN_TTL_SECONDS = 60 * 60 * 24 * 7; // remember an article for 7 days
const FEED_MAX_LENGTH = 300; // roughly 5 "pages" worth of retained history
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

// theme (normalized) -> Map(code -> {name, market, theme}) — built once at
// module load, not per-article. Ground truth for validating Claude's
// theme_stocks picks: a pick only counts if the code is actually
// registered under that theme in our own database (same anti-hallucination
// discipline as the full-universe direct matches in section A).
const THEME_MEMBERSHIP = (() => {
  const map = new Map();
  for (const row of rawThemeData) {
    const key = normalizeThemeName(row.theme);
    if (!map.has(key)) map.set(key, new Map());
    map.get(key).set(row.code, { name: row.name, market: row.market, theme: row.theme });
  }
  return map;
})();

// "테마명: code|name, code|name, ..." — one line per theme, given to Claude
// as [테마별 소속 종목 목록] so it can pick individual companion stocks
// within a matched theme instead of blindly getting the whole bucket
// dumped on it (see theme_stocks in SYSTEM_PROMPT — many theme buckets mix
// sub-industries that don't actually move together on the same news).
function buildThemeMembershipBlock() {
  const byTheme = new Map(); // display theme name -> ["code|name", ...]
  for (const row of rawThemeData) {
    if (!byTheme.has(row.theme)) byTheme.set(row.theme, []);
    byTheme.get(row.theme).push(`${row.code}|${row.name}`);
  }
  return Array.from(byTheme.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([theme, entries]) => `${theme}: ${entries.join(", ")}`)
    .join("\n");
}

// Validates and applies Claude's theme_stocks picks against THEME_MEMBERSHIP
// (so a hallucinated code/theme pairing is silently dropped, never trusted),
// enforces the existing per-theme caps, and tags each with the right tier
// (primary vs secondary) based on which theme it names.
function applyThemeStockPicks(themeStocks, primaryThemeName, secondaryThemeNames, existingCodes) {
  const allowedThemes = new Set(
    [primaryThemeName, ...(Array.isArray(secondaryThemeNames) ? secondaryThemeNames : [])]
      .filter(Boolean)
      .map(normalizeThemeName)
  );
  const primaryKey = normalizeThemeName(primaryThemeName);
  const perThemeCount = new Map(); // normalized theme -> count used so far
  const added = [];

  for (const pick of Array.isArray(themeStocks) ? themeStocks : []) {
    const code = pick?.code;
    const themeKey = normalizeThemeName(pick?.theme);
    if (!code || !themeKey) continue;
    if (existingCodes.has(code)) continue;
    if (!allowedThemes.has(themeKey)) continue; // must be a theme Claude actually picked in B/C

    const members = THEME_MEMBERSHIP.get(themeKey);
    const info = members?.get(code);
    if (!info) continue; // not actually registered under this theme — drop it, don't trust Claude's word alone

    const tier = themeKey === primaryKey ? "primary" : "secondary";
    const cap = tier === "primary" ? MAX_STOCKS_PER_PRIMARY_THEME : MAX_STOCKS_PER_SECONDARY_THEME;
    const used = perThemeCount.get(themeKey) || 0;
    if (used >= cap) continue;

    added.push({
      code,
      name: info.name,
      market: info.market,
      confidence: "theme",
      tier,
      reason: `'${info.theme}' 테마 동반 종목${tier === "primary" ? " (핵심 테마)" : ""}`,
    });
    existingCodes.add(code);
    perThemeCount.set(themeKey, used + 1);
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

너한테는 네 가지 목록이 주어져:
1. [전체 상장 종목]: 코스피·코스닥에 상장된 전체 종목 (코드|이름|시장 형식)
2. [테마 목록]: 우리가 관리하는 투자 테마 이름들
3. [테마별 소속 종목 목록]: 각 테마에 미리 등록해둔 종목들 (테마명: 코드|이름, 코드|이름, ... 형식) — 이 목록은 사람이 미리 정리해둔 것이라 완벽하지 않아. 같은 테마 이름 안에 실제로는 서로 다른 사업을 하는 회사가 섞여 있는 경우가 있어(예: "수소차" 테마에 자동차 회사(현대차·기아)와 발전·선박용 연료전지 회사가 같이 등록돼 있던 적이 있었는데, 이 둘은 완전히 다른 산업이라 한쪽 뉴스가 다른 쪽 주가에 영향을 주지 않아). 그러니까 이 목록에 등록돼 있다는 사실 자체를 "관련 있다"는 증거로 그대로 믿지 말고, 너의 판단으로 한 번 더 걸러야 해 (자세한 건 아래 theme_stocks 설명 참고).
4. [계열사-모회사 매핑]: 비상장(또는 우리 시스템에 코드가 없는) 자회사 이름 → 그 자회사를 소유한 상장 모회사

뉴스 기사 하나가 주어지면, 네 가지를 판단해:

**A. 직접 관련 종목 (matches)**: [전체 상장 종목] 중에서, 이 기사와 실제로 관련 있는 종목을 찾아. 목록에 없는 종목·코드는 절대 지어내면 안 돼.

**관련 종목이 하나도 없는 게 정상일 수 있어**: 모든 기사에 관련주가 있어야 하는 게 아니야. 확신이 안 서면 억지로 뭐라도 채워넣지 말고 matches를 빈 배열로 둬 — 이게 잘못된 답이 아니라 오히려 맞는 답인 경우가 많아. "그나마 제일 비슷해 보이는" 종목을 낮은 확신으로 끼워넣는 것보다, 정직하게 "관련 종목 없음"이라고 답하는 게 훨씬 나아.

[전체 상장 종목]에는 [테마 목록]에서 다루는 회사들보다 훨씬 많은 회사가 들어있어. 테마 목록에 없는 회사라도 절대 무시하지 마 — 네가 원래 알고 있는 배경지식(그 회사가 실제로 어떤 사업을 하는지, 무슨 제품을 만드는지)을 적극적으로 활용해서 [전체 상장 종목] 전체를 대상으로 판단해. 익숙한 대기업이 아니거나 우리가 미리 분류해두지 않은 회사라는 이유로 후보에서 제외하지 마 — 실제로 관련 있다면 반드시 포함시켜.

**비상장 자회사 처리 규칙**: 기사에 [계열사-모회사 매핑]에 있는 자회사 이름이 나오고, 그 자회사에 대한 사업적으로 의미 있는 소식(계약, 투자, 신사업, 실적 등)이 있다면, 그 자회사 자체는 [전체 상장 종목]에 없더라도 매핑에 적힌 모회사를 "confirmed"로 포함시켜. reason에는 "자회사 OOO 관련 소식"이라고 명시해서, 직접 언급이 아니라 자회사를 통한 연결이라는 걸 알 수 있게 해.

**주의**: 기사에 나온 회사 이름이 [계열사-모회사 매핑]에는 없지만 [전체 상장 종목]에 자기 자신의 코드로 이미 있다면(예: 삼성SDI, LG에너지솔루션처럼 자체 상장된 계열사), 그건 모회사로 연결하지 말고 반드시 그 회사 자신의 코드로 매칭해. 모회사 연결은 오직 [계열사-모회사 매핑] 목록에 있는, 자체 코드가 없는 회사에만 적용해.

- "confirmed" (사업근거 확인): 그 회사명·제품명이 기사에 직접 언급되거나, 정부 정책·규제·계약·사고 등이 그 회사의 실제 사업 영역에 직접 영향을 미치는 경우.
- - "rumor" (시장 추정): 구체적으로 존재하는 연결고리(특정 인물과의 동창·지연 관계, 커뮤니티에 도는 특정 소문)가 있을 때만. 막연한 업종 추측은 여기 넣지 말고 아예 빼.

**자기모순 방지 규칙**: reason에 쓸 문장이 "관계 확인 불가", "직접적 연관성 낮음", "확인되지 않음", "연결고리가 명확하지 않음"처럼 사실상 "관련 없다"는 뜻이 된다면, 그 종목은 matches에 아예 넣지 마. reason은 "왜 넣었는지"를 설명하는 자리이지 "왜 확신이 없는지"를 고백하는 자리가 아니야 — 확신이 없으면 넣지 않는 게 맞아. confirmed든 rumor든 마찬가지야.

**중요한 오판 방지 규칙**: 증권사가 기사에 "OO증권 리서치센터는 ~라고 분석했다", "OO증권 애널리스트는 ~라고 말했다"처럼 **코멘트·리포트의 출처로만** 언급된 경우, 그 증권사를 절대 관련주로 넣지 마. 그 증권사가 그 사건의 당사자(계약 주체, 투자자, 사업 파트너 등)일 때만 포함해. 단순히 "누가 이 기사에 대해 말했는지"와 "누가 사업적으로 관련 있는지"는 다른 문제야.

**계열사 이름 혼동 주의**: 회사 이름에 같은 단어가 들어간다고 같은 그룹이라고 착각하지 마. 특히 아래처럼 과거엔 한 뿌리였지만 지금은 완전히 남남인 그룹들을 절대 혼동하면 안 돼:
- "현대차그룹"(현대자동차·기아·현대모비스·현대건설 등)과 "HD현대"(옛 현대중공업그룹, HD현대중공업·HD현대마린엔진·HD한국조선해양·HD현대일렉트릭 등)는 완전히 별개의 그룹이야. "현대"라는 이름만 보고 현대차그룹 계열사라고 단정하지 마.
- "현대백화점그룹"(현대그린푸드·현대홈쇼핑 등)과 "현대해상화재보험"도 위 두 그룹과 전부 무관해.
- "LG그룹"과 "LX그룹"(LX하우시스·LX인터내셔널 등)은 2021년에 완전히 분리된 별개 회사야.
- - "삼성그룹"과 "신세계그룹"·"CJ그룹"·"한솔그룹"도 과거엔 한 뿌리였지만 지금은 전부 무관한 별개 회사야.
- OTT 서비스 "티빙(TVING)"은 CJ ENM이 최대주주(약 48.85%)로 참여하는 별도 합작법인이야. "스튜디오드래곤"은 CJ ENM의 드라마 제작 자회사일 뿐, 티빙의 운영사·주주가 아니야 — 둘 다 "CJ" 계열이라는 이유로 스튜디오드래곤을 티빙 관련 사고(해킹, 서비스 장애 등)의 당사자로 넣으면 안 돼. 티빙 관련 소식은 [계열사-모회사 매핑]에 따라 CJ ENM으로 연결해.
- 회사가 정확히 어느 그룹 소속인지, 그 그룹이 실제로 그 사업(예: 로봇, 반도체 등)을 하는 계열사를 갖고 있는지 확신이 서지 않으면, 절대 추측으로 넣지 말고 아예 빼. 애매하면 넣는 것보다 안 넣는 게 훨씬 나아.

**하락 뉴스 처리 규칙**: 어떤 회사 자체의 주가 하락·실적 악화만 다루고 다른 종목에 미치는 영향이 없다면, 그 회사를 관련주로 넣지 마(애초에 이런 기사는 필터 단계에서 대부분 걸러질 거야). 다만 그 하락·악재가 **다른 회사에는 반사이익·기회**가 되는 경우(예: A사 해킹 사고→보안업체 B에 호재, A사 실적 부진→경쟁사 C에 반사이익, A사가 지배하던 시장에 B사가 새로 진입)에는, 그 수혜 회사(B, C) 관점에서 "confirmed"로 포함해.

**정보 유출/해킹 사고 처리 규칙**: 기사에 "유출"이라는 단어가 "정보", "개인정보", "고객정보", "계정" 같은 단어와 같이 나오면, 이건 십중팔구 해킹·보안 사고를 의미해. 이런 기사는: (1) 사고 당사자 회사 자신을 matches에 넣고(정확히 어느 회사인지는 아래 계열사 혼동 주의 규칙을 지켜서 판단 — 이름이 비슷하다고 계열사로 넘겨짚지 마), (2) primary_theme 또는 secondary_themes에 "보안"을 반드시 포함시키고, (3) theme_stocks에서 "보안" 테마의 동반 종목을 반사이익 관점("이 사고로 보안 수요가 늘어날 회사")으로 포함시켜. 사고 당사자 회사 자체에는 이 사고를 negative_catalyst로 넣지 마(허용된 악재 유형 목록에 해킹·유출이 없으니 null로 둬) — 여기서 중요한 건 다른 회사(보안주)에게는 호재라는 것.

**B. 핵심 테마 (primary_theme)**: [테마 목록] 중, 이 기사의 "가장 좁고 정확한 핵심 초점" 딱 하나만 골라. 예를 들어 전기차 배터리에 쓰이는 리튬 공급 얘기라면 "2차전지"가 아니라 "원자재(리튬)"을 골라야 해 — 기사가 진짜 말하고 있는 게 뭔지가 기준이야. 명확한 핵심이 없으면 null.

**C. 부가 테마 (secondary_themes)**: 핵심만큼은 아니지만 함께 언급되거나 부차적으로 관련된 테마들. 최대 2개까지만, 배열로. 없으면 빈 배열.

우선순위 판단 예시: "리튬 공급 부족으로 배터리 업체 비상"이라는 기사라면 → primary_theme: "원자재(리튬)", secondary_themes: ["2차전지"]. 자동차 완성차 얘기가 기사에 없다면 자동차 테마는 넣지 마.

진짜 관련된 게 없으면 matches는 빈 배열, primary_theme은 null, secondary_themes는 빈 배열.

**테마 동반 종목 선별 (theme_stocks)**: primary_theme·secondary_themes로 고른 각 테마에 대해, [테마별 소속 종목 목록]에서 그 테마 밑에 실제로 등록된 종목들을 찾아봐. 하지만 등록돼 있다고 전부 자동으로 넣지 마 — 그중에서 **이 구체적인 기사 내용과 진짜 같이 반응할 만한 종목만** 골라서 theme_stocks에 넣어. 등록된 목록에 없는 종목·코드는 절대 지어내지 마.

판단 기준: 이 기사가 정확히 어느 하위 사업 영역 얘기인지 먼저 따져. 같은 테마 이름 안에 있어도 사업 성격이 다르면(위의 "수소차" 예시처럼 자동차 vs 발전용 연료전지) 관련 없는 쪽은 빼. 반대로 진짜 같은 사업 영역이라 이 뉴스에 함께 반응할 걸로 보이면 포함해. 애매하면 넣지 말고 빼는 쪽을 택해 — 이 목록은 "이 테마 소속 회사 전체 명단"이 아니라 "이 기사 때문에 같이 움직일 만한 회사"여야 해.

theme_stocks 형식: [{"code":"336260","theme":"SOFC"}, ...]. code는 반드시 그 theme 아래 [테마별 소속 종목 목록]에 실제로 등록된 코드여야 하고, theme은 반드시 네가 고른 primary_theme 또는 secondary_themes 중 하나여야 해. 관련된 동반 종목이 하나도 없으면 빈 배열.

**D. 악재 유형 판단 (negative_catalyst)**: 기사의 핵심 사건이, matches에 넣은 회사(주로 직접 언급된 그 회사 자신) 입장에서 아래의 "확정된 악재 유형" 목록 중 하나에 **명확하고 객관적으로** 해당하는 공시성 이벤트인지 판단해. 이건 "실적이 나쁘다", "주가가 떨어졌다" 같은 막연한 부정적 뉘앙스가 아니라, 기사 제목·요약에 사실관계가 명시적으로 나오는 구체적 기업행위/사건만 대상이야.

허용된 유형 목록 (반드시 이 중 하나의 문자열 그대로 사용, 새로 만들어내지 마):
"유상증자", "무상감자", "전환사채/신주인수권부사채 발행", "최대주주 지분 매도", "관리종목 지정", "거래정지", "상장폐지", "상장적격성 실질심사", "감사의견 거절·한정", "횡령·배임", "신용등급 강등", "소송 패소·피소", "대규모 리콜"

("어닝쇼크"는 목록에서 뺐어 — 실적 발표가 아닌 사건에도 잘못 붙는 경우가 많았음. 실적 관련 악재는 이 기능의 대상이 아니니 negative_catalyst를 null로 둬.)

규칙:
- 반드시 matches 배열에 이미 넣은 종목 중 하나의 code여야 해 (새 코드를 지어내지 마).
- confidence가 "confirmed"인 매치에만 적용해. "rumor"·테마 동반 종목에는 적용하지 마.
- 기사에 명시된 사실이 위 목록 중 정확히 하나에 해당할 때만 채워. 애매하거나 목록에 없는 종류의 부정적 뉴스면 null로 둬 — 억지로 끼워맞추지 마.
- 해당하는 게 없으면 negative_catalyst는 null.

응답은 반드시 아래 JSON 객체 형식이어야 해:
{"matches":[{"code":"005930","name":"삼성전자","market":"코스피","confidence":"confirmed","reason":"..."}],"primary_theme":"반도체","secondary_themes":[],"theme_stocks":[{"code":"000660","theme":"반도체"}],"negative_catalyst":null}

negative_catalyst 예시: {"code":"338220","type":"유상증자"}

중요한 제약 조건 (반드시 지켜):
- 너한테는 뉴스 제목과 요약만 주어져. 본문을 요청하거나 되묻지 마. 주어진 정보만으로 최선의 판단을 내려.
- 응답에는 오직 위 형식의 JSON 객체만 포함해야 해. 설명, 사과, 코드블록 표시 등 그 어떤 추가 텍스트도 붙이면 안 돼.

각 matches 항목의 reason은 한국어 한 문장, 20단어 이내.`;

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
- "세계 최초", "국내 최초", "국내 유일" 같은 표현이 붙은 기술·사업 성과 발표 — 이런 표현은 강한 재료 신호이니 절대 걸러내지 마
- 제목에 "[특징주]"가 붙은 기사 — 이미 실제 주가 변동이 있었다는 뜻이므로 적극적으로 포함해
- 어떤 회사의 악재(해킹, 실적 부진, 시장 잠식 등)가 **다른 회사에는 반사이익·기회**가 되는 뉴스 — 예: A사 해킹 사고, A사가 지배하던 시장에 B사가 새로 진입, A사 실적 부진으로 경쟁사가 반사이익. 이런 기사는 "누구에게 하락 재료인가"가 아니라 "누구에게 호재인가"의 관점에서 포함해

**제외해야 할 것** (예시 — 이런 건 걸러내):
- 부고, 인사동정 등 개인 신상 소식
- 경품·이벤트·프로모션 홍보성 뉴스
- 연예인이 등장하거나 주요 소재인 뉴스 (그 연예인이 투자·주식 얘기를 하더라도)
- "OO기업 주가 X원 X% 상승/하락" 식으로 숫자만 있고 구체적 이유(재료)가 없는 기계적 시세 리포트
- 일반적 시황 칼럼, 기고, 사설, 거시경제 논평
- 특정 종목과 무관한 일반 서비스 홍보(예: 은행의 시니어 돌봄서비스 출시 등)
- **어떤 회사 자체의 주가 하락·실적 악화·신용등급 강등만 다루고, 다른 회사에 미치는 긍정적 영향(반사이익 등)이 전혀 없는 뉴스.** 예: "OO기업 3분기 실적 부진으로 주가 급락" (다른 회사 언급 없이 그 자체로 끝나는 경우) — 이런 건 "누구에게도 새로운 투자 기회가 아닌 단순 악재 보도"이므로 제외해
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
  const staticContext = `${SYSTEM_PROMPT}\n\n[전체 상장 종목]\n${universeCompanyList}\n\n[테마 목록]\n${buildThemeList()}\n\n[테마별 소속 종목 목록]\n${buildThemeMembershipBlock()}\n\n[계열사-모회사 매핑]\n${buildSubsidiaryPromptBlock()}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      // Bumped from 1536: theme_stocks adds a per-code {code,theme} entry
      // on top of everything matches/primary_theme/secondary_themes already
      // needed — a bit more headroom avoids a truncated (unparseable) JSON
      // response on articles that legitimately match several themes.
      max_tokens: 2048,
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

  // Attach the (optional) negative-catalyst label to whichever direct match
  // it names — only ever a code we already matched above, confirmed-tier
  // only (enforced in the prompt, double-checked here too).
  const catalyst = parsed.negative_catalyst;
  if (catalyst?.code && catalyst?.type) {
    const target = directMatches.find((m) => m.code === catalyst.code && m.confidence === "confirmed");
    if (target) target.catalyst = catalyst.type;
  }

  // Claude's own per-article pick of which specific companion stocks within
  // the matched theme(s) actually belong here — not a blind dump of the
  // whole theme bucket. See applyThemeStockPicks for the validation/cap
  // logic and the theme_stocks prompt section for why this exists.
  const themeMatches = applyThemeStockPicks(
    parsed.theme_stocks,
    parsed.primary_theme,
    parsed.secondary_themes,
    existingCodes
  );

  return [...directMatches, ...themeMatches];
}

// Final ordering + cap. Tier order (direct → primary theme → secondary
// theme) comes first. Within the theme tiers, sort by today's change%
// descending — that's what naturally pushes sluggish mega-caps down
// without a hardcoded blacklist. Within the "direct" tier, though, keep
// Claude's own ordering instead: the article's actual subject is usually
// listed first, and re-sorting by price would let an unrelated mover
// (even a wrongly-matched one) outrank the real subject as "대장주".
const TIER_ORDER = { direct: 0, primary: 1, secondary: 2 };
function finalizeMatches(matches, priceMap) {
  const withPrices = matches.map((m) => {
    const p = priceMap.get(m.code);
    return { ...m, price: p?.price, change: p?.change };
  });
  withPrices.sort((a, b) => {
    const tierDiff = (TIER_ORDER[a.tier] ?? 9) - (TIER_ORDER[b.tier] ?? 9);
    if (tierDiff !== 0) return tierDiff;
    if (a.tier === "direct") return 0; // preserve original order (stable sort)
    const changeA = typeof a.change === "number" ? a.change : -Infinity;
    const changeB = typeof b.change === "number" ? b.change : -Infinity;
    return changeB - changeA;
  });
  return withPrices.slice(0, MAX_TOTAL_MATCHES).map(({ tier, ...rest }) => rest); // tier was only for sorting
}

const STORY_DEDUP_WINDOW_MS = 6 * 60 * 60 * 1000; // 6 hours
const STORY_DEDUP_CHECK_COUNT = 20; // how many recent feed items to check against

// Different outlets cover the same real event (a merger, a big deal) with
// completely different headlines, so title-based dedup alone lets a dozen
// near-duplicate articles about one story flood the feed. This checks
// whether the new article's LEAD stock (matches[0], already sorted to be
// the strongest/most relevant match) was already the lead stock of
// something published recently — if so, treat it as the same story.
async function isDuplicateStory(redis, matches, publishedThisRun = []) {
  if (!matches.length) return false;
  const leadCode = matches[0].code;

  // Check against items already published earlier in THIS run first — this
  // is what actually closes the race condition (multiple articles about
  // one breaking story, processed concurrently in the same poll cycle,
  // couldn't see each other in Redis yet since none had been written).
  for (const publishedMatches of publishedThisRun) {
    if (publishedMatches[0]?.code === leadCode) return true;
  }

  let recentRaw;
  try {
    recentRaw = await redis.lrange("feed", 0, STORY_DEDUP_CHECK_COUNT - 1);
  } catch {
    return false; // if we can't check, don't block publishing over it
  }

  const now = Date.now();
  for (const raw of recentRaw) {
    let item;
    try {
      item = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      continue;
    }
    if (!item?.savedAt || !Array.isArray(item.matches) || !item.matches.length) continue;
    const age = now - new Date(item.savedAt).getTime();
    if (age > STORY_DEDUP_WINDOW_MS) continue;
    if (item.matches[0].code === leadCode) return true;
  }
  return false;
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

// Phase 1 (safe to run concurrently): dedup-by-title check, cheap filter,
// then the expensive match call. Does NOT publish or make the story-level
// dedup decision — that has to happen sequentially afterward (see below).
async function computeArticleResult(keyword, article, redis, universeCompanyList, priceMap) {
  const key = articleKey(article);

  const alreadySeen = await redis.get(key);
  if (alreadySeen) {
    return { type: "skip", log: { keyword, title: article.title, skipped: "이미 처리됨" } };
  }

  let passesFilter = false;
  try {
    passesFilter = await isMarketMovingHeadline(article.title, article.summary);
  } catch (err) {
    return { type: "skip", log: { keyword, title: article.title, error: "필터링 실패: " + String(err.message || err) } };
  }

  if (!passesFilter) {
    await redis.set(key, "1", { ex: SEEN_TTL_SECONDS });
    return { type: "skip", log: { keyword, title: article.title, published: false, reason: "재료성 부족으로 필터링됨" } };
  }

  let rawMatches = [];
  try {
    rawMatches = await matchStocks(article.title, article.summary, universeCompanyList);
  } catch (err) {
    return { type: "skip", log: { keyword, title: article.title, error: String(err.message || err) } };
  }

  await redis.set(key, "1", { ex: SEEN_TTL_SECONDS });
  const matches = finalizeMatches(rawMatches, priceMap);

  if (matches.length === 0) {
    return { type: "skip", log: { keyword, title: article.title, published: false, reason: "관련 종목/테마 없음" } };
  }

  return { type: "candidate", keyword, key, article, matches };
}

// Phase 2 (must run one at a time, not in parallel): the actual
// dedup-against-recent-stories decision and the Redis write. Cheap and
// fast (no AI calls), so doing this sequentially doesn't reintroduce the
// timeout problem — but it DOES fix the race condition where several
// articles about the same breaking story (e.g. 3 outlets all covering one
// earnings report in the same poll cycle) were all processed concurrently
// and none of them could see the others yet, so all three passed the
// dedup check and got published separately.
async function publishCandidate(redis, candidate, publishedThisRun) {
  const { keyword, key, article, matches } = candidate;

  const isDupStory = await isDuplicateStory(redis, matches, publishedThisRun);
  if (isDupStory) {
    return { keyword, title: article.title, published: false, reason: "동일 종목 관련 최근 기사 이미 게재됨(중복 스토리)" };
  }

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
  publishedThisRun.push(matches); // so later candidates in this same run can see it too
  return { keyword, title: article.title, published: true, matchCount: matches.length };
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
  const candidates = [];

  for (const keyword of WATCHED_KEYWORDS) {
    let articles;
    try {
      articles = await fetchNaverNews(keyword);
    } catch (err) {
      log.push({ keyword, error: String(err.message || err) });
      continue;
    }

    const results = await Promise.all(
      articles.map((article) => computeArticleResult(keyword, article, redis, universeCompanyList, priceMap))
    );
    for (const r of results) {
      if (r.type === "skip") log.push(r.log);
      else candidates.push(r);
    }
  }

  // Sequential on purpose — see publishCandidate's comment above.
  const publishedThisRun = [];
  for (const candidate of candidates) {
    log.push(await publishCandidate(redis, candidate, publishedThisRun));
  }

  return Response.json({ checkedAt: new Date().toISOString(), basDt: krx.basDt, log });
}
