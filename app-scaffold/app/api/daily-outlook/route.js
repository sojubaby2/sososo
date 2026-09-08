// GET /api/daily-outlook
//
// 홈페이지 최상단 배너(components/DailyOutlookBanner.js)가 읽는 엔드포인트.
// Redis에 저장된 값을 그대로 돌려줄 뿐, Alpha Vantage/Claude를 직접
// 호출하지 않음(호출 한도·비용 보호) — 실제 계산은
// app/api/daily-outlook/refresh/route.js가 cron-job.org에 의해 매일 아침
// 한 번만 실행함. 자세한 설명은 lib/dailyOutlook.js 참고.

import { getRedis } from "../../../lib/redis";
import { getCachedDailyOutlook } from "../../../lib/dailyOutlook";

// Without this, Next.js may try to statically prerender this route at BUILD
// time — 다른 라우트들과 동일한 이유로 방지.
export const dynamic = "force-dynamic";

export async function GET() {
  const redis = getRedis();
  if (!redis) {
    return Response.json(
      { error: "Redis(Upstash) 환경변수가 아직 설정되지 않았습니다." },
      { status: 500 }
    );
  }

  let outlook = null;
  try {
    outlook = await getCachedDailyOutlook(redis);
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }

  return Response.json(
    { outlook },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600" } }
  );
}
