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

// [2026-09-11 추가] 이 작업이 마지막으로 언제·어떤 결과로 돌았는지 Redis에
// 기록해둠 — /health 화면에서 확인 가능(lib/runStatus.js 참고).
import { getRedis } from "../../../../lib/redis";
import { refreshDailyOutlook } from "../../../../lib/dailyOutlook";
import { recordRun, RUN_DAILY_OUTLOOK } from "../../../../lib/runStatus";

export const maxDuration = 30;

export async function GET(request) {
  const cronSecret = process.env.CRON_SECRET;
  // [2026-09-13 변경] searchParams를 if 블록 밖으로 꺼냄 — 아래 ?debug=1
  // 확인에서도 써야 해서.
  const { searchParams } = new URL(request.url);
  if (cronSecret) {
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

  // [2026-09-13 변경] refreshDailyOutlook의 반환값이 record 하나에서
  // { ok, record?, skipped?, reason?, debug }로 바뀜 — AI가 근거를 못 찾아
  // 빈 결과가 나왔을 때 에러를 던져 기존 예측까지 날리는 대신, 조용히
  // "이번엔 갱신 안 함"으로 끝내기 위함(lib/dailyOutlook.js 주석 참고).
  //
  // ?debug=1 을 붙이면 AI가 실제로 뭘 받아서 뭘 뱉었는지(뉴스 몇 건,
  // 응답 앞부분, 걸러진 테마와 그 이유)까지 같이 보여줌 — 원인 파악용.
  const wantDebug = searchParams.get("debug") === "1";

  try {
    const result = await refreshDailyOutlook(redis);

    if (!result.ok) {
      await recordRun(redis, RUN_DAILY_OUTLOOK, {
        ok: false,
        skipped: true,
        reason: result.reason || null,
        weekend: result.debug?.weekend ?? null,
        newsCount: result.debug?.newsCount ?? null,
        rawPickCount: result.debug?.rawPickCount ?? null,
      });
      return Response.json({
        ok: false,
        skipped: true,
        reason: result.reason,
        note: "기존에 저장된 예측은 그대로 유지됩니다.",
        ...(wantDebug ? { debug: result.debug } : {}),
      });
    }

    await recordRun(redis, RUN_DAILY_OUTLOOK, {
      ok: true,
      dateLabel: result.record?.dateLabel || null,
      weekend: !!result.record?.weekend,
      pickCount: result.record?.picks?.length || 0,
    });
    return Response.json({
      ok: true,
      record: result.record,
      ...(wantDebug ? { debug: result.debug } : {}),
    });
  } catch (err) {
    await recordRun(redis, RUN_DAILY_OUTLOOK, { ok: false, error: String(err.message || err) });
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }
}
