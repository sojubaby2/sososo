// lib/athBreakout.js
//
// [2026-11-03 신설] "오늘 역사적 신고가 돌파" — 재성님: "pc화면 우측에 오늘 신고가 돌파 종목 추가해줘 관심종목 아래쪽에.
//   장중에 돌파하면 넣고 다시 빠지면 빼버려" → "신고가 돌파는 역사적 신고가 돌파로 해주라"
//
// 역사적 신고가 = 상장 이후(야후에 자료가 있는 2000년 무렵부터) 가장 높았던 가격(장중 고가 기준).
//
// 어떻게 계산하나 (3단계)
//   ① 바탕표(ath:base:v1) — 종목마다 야후 "월봉 전체"를 한 번 받아서, 최근 6달을 뺀 옛날 최고가(o)와
//      전체 최고가(a)를 저장. 한 번에 200종목씩, 매시 15분 예약 실행으로 채움(전 종목 약 2,600개 → 반나절).
//      달이 바뀌면 같은 방식으로 조금씩 새로 받음.
//   ② 후보(ath:cand:v1) — 장이 끝난 뒤 하루 한 번, 최고가의 85% 이상까지 올라와 있는 종목만 골라
//      최근 6달 일봉을 받아 "오늘 이전까지의 정확한 역사적 최고가"를 계산해 둠(보통 수십~150종목).
//   ③ 장중 확인 — 화면이 물어보면 후보들의 지금 시세(야후, 15~20분 지연)를 받아 최고가를 넘은 종목만 돌려줌.
//      3분마다 한 번만 실제로 계산(방문자가 몇 명이든). 다시 최고가 아래로 내려오면 목록에서 빠짐.
//      장이 끝나면 마지막 결과를 그대로 보여 주고, 다음 날 장 시작 전엔 비움.
//
// 비용: 야후는 무료. Redis는 매시 몇 번 읽고 쓰기 + 장중 3분마다 결과 1건 저장. 시세 요청은 저장소(R2)에 남기지 않음(no-store).

import { getRedis } from "./redis";
import { getLatestDayRecords } from "./priceHistory";
import { toYahooSymbol } from "./quotes";

const YAHOO = "https://query1.finance.yahoo.com/v8/finance/chart";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";
const BASE_KEY = "ath:base:v1";
const CAND_KEY = "ath:cand:v1";
const STATE_KEY = "ath:state:v1";
const BASE_PER_RUN = 200;
const CAND_MAX = 150;
const CAND_RATIO = 0.85; // 최고가의 85% 이상이면 후보
const RECENT_MONTHS = 6; // 바탕표 "옛날 최고가"에서 빼는 최근 달 수(이 기간은 일봉으로 정확히 계산)
const BATCH = 8;
const KST = 9 * 3600 * 1000;

const kstNow = (ms = Date.now()) => new Date(ms + KST);
const kstDate = (ms) => new Date(ms + KST).toISOString().slice(0, 10);
const kstYm = (ms) => new Date(ms + KST).toISOString().slice(0, 7);
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
function ymMinus(ym, n) {
  let [y, m] = ym.split("-").map(Number);
  m -= n;
  while (m <= 0) {
    m += 12;
    y -= 1;
  }
  return `${y}-${String(m).padStart(2, "0")}`;
}
// 평일 09:00~15:40(한국 시간) = 장중
export function isMarketHours(ms = Date.now()) {
  const k = kstNow(ms);
  const wd = k.getUTCDay();
  if (wd === 0 || wd === 6) return false;
  const hm = k.getUTCHours() * 100 + k.getUTCMinutes();
  return hm >= 900 && hm < 1540;
}
function afterCloseToday(ms = Date.now()) {
  const k = kstNow(ms);
  return k.getUTCHours() * 100 + k.getUTCMinutes() >= 1540;
}

async function yahoo(symbol, query) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetch(`${YAHOO}/${encodeURIComponent(symbol)}?${query}`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: ctl.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    const j = await res.json();
    return j?.chart?.result?.[0] || null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
async function inBatches(list, fn) {
  const out = [];
  for (let i = 0; i < list.length; i += BATCH) {
    const part = await Promise.all(list.slice(i, i + BATCH).map(fn));
    out.push(...part);
  }
  return out;
}
const parse = (raw) => (typeof raw === "string" ? JSON.parse(raw) : raw);

// ① 바탕표 한 종목: 월봉 전체
async function fetchBase(stock, curYm) {
  const sym = toYahooSymbol(stock.code, stock.market);
  if (!sym) return null;
  const r = await yahoo(sym, "range=max&interval=1mo");
  const ts = r?.timestamp || [];
  const highs = r?.indicators?.quote?.[0]?.high || [];
  if (!ts.length) return null;
  const cutoff = ymMinus(curYm, RECENT_MONTHS - 1); // 이 달부터는 "최근"(일봉으로 계산)
  let o = 0, oy = null, a = 0, ay = null;
  ts.forEach((t, i) => {
    const h = num(highs[i]);
    if (!h || h <= 0) return;
    const ym = kstYm(t * 1000);
    if (h > a) { a = h; ay = ym; }
    if (ym < cutoff && h > o) { o = h; oy = ym; }
  });
  if (!a) return null;
  return { o: Math.round(o), oy, a: Math.round(a), ay, f: curYm, since: kstYm(ts[0] * 1000) };
}

// ② 후보 한 종목: 최근 6달 일봉으로 "오늘 이전까지" 최고가 확정
async function fetchExact(stock, base, includeToday) {
  const sym = toYahooSymbol(stock.code, stock.market);
  const r = await yahoo(sym, "range=6mo&interval=1d");
  const ts = r?.timestamp || [];
  const q = r?.indicators?.quote?.[0] || {};
  if (!ts.length) return null;
  const today = kstDate(Date.now());
  let rh = 0, rd = null, lastClose = null;
  ts.forEach((t, i) => {
    const d = kstDate(t * 1000);
    if (d === today && !includeToday) return;
    const h = num(q.high?.[i]);
    const c = num(q.close?.[i]);
    if (c) lastClose = c;
    if (h && h > rh) { rh = h; rd = d; }
  });
  const useRecent = rh >= (base.o || 0);
  const ath = Math.round(useRecent ? rh : base.o);
  if (!ath || !lastClose) return null;
  return {
    code: stock.code,
    name: stock.name,
    market: stock.market,
    ath,
    athDate: useRecent ? rd : base.oy,
    close: Math.round(lastClose),
    gapPct: +(((ath - lastClose) / ath) * 100).toFixed(2),
  };
}

// 예약 실행(매시 15분)에서 부름 — 바탕표 채우기 + 필요하면 후보 다시 만들기
export async function refreshAth({ force = false } = {}) {
  const redis = getRedis();
  if (!redis) return { error: "Redis 없음" };
  const nowMs = Date.now();
  const curYm = kstYm(nowMs);
  const { basDt, records } = await getLatestDayRecords(redis);
  if (!records.length) return { error: "종목 목록(시세 히스토리)이 아직 없음" };
  const stocks = records.filter((r) => r.code && r.name && r.c > 0 && /^[0-9A-Z]{6}$/.test(r.code));
  const baseAll = (await redis.hgetall(BASE_KEY)) || {};

  // ① 바탕표: 없는 종목 먼저, 그다음 지난달에 받은 종목
  const missing = stocks.filter((s) => !baseAll[s.code]);
  const stale = stocks.filter((s) => baseAll[s.code] && parse(baseAll[s.code])?.f !== curYm);
  const todo = [...missing, ...stale].slice(0, BASE_PER_RUN);
  const fetched = await inBatches(todo, (s) => fetchBase(s, curYm));
  const upd = {};
  todo.forEach((s, i) => {
    if (fetched[i]) {
      upd[s.code] = JSON.stringify(fetched[i]);
      baseAll[s.code] = fetched[i];
    }
  });
  if (Object.keys(upd).length) await redis.hset(BASE_KEY, upd);
  const baseCount = Object.keys(baseAll).length;

  // ② 후보: 장 마감 뒤 하루 한 번(또는 바탕표가 많이 늘었을 때) 다시 만듦
  const cand = parse(await redis.get(CAND_KEY).catch(() => null));
  const lastClose = new Date(Date.parse(`${kstDate(nowMs - (afterCloseToday(nowMs) ? 0 : 86400000))}T15:40:00+09:00`)).getTime();
  const needBuild =
    force ||
    !cand ||
    Date.parse(cand.builtAt || 0) < lastClose ||
    (cand.baseCount || 0) < baseCount * 0.9;
  let built = null;
  if (needBuild && !isMarketHours(nowMs)) {
    const includeToday = afterCloseToday(nowMs);
    const pre = [];
    for (const s of stocks) {
      const b = parse(baseAll[s.code]);
      if (!b?.a) continue;
      const approx = Math.max(b.a, s.h || 0);
      if (s.c >= approx * CAND_RATIO) pre.push({ s, b, ratio: s.c / approx });
    }
    pre.sort((x, y) => y.ratio - x.ratio);
    const picked = pre.slice(0, CAND_MAX);
    const exact = await inBatches(picked, ({ s, b }) => fetchExact(s, b, includeToday));
    const list = exact.filter((x) => x && x.close >= x.ath * CAND_RATIO).sort((a, b) => a.gapPct - b.gapPct);
    built = { builtAt: new Date(nowMs).toISOString(), basis: basDt, baseCount, list };
    await redis.set(CAND_KEY, built);
  }
  return {
    basDt,
    universe: stocks.length,
    baseCount,
    baseUpdated: Object.keys(upd).length,
    candidates: built ? built.list.length : cand?.list?.length ?? 0,
    rebuilt: Boolean(built),
  };
}

// ③ 장중 확인 — 후보 중 지금 가격이 역사적 최고가를 넘은 종목
async function quoteNow(stock) {
  const sym = toYahooSymbol(stock.code, stock.market);
  const r = await yahoo(sym, "range=1d&interval=1d");
  const m = r?.meta;
  const price = num(m?.regularMarketPrice);
  const t = num(m?.regularMarketTime);
  if (!price || !t) return null;
  if (kstDate(t * 1000) !== kstDate(Date.now())) return null; // 오늘 시세가 아직 안 들어옴
  const prev = num(m?.chartPreviousClose) || num(m?.previousClose);
  return { price, changePct: prev ? ((price - prev) / prev) * 100 : null, asOf: new Date(t * 1000).toISOString() };
}

export async function computeBreakouts() {
  const redis = getRedis();
  if (!redis) return { items: [], status: "error" };
  const nowMs = Date.now();
  const today = kstDate(nowMs);
  if (!isMarketHours(nowMs)) {
    const st = parse(await redis.get(STATE_KEY).catch(() => null));
    if (st?.date === today) return { ...st, status: "closed" }; // 오늘 장 마감 기준 마지막 결과
    return { items: [], status: "before", date: today };
  }
  const cand = parse(await redis.get(CAND_KEY).catch(() => null));
  const list = cand?.list || [];
  if (!list.length) return { items: [], status: "preparing", date: today };
  const quotes = await inBatches(list, (c) => quoteNow(c));
  const items = [];
  list.forEach((c, i) => {
    const q = quotes[i];
    if (q && q.price > c.ath) {
      items.push({
        code: c.code,
        name: c.name,
        market: c.market,
        price: Math.round(q.price),
        changePct: q.changePct === null ? null : +q.changePct.toFixed(2),
        ath: c.ath,
        athDate: c.athDate,
        abovePct: +(((q.price - c.ath) / c.ath) * 100).toFixed(2),
        asOf: q.asOf,
      });
    }
  });
  items.sort((a, b) => b.abovePct - a.abovePct);
  const state = { date: today, at: new Date(nowMs).toISOString(), items, watched: list.length };
  await redis.set(STATE_KEY, state, { ex: 3 * 86400 }).catch(() => {});
  return { ...state, status: "live" };
}
