// app/api/premarket/refresh/route.js
//
// [2026-10-29 신설] 장전 브리핑 만들기 — 실제 일은 lib/premarket.js가 합니다.
// 누가 부르나: Cloudflare 예약 실행(custom-worker.js, wrangler.jsonc의 "40 22 * * 0-5" = 한국 시간 월~토 07:40)
// 보안: CRON_SECRET이 있어야 실행(아무나 AI 호출을 일으키지 못하게 — 비용 보호)
// 손으로 시험할 때: /api/premarket/refresh?secret=<CRON_SECRET>&force=1  (오늘 것이 있어도 다시 만듦)

import { getRedis } from "../../../../lib/redis";
import { refreshPremarket } from "../../../../lib/premarket";
import { recordRun, RUN_DAILY_OUTLOOK } from "../../../../lib/runStatus";
// [2026-10-29 추가] 아침 예약 실행 때 "어제" 투자자별 수급도 한 번 더 저장(전날 오후에 못 받았을 때 메꾸기 — lib/investorFlow.js)
import { snapshotFlow } from "../../../../lib/investorFlow";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request) {
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  if (cronSecret) {
    const provided = searchParams.get("secret") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (provided !== cronSecret) return Response.json({ error: "인증되지 않은 요청입니다." }, { status: 401 });
  }
  const redis = getRedis();
  if (!redis) return Response.json({ error: "Redis(Upstash) 환경변수가 아직 설정되지 않았습니다." }, { status: 500 });
  const flowFill = await snapshotFlow(redis).catch((e) => ({ error: String(e?.message || e) }));
  try {
    const result = await refreshPremarket(redis, { force: searchParams.get("force") === "1" });
    result.flowFill = flowFill;
    if (!result.skipped) await recordRun(redis, RUN_DAILY_OUTLOOK, { ok: !!result.ok, via: "장전 브리핑", ...result });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    await recordRun(redis, RUN_DAILY_OUTLOOK, { ok: false, via: "장전 브리핑", error: String(err?.message || err) });
    return Response.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
