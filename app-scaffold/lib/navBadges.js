// lib/navBadges.js
//
// [2026-11-02 신설] 맨 위 메뉴 옆 "오늘의 살아 있는 표시"
// 재성님: "브리핑에만 NEW가 붙어 있으니 다른 건 죽은 페이지 같은 느낌" → 1안(메뉴마다 그날 바뀐 내용 표시) 채택
//
//   장전 브리핑  : 오늘 브리핑이 있으면 "오늘"(색), 평일 아침 9시 전이면 "07:40"(회색)
//   장 마감 정리 : 오늘 정리가 나왔으면 "오늘"(색)
//   테마별 종목  : 오늘 속보가 가장 많이 몰린 테마 이름(회색)
//   패턴검색     : 전고점 돌파 종목 수 "돌파 12"(회색, 20개 넘으면 "20+")
//   공시 일정    : 오늘 올라온 주요 공시 건수(회색)
//   공모주       : 지금 청약 중 "청약 2"(색) / 7일 안에 청약 시작 "예정 1"(회색)
//   칼럼         : 최근 3일 안에 새 글이면 "새 글"(색)
//
// 비용: AI 안 씀. 이미 사이트에 저장된 자료만 읽고, 결과는 5분 동안 저장해 다시 씀.
// 하나가 실패해도 나머지는 그대로 나갑니다(그 메뉴만 표시 없음).

import { unstable_cache } from "next/cache";
import { getRedis } from "./redis";
import { getPremarketDates } from "./premarket";
import { getMarketDates } from "./marketDay";
import { RESULTS_CACHE_KEY } from "./patternsScan";
import { getDisclosureData } from "./disclosures";
import { fetchIpoSchedule, statusOf } from "./ipo";
import { blogPosts } from "./allBlogPosts";
import { extractThemes } from "./todayBrief";

const KST = 9 * 3600 * 1000;
const kstIso = (ms) => new Date(ms + KST).toISOString().slice(0, 10);
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

// 공모주 일정은 DART를 여러 번 부르므로 따로 3시간 저장
const ipoCounts = unstable_cache(
  async (today) => {
    const data = await fetchIpoSchedule();
    let live = 0;
    let soon = 0;
    for (const it of data.items || []) {
      const st = statusOf(it, today);
      if (st === "진행") live++;
      else if (st === "예정" && it.subStart && it.subStart <= addDays(today, 7)) soon++;
    }
    return { live, soon };
  },
  ["nav-ipo-counts-v1"],
  { revalidate: 3 * 3600 }
);

async function compute() {
  const now = Date.now();
  const today = kstIso(now);
  const k = new Date(now + KST);
  const wd = k.getUTCDay();
  const hm = k.getUTCHours() * 100 + k.getUTCMinutes();
  const redis = getRedis();
  const out = {};
  const safe = (p) => p.catch(() => null);

  const [pmDates, mkDates, patterns, disc, ipo, feedRaw] = await Promise.all([
    redis ? safe(getPremarketDates(redis, 3)) : null,
    safe(getMarketDates()),
    redis ? safe(redis.get(RESULTS_CACHE_KEY)) : null,
    safe(getDisclosureData()),
    safe(ipoCounts(today)),
    redis ? safe(redis.lrange("feed", 0, 149)) : null,
  ]);

  // 장전 브리핑
  if (pmDates?.[0] === today) out["/briefing"] = { text: "오늘", hot: true };
  else if (wd >= 1 && wd <= 5 && hm < 900) out["/briefing"] = { text: "07:40", hot: false };

  // 장 마감 정리
  const lastMk = Array.isArray(mkDates) ? [...mkDates].sort().pop() : null;
  if (lastMk === today) out["/market"] = { text: "오늘", hot: true };

  // 테마별 종목 — 오늘 속보가 가장 많이 몰린 테마
  if (Array.isArray(feedRaw)) {
    const counts = new Map();
    for (const r of feedRaw) {
      let it = r;
      try {
        if (typeof r === "string") it = JSON.parse(r);
      } catch {
        continue;
      }
      const t = Date.parse(it?.pubDate || it?.savedAt || "");
      if (!Number.isFinite(t) || kstIso(t) !== today) continue;
      for (const th of extractThemes(it) || []) counts.set(th, (counts.get(th) || 0) + 1);
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] >= 2) {
      const name = top[0].replace(/\(.*?\)/g, "").trim();
      out["/themes"] = { text: name.length > 6 ? `${name.slice(0, 6)}…` : name, hot: false, title: `오늘 속보가 가장 많이 몰린 테마: ${top[0]} (${top[1]}건)` };
    }
  }

  // 패턴검색 — 전고점 돌파
  try {
    const data = typeof patterns === "string" ? JSON.parse(patterns) : patterns;
    const n = data?.patterns?.breakout_prior_high?.length || 0;
    if (n > 0) out["/patterns"] = { text: `돌파 ${n >= 20 ? "20+" : n}`, hot: false, title: "전고점 돌파 패턴에 걸린 종목 수" };
  } catch {
    // 표시 없음
  }

  // 공시 일정 — 오늘 주요 공시 건수
  if (disc?.recent) {
    const n = disc.recent.filter((r) => r.date === today).length;
    if (n > 0) out["/disclosure"] = { text: String(n > 99 ? "99+" : n), hot: false, title: `오늘 올라온 주요 공시 ${n}건` };
  }

  // 공모주
  if (ipo?.live > 0) out["/ipo"] = { text: `청약 ${ipo.live}`, hot: true, title: `지금 청약 중인 공모주 ${ipo.live}개` };
  else if (ipo?.soon > 0) out["/ipo"] = { text: `예정 ${ipo.soon}`, hot: false, title: `7일 안에 청약이 시작되는 공모주 ${ipo.soon}개` };

  // 칼럼 — 최근 3일 안 새 글
  const newest = blogPosts.map((p) => p.date).filter(Boolean).sort().pop();
  if (newest && newest >= addDays(today, -3)) out["/blog"] = { text: "새 글", hot: true };

  return { badges: out, at: new Date(now).toISOString() };
}

export const getNavBadges = unstable_cache(compute, ["nav-badges-v1"], { revalidate: 300 });
