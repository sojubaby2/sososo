// lib/priceHistory.js
//
// Daily OHLC (시가/고가/저가/종가) history store for every KOSPI/KOSDAQ
// stock, fetched from KRX 정식 Open API(openapi.krx.co.kr) — same 인증키
// (KRX_OPENAPI_KEY)와 같은 두 서비스(유가증권/코스닥 일별매매정보)를
// app/api/theme-momentum/route.js와 공유함. 자세한 교체 이력은 아래
// "2026-09-07 변경 — 2차" 주석 참고 — 이 파일도 theme-momentum이 겪은 것과
// 동일하게 비공식 KRX 내부 API가 클라우드 트래픽을 차단해서 공식 API로
// 옮겨왔음. lib/newsPipeline.js와는 별개 출처인 이유: 그쪽은 "오늘" 스냅샷만
// 필요하지만(네이버 금융 스크래핑), 이 파일은 날짜별 실제 OHLC가 필요함.
// 이 데이터 레이어를 차트패턴 인식 기능(lib/patternDetection.js,
// app/api/patterns/route.js)이 읽어감 — 쌍바닥, 컵앤핸들 같은 패턴은
// 몇 주~몇 달치 일별 종가가 있어야 하는데, 기존 코드베이스엔 이런 걸 저장하는
// 곳이 없었음(poll 파이프라인은 항상 "오늘" 스냅샷만 봤음).
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

// 지금까지 쌓인 일수(0~HISTORY_LOOKBACK_DAYS) — 프론트(패턴검색 페이지)에서
// "히스토리 쌓는 중" 진행률을 보여주는 용도. zcard 한 번이라 가벼움.
export async function getStoredDayCount(redis) {
  return redis.zcard(DATES_INDEX_KEY);
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

// [2026-09-07 변경 — 2차] 처음엔 공공데이터포털(apis.data.go.kr) KRX API를
// serviceKey(KRX_SERVICE_KEY)로 호출하다가, 그 API가 클라우드(Vercel) 서버
// 트래픽을 막기 시작해서 한국거래소(KRX) 정보데이터시스템(data.krx.co.kr)의
// 비공식 내부 API(getJsonData.cmd)로 한 차례 교체했었음. 그런데 이것도
// app/api/theme-momentum/route.js에서 겪은 것과 똑같은 문제로 막힘 — KRX가
// pykrx 같은 비공식 라이브러리의 과도한 접속을 이유로 이 내부 API를 IP
// 단위로 차단하는 정책을 운영 중이라(github.com/sharebook-kr/pykrx issue
// #151), Vercel처럼 여러 사용자가 IP 대역을 공유하는 클라우드에서는
// 나만 안 써도 막힐 수 있어서 근본적으로 불안정함. 그래서 theme-momentum과
// 동일하게 KRX가 직접 운영하는 정식 Open API(openapi.krx.co.kr, "KRX Data
// Marketplace")로 교체함 — 회원가입 → 인증키 발급 → "유가증권 일별매매정보"
// (stk_bydd_trd)/"코스닥 일별매매정보"(ksq_bydd_trd) 서비스 개별 활용신청을
// 거쳐야 하는 공식 경로라 비공식 스크래핑과 달리 차단될 위험이 없음. 인증키는
// Vercel 환경변수 KRX_OPENAPI_KEY (theme-momentum과 같은 값을 그대로 재사용).
const KRX_OPENAPI_BASE_URL = "https://data-dbg.krx.co.kr/svc/apis";
const KRX_OPENAPI_ENDPOINT = {
  STK: "sto/stk_bydd_trd", // 유가증권(코스피) 일별매매정보
  KSQ: "sto/ksq_bydd_trd", // 코스닥 일별매매정보
};

// 인증키를 헤더(AUTH_KEY)와 쿼리 파라미터 둘 다에 실어 보냄(theme-momentum과
// 동일한 이유 — 참고 자료마다 헤더/쿼리 중 어느 쪽을 요구하는지 달라서 둘 다
// 보내는 게 안전함).
async function fetchKrxOpenApi(mktId, basDt) {
  const authKey = process.env.KRX_OPENAPI_KEY;
  if (!authKey) {
    throw new Error("KRX_OPENAPI_KEY 환경변수가 설정되지 않았습니다.");
  }
  const endpoint = KRX_OPENAPI_ENDPOINT[mktId];
  const qs = new URLSearchParams({ basDd: basDt, AUTH_KEY: authKey });
  const url = `${KRX_OPENAPI_BASE_URL}/${endpoint}?${qs.toString()}`;
  const res = await fetch(url, {
    headers: { AUTH_KEY: authKey },
    cache: "no-store",
  });
  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw new Error(`KRX 정식 API 오류 (status ${res.status}): ${bodyText.slice(0, 300)}`);
  }
  const data = await res.json();
  return Array.isArray(data?.OutBlock_1) ? data.OutBlock_1 : [];
}

// data-dbg.krx.co.kr이 가끔 일시적으로 응답을 안 주는 경우를 대비해 한 번
// 실패하면 짧게 쉬었다가 한 번만 더 시도함(theme-momentum과 동일 패턴).
async function fetchKrxOpenApiWithRetry(mktId, basDt) {
  try {
    return await fetchKrxOpenApi(mktId, basDt);
  } catch (err) {
    console.error(`priceHistory: KRX 정식 API 요청 실패, 0.5초 후 1회 재시도 (${basDt}/${mktId}):`, err.message || err);
    await new Promise((resolve) => setTimeout(resolve, 500));
    return fetchKrxOpenApi(mktId, basDt);
  }
}

function parseKrxNum(v) {
  if (v === undefined || v === null) return undefined;
  const cleaned = String(v).replace(/,/g, "").trim();
  if (cleaned === "" || cleaned === "-") return undefined;
  return Number(cleaned);
}

// theme-momentum/route.js와 같은 이유로 필드명 후보를 여러 개 나열해두고
// 있는 걸 골라 씀(공식 문서로 100% 확인은 못 했음 — 다만 theme-momentum에서
// 이미 이 후보들로 정상 작동 확인함, 2026-09-07). 후보가 다 안 맞으면 콜드
// 스타트당 한 번만 원본 행을 로그로 남김.
const FIELD_CANDIDATES = {
  code: ["ISU_SRT_CD", "ISU_CD", "SRTN_CD"],
  name: ["ISU_ABBRV", "ISU_NM", "ISU_ABBRV_NM"],
  open: ["TDD_OPNPRC", "OPNPRC"],
  high: ["TDD_HGPRC", "HGPRC"],
  low: ["TDD_LWPRC", "LWPRC"],
  close: ["TDD_CLSPRC", "CLSPRC"],
};

function pickField(row, keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== "") return row[k];
  }
  return undefined;
}

let loggedFieldMismatchSample = false;

// KRX 정식 Open API 응답 행 -> toHistoryRecords가 기대하는 예전 필드명
// (srtnCd/itmsNm/mrktCtg/mkp/hipr/lopr/clpr)으로 변환.
function normalizeKrxRow(row, marketLabel) {
  const code = pickField(row, FIELD_CANDIDATES.code);
  const name = pickField(row, FIELD_CANDIDATES.name);
  if (!code || !name) {
    if (!loggedFieldMismatchSample) {
      loggedFieldMismatchSample = true;
      console.error(
        "priceHistory: KRX 정식 API 응답에서 종목코드/종목명 필드를 못 찾음(필드명이 예상과 다를 수 있음). 원본 행 샘플:",
        JSON.stringify(row)
      );
    }
    return null;
  }
  return {
    srtnCd: code,
    itmsNm: name,
    mrktCtg: marketLabel,
    mkp: parseKrxNum(pickField(row, FIELD_CANDIDATES.open)),
    hipr: parseKrxNum(pickField(row, FIELD_CANDIDATES.high)),
    lopr: parseKrxNum(pickField(row, FIELD_CANDIDATES.low)),
    clpr: parseKrxNum(pickField(row, FIELD_CANDIDATES.close)),
  };
}

async function fetchStockPage(basDt) {
  const [stk, ksq] = await Promise.all([
    fetchKrxOpenApiWithRetry("STK", basDt),
    fetchKrxOpenApiWithRetry("KSQ", basDt),
  ]);
  return [
    ...stk.map((r) => normalizeKrxRow(r, "KOSPI")),
    ...ksq.map((r) => normalizeKrxRow(r, "KOSDAQ")),
  ].filter(Boolean);
}

export async function backfillHistory(redis, { maxNewDaysPerRun = 20, targetDays = HISTORY_LOOKBACK_DAYS } = {}) {
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

    let items;
    try {
      items = await fetchStockPage(basDt);
    } catch (err) {
      return { error: "KRX 호출 실패: " + String(err.message || err), added, total: currentTotal + added };
    }
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
// once a minute).
export async function appendTodaysSnapshotIfMissing(redis, basDt) {
  const already = await hasSnapshot(redis, basDt);
  if (already) return { added: false };

  let items;
  try {
    items = await fetchStockPage(basDt);
  } catch (err) {
    return { added: false, error: "KRX 호출 실패: " + String(err.message || err) };
  }
  if (items.length === 0) return { added: false };

  const result = await storeDaySnapshot(redis, basDt, items);
  return { added: result.stored, basDt };
}
