// lib/priceHistory.js
//
// Daily OHLC (시가/고가/저가/종가) history store for every KOSPI/KOSDAQ
// stock, built on top of the same KRX daily-price API already used in
// lib/newsPipeline.js (fetchAllStocksToday). This is the data layer the
// new chart-pattern-recognition feature (lib/patternDetection.js,
// app/api/patterns/route.js) reads from — pattern shapes like 쌍바닥
// (double bottom) or 컵앤핸들 (cup and handle) need weeks/months of daily
// closes per stock, which nothing in the existing codebase stored before
// (the poll pipeline only ever looked at *today's* snapshot).
//
// Storage design — "one Redis key per trading day", not "one key per
// stock": each key (hist:day:<basDt>) holds every stock's OHLC for that
// single day as one JSON array. Reconstructing a single stock's time
// series means reading ~N day-keys (N = lookback window, e.g. 260) and
// picking that stock's entry out of each — O(N) Redis reads total,
// regardless of how many thousand stocks exist. The alternative
// (one key per stock, appended to daily) would mean ~2,800 Redis writes
// every single day just to keep history current, which is both slower
// and far more expensive on Upstash's per-request pricing. A sorted set
// (hist:dates) indexes which trading days we actually have, so backfill
// and readers never have to guess which basDt values are real trading
// days vs. weekends/holidays.

const DATES_INDEX_KEY = "hist:dates";
const DAY_KEY_PREFIX = "hist:day:";

// ~1 trading year plus margin — long enough for the widest pattern window
// (컵앤핸들, ~80 trading days) and doubles as a "52-week high" proxy for
// the 전고점돌파(breakout) detector. Tune later if a pattern needs more.
export const HISTORY_LOOKBACK_DAYS = 260;

function dayKey(basDt) {
  return DAY_KEY_PREFIX + basDt;
}

function marketLabel(mrktCtg) {
  if (mrktCtg === "KOSPI") return "코스피";
  if (mrktCtg === "KOSDAQ") return "코스닥";
  return mrktCtg || "";
}

// Raw KRX API items -> the lean {code,name,market,o,h,l,c} shape actually
// stored. (KRX field names: mkp=시가/open, hipr=고가/high, lopr=저가/low,
// clpr=종가/close — same API as fetchAllStocksToday in newsPipeline.js,
// just keeping open/high/low too, which the news-matching path never
// needed.)
function toHistoryRecords(krxItems) {
  const records = [];
  for (const it of krxItems) {
    if (!it.srtnCd || !it.itmsNm) continue;
    const o = Number(it.mkp);
    const h = Number(it.hipr);
    const l = Number(it.lopr);
    const c = Number(it.clpr);
    if (![o, h, l, c].every((n) => Number.isFinite(n))) continue;
    records.push({ code: it.srtnCd, name: it.itmsNm, market: marketLabel(it.mrktCtg), o, h, l, c });
  }
  return records;
}

// Stores one trading day's full-market OHLC snapshot (idempotent — safe to
// call again for a basDt that's already stored, just overwrites with the
// same data) and indexes it in the dates sorted set, then prunes anything
// older than HISTORY_LOOKBACK_DAYS to keep storage bounded.
export async function storeDaySnapshot(redis, basDt, krxItems) {
  const records = toHistoryRecords(krxItems);
  if (records.length === 0) return { stored: false, reason: "빈 데이터" };

  await redis.set(dayKey(basDt), records);
  await redis.zadd(DATES_INDEX_KEY, { score: Number(basDt), member: basDt });

  // Prune: keep only the most recent HISTORY_LOOKBACK_DAYS dates.
  const total = await redis.zcard(DATES_INDEX_KEY);
  if (total > HISTORY_LOOKBACK_DAYS) {
    const excess = total - HISTORY_LOOKBACK_DAYS;
    const oldest = await redis.zrange(DATES_INDEX_KEY, 0, excess - 1);
    if (oldest.length > 0) {
      await Promise.all(oldest.map((d) => redis.del(dayKey(d))));
      await redis.zrem(DATES_INDEX_KEY, ...oldest);
    }
  }

  return { stored: true, basDt, count: records.length };
}

export async function hasSnapshot(redis, basDt) {
  const score = await redis.zscore(DATES_INDEX_KEY, basDt);
  return score !== null && score !== undefined;
}

// Most recent `limit` trading days we have stored, ascending (oldest
// first) — the order every consumer (pattern detection, chart rendering)
// actually wants a time series in.
export async function getStoredDatesAscending(redis, limit = HISTORY_LOOKBACK_DAYS) {
  const total = await redis.zcard(DATES_INDEX_KEY);
  if (!total) return [];
  const start = Math.max(0, total - limit);
  return redis.zrange(DATES_INDEX_KEY, start, total - 1);
}

export async function getOldestStoredDate(redis) {
  const oldest = await redis.zrange(DATES_INDEX_KEY, 0, 0);
  return oldest[0] || null;
}

// Reads every stored day-snapshot in [oldest..newest] (ascending) and
// pivots them into one Map: code -> { name, market, series: [{date,o,h,l,c}, ...] }
// (series in ascending date order). This is the shape lib/patternDetection.js
// consumes. Missing/corrupt day-keys are skipped rather than failing the
// whole scan — a single bad day shouldn't take down every stock's history.
export async function buildPriceSeriesForAllStocks(redis, limit = HISTORY_LOOKBACK_DAYS) {
  const dates = await getStoredDatesAscending(redis, limit);
  const byCode = new Map();

  for (const basDt of dates) {
    let records;
    try {
      const raw = await redis.get(dayKey(basDt));
      records = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      continue;
    }
    if (!Array.isArray(records)) continue;

    for (const r of records) {
      if (!r?.code) continue;
      if (!byCode.has(r.code)) byCode.set(r.code, { name: r.name, market: r.market, series: [] });
      byCode.get(r.code).series.push({ date: basDt, o: r.o, h: r.h, l: r.l, c: r.c });
    }
  }

  return byCode;
}

// ---------------------------------------------------------------------------
// Backfill — one-time (well, resumable-multiple-times) job to populate
// history for days *before* whatever's already stored. Walks backward from
// the oldest stored date (or from today, on a completely empty store) and
// keeps fetching/storing earlier trading days until either
// HISTORY_LOOKBACK_DAYS is reached or `maxNewDaysPerRun` new days have been
// added in this call — whichever comes first. Deliberately capped per run
// (not "just fetch all 260 days in one go") because each day is a real
// external HTTP call to the KRX API, and this runs inside the same
// maxDuration=60s serverless budget as everything else here; a full
// backfill from empty takes ~13 calls to this endpoint (260 ÷ 20).
// Safe to call repeatedly — always resumes from wherever it left off, and
// no-ops once history is already at full depth.
// ---------------------------------------------------------------------------

function toBasDt(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${dd}`;
}

function* businessDaysBackFrom(fromBasDt) {
  // fromBasDt is a "YYYYMMDD" string — walk backward one calendar day at a
  // time, yielding only Mon-Fri (actual public holidays are handled by the
  // caller simply getting an empty `items` back from KRX for that date and
  // moving on, same as fetchAllStocksToday's existing retry logic).
  const y = Number(fromBasDt.slice(0, 4));
  const m = Number(fromBasDt.slice(4, 6)) - 1;
  const dd = Number(fromBasDt.slice(6, 8));
  const d = new Date(y, m, dd);
  while (true) {
    d.setDate(d.getDate() - 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) yield toBasDt(d);
  }
}

async function fetchStockPage(serviceKey, basDt) {
  const qs = new URLSearchParams({ numOfRows: "3000", pageNo: "1", resultType: "json", basDt });
  const url = `https://apis.data.go.kr/1160100/service/GetStockSecuritiesInfoService/getStockPriceInfo?serviceKey=${serviceKey}&${qs.toString()}`;
  const res = await fetch(url, { cache: "no-store" });
  return res.json();
}

export async function backfillHistory(redis, { maxNewDaysPerRun = 20, targetDays = HISTORY_LOOKBACK_DAYS } = {}) {
  const serviceKey = process.env.KRX_SERVICE_KEY;
  if (!serviceKey) return { error: "KRX_SERVICE_KEY 환경변수가 설정되지 않았습니다." };

  const currentTotal = await redis.zcard(DATES_INDEX_KEY);
  if (currentTotal >= targetDays) {
    return { done: true, added: 0, total: currentTotal, message: "이미 목표 일수만큼 쌓여 있습니다." };
  }

  const oldest = await getOldestStoredDate(redis);
  const startFrom = oldest || toBasDt(new Date()); // empty store: start walking back from today

  const gen = businessDaysBackFrom(startFrom);
  let added = 0;
  let attempts = 0;
  const maxAttempts = maxNewDaysPerRun * 3; // a few public holidays are expected along the way

  while (added < maxNewDaysPerRun && attempts < maxAttempts && currentTotal + added < targetDays) {
    attempts++;
    const basDt = gen.next().value;
    const already = await hasSnapshot(redis, basDt);
    if (already) continue; // shouldn't normally happen walking backward from the oldest, but stay idempotent

    let data;
    try {
      data = await fetchStockPage(serviceKey, basDt);
    } catch (err) {
      return { error: "KRX 호출 실패: " + String(err.message || err), added, total: currentTotal + added };
    }
    const items = data?.response?.body?.items?.item ?? [];
    if (items.length === 0) continue; // weekend slipped through, or a public holiday — no data that day, skip

    const result = await storeDaySnapshot(redis, basDt, items);
    if (result.stored) added++;
  }

  const total = await redis.zcard(DATES_INDEX_KEY);
  return { done: total >= targetDays, added, total, oldestNow: await getOldestStoredDate(redis) };
}

// Keeps history current going forward: called once per poll cycle with the
// basDt poll/route.js already resolved via getCachedUniverse (so no extra
// KRX call to even find out what "today" is). Cheap the vast majority of
// cycles — just a zscore check — and only does a real fetch on the rare
// cycle where that basDt isn't captured yet (KRX's daily settlement data
// doesn't change intraday, so this fires roughly once per trading day, not
// once a minute). A separate targeted fetch (not reused from
// getCachedUniverse) because the cached universe payload only keeps
// close+change for matching/sorting — this needs open/high/low too.
export async function appendTodaysSnapshotIfMissing(redis, basDt) {
  const already = await hasSnapshot(redis, basDt);
  if (already) return { added: false };

  const serviceKey = process.env.KRX_SERVICE_KEY;
  if (!serviceKey) return { added: false, error: "KRX_SERVICE_KEY 환경변수가 없습니다." };

  let data;
  try {
    data = await fetchStockPage(serviceKey, basDt);
  } catch (err) {
    return { added: false, error: "KRX 호출 실패: " + String(err.message || err) };
  }
  const items = data?.response?.body?.items?.item ?? [];
  if (items.length === 0) return { added: false };

  const result = await storeDaySnapshot(redis, basDt, items);
  return { added: result.stored, basDt };
}
