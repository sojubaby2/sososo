// GET /api/feed
// GET /api/feed?limit=30
//
// Serves whatever /api/poll has saved to Redis so far. The homepage calls
// this to render the real, automatically-collected news feed.
//
// Cached at the edge for 8s (just under our 10s client poll interval) so
// N concurrent visitors polling this share ONE Redis read instead of N —
// Redis command usage otherwise scales with (visitor count × poll
// frequency), which is the actual cost risk of polling more often.
//
// [2026-09-09 추가] ?limit= 파라미터 추가 — 재성님이 Upstash 사용량(특히
// 대역폭)이 예상보다 훨씬 빠르게 느는 걸 확인해서 원인을 찾아보니, 홈페이지가
// 10초마다 이 라우트를 호출할 때마다 매번 250개 전체를 통째로 다시 받아가고
// 있었음 — 실제로 새로 온 글은 보통 0~2개뿐인데 매번 250개를 다 주고받는
// 건 낭비. 이제 폴링(재조회) 때는 app/page.js가 ?limit=30 정도로 작게
// 요청하고, 최초 로딩 때만 기본값(250개)을 씀. 위의 8초 엣지 캐시가 실제로
// 잘 동작하고 있었다 해도 이건 추가로 안전한 절감이고, 혹시 캐시가 기대만큼
// 안 먹고 있었다면(강한 확신은 없음 — 정확한 원인은 계속 지켜봐야 함) 이
// 변경 하나로 폴링당 전송량이 대략 8분의 1로 줄어듦.

import { getRedis } from "../../../lib/redis";

// Without this, Next.js may try to statically prerender this route at
// BUILD time (it takes no `request` param), which would mean calling Redis
// during the Cloudflare build — fragile and pointless for a route that's
// supposed to reflect live, constantly-changing feed data anyway.
export const dynamic = "force-dynamic";

export async function GET(request) {
  const redis = getRedis();
  if (!redis) {
    return Response.json(
      { error: "Redis(Upstash) 환경변수가 아직 설정되지 않았습니다." },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const limitParam = Number(searchParams.get("limit"));
  const limit =
    Number.isFinite(limitParam) && limitParam > 0 ? Math.min(Math.floor(limitParam), 250) : 250;

  const raw = await redis.lrange("feed", 0, limit - 1);
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
