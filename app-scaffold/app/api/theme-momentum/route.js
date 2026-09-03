// GET /api/theme-momentum
//
// We only have daily KRX snapshots, not a real historical time series, so
// "N-day change" here is computed by diffing snapshots: the most recent
// available business day, against the closest available business day ~7 and
// ~30 calendar days earlier. This deliberately replaces daily change%
// everywhere it was shown next to news/theme data that isn't itself
// real-time — a same-day % next to a headline read like "this just
// happened", which was misleading. A multi-day figure doesn't carry that
// same false-immediacy problem.
//
// 1주일/1개월 두 기간을 동시에 계산해서 프론트(HOT 테마 패널의 토글)에서
// 고르게 함.
//
// 상장주식수(lstgStCnt) 변동 종목 제외: KRX 종가는 감자·주식병합·유상증자·
// 무상증자 같은 이벤트가 있어도 그 사실을 전혀 반영하지 않고 그냥 "그날의
// 1주 가격"만 줌. 예를 들어 삼부토건은 2026년 6월 법원 회생계획 인가로
// 27대 1 주식병합(96.3% 감자)을 거쳐 2026-09-01에 신주가 새로 상장됐는데,
// 병합 전/후 종가를 그대로 비교하면 실제로는 아무 일도 없었는데(가치는
// 그대로, 주식 수만 27분의 1로 줄고 주당가격만 그만큼 뛴 것) 등락률이
// +1500%대로 튀어 보이는 문제가 있었음. 상장주식수가 두 시점 사이에 크게
// 달라진 종목은 애초에 "종가 비교"라는 계산 자체가 성립하지 않으므로,
// 개별 종목의 등락률(stockChanges)과 테마 평균 양쪽 모두에서 제외함.
export const dynamic = "force-dynamic";

import rawThemeData from "../../../lib/themeData.json";

// 상장주식수가 두 시점 사이에 이 비율 이상 달라지면 감자/병합/증자 등으로
// 보고, 가격 비교 대상에서 제외함. 상장주식수는 평소엔 거의 안 바뀌므로
// 넉넉하게 잡아도(0.5%) 오탐은 거의 없음.
const SHARE_CHANGE_THRESHOLD = 0.005;

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

async function fetchStockPage(serviceKey, basDt) {
  const qs = new URLSearchParams({ numOfRows: "3000", pageNo: "1", resultType: "json", basDt });
  const url = `https://apis.data.go.kr/1160100/service/GetStockSecuritiesInfoService/getStockPriceInfo?serviceKey=${serviceKey}&${qs.toString()}`;
  const res = await fetch(url, { next: { revalidate: 21600 } }); // 6h cache — daily-granularity data
  return res.json();
}

async function fetchLatestAvailable(serviceKey, startFrom) {
  const gen = businessDaysBackFrom(startFrom);
  for (let i = 0; i < 6; i++) {
    const basDt = gen.next().value;
    const data = await fetchStockPage(serviceKey, basDt);
    const items = data?.response?.body?.items?.item ?? [];
    if (items.length > 0) return { items, basDt };
  }
  return null;
}

function toPriceMap(items) {
  const map = new Map();
  for (const it of items) {
    if (!it.srtnCd || !it.clpr) continue;
    map.set(it.srtnCd, Number(it.clpr));
  }
  return map;
}

// 종목코드 -> 상장주식수(lstgStCnt) 맵. 값이 없거나 0이면 그 종목은 그냥
// 건너뜀(있는 값만 가지고 비교).
function toSharesMap(items) {
  const map = new Map();
  for (const it of items) {
    if (!it.srtnCd || !it.lstgStCnt) continue;
    const n = Number(it.lstgStCnt);
    if (Number.isFinite(n) && n > 0) map.set(it.srtnCd, n);
  }
  return map;
}

// recentPrices/pastPrices 두 시점의 가격 맵을 비교해 종목코드 -> 등락률(%) 맵을
// 만듦. recentShares/pastShares로 상장주식수가 크게 달라진 종목(감자·병합·
// 증자 등)은 가격 비교 자체가 무의미하므로 결과에서 제외함.
function computeChanges(recentPrices, pastPrices, recentShares, pastShares) {
  const changes = {};
  for (const [code, nowPrice] of recentPrices.entries()) {
    const pastPrice = pastPrices.get(code);
    if (!pastPrice) continue;

    const nowShares = recentShares.get(code);
    const pastSharesCount = pastShares.get(code);
    if (nowShares && pastSharesCount) {
      const shareDiffRatio = Math.abs(nowShares - pastSharesCount) / pastSharesCount;
      if (shareDiffRatio > SHARE_CHANGE_THRESHOLD) continue; // 감자/병합/증자 등 — 비교 불가
    }

    changes[code] = ((nowPrice - pastPrice) / pastPrice) * 100;
  }
  return changes;
}

// stockChanges(종목코드 -> 등락률)를 테마별로 집계.
function aggregateByTheme(stockChanges) {
  const themeAgg = new Map();
  for (const row of rawThemeData) {
    const pct = stockChanges[row.code];
    if (typeof pct !== "number") continue;
    if (!themeAgg.has(row.theme)) themeAgg.set(row.theme, { sum: 0, count: 0 });
    const agg = themeAgg.get(row.theme);
    agg.sum += pct;
    agg.count += 1;
  }
  return themeAgg;
}

export async function GET() {
  const serviceKey = process.env.KRX_SERVICE_KEY;
  if (!serviceKey) {
    return Response.json({ error: "KRX_SERVICE_KEY 환경변수가 설정되지 않았습니다." }, { status: 500 });
  }

  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const monthAgo = new Date(now);
  monthAgo.setDate(monthAgo.getDate() - 30);

  const [recent, week, month] = await Promise.all([
    fetchLatestAvailable(serviceKey, now),
    fetchLatestAvailable(serviceKey, weekAgo),
    fetchLatestAvailable(serviceKey, monthAgo),
  ]);

  if (!recent || !week || !month) {
    return Response.json({ error: "시세 데이터를 가져오지 못했습니다." }, { status: 502 });
  }

  const recentPrices = toPriceMap(recent.items);
  const weekPrices = toPriceMap(week.items);
  const monthPrices = toPriceMap(month.items);

  const recentShares = toSharesMap(recent.items);
  const weekShares = toSharesMap(week.items);
  const monthShares = toSharesMap(month.items);

  const stockChanges1W = computeChanges(recentPrices, weekPrices, recentShares, weekShares);
  const stockChanges1M = computeChanges(recentPrices, monthPrices, recentShares, monthShares);

  const themeAgg1W = aggregateByTheme(stockChanges1W);
  const themeAgg1M = aggregateByTheme(stockChanges1M);

  const themeNames = new Set([...themeAgg1W.keys(), ...themeAgg1M.keys()]);
  const themeChanges = Array.from(themeNames).map((theme) => {
    const w = themeAgg1W.get(theme);
    const m = themeAgg1M.get(theme);
    return {
      theme,
      change1W: w ? w.sum / w.count : null,
      sampleSize1W: w ? w.count : 0,
      change1M: m ? m.sum / m.count : null,
      sampleSize1M: m ? m.count : 0,
    };
  });

  return Response.json(
    {
      recentBasDt: recent.basDt,
      weekBasDt: week.basDt,
      monthBasDt: month.basDt,
      themeChanges,
      stockChanges1W,
      stockChanges1M,
    },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=1800, stale-while-revalidate=3600" } }
  );
}
