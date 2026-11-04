// app/api/ath/refresh/route.js
//
// [2026-11-03 신설] 역사적 신고가 바탕표·후보 갱신(lib/athBreakout.js의 refreshAth).
//   Cloudflare 예약 실행(custom-worker.js, 매시 15분)이 부릅니다. CRON_SECRET이 있어야 실행됩니다.
//   손으로 시험할 때: /api/ath/refresh?secret=<CRON_SECRET>  (&force=1 이면 후보를 지금 다시 만듦 — 장중에는 안 만듦)

import { refreshAth } from "../../../../lib/athBreakout";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && searchParams.get("secret") !== cronSecret) {
    return Response.json({ error: "인증되지 않은 요청입니다." }, { status: 401 });
  }
  try {
    const result = await refreshAth({ force: searchParams.get("force") === "1" });
    return Response.json({ at: new Date().toISOString(), ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return Response.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
