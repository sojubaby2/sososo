// GET /api/daily-outlook/refresh
//
// cron-job.org가 매일 아침 7시 50분(평일)에 이 주소를 호출하도록 새로
// 등록해야 함 — /api/poll이 쓰는 것과 똑같은 CRON_SECRET을 재사용하므로
// (아래 인증 로직 참고) Cloudflare 쪽에 새 시크릿을 추가할 필요는 없음.
//
// 호출되면 Alpha Vantage에서 미국 상위 상승 종목·기술 뉴스를 가져와서
// Claude로 "오늘의 국장 예측" 한 문장을 만들고, 그 결과를 Redis에 저장함.
// 홈페이지는 이 결과를 app/api/daily-outlook/route.js를 통해서만 읽고,
// 절대 이 라우트를 직접 부르지 않음(호출 한도 보호 — lib/dailyOutlook.js
// 상단 설명 참고).
//
// maxDuration: Alpha Vantage 호출 2번 + Claude 호출 1번 정도라 여유있게
// 30초로 잡음(다른 라우트들의 60초보다는 훨씬 가벼운 작업).

import { getRedis } from "../../../../lib/redis";
import { refreshDailyOutlook } from "../../../../lib/dailyOutlook";

export const maxDuration = 30;

export async function GET(request) {
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
    return Response.json(
      { error: "Redis(Upstash) 환경변수가 아직 설정되지 않았습니다." },
      { status: 500 }
    );
  }

  try {
    const record = await refreshDailyOutlook(redis);
    return Response.json({ ok: true, record });
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}
