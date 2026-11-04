// app/api/ath-breakouts/route.js
//
// [2026-11-03 신설] 오늘 역사적 신고가를 돌파한 종목(홈 화면 오른쪽 칸·휴대폰 시장 탭이 씀).
//   계산은 lib/athBreakout.js. 실제 계산은 3분에 한 번만(방문자가 몇 명이든) — 아래 저장본이 나눠 씀.

import { unstable_cache } from "next/cache";
import { computeBreakouts } from "../../../lib/athBreakout";

export const dynamic = "force-dynamic";

const cached = unstable_cache(
  async () => {
    const r = await computeBreakouts();
    if (r.status === "error") throw new Error("계산 실패"); // 실패는 저장하지 않음
    return r;
  },
  ["ath-breakouts-v1"],
  { revalidate: 180 }
);

export async function GET() {
  try {
    const data = await cached();
    return Response.json(data, { headers: { "Cache-Control": "public, max-age=0, s-maxage=60" } });
  } catch {
    return Response.json({ items: [], status: "error" }, { headers: { "Cache-Control": "no-store" } });
  }
}
