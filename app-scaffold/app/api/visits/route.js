// app/api/visits/route.js
//
// [2026-11-04 신설] 머리띠 오른쪽 위 👁 누적 방문 숫자 — 재성님: "눈 모양 해놓고 숫자 띄우기, 단위는 5.28k 처럼"
//
// 숫자는 전부 실제로 센 값입니다.
//   · 시작값 5,280 = Cloudflare 대시보드 "Unique Visitors"(10/5 ~ 11/4, 30일) 실제 기록
//     (재성님이 2026-11-04 캡처해서 보내 준 숫자)
//   · 그 뒤로는 한 사람이 하루에 한 번 들어올 때마다 1씩 더함(같은 날 여러 번 들어와도 1번)
//     → 하루 한 번만 세는 건 브라우저가 기억합니다(components/VisitBadge.js, localStorage "nm-visit-day").
//
// 비용: 새 방문 1번 = Redis 명령 1번(INCR). 숫자 읽기는 이 서버가 1분 동안 기억해 둬서 방문자가 몇 명이든
//   1분에 최대 1번만 Redis에 물어봅니다.
// ★ 시작값을 바꾸려면 BASE_VISITS 숫자만 고치면 됩니다.

import { getRedis } from "../../../lib/redis";

export const dynamic = "force-dynamic";

const BASE_VISITS = 5280;
const KEY = "visits:total";

let memo = { at: 0, total: null };

async function readTotal(redis) {
  if (memo.total !== null && Date.now() - memo.at < 60_000) return memo.total;
  const n = Number(await redis.get(KEY)) || 0;
  memo = { at: Date.now(), total: n };
  return n;
}

export async function GET() {
  const redis = getRedis();
  if (!redis) return Response.json({ total: null });
  try {
    const n = await readTotal(redis);
    return Response.json({ total: BASE_VISITS + n }, { headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } });
  } catch {
    return Response.json({ total: null });
  }
}

// 오늘 처음 들어온 브라우저만 보냄 → 1 더하고 새 합계를 돌려줌
export async function POST() {
  const redis = getRedis();
  if (!redis) return Response.json({ total: null });
  try {
    const n = Number(await redis.incr(KEY)) || 0;
    memo = { at: Date.now(), total: n };
    return Response.json({ total: BASE_VISITS + n }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ total: null });
  }
}
