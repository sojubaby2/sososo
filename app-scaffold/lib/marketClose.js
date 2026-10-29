// lib/marketClose.js
//
// [2026-10-28 신설] 장 마감 직후 "잠정" 시세 모으기 — 재성님: "10/27 15:30 정규장 끝나면 올라오게끔 바꿔줘"
//
// 왜 필요한가:
//   장 마감 정리(/market)는 한국거래소(KRX) 정식 일별 시세로 만듭니다. 그런데 KRX가 그날 시세를
//   다음 날 아침에야 공개해서, 10월 27일 정리가 10월 28일 아침에야 올라왔습니다.
//
// 어떻게 바꿨나:
//   장이 끝나면(15:30) 야후 시세로 전 종목 종가·거래량을 먼저 모아 "잠정 장 마감 정리"를 바로 올립니다.
//   다음 날 아침 KRX 확정 자료가 들어오면 자동으로 확정치로 바뀌고 잠정 자료는 지워집니다
//   (lib/priceHistory.js storeDaySnapshot).
//
// 언제 도나:
//   Cloudflare 예약 실행(wrangler.jsonc의 triggers, custom-worker.js)이 평일 15시~17시 사이 3분마다
//   /api/market-close를 부릅니다. 한 번에 약 700종목씩 받아서 4~5번이면 끝납니다.
//   ★ 야후 국내 시세는 15~20분 늦게 나옵니다. 그래서 실제로 정리가 올라오는 건 보통 15시 55분~16시 10분쯤입니다.
//     (15:30 종가가 야후에 반영됐는지 대표 종목 3개로 먼저 확인하고, 아직이면 기다렸다가 다음 차례에 다시 봅니다)
//
// 비용: 야후는 무료. Redis는 하루 몇십 번 읽고 쓰기. 야후 응답은 저장하지 않음(cache: no-store — 저장 창고 사용량 0).
//
// 저장 위치(Redis):
//   hist:prelim:YYYYMMDD   — 완성된 잠정 시세 { basDt, at, complete, holiday?, records:[{code,name,market,o,h,l,c,v}] }
//   hist:prelim:latest     — 가장 최근 잠정 날짜(YYYYMMDD)
//   hist:prelim-work:YYYYMMDD — 모으는 중간 진행 상황(끝나면 지움)
// 정식 자료(hist:day:, hist:dates)와 따로 둬서, 패턴검색 등 다른 기능은 확정 자료만 계속 씁니다.

const YAHOO_URL = "https://query1.finance.yahoo.com/v8/finance/chart";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

export const PRELIM_PREFIX = "hist:prelim:";
export const PRELIM_LATEST_KEY = "hist:prelim:latest";
const WORK_PREFIX = "hist:prelim-work:";
const DATES_KEY = "hist:dates";
const DAY_PREFIX = "hist:day:";

const PER_RUN = 700; // 한 번 실행에 받을 종목 수
const CONCURRENCY = 10; // 동시에 보내는 요청 수
const RUN_BUDGET_MS = 25000; // 한 번 실행 최대 시간
const START_MIN = 15 * 60 + 33; // 15:33부터 시도
const STOP_MIN = 17 * 60 + 30; // 17:30 이후엔 안 함
const GIVE_UP_MIN = 16 * 60 + 40; // 이때까지 다 못 모으면 모인 만큼으로 마무리(60% 이상일 때)
// [2026-10-29 전체 점검] 0.95 → 0.9 — 10/29엔 야후에 없는 종목이 7%쯤이라 95%를 못 채워서, 16시 40분 "포기 시각"까지
//   기다렸다가 마무리됐음(평소 16시 10분쯤 → 30분 늦게 올라옴). 빠진 종목은 다음 날 아침 한국거래소 확정치로 채워짐.
const DONE_RATIO = 0.9; // 이만큼 모이면 완성(거래정지 종목 등은 야후에 오늘 시세가 없음)
const MIN_RATIO = 0.6; // 이보다 적으면 휴장일로 봄
const PROBES = ["005930.KS", "000660.KS", "035420.KS"]; // 종가 반영 확인용 대표 종목

function kstNow(now = new Date()) {
  const k = new Date(now.getTime() + 9 * 3600 * 1000);
  const basDt = `${k.getUTCFullYear()}${String(k.getUTCMonth() + 1).padStart(2, "0")}${String(k.getUTCDate()).padStart(2, "0")}`;
  return { basDt, minutes: k.getUTCHours() * 60 + k.getUTCMinutes(), weekday: k.getUTCDay() };
}
// 그날 한국 시간 15:30을 유닉스 초로
function closeEpoch(basDt) {
  const y = Number(basDt.slice(0, 4));
  const m = Number(basDt.slice(4, 6)) - 1;
  const d = Number(basDt.slice(6, 8));
  return Date.UTC(y, m, d, 6, 30, 0) / 1000; // 15:30 KST = 06:30 UTC
}
const parse = (raw) => (typeof raw === "string" ? JSON.parse(raw) : raw);
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const lastNum = (arr) => {
  if (!Array.isArray(arr)) return null;
  for (let i = arr.length - 1; i >= 0; i--) if (num(arr[i]) !== null) return arr[i];
  return null;
};
function symbolOf(r) {
  if (!/^[0-9A-Z]{6}$/i.test(r.code || "")) return null;
  return `${r.code}.${String(r.market || "").includes("닥") ? "KQ" : "KS"}`;
}

// 종목 하나 — 오늘 15:30 이후 확정된 시세면 {o,h,l,c,v}, 아니면 null
async function fetchClose(symbol, basDt) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(`${YAHOO_URL}/${encodeURIComponent(symbol)}?range=1d&interval=1d`, {
      headers: { "User-Agent": BROWSER_UA, Accept: "application/json,text/plain,*/*" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    const meta = result?.meta;
    const t = num(meta?.regularMarketTime);
    if (!t || t < closeEpoch(basDt)) return null; // 아직 15:30 종가 전이거나 오늘 거래가 없음(거래정지·휴장)
    if (t > closeEpoch(basDt) + 12 * 3600) return null; // 다른 날 자료
    const q = result?.indicators?.quote?.[0] || {};
    const c = lastNum(q.close) ?? num(meta.regularMarketPrice);
    if (c === null) return null;
    return {
      o: lastNum(q.open) ?? c,
      h: lastNum(q.high) ?? num(meta.regularMarketDayHigh) ?? c,
      l: lastNum(q.low) ?? num(meta.regularMarketDayLow) ?? c,
      c,
      v: lastNum(q.volume) ?? num(meta.regularMarketVolume) ?? undefined,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function latestOfficialRecords(redis, basDt) {
  const total = await redis.zcard(DATES_KEY);
  if (!total) return null;
  const dates = (await redis.zrange(DATES_KEY, Math.max(0, total - 5), total - 1)).map(String).sort();
  const prev = dates.filter((d) => d < basDt).pop();
  if (!prev) return null;
  const rows = parse(await redis.get(DAY_PREFIX + prev));
  return Array.isArray(rows) ? rows : null;
}

// 잠정 시세 읽기(완성된 것만). 없으면 null
export async function readPrelim(redis, basDt) {
  const p = parse(await redis.get(PRELIM_PREFIX + basDt));
  return p && p.complete && Array.isArray(p.records) ? p : null;
}
export async function readPrelimLatest(redis) {
  const d = await redis.get(PRELIM_LATEST_KEY);
  return d ? String(d) : null;
}

// 한 번 실행: 할 일이 있으면 최대 PER_RUN 종목을 받아 진행 상황을 저장하고, 다 모이면 완성본을 씁니다.
export async function runMarketCloseStep(redis, { force = false, now = new Date() } = {}) {
  const started = Date.now();
  const { basDt, minutes, weekday } = kstNow(now);
  if (!force) {
    if (weekday === 0 || weekday === 6) return { skipped: "주말" };
    if (minutes < START_MIN) return { skipped: "아직 장 마감 전" };
    if (minutes > STOP_MIN) return { skipped: "오늘 작업 시간 지남" };
  }
  if (await redis.zscore(DATES_KEY, basDt)) return { skipped: "한국거래소 확정 자료가 이미 있음", basDt };
  const existing = parse(await redis.get(PRELIM_PREFIX + basDt));
  if (existing?.complete || existing?.holiday) return { skipped: existing.holiday ? "휴장일로 판단함" : "이미 완성", basDt };

  // 15:30 종가가 야후에 들어왔는지 대표 종목으로 먼저 확인(야후는 15~20분 늦음)
  const probes = await Promise.all(PROBES.map((s) => fetchClose(s, basDt)));
  const ready = probes.filter(Boolean).length;
  if (ready === 0) {
    if (!force && minutes >= GIVE_UP_MIN) {
      await redis.set(PRELIM_PREFIX + basDt, { basDt, at: new Date().toISOString(), complete: false, holiday: true }, { ex: 3 * 86400 });
      return { skipped: "오늘 종가가 없어 휴장일로 판단", basDt };
    }
    return { waiting: "야후에 아직 종가가 안 들어옴(15~20분 지연)", basDt };
  }

  const universe = await latestOfficialRecords(redis, basDt);
  if (!universe?.length) return { error: "기준이 될 전 거래일 자료가 없음", basDt };
  const work = parse(await redis.get(WORK_PREFIX + basDt)) || { done: {} };
  const done = work.done || {};
  const tried = new Set(work.tried || []);

  // 아직 안 받은 종목부터, 그다음 "받아 봤는데 아직 종가 전이었던" 종목을 다시
  const notDone = universe.filter((r) => !done[r.code] && symbolOf(r));
  const todo = [...notDone.filter((r) => !tried.has(r.code)), ...notDone.filter((r) => tried.has(r.code))].slice(0, PER_RUN);
  let fetched = 0;
  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    if (Date.now() - started > RUN_BUDGET_MS) break;
    const slice = todo.slice(i, i + CONCURRENCY);
    const got = await Promise.all(slice.map((r) => fetchClose(symbolOf(r), basDt)));
    got.forEach((q, k) => {
      const r = slice[k];
      tried.add(r.code);
      if (q) {
        done[r.code] = { code: r.code, name: r.name, market: r.market, ...q };
        fetched += 1;
      }
    });
  }

  const total = universe.length;
  const count = Object.keys(done).length;
  const ratio = count / total;
  const allTried = universe.every((r) => done[r.code] || tried.has(r.code) || !symbolOf(r));
  const finish = ratio >= DONE_RATIO || (allTried && (force || minutes >= GIVE_UP_MIN) && ratio >= MIN_RATIO);

  if (finish) {
    const records = Object.values(done);
    await redis.set(PRELIM_PREFIX + basDt, { basDt, at: new Date().toISOString(), complete: true, records }, { ex: 4 * 86400 });
    await redis.set(PRELIM_LATEST_KEY, basDt);
    await redis.del(WORK_PREFIX + basDt);
    return { completed: true, basDt, count, total };
  }
  // 한 바퀴 다 돌았는데 덜 모였으면(아직 종가 전이던 종목) 다음 차례에 못 받은 것만 다시
  await redis.set(WORK_PREFIX + basDt, { done, tried: [...tried] }, { ex: 86400 });
  return { progress: true, basDt, fetchedThisRun: fetched, count, total, ratio: Math.round(ratio * 100) / 100 };
}
