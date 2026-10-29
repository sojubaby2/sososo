// lib/newsPipeline.js
//
// Shared filter/match/publish pipeline, extracted out of app/api/poll/route.js
// so that app/api/telegram-ingest/route.js can reuse the exact same logic
// (Claude filter prompt, Claude match prompt, theme-stock expansion,
// dedup rules, feed publishing) instead of duplicating ~500 lines of code.
//
// app/api/poll/route.js (Naver News, keyword-polling) and
// app/api/telegram-ingest/route.js (Telegram channel messages, pushed in
// real time) both import from here. Naver-specific fetching (fetchNaverNews,
// stripHtml, WATCHED_KEYWORDS) stays in poll/route.js since it's not shared.

import rawThemeData from "./themeData.json";
import { SUBSIDIARY_MAP } from "./subsidiaryMap";
import { fetchLatestAvailable } from "./krxOpenApi";

const MAX_STOCKS_PER_PRIMARY_THEME = 6;
const MAX_STOCKS_PER_SECONDARY_THEME = 3;
const MAX_TOTAL_MATCHES = 9;

// How long a "seen" dedup marker (per-article or per-telegram-message) is
// kept in Redis before it expires and could theoretically be reprocessed.
export const SEEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

const FEED_MAX_LENGTH = 300; // roughly 5 "pages" worth of retained history

// ---------------------------------------------------------------------------
// Section A: full KOSPI/KOSDAQ universe (KRX) — fetched fresh at most once
// per cache window, not once per request. Both poll/route.js (called every
// minute by cron) and telegram-ingest/route.js (called once per incoming
// channel message, potentially in quick bursts) share this cache so we
// don't hammer the KRX API — it only actually changes once per trading day.
//
// [시세 데이터 출처 변경 이력]
// 1차: 공공데이터포털(apis.data.go.kr)의 KRX 시세 API — 클라우드(Vercel)
//      서버 트래픽을 막기 시작해서 죽음(ConnectTimeout).
// 2차: m.stock.naver.com의 비공식 JSON API로 교체 시도 → 404.
// 3차: 네이버 금융(finance.naver.com)의 "시가총액" 페이지를 직접 파싱하는
//      방식으로 한동안 버텼는데, 2026-09-10~11 사이 이 페이지도 클라우드
//      트래픽을 막기 시작한 것으로 보여 종목을 하나도 못 가져오는 상태가
//      됨(getCachedUniverse가 계속 null 반환) — 그 결과 HOT테마 패널은
//      멀쩡한데(아래 4차 방식을 이미 쓰고 있었음) 텔레그램 뉴스의 "관련주
//      매칭"만 조용히 전부 실패하는 사고가 발생함(재성님 리포트로 발견,
//      /api/debug-universe로 확인).
// 4차(현재): app/api/theme-momentum/route.js(HOT테마 패널)가 이미 쓰고
//      있던, KRX가 직접 운영하는 정식 Open API(data-dbg.krx.co.kr)로
//      통일함. 그 공통 로직을 lib/krxOpenApi.js로 뽑아서 여기서도 그대로
//      재사용 — 이제 이 사이트의 시세 데이터 출처는 어디서 쓰이든 단
//      하나뿐이라, 한쪽만 조용히 막히는 이런 사고가 다시 생기지 않음.
// ---------------------------------------------------------------------------

// KRX 정식 API가 돌려주는 마켓 코드("KOSPI"/"KOSDAQ")를 이 사이트 나머지
// 코드가 쓰는 한글 표기("코스피"/"코스닥")로 맞춰줌.
function toKoreanMarketLabel(mrktCtg) {
  if (mrktCtg === "KOSPI") return "코스피";
  if (mrktCtg === "KOSDAQ") return "코스닥";
  return mrktCtg || "";
}

// Returns { items: [{code,name,market,price,changePct}], basDt } or null.
export async function fetchAllStocksToday() {
  const result = await fetchLatestAvailable(new Date());
  if (!result) {
    console.error(
      "fetchAllStocksToday: KRX 정식 API에서 최근 영업일 시세를 하나도 못 가져옴(최대 6영업일 소급 시도 모두 실패)."
    );
    return null;
  }
  const items = result.items.map((it) => ({
    code: it.srtnCd,
    name: it.itmsNm,
    market: toKoreanMarketLabel(it.mrktCtg),
    price: it.clpr,
    changePct: it.fltRt,
  }));
  return { items, basDt: result.basDt };
}

// Builds the full-universe "code|name|market" list Claude picks direct
// matches from, plus a code -> {price, change} lookup used for sorting.
export function buildUniverseFromKrx(krxItems) {
  const lines = [];
  const priceMap = new Map();
  for (const it of krxItems) {
    if (!it.code || !it.name) continue;
    lines.push(`${it.code}|${it.name}|${it.market || ""}`);
    priceMap.set(it.code, { price: it.price, change: it.changePct });
  }
  return { companyList: lines.join("\n"), priceMap };
}

const UNIVERSE_CACHE_KEY = "krx:universe:v1";
const UNIVERSE_CACHE_TTL_SECONDS = 60 * 10; // 10 minutes — KRX data doesn't move intraday anyway

// Cached wrapper around fetchAllStocksToday + buildUniverseFromKrx. Reads a
// Redis-cached snapshot when fresh; otherwise fetches from KRX and caches
// the result (best-effort — a caching failure doesn't block the caller,
// it just means the next call re-fetches). Returns
// { companyList, priceMap, basDt } or null if KRX is unreachable/misconfigured.
export async function getCachedUniverse(redis) {
  try {
    const cached = await redis.get(UNIVERSE_CACHE_KEY);
    if (cached) {
      const data = typeof cached === "string" ? JSON.parse(cached) : cached;
      if (data && typeof data.companyList === "string" && Array.isArray(data.priceEntries)) {
        return { companyList: data.companyList, priceMap: new Map(data.priceEntries), basDt: data.basDt };
      }
    }
  } catch {
    // corrupt/unreadable cache entry — fall through and fetch fresh
  }

  const krx = await fetchAllStocksToday();
  if (!krx) return null;
  const { companyList, priceMap } = buildUniverseFromKrx(krx.items);

  try {
    await redis.set(
      UNIVERSE_CACHE_KEY,
      { companyList, priceEntries: Array.from(priceMap.entries()), basDt: krx.basDt },
      { ex: UNIVERSE_CACHE_TTL_SECONDS }
    );
  } catch {
    // caching is best-effort — a failed write just means the next call
    // fetches fresh from KRX again, not a hard failure
  }

  return { companyList, priceMap, basDt: krx.basDt };
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

// ---------------------------------------------------------------------------
// [2026-09-18 추가 — AI 비용 90% 절감] 후보 추리기
//
// 왜 만들었나: 예전에는 뉴스 한 건을 매칭할 때마다 AI에게 "상장 종목 2,800개
// 전체 + 테마 157개 + 테마별 소속 종목 1,514줄 + 계열사 매핑"을 통째로
// 보냈습니다. 한 번에 9만 6천 자(약 44,000 토큰)라, 뉴스 한 건 붙이자고 매번
// 사전 한 권을 읽히는 꼴이었고 이것 때문에 API 크레딧이 며칠 만에 소진됐습니다
// (2026-09-18 확인).
//
// 고친 방법: 종목 이름을 찾는 일은 AI가 아니라 그냥 글자 비교로 공짜로 할 수
// 있습니다. 그래서 먼저 여기서
//   ① 제목·요약에 이름이 그대로 등장하는 종목
//   ② 제목·요약에 테마 이름(또는 그 일부)이 등장하는 테마 + ①의 종목이 속한 테마
//   ③ 그 후보 테마들에 등록된 소속 종목
// 을 추려내고, AI에게는 그 후보만 보냅니다. 보통 수십~200개 수준이라
// 보내는 양이 6분의 1 아래로 줄어듭니다.
//
// 화면에 나오는 결과는 그대로입니다 — AI가 하는 일("이 중 진짜 관련 있는 것만
// 골라라")은 똑같고, 고를 대상만 미리 좁혀줄 뿐입니다.
//
// 트레이드오프(정직하게): 후보에 아예 없는 종목은 AI가 고를 수 없습니다.
// 그래서 후보 그물을 일부러 넓게 칩니다 — 이름이 직접 나온 종목뿐 아니라
// "관련 있어 보이는 테마"의 소속 종목을 통째로 후보에 넣습니다. 그래도
// 후보가 하나도 안 잡히면 애초에 붙일 관련주가 없다는 뜻이므로, 그 메시지는
// AI를 아예 부르지 않고 건너뜁니다(=공짜).
// ---------------------------------------------------------------------------

const CANDIDATE_MAX_STOCKS = 220; // 후보 종목 상한 (프롬프트 크기 안전장치)
const CANDIDATE_MAX_THEMES = 8; // 후보 테마 상한
const CANDIDATE_MAX_STOCKS_PER_THEME = 40; // 테마 하나에서 가져올 종목 상한

// 테마 이름을 쪼갤 때 너무 흔해서 아무 테마나 걸리게 만드는 조각들은 제외.
// (예: "반도체 소재(불화수소)"의 "소재"만 보고 반도체 테마를 몽땅 후보로
//  올리면 후보를 좁히는 의미가 없어짐)
const GENERIC_THEME_TOKENS = new Set([
  "제품", "소재", "장비", "기술", "서비스", "관련주", "테마주", "업종", "산업",
]);

// [2026-10-29 추가] 세분화 테마 전용 검색어 — 재성님: "의료 로봇 테마를 따로 나눠야할거같은데 … 같은 섹터에서 더
//   세분화되는것들이 있으면 새로 만들어줘". 테마 이름 조각("로봇", "2차전지")만으로는 큰 테마와 하위 테마가 똑같이 걸려서
//   AI 후보에서 하위 테마가 밀릴 수 있습니다. 그래서 하위 테마만의 낱말이 기사에 나오면 점수를 더 줘서(+5) 먼저 후보에 올립니다.
const EXTRA_THEME_KEYWORDS = {
  "의료 로봇": ["수술로봇", "수술 로봇", "의료로봇", "의료 로봇", "재활로봇", "재활 로봇", "웨어러블 로봇", "혈관중재", "혈관 중재", "혈전", "시술 로봇", "뇌수술", "인공관절 로봇", "모발이식 로봇"],
  "휴머노이드 로봇": ["휴머노이드", "옵티머스", "아틀라스", "피규어AI", "피규어 AI", "유니트리", "보스턴다이내믹스", "인간형 로봇"],
  "협동로봇": ["협동로봇", "협동 로봇", "코봇", "로봇팔", "로봇 팔"],
  "로봇 부품(감속기·액추에이터)": ["감속기", "액추에이터", "로봇 부품", "로봇부품", "서보모터", "토크센서", "로봇 관절", "로봇 손"],
  "서비스·물류 로봇": ["서빙로봇", "서빙 로봇", "배달로봇", "배달 로봇", "배송로봇", "물류로봇", "물류 로봇", "AMR", "로봇청소기", "청소로봇", "안내로봇", "자율주행로봇"],
  "2차전지 소재(양극재)": ["양극재", "전구체", "하이니켈", "LFP", "NCM", "NCA", "LMR"],
  "2차전지 소재(음극재)": ["음극재", "실리콘 음극", "실리콘음극", "흑연"],
  "2차전지 소재(전해질)": ["전해질", "전해액", "리튬염", "LiPF6", "LiFSI", "첨가제"],
  "2차전지 소재(분리막)": ["분리막"],
  "2차전지 소재(동박)": ["동박", "전지박"],
  "ADC(항체약물접합체)": ["ADC", "항체약물접합체", "항체-약물", "링커", "페이로드"],
};
const EXTRA_KEYWORD_BONUS = 5;

// [2026-10-29 추가] 테마 이름에는 없지만 기사에 자주 나오는 "다른 말" → 테마 연결
//   재성님: "뉴스 필터링이 너무 강한거같은데 좀 풀까? 뉴스속보가 너무 안올라와"
//   하루 기록을 보니 "후보 종목 없음(AI 호출 안 함)"으로 버려지는 기사가 많았는데, 그중엔
//   "원전 공론화", "코인거래소 해킹", "6곳에 7.67만호 공급", "넥슨 신작 출시일", "애플 맥북" 처럼
//   테마 이름 낱말("원자력발전", "사이버 보안", "건설", "게임")이 제목에 그대로 안 나와서 빠진 게 섞여 있었습니다.
//   여기 낱말이 기사에 나오면 그 테마를 후보로 올립니다(가산점 없음 — 위 하위 테마 검색어와 다름).
//   후보에 오를 뿐이고, 진짜 관련 있는지는 그 다음 AI 두 단계가 판단합니다.
const SYNONYM_THEME_KEYWORDS = {
  "사이버 보안": ["해킹", "해커", "랜섬웨어", "디도스", "DDoS", "정보유출", "정보 유출", "악성코드", "피싱", "보안 사고", "보안사고"],
  "원자력발전(SMR)": ["원전", "원자력", "SMR", "소형모듈원자로", "두코바니"],
  "건설": ["주택 공급", "주택공급", "공급대책", "부동산 대책", "재건축", "재개발", "분양", "택지", "신도시", "공공주택", "만호 공급", "만 가구", "만가구", "새만금", "SOC"],
  "석유가스": ["경유", "휘발유", "정유", "국제유가", "유가 급등", "유가 상승", "유가 하락", "원유", "WTI", "브렌트", "OPEC"],
  "게임": ["신작", "출시일", "사전예약", "베타 테스트", "CBT", "OBT", "지스타", "넥슨", "엔씨소프트", "크래프톤", "넷마블", "펄어비스", "스팀"],
  "자동차부품": ["완성차", "신차", "제네시스", "GV90", "GV80", "현대차그룹"],
  "전기차": ["테슬라", "리비안", "전기 SUV"],
  "인공지능(AI)": ["오픈AI", "OpenAI", "챗GPT", "ChatGPT", "제미나이", "LLM", "생성형", "AI 에이전트"],
  "반도체": ["TSMC", "엔비디아", "마이크론", "CXMT", "D램", "디램", "낸드", "파운드리", "웨이퍼"],
  "데이터 센터": ["데이터센터", "AI 서버", "하이퍼스케일"],
  "클라우드": ["아마존", "AWS", "마이크로소프트", "애저", "Azure"],
  "OLED": ["애플", "아이폰", "맥북", "아이패드"],
  "방산주": ["절충교역", "방위사업청", "방사청", "국방부", "K9", "K2 전차", "천무", "무기 수출", "방산 수출"],
  "대북주": ["북한", "北", "김정은", "개성공단", "DMZ"],
  "조선": ["선박", "선대", "LNG선", "컨테이너선", "진수식", "수주 잔고"],
  "해운": ["선대", "운임", "SCFI", "선사"],
  "우주항공": ["위성", "발사체", "누리호", "지상국"],
  "바이오": ["임상", "FDA", "기술이전", "기술수출", "신약", "품목허가"],
  "가상화폐": ["코인", "비트코인", "이더리움", "업비트", "빗썸", "가상자산"],
};


// 테마명 -> 검색용 조각들. 모듈 로드 때 한 번만 만듦.
const THEME_SEARCH_TOKENS = (() => {
  const out = [];
  for (const theme of new Set(rawThemeData.map((r) => r.theme))) {
    const tokens = new Set();
    // [2026-10-29] 하위 테마 전용 검색어 — 점수 계산 때 길이 + 5점(아래 extractMatchCandidates)
    for (const kw of EXTRA_THEME_KEYWORDS[theme] || []) tokens.add(`\u0000${kw}`);
    // [2026-10-29] 다른 말(SYNONYM_THEME_KEYWORDS) — 가산점 없이 일반 조각처럼
    for (const kw of SYNONYM_THEME_KEYWORDS[theme] || []) tokens.add(kw);
    const compact = theme.replace(/\s+/g, "");
    if (compact.length >= 2) tokens.add(compact);
    for (const piece of theme.split(/[\s()\/·,]+/)) {
      const t = piece.trim();
      if (t.length >= 2 && !GENERIC_THEME_TOKENS.has(t)) tokens.add(t);
      // [2026-09-18] 붙여 쓴 합성어 테마명 보정 — "자동차부품" 같은 이름은
      // 쪼갤 구분자가 없어서 통째로 한 조각이 되는데, 기사에는 보통
      // "자동차"까지만 나옵니다. 그러면 후보 테마를 못 찾아서 관련주가
      // 아예 안 붙는 일이 생기므로, 4글자 이상 한글 조각은 앞 3글자도
      // 검색어로 같이 넣습니다("원자력발전"->"원자력", "반도체부품"->"반도체").
      // 조금 넓게 걸리더라도 어차피 "후보"일 뿐이고, 최종 판단은 AI가 합니다.
      if (t.length >= 4 && /^[가-힣]+$/.test(t)) {
        const head = t.slice(0, 3);
        if (!GENERIC_THEME_TOKENS.has(head)) tokens.add(head);
      }
    }
    if (tokens.size > 0) out.push({ theme, tokens: Array.from(tokens) });
  }
  return out;
})();

// ---------------------------------------------------------------------------
// [2026-10-22 추가] 삼성 + 로봇 뉴스 → 레인보우로보틱스 강제 포함 (코드 안전장치)
//
// 왜 만들었나: 삼성전자는 2025년 2월에 레인보우로보틱스 지분을 35%로 늘려
// 최대주주가 됐고, 이 회사를 연결 자회사로 편입했습니다. 삼성의 휴머노이드
// 개발을 맡은 주력 계열사입니다. 그래서 "삼성이 로봇에 투자한다 /
// 휴머노이드를 만든다" 같은 기사는 레인보우로보틱스가 바로 수혜를 봅니다.
//
// 그런데 기사 제목에 "레인보우로보틱스"라는 이름이 직접 안 나오면,
//   ① 후보 종목 목록에 이 회사가 안 들어갈 수 있고(그러면 AI는 아예 못 고름)
//   ② 후보에 들어가더라도 AI가 가끔 빠뜨립니다.
// 아래 프롬프트에도 같은 규칙을 넣었지만, 프롬프트는 "부탁"일 뿐 100% 지켜지지
// 않습니다. 그래서 코드에서도 한 번 더 확인해서 강제로 넣습니다.
//
// 언제 작동하나: 제목+요약에 아래 두 가지가 "둘 다" 있을 때만.
//   - 삼성 계열 이름 ("삼성" 두 글자로 확인 — 삼성전자·삼성그룹·삼성SDI 등 전부 포함)
//   - 로봇 관련 단어 (로봇·휴머노이드·협동로봇·로보틱스)
// 그래서 LG·두산·현대의 로봇 뉴스(삼성이 없음)나, 로봇과 상관없는 삼성
// 뉴스(반도체·스마트폰 등, 로봇 단어가 없음)에는 작동하지 않습니다.
// ---------------------------------------------------------------------------

const RAINBOW_ROBOTICS = { code: "277810", name: "레인보우로보틱스", market: "코스닥" };

// 로봇 관련 단어. ("협동로봇"은 "로봇"에 이미 걸리지만, 사람이 읽기 쉽게
//  요청받은 단어를 그대로 다 적어둠)
const SAMSUNG_ROBOT_WORDS = ["로봇", "휴머노이드", "협동로봇", "로보틱스"];

// "로봇청소기"는 생활가전(삼성 비스포크 제트봇 같은 것)이라 휴머노이드 개발
// 회사와 상관이 없습니다. 그래서 로봇 단어를 찾기 전에 이 단어들을 먼저
// 지워버립니다. 이렇게 하면:
//   - "삼성, 신형 로봇청소기 출시" → "로봇"이 남지 않음 → 작동 안 함 (원하는 대로)
//   - "삼성, 로봇청소기 이어 휴머노이드도 개발" → "휴머노이드"가 남음 → 작동함
const SAMSUNG_ROBOT_EXCLUDE_WORDS = ["로봇청소기", "로봇 청소기"];

// "삼성"이 들어가지만 삼성그룹의 로봇 사업과는 무관하게 기사에 등장하는
// 이름들. 예를 들어 "삼성증권 리서치센터는 LG 로봇 사업을 긍정적으로
// 평가했다"는 기사는 삼성이 주어가 아니라 그냥 코멘트를 한 증권사일 뿐입니다
// (이 파일 프롬프트의 "증권사 코멘트 출처는 관련주로 넣지 마" 규칙과 같은
// 이유). "삼성동"은 서울 지명이라 마찬가지로 지웁니다.
const SAMSUNG_NOT_SUBJECT_WORDS = [
  "삼성증권", "삼성자산운용", "삼성액티브자산운용", "삼성선물", "삼성동",
];

function isSamsungRobotNews(title, summary) {
  let text = `${title || ""}\n${summary || ""}`;
  for (const w of SAMSUNG_ROBOT_EXCLUDE_WORDS) text = text.split(w).join("");
  for (const w of SAMSUNG_NOT_SUBJECT_WORDS) text = text.split(w).join("");
  const hasSamsung = text.includes("삼성");
  const hasRobot = SAMSUNG_ROBOT_WORDS.some((w) => text.includes(w));
  return hasSamsung && hasRobot;
}

// "code|name|market" 줄들을 다시 객체로. (getCachedUniverse가 문자열로
// 들고 다니기 때문에 여기서 한 번 풀어줌 — 2,800줄 쪼개기는 공짜.)
function parseUniverseRows(universeCompanyList) {
  const rows = [];
  for (const line of String(universeCompanyList || "").split("\n")) {
    const [code, name, market] = line.split("|");
    if (code && name) rows.push({ code: code.trim(), name: name.trim(), market: (market || "").trim() });
  }
  return rows;
}

// 뉴스 한 건에 대해 "AI에게 보여줄 후보"를 만들어냄.
// 반환: { stockBlock, themeBlock, subsidiaryBlock, stockCount, themeCount, mentionedNames }
export function extractMatchCandidates(title, summary, universeCompanyList) {
  const text = `${title || ""}\n${summary || ""}`;
  const rows = parseUniverseRows(universeCompanyList);

  // ① 이름이 본문에 그대로 등장하는 종목
  const mentioned = rows.filter((r) => r.name.length >= 2 && text.includes(r.name));
  const mentionedCodes = new Set(mentioned.map((r) => r.code));

  // ② 후보 테마 — 점수가 높을수록(더 긴 조각이 걸릴수록) 확실한 후보
  const themeScore = new Map();
  for (const { theme, tokens } of THEME_SEARCH_TOKENS) {
    let best = 0;
    for (const tk of tokens) {
      // "\u0000"으로 시작하는 조각 = 하위 테마 전용 검색어(EXTRA_THEME_KEYWORDS) → 가산점
      if (tk.startsWith("\u0000")) {
        const kw = tk.slice(1);
        if (text.includes(kw)) best = Math.max(best, kw.length + EXTRA_KEYWORD_BONUS);
      } else if (text.includes(tk)) best = Math.max(best, tk.length);
    }
    if (best > 0) themeScore.set(theme, best);
  }
  // 본문에 이름이 나온 종목이 속한 테마도 후보로(이름 매칭은 아주 강한 신호라 가산점)
  for (const row of rawThemeData) {
    if (!mentionedCodes.has(row.code)) continue;
    themeScore.set(row.theme, Math.max(themeScore.get(row.theme) || 0, 6));
  }
  const candidateThemes = Array.from(themeScore.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, CANDIDATE_MAX_THEMES)
    .map(([theme]) => theme);

  // ③ 후보 종목 = 이름이 나온 종목 + 후보 테마 소속 종목
  const universeByCode = new Map(rows.map((r) => [r.code, r]));
  const picked = new Map(); // code -> {code,name,market}
  for (const r of mentioned) picked.set(r.code, r);

  // [2026-10-22 추가] 삼성 + 로봇 기사면 레인보우로보틱스를 후보 맨 앞에 넣음.
  // 기사에 "레인보우로보틱스"라는 이름이 직접 안 나와도 AI가 고를 수 있게
  // 하려는 것입니다(후보에 없는 종목은 AI가 절대 고를 수 없음 — 위 설명 참고).
  // 오늘 시세 목록(universe)에 있으면 그 정보를, 없으면 고정값을 씁니다.
  if (isSamsungRobotNews(title, summary) && !picked.has(RAINBOW_ROBOTICS.code)) {
    picked.set(RAINBOW_ROBOTICS.code, universeByCode.get(RAINBOW_ROBOTICS.code) || RAINBOW_ROBOTICS);
  }

  const themeLines = [];
  for (const theme of candidateThemes) {
    const members = rawThemeData.filter((r) => r.theme === theme).slice(0, CANDIDATE_MAX_STOCKS_PER_THEME);
    if (members.length === 0) continue;
    themeLines.push(`${theme}: ${members.map((m) => `${m.code}|${m.name}`).join(", ")}`);
    for (const m of members) {
      if (picked.size >= CANDIDATE_MAX_STOCKS) break;
      if (picked.has(m.code)) continue;
      const u = universeByCode.get(m.code);
      picked.set(m.code, u || { code: m.code, name: m.name, market: m.market || "" });
    }
  }

  // 계열사 매핑도 본문에 이름이 나온 것만
  const subsidiaryBlock = SUBSIDIARY_MAP.filter((r) => r.subsidiary && text.includes(r.subsidiary))
    .map((r) => `${r.subsidiary} → ${r.parentName}(${r.parentCode}|${r.parentMarket})`)
    .join("\n");

  const stockBlock = Array.from(picked.values())
    .map((r) => `${r.code}|${r.name}|${r.market}`)
    .join("\n");

  return {
    stockBlock,
    themeBlock: themeLines.join("\n"),
    subsidiaryBlock,
    stockCount: picked.size,
    themeCount: candidateThemes.length,
    mentionedNames: mentioned.map((r) => r.name),
  };
}

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
1. [후보 종목]: 이 기사와 관련이 있을 만한 종목만 미리 추려놓은 목록 (코드|이름|시장 형식). 기사 제목·요약에 이름이 그대로 등장하는 종목과, 관련 있어 보이는 테마에 등록된 종목들을 모아둔 것이야. 여기 없는 종목·코드는 절대 지어내면 안 돼 — 반드시 이 목록 안에서만 골라.
2. [테마 목록]: 우리가 관리하는 투자 테마 이름들 (전체)
3. [후보 테마별 소속 종목 목록]: 위 후보와 관련 있어 보이는 테마들에 미리 등록해둔 종목들 (테마명: 코드|이름, 코드|이름, ... 형식) — 이 목록은 사람이 미리 정리해둔 것이라 완벽하지 않아. 같은 테마 이름 안에 실제로는 서로 다른 사업을 하는 회사가 섞여 있는 경우가 있어(예: "수소차" 테마에 자동차 회사(현대차·기아)와 발전·선박용 연료전지 회사가 같이 등록돼 있던 적이 있었는데, 이 둘은 완전히 다른 산업이라 한쪽 뉴스가 다른 쪽 주가에 영향을 주지 않아). 그러니까 이 목록에 등록돼 있다는 사실 자체를 "관련 있다"는 증거로 그대로 믿지 말고, 너의 판단으로 한 번 더 걸러야 해 (자세한 건 아래 theme_stocks 설명 참고).
4. [계열사-모회사 매핑]: 비상장(또는 우리 시스템에 코드가 없는) 자회사 이름 → 그 자회사를 소유한 상장 모회사

뉴스 기사 하나가 주어지면, 네 가지를 판단해:

**A. 직접 관련 종목 (matches)**: [후보 종목] 중에서, 이 기사와 실제로 관련 있는 종목을 찾아. 목록에 없는 종목·코드는 절대 지어내면 안 돼.

**관련 종목이 하나도 없는 게 정상일 수 있어**: 모든 기사에 관련주가 있어야 하는 게 아니야. 확신이 안 서면 억지로 뭐라도 채워넣지 말고 matches를 빈 배열로 둬 — 이게 잘못된 답이 아니라 오히려 맞는 답인 경우가 많아. "그나마 제일 비슷해 보이는" 종목을 낮은 확신으로 끼워넣는 것보다, 정직하게 "관련 종목 없음"이라고 답하는 게 훨씬 나아.

[후보 종목]에는 테마에 등록되지 않은 회사도 섞여 있어. 네가 원래 알고 있는 배경지식(그 회사가 실제로 어떤 사업을 하는지, 무슨 제품을 만드는지)을 적극적으로 활용해서 [후보 종목] 전체를 대상으로 판단해. 익숙한 대기업이 아니라는 이유로 빼지 마 — 실제로 관련 있다면 반드시 포함시켜. 다만 [후보 종목]에 없는 회사는 아무리 관련 있어 보여도 넣을 수 없어(코드를 지어내게 되니까).

**비상장 자회사 처리 규칙**: 기사에 [계열사-모회사 매핑]에 있는 자회사 이름이 나오고, 그 자회사에 대한 사업적으로 의미 있는 소식(계약, 투자, 신사업, 실적 등)이 있다면, 그 자회사 자체는 [후보 종목]에 없더라도 매핑에 적힌 모회사를 "confirmed"로 포함시켜. reason에는 "자회사 OOO 관련 소식"이라고 명시해서, 직접 언급이 아니라 자회사를 통한 연결이라는 걸 알 수 있게 해.

**주의**: 기사에 나온 회사 이름이 [계열사-모회사 매핑]에는 없지만 [후보 종목]에 자기 자신의 코드로 이미 있다면(예: 삼성SDI, LG에너지솔루션처럼 자체 상장된 계열사), 그건 모회사로 연결하지 말고 반드시 그 회사 자신의 코드로 매칭해. 모회사 연결은 오직 [계열사-모회사 매핑] 목록에 있는, 자체 코드가 없는 회사에만 적용해.

- "confirmed" (사업근거 확인): 그 회사명·제품명이 기사에 직접 언급되거나, 정부 정책·규제·계약·사고 등이 그 회사의 실제 사업 영역에 직접 영향을 미치는 경우.
- "rumor" (시장 추정): 구체적으로 존재하는 연결고리(특정 인물과의 동창·지연 관계, 커뮤니티에 도는 특정 소문)가 있을 때만. 막연한 업종 추측은 여기 넣지 말고 아예 빼.

**자기모순 방지 규칙**: reason에 쓸 문장이 "관계 확인 불가", "직접적 연관성 낮음", "확인되지 않음", "연결고리가 명확하지 않음"처럼 사실상 "관련 없다"는 뜻이 된다면, 그 종목은 matches에 아예 넣지 마. reason은 "왜 넣었는지"를 설명하는 자리이지 "왜 확신이 없는지"를 고백하는 자리가 아니야 — 확신이 없으면 넣지 않는 게 맞아. confirmed든 rumor든 마찬가지야.

**중요한 오판 방지 규칙**: 증권사가 기사에 "OO증권 리서치센터는 ~라고 분석했다", "OO증권 애널리스트는 ~라고 말했다"처럼 **코멘트·리포트의 출처로만** 언급된 경우, 그 증권사를 절대 관련주로 넣지 마. 그 증권사가 그 사건의 당사자(계약 주체, 투자자, 사업 파트너 등)일 때만 포함해. 단순히 "누가 이 기사에 대해 말했는지"와 "누가 사업적으로 관련 있는지"는 다른 문제야.

**계열사 이름 혼동 주의**: 회사 이름에 같은 단어가 들어간다고 같은 그룹이라고 착각하지 마. 특히 아래처럼 과거엔 한 뿌리였지만 지금은 완전히 남남인 그룹들을 절대 혼동하면 안 돼:
- "현대차그룹"(현대자동차·기아·현대모비스·현대건설 등)과 "HD현대"(옛 현대중공업그룹, HD현대중공업·HD현대마린엔진·HD한국조선해양·HD현대일렉트릭 등)는 완전히 별개의 그룹이야. "현대"라는 이름만 보고 현대차그룹 계열사라고 단정하지 마.
- "현대백화점그룹"(현대그린푸드·현대홈쇼핑 등)과 "현대해상화재보험"도 위 두 그룹과 전부 무관해.
- "LG그룹"과 "LX그룹"(LX하우시스·LX인터내셔널 등)은 2021년에 완전히 분리된 별개 회사야.
- "삼성그룹"과 "신세계그룹"·"CJ그룹"·"한솔그룹"도 과거엔 한 뿌리였지만 지금은 전부 무관한 별개 회사야.
- OTT 서비스 "티빙(TVING)"은 CJ ENM이 최대주주(약 48.85%)로 참여하는 별도 합작법인이야. "스튜디오드래곤"은 CJ ENM의 드라마 제작 자회사일 뿐, 티빙의 운영사·주주가 아니야 — 둘 다 "CJ" 계열이라는 이유로 스튜디오드래곤을 티빙 관련 사고(해킹, 서비스 장애 등)의 당사자로 넣으면 안 돼. 티빙 관련 소식은 [계열사-모회사 매핑]에 따라 CJ ENM으로 연결해.
- 회사가 정확히 어느 그룹 소속인지, 그 그룹이 실제로 그 사업(예: 로봇, 반도체 등)을 하는 계열사를 갖고 있는지 확신이 서지 않으면, 절대 추측으로 넣지 말고 아예 빼. 애매하면 넣는 것보다 안 넣는 게 훨씬 나아.

**하락 뉴스 처리 규칙**: 어떤 회사 자체의 주가 하락·실적 악화만 다루고 다른 종목에 미치는 영향이 없다면, 그 회사를 관련주로 넣지 마(애초에 이런 기사는 필터 단계에서 대부분 걸러질 거야). 다만 그 하락·악재가 **다른 회사에는 반사이익·기회**가 되는 경우(예: A사 해킹 사고→보안업체 B에 호재, A사 실적 부진→경쟁사 C에 반사이익, A사가 지배하던 시장에 B사가 새로 진입)에는, 그 수혜 회사(B, C) 관점에서 "confirmed"로 포함해.

**정보 유출/해킹 사고 처리 규칙**: 기사에 "유출"이라는 단어가 "정보", "개인정보", "고객정보", "계정" 같은 단어와 같이 나오면, 이건 십중팔구 해킹·보안 사고를 의미해. 이런 기사는: (1) primary_theme 또는 secondary_themes에 **"사이버 보안"**을 반드시 포함시키고, (2) theme_stocks에서 "사이버 보안" 테마의 동반 종목을 반사이익 관점("이 사고로 보안 수요가 늘어날 회사")으로 포함시켜.

**[2026-09-08 추가] 해킹·유출 사고를 "당한" 회사 자신은 matches에 넣지 마**: 재성님 리포트 — 전자결제(PG)업체가 해킹당했다는 기사에 그 PG업체 자신(예: KG이니시스, 다날)이 "관련주"로 같이 뜨는 게 이상하다는 피드백. 그 회사는 이 사고의 **피해자**지 이 뉴스로 득을 보는 회사가 아닌데, 사이버 보안 반사이익 종목들과 나란히 "관련주"로 뜨면 마치 둘 다 좋은 의미의 관련주인 것처럼 오해를 줌. 그래서 사고 당사자 회사(해킹·정보 유출을 당한 그 회사 자신, 계열사 포함)는 matches에 아예 넣지 말고, 오직 "사이버 보안" 테마 동반 종목(반사이익 수혜주)만 matches/theme_stocks에 넣어. 예: "OO페이먼츠 해킹 정황, 카드정보 유출"이라는 기사라면 OO페이먼츠나 그 계열사·연계망 회사들은 넣지 말고, 안랩·드림시큐리티 같은 사이버 보안주만 넣어. (기업이 직접 언급된 주체라도 이 규칙에서는 예외 없음 — 앞부분의 "확정된 매치 규칙"보다 이 해킹·유출 사고 규칙이 우선함.)

**"보안" vs "사이버 보안" 구분 주의**: [테마 목록]에 "보안"과 "사이버 보안"은 서로 다른 테마야. "보안"은 CCTV·출입통제·생체인식 같은 물리보안 하드웨어 회사들이고, "사이버 보안"은 정보보안 소프트웨어·인증·네트워크 보안 회사들이야. 해킹·개인정보 유출처럼 온라인/네트워크 사고면 "사이버 보안"을 써야지, 이름이 비슷하다고 "보안"을 쓰면 안 돼. 반대로 CCTV·출입 통제 시스템 자체에 대한 뉴스라면 "보안"이 맞아.

**[2026-09-08 추가] "조류독감" vs "감염병(코로나·독감)" 구분 주의**: 둘 다 "독감"이라는 단어가 들어가서 헷갈리기 쉬운데 완전히 다른 테마야. "조류독감"은 실제 닭·오리 같은 가금류·축산 농가에서 조류인플루엔자(AI)가 발생·확산됐다는 뉴스에만 써 — 여기 동반 종목은 동물용 백신·사료·축산업체(가축전염병으로 직접 피해/수혜를 보는 회사들)야. 반면 사람이 걸리는 계절독감(인플루엔자)·코로나19처럼 "사람" 감염병이 유행한다는 뉴스는 절대 "조류독감"을 쓰면 안 되고 "감염병(코로나·독감)"을 써야 해 — 여기 동반 종목은 사람 대상 진단키트·백신 회사들이야. 기사에 "조류", "가금류", "닭", "오리", "AI(조류인플루엔자)", "산란계", "육계" 같은 축산·가금류 관련 단어가 명시적으로 없으면 "조류독감"으로 분류하지 마 — 그냥 "독감", "인플루엔자", "코로나"라는 단어만 있으면 "감염병(코로나·독감)"이야.

**B. 핵심 테마 (primary_theme)**: [테마 목록] 중, 이 기사의 "가장 좁고 정확한 핵심 초점" 딱 하나만 골라. 예를 들어 전기차 배터리에 쓰이는 리튬 공급 얘기라면 "2차전지"가 아니라 "원자재(리튬)"을 골라야 해 — 기사가 진짜 말하고 있는 게 뭔지가 기준이야. 명확한 핵심이 없으면 null.

**[2026-09-09 추가] 제목에 테마 이름이 그대로 등장하면 그 테마를 반드시 채택**: 기사 제목에 [테마 목록] 중 하나의 이름이 (띄어쓰기 차이 정도는 무시하고) 그대로 등장하면 — 예를 들어 제목에 "사이버보안"이라는 단어가 있으면 — 정작 어느 상장사가 그 일을 하는지 요약문에 구체적으로 안 나와 있어도 "사이버 보안"을 반드시 primary_theme 또는 secondary_themes에 포함시키고, theme_stocks에서 그 테마의 동반 종목도 실제로 골라 넣어(빈 배열로 남겨두지 마). 재성님 리포트 — "오픈AI, 한국서 사이버보안 파트너 5곳 뽑는다"는 기사가, 그 5곳이 구체적으로 어느 회사인지 요약문에 안 나온다는 이유만으로 관련주가 하나도 안 뜨고 통째로 걸러진 적이 있었음. 이건 위쪽 "관련 종목이 하나도 없는 게 정상일 수 있어" 원칙이나 "명확한 핵심이 없으면 null" 원칙보다 이 규칙이 우선해 — 기사 제목에 테마 이름이 명시적으로 쓰였다는 것 자체가 이미 충분히 강한 관련성 신호이기 때문이야.

**[2026-09-09 추가] 해외 대기업이 주어인 기사는 뒤에 나오는 산업 키워드로 테마를 매칭**: 기사의 핵심 행위자(주어)가 오픈AI·구글·엔비디아·애플·테슬라·마이크로소프트·TSMC·아마존·메타처럼 이름값 있는 해외 대기업이면(FILTER 단계에서 이런 기사는 이미 대부분 통과시키도록 되어 있음), 그 대기업 자신은 [후보 종목]에 없으니 matches에 넣을 순 없지만, 그 대기업의 행위 뒤에 붙는 산업·기술 키워드(예: "사이버보안 파트너", "반도체 장비 발주", "데이터센터 투자", "AI 서버", "배터리 공급" 등)를 보고 [테마 목록] 중 가장 가까운 테마를 primary_theme 또는 secondary_themes로 채택해. 굳이 그 테마 이름이 제목에 토씨 하나 안 틀리고 등장하지 않아도 돼(위 규칙보다 좀 더 느슨하게 적용) — 키워드가 그 테마의 사업 영역을 가리키기만 하면 충분해. 그 다음 theme_stocks에서 그 테마의 동반 종목(국내 관련 부품·장비·서비스 회사들)을 실제로 채워 넣어. 재성님 판단 — 해외 대기업의 사업 확장·투자·파트너십 소식은 국내 관련 공급망 회사들에 대부분 호재로 작용하기 때문에, 이런 기사는 최대한 적극적으로 관련 테마를 찾아 매칭해야 해.

**[2026-10-22 추가] 삼성 + 로봇 뉴스는 레인보우로보틱스가 1순위**: 삼성전자·삼성그룹이 주어인 로봇·휴머노이드 뉴스에는 레인보우로보틱스(277810, 코스닥)를 관련주 1순위로 넣어. 삼성전자가 2025년 2월 지분 35%로 최대주주가 되면서 연결 자회사로 편입했고, 삼성의 휴머노이드 개발 주력 계열사야. "삼성이 로봇에 투자한다 / 휴머노이드를 만든다 / 로봇 사업을 확대한다" 류의 기사는 이 회사가 직접 수혜 대상이야. 단, 기사에 삼성 계열 이름과 로봇 관련 단어(로봇·휴머노이드·협동로봇·로보틱스)가 둘 다 있어야 해. LG·두산·현대의 로봇 뉴스나, 로봇과 무관한 삼성 뉴스(반도체·스마트폰 등)에는 적용하지 마. "로봇청소기" 같은 생활가전 기사도 제외야.

**[2026-10-29 추가] 큰 테마 대신 하위 테마를 먼저 골라**: [테마 목록]에 같은 분야의 큰 테마와 하위 테마가 함께 있으면, 기사 내용에 맞는 하위 테마를 primary_theme으로 골라. 큰 테마(예: "로봇", "2차전지", "바이오")의 동반 종목은 기사 내용과 직접 같은 사업을 하는 회사만 넣고, 사업이 다른 회사는 넣지 마.
- 로봇: 수술·재활·혈관 시술·의료용 로봇 기사 → "의료 로봇" (산업용·휴머노이드 로봇 회사인 레인보우로보틱스·두산로보틱스·뉴로메카 등은 의료 로봇 사업이 기사에 나오지 않으면 넣지 마) / 휴머노이드(사람 모양 로봇) → "휴머노이드 로봇" / 공장·작업용 로봇팔 → "협동로봇" / 감속기·액추에이터·모터·센서 같은 로봇 부품 → "로봇 부품(감속기·액추에이터)" / 서빙·배달·물류·청소 로봇 → "서비스·물류 로봇". 어느 하위 테마에도 딱 맞지 않는 로봇 일반 기사만 "로봇"을 써.
- 2차전지: 양극재·전구체 → "2차전지 소재(양극재)" / 음극재(흑연·실리콘) → "2차전지 소재(음극재)" / 전해질·전해액·리튬염 → "2차전지 소재(전해질)" / 분리막 → "2차전지 소재(분리막)" / 동박·전지박 → "2차전지 소재(동박)". 셀(배터리 완제품) 회사나 업황 전반 기사는 "2차전지".
- 바이오: 항체약물접합체(ADC) 기술이전·임상·위탁생산 → "ADC(항체약물접합체)".

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

**[2026-09-08 추가] 최우선 규칙 — 감염병 관련 뉴스는 무조건 포함**: 코로나(COVID), 독감(인플루엔자), 조류독감(AI), 아프리카돼지열병, 구제역, 팬데믹, 신종 감염병, 전염병 확산·유행 등 사람이나 가축에게 퍼지는 전염성 질병과 관련된 뉴스는 아래의 다른 어떤 포함/제외 기준(홍보성인지, 구체적 재료가 있는지, 이미 일어난 일을 설명하는 프레이밍인지 등)도 따지지 말고 무조건 include:true로 판단해. 이 규칙이 아래 다른 모든 규칙보다 우선해.

**포함해야 할 것** (예시 — 이런 성격의 뉴스):
- 대기업의 중소기업 인수·투자
- 신약 임상시험(FDA 등) 결과, 기술수출 계약
- 대통령·정부 고위 인사의 특정 산업 관련 정책·관세 발언
- 빅테크 리더(예: 젠슨황)의 산업에 영향력 있는 발언
- [2026-09-08 추가] 국내 대기업 총수·경제단체장(예: 최태원 대한상공회의소 회장 겸 SK그룹 회장, 이재용, 정의선 등)의 산업·정책 방향 관련 발언 — 구체적 계약이 아니라 "~해야 한다", "~구상한다" 같은 제안·구상 수준의 발언이어도, 본인이 속한 산업(에너지, 반도체, 자동차 등)이나 그 발언이 겨냥한 구체적 업종(예: 가스관·송전망 연결 구상 → 관련 인프라 업종)의 향후 방향을 시사하면 포함해. "일반적 거시경제 논평"과 구분하는 기준은 발언자가 누구인지야 — 익명의 전문가·평론가·기자의 시황 해설이 아니라, 실제로 그 산업에 영향력을 행사할 수 있는 특정 기업·단체의 대표가 자기 이름으로 한 발언이면 재료성이 있다고 봐
- 해킹, 개인정보 유출 등 보안 사고
- 감염병 확산 등 공중보건 이슈
- 대규모 공급계약·수주·기술수출
- 반도체 등 핵심 부품 공급망 리스크
- 대규모 투자유치·IPO·자금조달
- [2026-09-08 추가] 기업 자신의 대규모 투자 계획 발표 — 상대 회사와 맺은 계약이 아니라 "OO, 2031년까지 10조원 투자해 AI·로봇 사업 확대" 처럼 회사 스스로의 사업에 대한 투자 계획이라도, 금액이나 기간이 구체적 숫자로 나와 있으면 재료성이 있다고 봐. "미래 동력 확보", "청사진 발표", "~전방위 확대" 같은 다소 포괄적인 표현이 헤드라인에 붙어 있어도, 그 안에 구체적인 투자 금액·기간이 있다면 홍보성으로 보지 말고 포함해
- 시장 예상과 크게 다른 실적이고 그 구체적 이유가 설명된 경우
- 해외 대규모 공장 투자·진출
- 신기술 인증 등 사업적으로 유의미한 이벤트
- "세계 최초", "국내 최초", "국내 유일" 같은 표현이 붙은 기술·사업 성과 발표 — 이런 표현은 강한 재료 신호이니 절대 걸러내지 마
- 어떤 회사의 악재(해킹, 실적 부진, 시장 잠식 등)가 **다른 회사에는 반사이익·기회**가 되는 뉴스 — 예: A사 해킹 사고, A사가 지배하던 시장에 B사가 새로 진입, A사 실적 부진으로 경쟁사가 반사이익. 이런 기사는 "누구에게 하락 재료인가"가 아니라 "누구에게 호재인가"의 관점에서 포함해
- [2026-09-08 추가] 기업이 전시회·컨퍼런스·박람회 등에서 자사 기술력·제품·서비스 역량을 소개·공개하는 뉴스 — 예: "OO기업, △△서밋에서 AI 플랫폼 역량 공개". 구체적인 계약·수주 금액이 없어도, 실명의 특정 기업이 자기 사업 영역에서 실제로 보유한 기술·제품을 발표하는 내용이면 재료성이 있다고 보고 포함해
- [2026-09-08 추가] "OO 주가 상승한 이유", "왜 올랐나", "~탄 OOO, ~모멘텀" 처럼 **이미 일어난 주가 변동을 사후적으로 설명하는 프레이밍**의 기사(흔히 [특징주] 태그가 붙어 나옴)도 포함해 — 텔레그램 채널 쪽에서 이미 1차로 관련성 있는 뉴스만 골라 보내주기 때문에, 여기서 프레이밍만 보고 한 번 더 걸러낼 필요는 없어. 언급된 종목이 있으면 그대로 관련주로 매칭해
- [2026-09-09 추가] 오픈AI·구글·엔비디아·애플·테슬라·마이크로소프트·TSMC·아마존·메타처럼 이름값 있는 **해외 대기업이 기사의 주어(핵심 행위자)**인 뉴스는, 국내 협력사 이름이나 계약 금액이 구체적으로 안 나와 있어도 일단 포함해(include:true) — 재성님 판단으로, 이런 기사는 거의 대부분 관련 국내 부품·장비·서비스 공급망 회사들에 우호적인 재료로 작용해. 그 해외 대기업이 한국 시장을 잠식한다거나 국내 기업과 직접 경쟁해서 명백히 안 좋은 내용인 경우만 예외로 두고, 그 외에는 애매해도 포함 쪽으로 판단해(이 항목에 한해서는 "애매하면 제외" 원칙보다 이 규칙이 우선함).

- [2026-10-29 추가 — 재성님: "뉴스 필터링이 너무 강한거같은데 좀 풀까? 뉴스속보가 너무 안올라와"] 아래 성격의 뉴스도 포함해:
  · 상장사의 유상증자(특히 제3자배정)·투자 유치·지분 인수 — 새 자금·새 주주가 들어오는 소식은 그 회사 주가의 재료야
  · 정부·국회·지자체의 정책·예산·국책사업·규제 변화(예: 주택 공급 대책, 새만금·신도시 개발, 원전 정책, 수출 규제 완화) — 관련 업종 전체의 재료야
  · 신제품·신작 게임의 출시·출시일 공개·테스트 시작, 신규 서비스 시작
  · 상장사의 실적 발표·잠정실적·컨퍼런스콜 내용(시장 예상과 크게 다르지 않아도)
  · 국방·공공 사업 선정, 인증·특허 등록, 우선협상대상자 선정, 선박·설비 확충
  · 해외 빅테크의 신제품 공개(애플 신형 맥북·아이폰 등) — 국내 부품 공급망의 재료야
  · 유가·원자재 가격 급변, 전쟁·휴전·북한 도발 같은 지정학 사건 — 정유·방산·해운 등 관련 업종의 재료야

**제외해야 할 것** (예시 — 이런 건 걸러내):
- 부고, 인사동정 등 개인 신상 소식
- 경품·이벤트·프로모션 홍보성 뉴스(예: 카드사 경품 이벤트, 은행 사은품 행사) — 이건 위에서 새로 추가한 "기술력·제품 역량 소개"와는 달라. 상품·서비스 자체가 아니라 경품·추첨·할인 같은 판촉 행사가 소재인 경우만 여기 해당해
- 연예인이 등장하거나 주요 소재인 뉴스 (그 연예인이 투자·주식 얘기를 하더라도)
- "OO기업 주가 X원 X% 상승/하락" 식으로 숫자만 있고 구체적 이유(재료)가 없는 기계적 시세 리포트
- 일반적 시황 칼럼, 기고, 사설, 거시경제 논평 (익명 전문가·평론가·기자가 쓴 시황 해설·전망 기사를 말하는 거야 — 위 "포함해야 할 것"에 있는, 실명의 대기업 총수·경제단체장·정부 고위 인사가 자기 이름으로 한 산업 정책 관련 발언은 이 항목으로 걸러내지 마. 예를 들어 "OO증권 리서치센터는 ~라고 전망했다" 식의 익명·범용 전망은 제외 대상이지만, "최태원 회장은 ~해야 한다고 말했다"처럼 특정 인물의 실명 발언을 전하는 기사는 제외 대상이 아니야)
- 특정 종목과 무관한 일반 서비스 홍보(예: 은행의 시니어 돌봄서비스 출시 등)
- **어떤 회사 자체의 주가 하락·실적 악화·신용등급 강등만 다루고, 다른 회사에 미치는 긍정적 영향(반사이익 등)이 전혀 없는 뉴스.** 예: "OO기업 3분기 실적 부진으로 주가 급락" (다른 회사 언급 없이 그 자체로 끝나는 경우) — 이런 건 "누구에게도 새로운 투자 기회가 아닌 단순 악재 보도"이므로 제외해
- 경영상 심각한 문제 없이 발생한 소소한 주가 등락
- 날씨 예보, 사건·사고(범죄·화재·교통사고), 정치인 간 공방, 스포츠, 생활 정보처럼 어느 업종의 사업과도 연결되지 않는 일반 사회 뉴스

[2026-10-29 변경] 애매하면 포함하는 쪽으로 판단해. 예전엔 "애매하면 제외"였는데 사이트에 올라오는 속보가 너무 적었어. 이 단계를 통과해도 다음 단계에서 관련 종목을 엄격하게 다시 고르고, 관련 종목이 없으면 어차피 게재되지 않아. 그러니까 여기서는 "상장사나 특정 업종의 사업에 영향을 줄 가능성이 조금이라도 있으면" 통과시키고, 위 제외 목록에 분명히 해당하는 것만 걸러내.

응답은 반드시 아래 형식의 JSON 객체 하나만, 다른 텍스트 없이:
{"include":true}`;

export async function isMarketMovingHeadline(title, summary) {
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

export async function matchStocks(title, summary, universeCompanyList) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.");

  // [2026-09-18 변경] 캐시에 넣는 고정 블록은 이제 "지시문 + 테마 이름 목록"
  // 뿐입니다(약 1만 자). 예전에는 여기에 상장 종목 2,800개 전체와 테마별
  // 소속 종목 1,514줄까지 통째로 들어가서 9만 6천 자였는데, 그게 비용의
  // 대부분이었습니다. 기사마다 달라지는 후보 목록은 아래 user 메시지로
  // 내려보냅니다 — 캐시는 고정 블록에만 걸리므로 이렇게 나누는 게 맞습니다.
  const staticContext = `${SYSTEM_PROMPT}\n\n[테마 목록]\n${buildThemeList()}`;

  // 기사별 후보 — 이 부분만 매번 새로 보냄(보통 수천 자).
  const candidates = extractMatchCandidates(title, summary, universeCompanyList);
  const candidateContext = [
    `[후보 종목]\n${candidates.stockBlock || "(없음)"}`,
    `[후보 테마별 소속 종목 목록]\n${candidates.themeBlock || "(없음)"}`,
    `[계열사-모회사 매핑]\n${candidates.subsidiaryBlock || "(이 기사와 관련된 항목 없음)"}`,
  ].join("\n\n");

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
        { role: "user", content: `${candidateContext}\n\n뉴스 제목: ${title}\n뉴스 요약: ${summary}` },
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

  // SYSTEM_PROMPT's "자기모순 방지 규칙" tells Claude not to include a match
  // whose own reason text amounts to "no real connection found" — but a
  // prompt instruction is a request, not a guarantee, and this kept slipping
  // through in practice (e.g. reason: "SFC와 SFA반도체는 다른 회사이며,
  // 직접적 연관성 확인 불가" attached to an included match). This is a
  // second, code-level backstop: drop any match whose reason contains one of
  // these self-denying phrases, regardless of what the prompt asked for.
  // Kept deliberately narrow to negative-only phrasings — a broader
  // substring like "직접적 연관" would also match a legitimate positive
  // reason ("직접적 연관성이 확인됨"), so every entry here is a phrase that
  // is negative regardless of what comes after it.
  const SELF_CONTRADICTION_PATTERNS = [
    "확인 불가",
    "확인되지 않",
    "연관성 낮",
    "연관성이 낮",
    "관계가 없",
    "관련 없",
    "관련이 없",
    "연관이 없",
    "직접적 연관성 낮",
    "직접적인 연관성을 찾기 어렵",
    "연결고리가 명확하지 않",
    "연결고리를 찾기 어렵",
    "무관",
  ];
  function isSelfContradicting(reason) {
    if (typeof reason !== "string") return false;
    return SELF_CONTRADICTION_PATTERNS.some((p) => reason.includes(p));
  }

  const directMatches = (Array.isArray(parsed.matches) ? parsed.matches : [])
    .filter((m) => !isSelfContradicting(m?.reason))
    .map((m) => ({ ...m, tier: "direct" }));

  // [2026-10-22 추가] 삼성 + 로봇 기사면 레인보우로보틱스를 직접 관련주 1순위로.
  //
  // 프롬프트에도 같은 규칙을 넣었지만 AI가 가끔 빠뜨리거나 뒤쪽에 넣습니다.
  // 그래서 여기서 최종 확인:
  //   - AI가 이미 넣었으면 → 그 항목(AI가 쓴 이유 문장 포함)을 맨 앞으로 옮김
  //   - AI가 빠뜨렸으면 → 새로 만들어서 맨 앞에 넣음
  // 맨 앞에 두는 이유: 아래 finalizeMatches는 "직접 관련주" 안에서는 순서를
  // 바꾸지 않고 그대로 둡니다. 그래서 맨 앞에 있으면 화면에서 "대장주"
  // 자리에 그대로 나옵니다.
  // 같은 종목이 두 번 나오지 않도록, 기존 항목은 빼고 다시 넣습니다.
  if (isSamsungRobotNews(title, summary)) {
    const idx = directMatches.findIndex((m) => m.code === RAINBOW_ROBOTICS.code);
    const rainbow =
      idx >= 0
        ? directMatches.splice(idx, 1)[0]
        : {
            ...RAINBOW_ROBOTICS,
            confidence: "confirmed",
            tier: "direct",
            reason: "삼성전자 연결 자회사(지분 35%)이자 삼성 휴머노이드 개발 주력 계열사",
          };
    directMatches.unshift(rainbow);
  }

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

  const all = [...directMatches, ...themeMatches];

  // [2026-10-19 추가] 이 기사의 테마를 첫 번째 종목에 붙여서 같이 저장합니다.
  //
  // 왜 필요한가: 홈 화면의 테마 히트맵("뉴스가 몰린 테마")과 "오늘 시장을
  // 움직인 건 ○○" 문장은 기사별 테마를 세어서 만듭니다. 그런데 지금까지
  // 저장되는 피드 항목에는 테마가 따로 담기지 않고, 테마로 묶인 종목의
  // reason에만 "'해운' 테마 동반 종목" 형태로 들어 있었습니다. 그래서
  // 동반 종목이 하나도 안 붙은 기사는 테마를 알 길이 없었습니다.
  //
  // 왜 첫 번째 종목에만 붙이나: 모든 종목에 똑같은 배열을 복사해 넣으면
  // 저장 용량만 늘어납니다. 피드를 읽는 쪽(lib/todayBrief.js의
  // extractThemes)이 첫 번째 종목을 먼저 보고, 없으면 예전처럼 reason에서
  // 읽어내도록 돼 있습니다.
  if (all.length > 0) {
    const primary = typeof parsed.primary_theme === "string" ? parsed.primary_theme : null;
    const secondary = Array.isArray(parsed.secondary_themes)
      ? parsed.secondary_themes.filter((t) => typeof t === "string" && t)
      : [];
    const themes = [...new Set([primary, ...secondary].filter(Boolean))];
    if (themes.length > 0) all[0] = { ...all[0], themes };
  }

  return all;
}

// Final ordering + cap. Tier order (direct → primary theme → secondary
// theme) comes first. Within the theme tiers, sort by today's change%
// descending — that's what naturally pushes sluggish mega-caps down
// without a hardcoded blacklist. Within the "direct" tier, though, keep
// Claude's own ordering instead: the article's actual subject is usually
// listed first, and re-sorting by price would let an unrelated mover
// (even a wrongly-matched one) outrank the real subject as "대장주".
const TIER_ORDER = { direct: 0, primary: 1, secondary: 2 };
export function finalizeMatches(matches, priceMap) {
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
const STORY_DEDUP_CHECK_COUNT = 30; // how many recent feed items to check against

// [2026-10-28 변경 — 속보가 너무 적게 올라오던 큰 원인]
// 재성님: "텔레그램 뉴스는 엄청 많이 발생되는데 내 사이트에는 너무 적게 올라와"
//
// 예전 규칙: 새 속보의 "대표 종목"(관련주 맨 앞)이 최근 6시간 안에 올라간 속보의 대표 종목과 같으면
//   기사 내용과 상관없이 "같은 이야기"로 보고 버렸습니다. 그래서 삼성전자·SK하이닉스·한화에어로스페이스처럼
//   하루에도 여러 다른 소식이 나오는 종목은 6시간에 1건밖에 못 올라갔습니다.
//   게다가 이 검사는 AI 두 번(재료성 판단 + 종목 매칭)을 다 쓴 "뒤"에 해서, 돈은 쓰고 버리는 셈이었습니다.
//
// 바뀐 규칙: 대표 종목이 같고 + 제목의 핵심 단어가 2개 이상 겹칠 때만 "같은 이야기"로 봅니다.
//   예) "SK하이닉스, HBM4 12단 엔비디아 최종 인증 통과" ↔ "하이닉스 HBM4 엔비디아 퀄 통과…공급 본격화"
//       → HBM4·엔비디아·통과가 겹침 → 같은 이야기(여러 언론사가 같은 소식을 낸 것) → 1건만
//   예) "삼성전자, 휴머노이드 전담 조직 신설" ↔ "삼성전자, 美 텍사스 공장 2나노 양산 시작"
//       → 종목 이름 말고 겹치는 단어 없음 → 다른 소식 → 둘 다 올라감
// 비용 변화 없음(이미 쓴 AI 결과를 덜 버리는 것뿐).
const DEDUP_MIN_SHARED = 2;
const DEDUP_MIN_RATIO = 0.34;
const DEDUP_STOPWORDS = new Set([
  "속보", "단독", "특징주", "종합", "공시", "뉴스", "관련", "관련주", "주가", "상승", "하락", "급등", "급락", "강세", "약세",
  "기대", "전망", "확대", "추진", "본격", "가속", "예정", "발표", "공개", "국내", "최초", "세계", "글로벌", "업계", "시장",
  "the", "and", "for", "with",
]);
function headlineTokens(title, leadName) {
  const lead = String(leadName || "").replace(/\s+/g, "");
  const words = String(title || "")
    .replace(/\[[^\]]{0,12}\]/g, " ")
    .split(/[^0-9A-Za-z가-힣]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2 && !DEDUP_STOPWORDS.has(w.toLowerCase()));
  // 대표 종목 이름(또는 그 일부)은 당연히 겹치므로 빼고 비교
  return new Set(words.filter((w) => !lead || (!lead.includes(w) && !w.includes(lead))));
}
function sameStoryTitles(a, b, leadName) {
  const A = headlineTokens(a, leadName);
  const B = headlineTokens(b, leadName);
  if (!A.size || !B.size) return false;
  // "엔비디아"와 "엔비디아와"처럼 조사만 다른 단어도 같은 단어로 침(한쪽이 다른 쪽으로 시작하면 같음)
  let shared = 0;
  for (const w of A) {
    for (const v of B) {
      if (w === v || w.startsWith(v) || v.startsWith(w)) {
        shared += 1;
        break;
      }
    }
  }
  return shared >= DEDUP_MIN_SHARED && shared / Math.min(A.size, B.size) >= DEDUP_MIN_RATIO;
}

// Different outlets (or, now, a news wire vs a Telegram channel) cover the
// same real event with completely different headlines. This checks whether
// the new item's LEAD stock (matches[0]) was the lead of something published
// recently AND the headlines share enough key words (see above).
// publishedThisRun entries: { matches, title } (old callers passed bare matches arrays — still accepted)
export async function isDuplicateStory(redis, matches, publishedThisRun = [], title = "") {
  if (!matches.length) return false;
  const leadCode = matches[0].code;
  const leadName = matches[0].name;

  for (const entry of publishedThisRun) {
    const m = Array.isArray(entry) ? entry : entry?.matches;
    const t = Array.isArray(entry) ? "" : entry?.title;
    if (m?.[0]?.code === leadCode && (!title || !t || sameStoryTitles(title, t, leadName))) return true;
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
    if (item.matches[0].code !== leadCode) continue;
    if (sameStoryTitles(title, item.title, leadName)) return true;
  }
  return false;
}

// Dedup key for a Naver News article — by TITLE, not link (wire-service
// reposts often get a brand-new URL each time even though the headline is
// identical, which was defeating link-based dedup).
export function articleKey(article) {
  const normalized = article.title.trim().toLowerCase().replace(/\s+/g, "");
  return "seen:" + Buffer.from(normalized).toString("base64url").slice(0, 120);
}

// Dedup key for a Telegram channel message — by (channel, messageId), which
// Telegram guarantees is unique and stable per message, so no text
// normalization is needed the way it is for articleKey above.
export function telegramMessageKey(channel, messageId) {
  return `seen:tg:${channel}:${messageId}`;
}

// Generalized "publish one accepted item to the feed" step, shared by both
// poll/route.js (Naver articles) and telegram-ingest/route.js (Telegram
// messages). Handles the cross-source story-level dedup check (see
// isDuplicateStory above) and the actual Redis feed write.
//
// `item` shape: { id, keyword, title, summary, link, pubDate, matches,
// source?, channel? } — keyword is what NewsCard shows as the little
// "source" label (e.g. "특징주" for poll, "텔레그램·NEWSZZANG" for
// telegram-ingest). source/channel are optional extra tags, currently
// unused by the frontend but kept on the record for future filtering/UI.
export async function publishFeedItem(redis, item, publishedThisRun) {
  const isDupStory = await isDuplicateStory(redis, item.matches, publishedThisRun, item.title);
  if (isDupStory) {
    return { title: item.title, published: false, reason: "동일 종목 관련 최근 기사 이미 게재됨(중복 스토리)" };
  }

  const feedItem = {
    id: item.id,
    keyword: item.keyword,
    title: item.title,
    summary: item.summary,
    link: item.link,
    pubDate: item.pubDate,
    matches: item.matches,
    savedAt: new Date().toISOString(),
    ...(item.source ? { source: item.source } : {}),
    ...(item.channel ? { channel: item.channel } : {}),
  };
  await redis.lpush("feed", JSON.stringify(feedItem));
  await redis.ltrim("feed", 0, FEED_MAX_LENGTH - 1);
  publishedThisRun.push({ matches: item.matches, title: item.title }); // so later candidates in this same run can see it too
  return { title: item.title, published: true, matchCount: item.matches.length };
}
