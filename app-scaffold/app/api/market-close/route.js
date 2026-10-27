// app/api/market-close/route.js
//
// [2026-10-28 신설] 장 마감 직후 "잠정 장 마감 정리" 자료 모으기 — 실제 일은 lib/marketClose.js가 합니다.
// 재성님: "10/27 15:30 정규장 끝나면 올라오게끔 바꿔줘"
//
// 누가 부르나: Cloudflare 예약 실행(custom-worker.js의 scheduled, wrangler.jsonc의 triggers)이
//   평일 15시~17시 사이 3분마다 부릅니다. 사람이 직접 열 일은 없습니다.
// 보안: 다른 자동작업(/api/poll)과 같은 CRON_SECRET이 있어야 실행됩니다(아무나 야후 요청을 일으키지 못하게).
// 손으로 시험할 때: /api/market-close?secret=<CRON_SECRET>&force=1  (시간 조건을 무시하고 한 번 실행)

import { getRedis } from "../../../lib/redis";
import { runMarketCloseStep } from "../../../lib/marketClose";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request) {
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  if (cronSecret) {
    const provided = searchParams.get("secret") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (provided !== cronSecret) {
      return Response.json({ error: "인증되지 않은 요청입니다." }, { status: 401 });
    }
  }
  const redis = getRedis();
  if (!redis) {
    return Response.json({ error: "Redis(Upstash) 환경변수가 아직 설정되지 않았습니다." }, { status: 500 });
  }
  try {
    const result = await runMarketCloseStep(redis, { force: searchParams.get("force") === "1" });
    if (result?.completed) console.log("market-close: 잠정 장 마감 정리 완성", JSON.stringify(result));
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("market-close: 실패", err);
    return Response.json({ error: String(err?.message || err) }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
