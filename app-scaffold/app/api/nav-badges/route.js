// app/api/nav-badges/route.js
//
// [2026-11-02 신설] 맨 위 메뉴 옆 작은 표시(오늘·청약 2·돌파 12 등) — 계산은 lib/navBadges.js.
// 5분 동안 공용으로 저장해 두고 다시 씀(방문자가 몇 명이든 계산은 5분에 한 번).
import { getNavBadges } from "../../../lib/navBadges";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getNavBadges();
    return Response.json(data, { headers: { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600" } });
  } catch {
    return Response.json({ badges: {} }, { headers: { "Cache-Control": "public, max-age=0, s-maxage=60" } });
  }
}
