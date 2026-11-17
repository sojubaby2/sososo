// app/api/earnings/route.js
//
// [2026-11-15 신설] 실적 캘린더 자료(lib/earnings.js). 비밀값 없음 — DART 열쇠는 서버 안에서만 씀.

import { getEarningsData } from "../../../lib/earnings";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const data = await getEarningsData();
  if (!data) {
    return Response.json({ items: [], error: "지금 DART에서 실적 공시를 받아오지 못했습니다." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  return Response.json(data, { headers: { "Cache-Control": "public, max-age=0, s-maxage=600" } });
}
