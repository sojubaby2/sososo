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
// Cached for 6 hours (this is inherently daily-granularity data, no need
// to refetch on every page load).
//
// force-dynamic: no `request` param + a cacheable fetch means Next.js would
// otherwise try to call the KRX API once at BUILD time to prerender this
// route — if that build-time call fails (network hiccup in the CI
// container), it fails the whole Cloudflare deploy. This makes it run only
// per actual request instead, like the rest of this app's API routes.
export const dynamic = "force-dynamic";

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

// recentPrices/pastPrices 두 시점의 가격 맵을 비교해 종목코드 -> 등락률(%) 맵을 만듦.
function computeChanges(recentPrices, pastPrices) {
  const changes = {};
  for (const [code, nowPrice] of recentPrices.entries()) {
    const pastPrice = pastPrices.get(code);
    if (!pastPrice) continue;
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

  const stockChanges1W = computeChanges(recentPrices, weekPrices);
  const stockChanges1M = computeChanges(recentPrices, monthPrices);

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
