// GET /api/feed
//
// Serves whatever /api/poll has saved to Redis so far. The homepage calls
// this to render the real, automatically-collected news feed.
//
// Cached at the edge for 8s (just under our 10s client poll interval) so
// N concurrent visitors polling this share ONE Redis read instead of N —
// Redis command usage otherwise scales with (visitor count × poll
// frequency), which is the actual cost risk of polling more often.

import { getRedis } from "../../../lib/redis";

export async function GET() {
  const redis = getRedis();
  if (!redis) {
    return Response.json(
      { error: "Redis(Upstash) 환경변수가 아직 설정되지 않았습니다." },
      { status: 500 }
    );
  }

  const raw = await redis.lrange("feed", 0, 249); // ~5 "pages" worth
  const items = raw
    .map((r) => {
      try {
        return typeof r === "string" ? JSON.parse(r) : r; // SDK may already parse JSON values
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  return Response.json(
    { items },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=8, stale-while-revalidate=20" } }
  );
}
