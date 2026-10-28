// lib/marketDay.js
//
// [2026-10-27 신설] "장 마감 정리" 계산 — /market/날짜 페이지가 씁니다.
//
// 재료: 이미 매일 저장되고 있는 전 종목 일별 시세(lib/priceHistory.js, Redis "hist:day:YYYYMMDD").
//       그날 것과 바로 전 거래일 것 두 개만 읽어서 비교합니다. 새로 저장하는 것은 없습니다.
//
// 비용: 계산 결과를 날짜별로 저장(unstable_cache)해서, 같은 날짜는 다시 계산하지 않습니다.
//   · 지난 날짜(값이 더 이상 안 바뀜): 7일에 한 번 다시 계산
//   · 가장 최근 날짜: 1시간에 한 번
//   → 날짜 하나당 Redis 읽기는 많아야 하루 몇 번입니다.
//   날짜 목록(hist:dates)도 1시간 저장본을 씁니다.
//
// 계산하는 것
//   · 코스피/코스닥 각각 오른 종목·내린 종목·보합 수
//   · 상승률 상위·하락률 상위 10 (거래가 없었던 종목, 1,000원 미만 동전주는 제외 — 숫자가 튀어서)
//   · 거래대금(종가×거래량) 상위 10
//   · 테마별 평균 등락률 상위·하위 5 (종목 3개 이상인 테마만) + 그 테마에서 많이 오른/내린 종목

import { unstable_cache } from "next/cache";
import { getRedis } from "./redis";
import { allThemes, themeMembers } from "./stockDirectory";
// [2026-10-28 추가] 장 마감 직후 잠정 시세(야후) — 한국거래소 확정 자료가 다음 날 아침에야 나와서
import { readPrelim, readPrelimLatest } from "./marketClose";

const DATES_KEY = "hist:dates";
const DAY_PREFIX = "hist:day:";
const MIN_PRICE = 1000;
const TOP_N = 10;
const THEME_N = 5;

const toIso = (basDt) => `${basDt.slice(0, 4)}-${basDt.slice(4, 6)}-${basDt.slice(6, 8)}`;
const toBas = (iso) => iso.replace(/-/g, "");

async function readDates() {
  const redis = getRedis();
  if (!redis) return [];
  const total = await redis.zcard(DATES_KEY);
  if (!total) return [];
  const raw = await redis.zrange(DATES_KEY, 0, total - 1);
  const dates = raw.map((d) => String(d)).filter((d) => /^\d{8}$/.test(d)).sort();
  // [2026-10-28] 확정 자료보다 새로운 "잠정(장 마감 직후)" 날짜가 완성돼 있으면 맨 끝에 붙임
  const pre = await readPrelimLatest(redis).catch(() => null);
  if (pre && /^\d{8}$/.test(pre) && pre > (dates[dates.length - 1] || "") && (await readPrelim(redis, pre).catch(() => null))) {
    dates.push(pre);
  }
  return dates;
}

// 저장된 거래일 목록(오래된 → 최신), "2026-10-27" 모양.
// [2026-10-28 변경] 1시간 → 5분 저장 — 장 마감 직후 잠정 정리가 늦지 않게 뜨도록
export const getMarketDates = unstable_cache(
  async () => (await readDates()).map(toIso),
  ["market-dates-v2"],
  { revalidate: 300 }
);

// 그날 전 종목 시세. 확정 자료(hist:day)가 없으면 잠정 자료(hist:prelim)를 씀 → { rows, provisional }
async function readDay(redis, basDt) {
  const raw = await redis.get(DAY_PREFIX + basDt);
  const rows = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (Array.isArray(rows)) return { rows, provisional: false };
  const pre = await readPrelim(redis, basDt).catch(() => null);
  return pre ? { rows: pre.records, provisional: true, at: pre.at } : null;
}

function round2(v) {
  return Math.round(v * 100) / 100;
}

async function computeDay(iso) {
  const redis = getRedis();
  if (!redis) return null;
  const dates = await getMarketDates();
  const idx = dates.indexOf(iso);
  if (idx <= 0) return null; // 그날 자료가 없거나, 비교할 전 거래일이 없음
  const prevIso = dates[idx - 1];
  const [todayDay, prevDay] = await Promise.all([readDay(redis, toBas(iso)), readDay(redis, toBas(prevIso))]);
  if (!todayDay || !prevDay) return null;
  const today = todayDay.rows;
  const prev = prevDay.rows;

  const prevClose = new Map(prev.map((r) => [r.code, r.c]));
  const rows = [];
  for (const r of today) {
    const pc = prevClose.get(r.code);
    if (!pc || !r.c) continue;
    // [2026-10-28] 하루 가격제한폭(±30%)을 넘는 등락은 실제 등락이 아님 — 액면병합·감자·거래재개처럼
    //   그날 기준가가 새로 정해진 종목이라 전날 종가와 비교하면 숫자가 튐(예: 에스에너지 +807%). 정리에서 뺌.
    if (Math.abs(((r.c - pc) / pc) * 100) > 30.5) continue;
    rows.push({
      code: r.code,
      name: r.name,
      market: r.market,
      close: r.c,
      chg: round2(((r.c - pc) / pc) * 100),
      vol: typeof r.v === "number" ? r.v : null,
      value: typeof r.v === "number" ? r.c * r.v : null,
    });
  }
  if (!rows.length) return null;

  const breadth = {};
  for (const mk of ["코스피", "코스닥"]) {
    const list = rows.filter((r) => r.market === mk);
    breadth[mk] = {
      up: list.filter((r) => r.chg > 0).length,
      down: list.filter((r) => r.chg < 0).length,
      flat: list.filter((r) => r.chg === 0).length,
      avg: list.length ? round2(list.reduce((s, r) => s + r.chg, 0) / list.length) : null,
    };
  }

  const traded = rows.filter((r) => r.close >= MIN_PRICE && (r.vol === null || r.vol > 0));
  const pick = (r) => ({ code: r.code, name: r.name, market: r.market, close: r.close, chg: r.chg, value: r.value });
  const gainers = [...traded].sort((a, b) => b.chg - a.chg).slice(0, TOP_N).map(pick);
  const losers = [...traded].sort((a, b) => a.chg - b.chg).slice(0, TOP_N).map(pick);
  const byValue = traded
    .filter((r) => typeof r.value === "number")
    .sort((a, b) => b.value - a.value)
    .slice(0, TOP_N)
    .map(pick);

  const byCode = new Map(rows.map((r) => [r.code, r]));
  const themes = [];
  for (const t of allThemes()) {
    const mem = themeMembers(t)
      .map((m) => byCode.get(m.code))
      .filter(Boolean);
    if (mem.length < 3) continue;
    const avg = mem.reduce((s, r) => s + r.chg, 0) / mem.length;
    const sorted = [...mem].sort((a, b) => b.chg - a.chg);
    themes.push({
      theme: t,
      avg: round2(avg),
      count: mem.length,
      best: sorted.slice(0, 3).map(pick),
      worst: sorted.slice(-3).reverse().map(pick),
    });
  }
  themes.sort((a, b) => b.avg - a.avg);

  return {
    date: iso,
    prevDate: prevIso,
    nextDate: dates[idx + 1] || null,
    breadth,
    gainers,
    losers,
    byValue,
    themesUp: themes.slice(0, THEME_N),
    themesDown: themes.slice(-THEME_N).reverse(),
    stockCount: rows.length,
    // [2026-10-28] 잠정(장 마감 직후 야후 시세) 여부 — 다음 날 아침 한국거래소 확정치로 바뀜
    provisional: todayDay.provisional,
    provisionalAt: todayDay.at || null,
  };
}

const cachedRecent = unstable_cache(computeDay, ["market-day-recent-v2"], { revalidate: 3600 });
// [2026-10-28] 가장 최근 날짜가 잠정 자료일 때 — 짧게 저장하고 이름표를 따로 둬서, 확정 자료가 오면 새로 계산됨
const cachedProvisional = unstable_cache(computeDay, ["market-day-provisional-v2"], { revalidate: 600 });
const cachedPast = unstable_cache(computeDay, ["market-day-past-v2"], { revalidate: 7 * 86400 });

// 날짜 "2026-10-27" → 정리 결과(없으면 null)
export async function getMarketDay(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const dates = await getMarketDates();
  if (!dates.includes(iso)) return null;
  const isLatest = dates[dates.length - 1] === iso;
  try {
    if (isLatest) {
      const redis = getRedis();
      const official = redis ? await redis.zscore(DATES_KEY, toBas(iso)) : 1;
      if (official === null || official === undefined) return await cachedProvisional(iso);
    }
    return await (isLatest ? cachedRecent(iso) : cachedPast(iso));
  } catch {
    return null;
  }
}

// 사람이 읽는 요약 문장
export function describeMarketDay(d) {
  if (!d) return [];
  const lines = [];
  const kp = d.breadth["코스피"];
  const kq = d.breadth["코스닥"];
  if (kp && kq) {
    lines.push(
      `코스피는 ${kp.up.toLocaleString("ko-KR")}개 종목이 오르고 ${kp.down.toLocaleString("ko-KR")}개가 내렸고, 코스닥은 ${kq.up.toLocaleString(
        "ko-KR"
      )}개가 오르고 ${kq.down.toLocaleString("ko-KR")}개가 내렸습니다.`
    );
  }
  if (d.themesUp.length) {
    const t = d.themesUp.slice(0, 3).map((x) => `${x.theme}(${x.avg > 0 ? "+" : ""}${x.avg.toFixed(1)}%)`);
    lines.push(`테마 평균으로 가장 강했던 곳은 ${t.join(", ")}입니다.`);
  }
  if (d.themesDown.length) {
    const t = d.themesDown.slice(0, 3).map((x) => `${x.theme}(${x.avg > 0 ? "+" : ""}${x.avg.toFixed(1)}%)`);
    lines.push(`반대로 약했던 테마는 ${t.join(", ")}입니다.`);
  }
  if (d.byValue.length) {
    lines.push(`거래대금이 가장 많이 몰린 종목은 ${d.byValue.slice(0, 3).map((x) => x.name).join(", ")} 순이었습니다.`);
  }
  return lines;
}

export function koreanDate(iso) {
  const wd = ["일", "월", "화", "수", "목", "금", "토"][new Date(`${iso}T00:00:00Z`).getUTCDay()];
  return `${Number(iso.slice(0, 4))}년 ${Number(iso.slice(5, 7))}월 ${Number(iso.slice(8, 10))}일(${wd})`;
}
