// GET /api/daily-outlook/refresh
//
// cron-job.org가 매일 아침 7시 50분(평일)에 부르는 주소 — /api/poll과 같은 CRON_SECRET으로 보호.
//
// [2026-10-29 변경] 예전에는 미국 시세 업체(Alpha Vantage)의 상위 상승 종목 + 뉴스를 받아 AI로 "오늘의 전망"을
//   만들었는데, 그 업체가 해당 자료를 유료로 바꿔서(premium endpoint) 매일 실패하고 있었습니다.
//   → 이제 "장전 브리핑"(lib/premarket.js)을 만드는 일로 바꿨습니다. 장전 브리핑을 만들면 홈 맨 위
//   "오늘의 전망" 배너도 그 브리핑의 "주목 테마"로 같이 채워집니다.
//   Cloudflare 예약 실행(07:40)이 먼저 만들어 두면 여기(07:50)서는 "이미 있음"으로 건너뜁니다(AI 호출 안 함 → 추가 비용 없음).
//   예전 코드(lib/dailyOutlook.js의 refreshDailyOutlook)는 지우지 않고 남겨 둡니다(배너가 읽는 getCachedDailyOutlook은 계속 씀).

import { getRedis } from "../../../../lib/redis";
import { refreshPremarket } from "../../../../lib/premarket";
import { recordRun, RUN_DAILY_OUTLOOK } from "../../../../lib/runStatus";

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
    const result = await refreshPremarket(redis, { force: searchParams.get("force") === "1" });
    if (!result.skipped) await recordRun(redis, RUN_DAILY_OUTLOOK, { ok: !!result.ok, via: "장전 브리핑(cron-job.org)", ...result });
    return Response.json(result);
  } catch (err) {
    await recordRun(redis, RUN_DAILY_OUTLOOK, { ok: false, via: "장전 브리핑(cron-job.org)", error: String(err?.message || err) });
    return Response.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
