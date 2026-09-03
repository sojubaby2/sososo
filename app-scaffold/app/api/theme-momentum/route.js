// GET /api/theme-momentum
//
// We only have daily KRX snapshots, not a real historical time series, so
// "1-month change" here is computed by diffing TWO snapshots: the most
// recent available business day, and the closest available business day
// ~30 calendar days earlier. This deliberately replaces daily change%
// everywhere it was shown next to news/theme data that isn't itself
// real-time — a same-day % next to a headline read like "this just
// happened", which was misleading. A 1-month figure doesn't carry that
// same false-immediacy problem.
//
// Cached for 6 hours (this is inherently daily-granularity data, no need
// to refetch on every page load).
export const dynamic = "force-dynamic";

import rawThemeData from "../../../lib/themeData.json";
import rawThemeData from "../../../lib/themeData.json";

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

export async function GET() {
  const serviceKey = process.env.KRX_SERVICE_KEY;
  if (!serviceKey) {
    return Response.json({ error: "KRX_SERVICE_KEY 환경변수가 설정되지 않았습니다." }, { status: 500 });
  }

  const now = new Date();
  const monthAgo = new Date(now);
  monthAgo.setDate(monthAgo.getDate() - 30);

  const [recent, past] = await Promise.all([
    fetchLatestAvailable(serviceKey, now),
    fetchLatestAvailable(serviceKey, monthAgo),
  ]);

  if (!recent || !past) {
    return Response.json({ error: "시세 데이터를 가져오지 못했습니다." }, { status: 502 });
  }

  const recentPrices = toPriceMap(recent.items);
  const pastPrices = toPriceMap(past.items);

  // Per-stock 1-month change, for every code we have both endpoints for.
  const stockChanges = {};
  for (const [code, nowPrice] of recentPrices.entries()) {
    const pastPrice = pastPrices.get(code);
    if (!pastPrice) continue;
    stockChanges[code] = ((nowPrice - pastPrice) / pastPrice) * 100;
  }

  // Aggregate into per-theme averages using our theme→stock groupings.
  const themeAgg = new Map(); // theme -> {sum, count}
  for (const row of rawThemeData) {
    const pct = stockChanges[row.code];
    if (typeof pct !== "number") continue;
    if (!themeAgg.has(row.theme)) themeAgg.set(row.theme, { sum: 0, count: 0 });
    const agg = themeAgg.get(row.theme);
    agg.sum += pct;
    agg.count += 1;
  }
  const themeChanges = Array.from(themeAgg.entries()).map(([theme, { sum, count }]) => ({
    theme,
    change1M: sum / count,
    sampleSize: count,
  }));

  return Response.json(
    {
      recentBasDt: recent.basDt,
      pastBasDt: past.basDt,
      themeChanges,
      stockChanges,
    },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=1800, stale-while-revalidate=3600" } }
  );
}
