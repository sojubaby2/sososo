// GET /api/backfill-history
//
// One-time (well, resumable — safe to hit repeatedly) job to populate the
// daily OHLC price-history store (lib/priceHistory.js) that the chart-
// pattern feature (lib/patternDetection.js, /api/patterns) reads from.
// Walks backward from whatever's already stored and fetches ~20 more
// trading days from KRX per call, so reaching the full
// HISTORY_LOOKBACK_DAYS (260) target takes roughly 13 calls to this
// endpoint from an empty store. Call it again later any time to keep
// extending history further back, or just let app/api/poll/route.js's
// daily appendTodaysSnapshotIfMissing() keep it current going forward
// once it's caught up.
//
// Not on a schedule — 재성 triggers this manually (e.g. by opening the
// URL with the secret) until { done: true } comes back.

import { getRedis } from "../../../lib/redis";
import { backfillHistory } from "../../../lib/priceHistory";

export const maxDuration = 60;

export async function GET(request) {
  // Reuses CRON_SECRET rather than adding yet another env var — this is an
  // admin-only manual trigger, not something anything else needs to call.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const { searchParams } = new URL(request.url);
    const provided =
      searchParams.get("secret") ||
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (provided !== cronSecret) {
      return Response.json({ error: "인증되지 않은 요청입니다." }, { status: 401 });
    }
  }

  const redis = getRedis();
  if (!redis) {
    return Response.json({ error: "Redis(Upstash) 환경변수가 아직 설정되지 않았습니다." }, { status: 500 });
  }

  const result = await backfillHistory(redis, {});
  return Response.json(result);
}
