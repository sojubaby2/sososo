// lib/candles.js
//
// [2026-10-26 신설] 종목을 누르면 뜨는 "일봉 차트"의 데이터를 가져오는 곳입니다.
//
// 재성님 요청: "이 사이트(jongganote)처럼 종목을 누르면 당일을 포함한 일봉이
//              보이는 차트를 표시할 수 있을까?"
//
// 어디서 가져오나 — 야후 파이낸스(무료):
//   lib/quotes.js, lib/flagships.js와 같은 곳입니다. Vercel에서 잘 되는 것을
//   이미 확인했습니다.
//   · 코스피 종목 → 005930.KS
//   · 코스닥 종목 → 247540.KQ
//   어느 시장인지 모르면 코스피(.KS)로 먼저 해보고, 없으면 코스닥(.KQ)으로 다시 해봅니다.
//
// 오늘 봉: 장중에는 오늘 봉이 "지금까지의 시가·고가·저가·현재가"로 같이 옵니다
//   (실시간이 아니라 15~20분 늦은 값입니다 — 사이트 다른 시세와 같습니다).
//
// 비용: 돈이 들지 않습니다(AI·Redis 안 씀). 같은 종목은 2분 동안 저장된 값을
//   다시 쓰므로, 방문자 여러 명이 같은 종목을 눌러도 야후에는 2분에 한 번만 갑니다.
//
// 야후 데이터에서 실제로 조심해야 하는 것:
//   ① 값이 빈(null) 날이 섞여 옵니다(휴장일 등) → 빼고 씁니다.
//   ② 오늘 봉이 두 번 들어오는 경우가 있습니다 → 날짜(한국시간)가 같으면 뒤의 것만 남깁니다.
//   ③ 거래정지 등으로 몇 년 전 값이 오는 종목이 있습니다(lib/quotes.js 참고)
//      → 마지막 봉이 30일보다 오래됐으면 "데이터 없음"으로 처리합니다.

const YAHOO_URL = "https://query1.finance.yahoo.com/v8/finance/chart";
const CACHE_SECONDS = 120; // 2분
const REQUEST_TIMEOUT_MS = 6000;
const MAX_STALE_DAYS = 30;
const RANGE = "9mo"; // 약 180거래일을 받아서, 20일선이 차트 맨 왼쪽부터 그려지게 함

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// 유닉스 시각(초) → 한국 날짜 "2026-10-26"
function kstDate(sec) {
  return new Date(sec * 1000 + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

async function fetchYahooDaily(symbol) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${YAHOO_URL}/${encodeURIComponent(symbol)}?range=${RANGE}&interval=1d`, {
      headers: { "User-Agent": BROWSER_UA, Accept: "application/json,text/plain,*/*" },
      signal: controller.signal,
      next: { revalidate: CACHE_SECONDS },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    const ts = result?.timestamp;
    const q = result?.indicators?.quote?.[0];
    if (!Array.isArray(ts) || !q) return null;

    // 날짜별로 정리 (같은 날짜가 두 번 오면 뒤의 것으로 덮어씀 — 위 ②)
    const byDate = new Map();
    for (let i = 0; i < ts.length; i++) {
      const o = toNum(q.open?.[i]);
      const h = toNum(q.high?.[i]);
      const l = toNum(q.low?.[i]);
      const c = toNum(q.close?.[i]);
      if (o === null || h === null || l === null || c === null || c <= 0) continue; // 위 ①
      const v = toNum(q.volume?.[i]) ?? 0;
      byDate.set(kstDate(ts[i]), { d: kstDate(ts[i]), o, h, l, c, v });
    }
    const candles = [...byDate.values()].sort((a, b) => (a.d < b.d ? -1 : 1));
    if (!candles.length) return null;

    // 오늘 봉의 종가는 meta의 현재가가 더 최신인 경우가 있어서 맞춰 줍니다.
    const meta = result.meta || {};
    const livePrice = toNum(meta.regularMarketPrice);
    const liveTime = toNum(meta.regularMarketTime);
    const last = candles[candles.length - 1];
    if (livePrice && liveTime && kstDate(liveTime) === last.d) {
      last.c = livePrice;
      last.h = Math.max(last.h, livePrice);
      last.l = Math.min(last.l, livePrice);
    }

    // 위 ③: 너무 오래된 데이터면 버림
    const lastMs = new Date(`${last.d}T15:30:00+09:00`).getTime();
    if ((Date.now() - lastMs) / 86400000 > MAX_STALE_DAYS) return null;

    return {
      symbol,
      candles,
      asOf: liveTime ? new Date(liveTime * 1000).toISOString() : null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// code: "005930", market: "코스피" | "코스닥" | "" (모르면 빈 값)
export async function fetchDailyCandles(code, market = "") {
  if (!/^[0-9A-Z]{6}$/.test(code)) return null;
  const order = /코스닥|KOSDAQ|KQ/i.test(market) ? [".KQ", ".KS"] : [".KS", ".KQ"];
  for (const suffix of order) {
    const r = await fetchYahooDaily(code + suffix);
    if (r) return { code, market: suffix === ".KQ" ? "코스닥" : "코스피", ...r };
  }
  return null;
}
