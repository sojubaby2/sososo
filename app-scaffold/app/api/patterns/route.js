// GET /api/patterns
//
// Reads the stored price history (lib/priceHistory.js) and scans every
// stock against the 13 chart patterns in lib/patternDetection.js, keyed
// by pattern id -> ranked list of {code, name, similarity, ...}. Cached
// in Redis for 30 minutes (history only actually changes once a day, so
// rescanning ~2,800 stocks on every single page load is wasted work) —
// pass ?refresh=1 to force a fresh scan.
//
// Returns { error } (still 200, so the frontend can show a friendly
// "run the backfill first" message) if no history has been backfilled yet.

import { getRedis } from "../../../lib/redis";
import { buildPriceSeriesForAllStocks } from "../../../lib/priceHistory";
import { scanAllStocksForPatterns, PATTERN_DEFS } from "../../../lib/patternDetection";

export const maxDuration = 60;

const RESULTS_CACHE_KEY = "patterns:results:v1";
const RESULTS_CACHE_TTL_SECONDS = 60 * 30;

export async function GET(request) {
  const redis = getRedis();
  if (!redis) {
    return Response.json({ error: "Redis(Upstash) 환경변수가 아직 설정되지 않았습니다." }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const force = searchParams.get("refresh") === "1";

  if (!force) {
    try {
      const cached = await redis.get(RESULTS_CACHE_KEY);
      if (cached) {
        const data = typeof cached === "string" ? JSON.parse(cached) : cached;
        if (data?.patterns) return Response.json(data);
      }
    } catch {
      // corrupt/unreadable cache entry — fall through to a fresh scan
    }
  }

  const priceSeriesMap = await buildPriceSeriesForAllStocks(redis);
  if (priceSeriesMap.size === 0) {
    return Response.json({
      error: "저장된 시세 히스토리가 아직 없습니다. /api/backfill-history를 먼저 실행해주세요.",
      patternDefs: PATTERN_DEFS,
      patterns: {},
    });
  }

  const patterns = scanAllStocksForPatterns(priceSeriesMap, {});
  const payload = { generatedAt: new Date().toISOString(), patternDefs: PATTERN_DEFS, patterns };

  try {
    await redis.set(RESULTS_CACHE_KEY, payload, { ex: RESULTS_CACHE_TTL_SECONDS });
  } catch {
    // caching is best-effort — a failed write just means the next request re-scans
  }

  return Response.json(payload);
}
