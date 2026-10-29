// lib/stockIndex.js
//
// [2026-10-29 신설] 종목 검색용 "전 종목 목록" — 재성님: "홈에서 종목 검색도 할수있는걸 하나 만들어줘.
//   검색하면 관련종목 뉴스라던가 여러가지들을 확인할수 있도록"
//
// 무엇: 코스피·코스닥 전 종목(약 2,800개)의 [코드, 이름, 시장, 최근 종가, 등락률, 소속 테마]
// 어디서: 이미 매일 저장되는 전 종목 일별 시세(Redis "hist:day:", 장 마감 직후엔 잠정 "hist:prelim:")
//         + 테마 자료(lib/themeData.json). 새로 받아 오는 바깥 자료 없음 → 비용 0.
// 얼마나 자주: 계산 결과를 1시간 저장(unstable_cache) + 주소(/api/stock-index) 응답도 1시간 저장.
//   방문자가 검색창을 처음 열 때 한 번만 내려받고(약 100KB), 그다음 검색은 방문자 화면 안에서 바로 찾습니다.

import { unstable_cache } from "next/cache";
import { getRedis } from "./redis";
import { getMarketDates } from "./marketDay";
import { readPrelim } from "./marketClose";
import { STOCKS } from "./stockDirectory";

const DAY_PREFIX = "hist:day:";
const parse = (raw) => (typeof raw === "string" ? JSON.parse(raw) : raw);
const toBas = (iso) => iso.replace(/-/g, "");

async function readRows(redis, iso) {
  const rows = parse(await redis.get(DAY_PREFIX + toBas(iso)));
  if (Array.isArray(rows)) return rows;
  const pre = await readPrelim(redis, toBas(iso)).catch(() => null);
  return pre?.records || null;
}

async function build() {
  const redis = getRedis();
  const out = new Map(); // code -> row
  let asOf = null;
  if (redis) {
    const dates = await getMarketDates().catch(() => []);
    const last = dates[dates.length - 1];
    const prev = dates[dates.length - 2];
    if (last) {
      const [today, before] = await Promise.all([readRows(redis, last), prev ? readRows(redis, prev) : null]);
      const prevClose = new Map((before || []).map((r) => [r.code, r.c]));
      for (const r of today || []) {
        if (!r?.code || !r?.name) continue;
        const pc = prevClose.get(r.code);
        const chg = pc && r.c ? Math.round(((r.c - pc) / pc) * 10000) / 100 : null;
        // ±30% 넘는 값은 기준가가 바뀐 종목(액면병합 등)이라 등락률을 비움
        out.set(r.code, [r.code, r.name, String(r.market || "").includes("닥") ? "Q" : "P", r.c ?? null, chg !== null && Math.abs(chg) <= 30.5 ? chg : null, ""]);
      }
      asOf = last;
    }
  }
  // 테마 붙이기(+ 시세 목록에 없는 테마 종목도 검색되게)
  for (const s of STOCKS.values()) {
    const themes = (s.themes || []).slice(0, 4).join("|");
    const row = out.get(s.code);
    if (row) row[5] = themes;
    else out.set(s.code, [s.code, s.name, String(s.market || "").includes("닥") ? "Q" : "P", null, null, themes]);
  }
  return { asOf, rows: [...out.values()] };
}

export const getStockIndex = unstable_cache(build, ["stock-index-v1"], { revalidate: 3600 });
