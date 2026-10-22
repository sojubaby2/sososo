// lib/worldIndices.js
//
// [2026-10-17 신설] 홈 화면의 "오늘의 세계증시" 지도에 쓸 지수 데이터를 모으는
// 파일입니다.
//
// [2026-10-17 전면 교체] 재성님 리포트 — "지금 표시가 안 되는 증시들은 왜
// 안 되는 거야?"
//
// 원인을 실제로 확인했습니다. 처음에 쓰던 Stooq(stooq.com)의 무료 시세 주소가
// **지금은 통째로 사라졌습니다.** 배포된 사이트에서도, 재성님 PC 브라우저에서
// 직접 열어봐도 똑같이 "페이지가 없습니다(404)"가 나옵니다. 우리 쪽 문제가
// 아니라 그 회사가 그 주소를 닫은 겁니다. 그래서 FRED가 가진 세 개
// (다우·나스닥·닛케이)만 숫자가 나오고 나머지 여덟 나라는 전부 "—"였습니다.
//
// 그래서 데이터를 받아오는 곳을 바꿨습니다. 이제 세 군데를 순서대로 씁니다.
//
//  ① 야후 파이낸스 (query1.finance.yahoo.com) — 무료, 인증키 불필요.
//     지수 하나당 주소 하나로 최근 며칠치 종가를 줍니다. 11개 나라를 전부
//     커버합니다. 실제로 열어서 코스피 값이 제대로 나오는 것을 확인했습니다.
//  ② FRED (미국 세인트루이스 연방준비은행) — 공식 통계, 무료, 이미 키를
//     쓰고 있습니다. 다우·나스닥·닛케이만 있지만 대단히 안정적입니다.
//  ③ 네이버 금융 지수 일별시세 — 코스피 전용. 이미 이 프로젝트 안에 조회
//     코드가 있습니다(lib/marketIndex.js).
//
// 왜 세 군데나 쓰나: 이번처럼 한 곳이 문을 닫아도 지도가 통째로 비지 않게
// 하려는 겁니다. 한 나라에 대해 ①이 실패하면 ②, ②도 없으면 ③ 순서로
// 내려가고, 전부 실패한 나라만 "—"가 됩니다.
//
// 비용: 이 함수는 app/api/world-indices/route.js에서만 호출되고, 그 주소에
// 5분짜리 캐시가 걸려 있습니다. 방문자가 몇 명이든 바깥 요청은 5분에 한 번
// 뿐입니다. Claude(AI) 비용과는 아무 관계가 없습니다.
//
// 어느 나라가 또 비면:
// https://newsmeme.co.kr/api/world-indices?debug=1 을 열어보면 나라별로 어느
// 경로에서 성공했는지, 실패했다면 왜인지 그대로 나옵니다.

import { fetchIndexTodaySummary } from "./marketIndex";

// 지도에 표시할 나라들.
//
// yahoo: 야후 파이낸스 종목기호. 어느 나라가 "—"로 뜨면 이 값부터 의심하세요.
// fred : FRED 통계 코드(있는 나라만).
// lon/lat: 지금 화면은 안 쓰지만(핀 위치는 components/BriefingBand.js의
//          표로 직접 잡습니다) 나중에 다른 용도로 쓸 수 있어 남겨둡니다.
// region: 화면 위쪽 탭(전체/아시아/북아메리카/남아메리카/유럽) 거르기용.
// [2026-10-22 순서·구성 변경] 재성님 요청.
//
//   1) 한국-코스피
//   2) 한국-코스닥   ← 새로 넣음 (코스피200은 뺌)
//   3) 미국-나스닥
//   4) 미국-다우
//   5) 그 아래로 나머지 나라들 (예전 순서 그대로)
//
// 왜 이 순서인가: 우리 방문자가 실제로 보는 순서입니다. 내 시장(코스피·
// 코스닥)을 먼저 보고, 그다음 간밤의 미국을 봅니다. 나머지 나라는 참고용
// 입니다. 예전에는 아시아→유럽→미국 지리 순서였는데, 지리 교과서가
// 아니라 증시 화면이니 이쪽이 맞습니다.
//
// 코스피200을 뺀 이유: 코스피와 거의 같이 움직여서 두 칸을 쓸 값어치가
// 없었습니다. 코스닥은 따로 움직이는 날이 많아 볼 이유가 분명합니다.
//
// ★ 순서를 바꾸고 싶으면 아래 줄 순서만 바꾸면 됩니다. 화면에 나오는
//   순서가 곧 이 배열 순서입니다(아래 MARKETS.map이 그대로 씁니다).
// ★ 어느 칸이 "—"로만 뜨면 그 줄의 yahoo 값을 의심하세요. 확인은
//   주소창에 아래를 치면 어느 기호가 실패했는지 바로 나옵니다.
//     newsmeme.co.kr/api/world-indices?debug=1
export const MARKETS = [
  // ── 국내 ──────────────────────────────────────────────────────────
  { key: "kr", label: "한국-코스피", flag: "🇰🇷", indexName: "코스피", region: "아시아", yahoo: "^KS11", fred: null, lon: 127.0, lat: 37.5 },
  // 지도 핀은 없습니다 — 서울 자리는 코스피가 이미 쓰고 있어 겹칩니다.
  // components/BriefingBand.js의 위치표(MAP_POINTS)에 이 key가 없으면
  // 핀만 자동으로 생략되고 아래 지수 띠에는 정상으로 나옵니다.
  { key: "kq", label: "한국-코스닥", flag: "🇰🇷", indexName: "코스닥", region: "아시아", yahoo: "^KQ11", fred: null, lon: null, lat: null },

  // ── 미국 (간밤 장) ────────────────────────────────────────────────
  { key: "us-nasdaq", label: "미국-나스닥", flag: "🇺🇸", indexName: "나스닥", region: "북아메리카", yahoo: "^IXIC", fred: "NASDAQCOM", lon: -96.0, lat: 33.0 },
  { key: "us-dow", label: "미국-다우", flag: "🇺🇸", indexName: "다우존스", region: "북아메리카", yahoo: "^DJI", fred: "DJIA", lon: -77.0, lat: 40.0 },

  // ── 나머지 나라 (예전 순서 그대로) ────────────────────────────────
  { key: "jp", label: "일본", flag: "🇯🇵", indexName: "닛케이225", region: "아시아", yahoo: "^N225", fred: "NIKKEI225", lon: 139.7, lat: 35.7 },
  { key: "cn", label: "중국", flag: "🇨🇳", indexName: "상하이종합", region: "아시아", yahoo: "000001.SS", fred: null, lon: 121.5, lat: 31.2 },
  { key: "hk", label: "홍콩", flag: "🇭🇰", indexName: "항셍", region: "아시아", yahoo: "^HSI", fred: null, lon: 114.2, lat: 22.3 },
  { key: "tw", label: "대만", flag: "🇹🇼", indexName: "가권", region: "아시아", yahoo: "^TWII", fred: null, lon: 121.0, lat: 23.7 },
  { key: "in", label: "인도", flag: "🇮🇳", indexName: "센섹스", region: "아시아", yahoo: "^BSESN", fred: null, lon: 72.9, lat: 19.1 },
  { key: "gb", label: "영국", flag: "🇬🇧", indexName: "FTSE100", region: "유럽", yahoo: "^FTSE", fred: null, lon: -2.0, lat: 53.5 },
  { key: "de", label: "독일", flag: "🇩🇪", indexName: "DAX", region: "유럽", yahoo: "^GDAXI", fred: null, lon: 10.4, lat: 51.0 },
  { key: "br", label: "브라질", flag: "🇧🇷", indexName: "보베스파", region: "남아메리카", yahoo: "^BVSP", fred: null, lon: -46.6, lat: -23.5 },
];

const YAHOO_URL = "https://query1.finance.yahoo.com/v8/finance/chart";
const FRED_URL = "https://api.stlouisfed.org/fred/series/observations";

// 한 번의 바깥 요청이 이 시간을 넘기면 포기합니다. 한 나라가 느리다는 이유로
// 홈 화면 전체가 늦어지면 안 되기 때문입니다.
const REQUEST_TIMEOUT_MS = 6000;

function toNum(value) {
  const n = Number(String(value ?? "").trim());
  return Number.isFinite(n) ? n : null;
}

// 정해진 시간 안에 안 오면 스스로 끊는 fetch.
async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// 야후 파이낸스에서 지수 하나의 최근 종가와 전일 대비 등락률을 가져옵니다.
//
// 돌려주는 응답 안에 쓸 만한 값이 두 군데 있습니다.
//  · meta.regularMarketPrice        = 가장 최근 값
//  · meta.regularMarketChangePercent = 전일 대비 등락률(야후가 계산해 준 값)
// 등락률이 안 들어오는 경우를 대비해, 종가 배열의 마지막 둘을 직접 비교하는
// 계산도 함께 넣어뒀습니다.
async function fetchFromYahoo(symbol) {
  if (!symbol) return null;
  const url = `${YAHOO_URL}/${encodeURIComponent(symbol)}?range=5d&interval=1d`;
  const res = await fetchWithTimeout(url, {
    headers: {
      // 야후는 아무 표시 없는 요청을 가끔 막습니다. 평범한 브라우저처럼
      // 보이도록 표시를 붙입니다.
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
      Accept: "application/json,text/plain,*/*",
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`야후 요청 실패 (status ${res.status})`);

  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error(data?.chart?.error?.description || "빈 응답");

  const meta = result.meta || {};
  const closes = (result.indicators?.quote?.[0]?.close || []).filter(
    (v) => typeof v === "number" && Number.isFinite(v)
  );

  const close = toNum(meta.regularMarketPrice) ?? (closes.length ? closes[closes.length - 1] : null);
  if (close === null) throw new Error("종가 없음");

  let changePct = toNum(meta.regularMarketChangePercent);
  if (changePct === null && closes.length >= 2) {
    const prev = closes[closes.length - 2];
    if (prev) changePct = ((close - prev) / prev) * 100;
  }

  // 응답에 들어있는 시각(초 단위)을 날짜로 바꿔 화면 아래 "기준" 표시에 씁니다.
  let asOf = null;
  const ts = toNum(meta.regularMarketTime);
  if (ts) asOf = new Date(ts * 1000).toISOString().slice(0, 10);

  return { close, changePct, asOf };
}

// FRED에서 한 지수의 최근 관측값을 가져옵니다(오늘과 직전 영업일).
// 전일 대비 등락률을 계산하려면 두 개가 필요합니다.
async function fetchFromFred(seriesId, apiKey) {
  if (!seriesId || !apiKey) return null;
  const qs = new URLSearchParams({
    series_id: seriesId,
    api_key: apiKey,
    file_type: "json",
    sort_order: "desc",
    limit: "5",
  });
  try {
    const res = await fetchWithTimeout(`${FRED_URL}?${qs.toString()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    // 값이 아직 안 들어온 날은 "."로 옵니다 — 걸러내고 숫자만 추립니다.
    const points = (data?.observations || [])
      .map((o) => ({ date: o.date, value: toNum(o.value) }))
      .filter((o) => o.value !== null);
    if (points.length < 2) return null;
    const [latest, prev] = points;
    return {
      close: latest.value,
      changePct: prev.value ? ((latest.value - prev.value) / prev.value) * 100 : null,
      date: latest.date,
    };
  } catch {
    return null;
  }
}

// 지도에 쓸 데이터를 한 번에 만들어 돌려줍니다.
//
// 반환 형태:
//   { generatedAt, items: [{ key, label, flag, indexName, region, lon, lat,
//                            close, changePct, source, basis, asOf }], debug }
// changePct가 null이면 화면에서 "—"로 표시됩니다.
export async function buildWorldIndices() {
  const fredKey = process.env.FRED_API_KEY || "";

  // ① 야후 — 11개를 동시에 요청합니다(하나가 실패해도 나머지는 삽니다).
  const yahooResults = {};
  const yahooErrors = {};
  await Promise.all(
    MARKETS.map(async (m) => {
      try {
        yahooResults[m.key] = await fetchFromYahoo(m.yahoo);
      } catch (err) {
        yahooResults[m.key] = null;
        yahooErrors[m.key] = String(err?.message || err);
      }
    })
  );

  // [2026-10-17 추가] 한 번 더 두드려 봅니다.
  //
  // 왜 필요한가: 11개를 한꺼번에 던지면 야후가 그중 한두 개를 "너무 빠르다"고
  // 튕겨내는 일이 있습니다. 실제로 배포 직후 화면을 보니 아홉 나라는 숫자가
  // 들어왔는데 대만·인도만 비어 있었습니다(잠시 뒤 다시 부르면 멀쩡히
  // 들어옴). 실패한 것만 0.2초씩 간격을 두고 하나씩 다시 부르면 거의 다
  // 채워집니다. 실패가 없으면 이 구간은 그냥 지나갑니다.
  const retryTargets = MARKETS.filter((m) => !yahooResults[m.key]);
  for (const m of retryTargets) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    try {
      yahooResults[m.key] = await fetchFromYahoo(m.yahoo);
      if (yahooResults[m.key]) delete yahooErrors[m.key];
    } catch (err) {
      yahooErrors[m.key] = String(err?.message || err);
    }
  }

  // ② FRED — 야후가 실패했을 때를 대비한 예비. 세 나라만 있습니다.
  const fredResults = {};
  await Promise.all(
    MARKETS.filter((m) => m.fred).map(async (m) => {
      fredResults[m.key] = await fetchFromFred(m.fred, fredKey);
    })
  );

  // ③ 코스피 — 위 둘이 다 실패했을 때만 쓰는 마지막 예비.
  let kospi = null;
  const needKospiFallback = !yahooResults.kr;
  if (needKospiFallback) {
    try {
      kospi = await fetchIndexTodaySummary("KOSPI");
    } catch {
      kospi = null;
    }
  }

  const debug = {
    yahooOk: Object.fromEntries(MARKETS.map((m) => [m.key, !!yahooResults[m.key]])),
    yahooErrors,
    fredOk: Object.fromEntries(Object.entries(fredResults).map(([k, v]) => [k, !!v])),
    kospiFallbackUsed: !!(kospi && typeof kospi.close === "number"),
    missing: [],
  };

  const items = MARKETS.map((m) => {
    const yahoo = yahooResults[m.key] || null;
    const fred = fredResults[m.key] || null;

    let close = null;
    let changePct = null;
    let source = null;
    let basis = null;
    let asOf = null;

    if (yahoo) {
      close = yahoo.close;
      changePct = yahoo.changePct;
      source = "yahoo";
      basis = "전일종가대비";
      asOf = yahoo.asOf;
    } else if (fred) {
      close = fred.close;
      changePct = fred.changePct;
      source = "fred";
      basis = "전일종가대비";
      asOf = fred.date;
    } else if (m.key === "kr" && kospi && typeof kospi.close === "number") {
      close = kospi.close;
      changePct = typeof kospi.changeVsPrevClosePct === "number" ? kospi.changeVsPrevClosePct : null;
      source = "naver";
      basis = "전일종가대비";
      asOf = kospi.date || null;
    } else {
      debug.missing.push({ key: m.key, yahoo: m.yahoo, error: yahooErrors[m.key] || null });
    }

    return {
      key: m.key,
      label: m.label,
      flag: m.flag,
      indexName: m.indexName,
      region: m.region,
      lon: m.lon,
      lat: m.lat,
      close,
      changePct,
      source,
      basis,
      asOf,
    };
  });

  return { generatedAt: new Date().toISOString(), items, debug };
}
