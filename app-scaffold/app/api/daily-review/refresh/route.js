// GET /api/daily-review/refresh
//
// [2026-09-09 추가] cron-job.org가 매일 저녁 9시(평일, KST)에 이 주소를
// 호출하도록 등록해야 함 — /api/daily-outlook/refresh가 쓰는 것과 똑같은
// CRON_SECRET을 재사용하므로 Cloudflare 쪽에 새 시크릿을 추가할 필요는
// 없음.
//
// 예전에는 Claude Code Remote의 예약 작업(매일 저녁 9시에 뜨는 별도
// 세션)이 직접 이 사이트에 접속해서 글을 쓰고 게시했는데, 그 예약
// 작업이 도는 클라우드 환경이 newsmeme.co.kr 같은 임의의 외부 사이트로
// 나가는 걸 "조직 정책"으로 막고 있다는 게 뒤늦게 확인됨(Redis 문제와는
// 완전히 별개의 원인 — 재성님이 다른 세션에서 직접 확인해줌). 그래서
// 매일 밤 조용히 실패하고 있었음.
//
// 고친 방법: daily-outlook/refresh랑 똑같은 구조로 바꿈 — 예약 작업이
// "밖에서 안으로" 접속하는 대신, 사이트 자기 자신이 Anthropic API를
// 직접 호출해서(lib/dailyReviewWriter.js) 글을 쓰고 그 자리에서 바로
// Redis에 저장함. Vercel 서버는 임의의 외부 API를 자유롭게 호출할 수
// 있어서 이 문제 자체가 발생하지 않음.

import { getRedis } from "../../../../lib/redis";
import { saveDailyReview } from "../../../../lib/dailyReview";
import { synthesizeDailyReview } from "../../../../lib/dailyReviewWriter";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function basDtToIso(basDt) {
  // "20260908" -> "2026-09-08"
  return `${basDt.slice(0, 4)}-${basDt.slice(4, 6)}-${basDt.slice(6, 8)}`;
}

// 서버는 UTC로 돌아가므로 KST(UTC+9)로 보정한 "오늘" 날짜를 구함 —
// source-data가 돌려준 basDt가 정말 "오늘"인지 확인하는 용도.
function todayKstBasDt() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

export async function GET(request) {
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams, origin } = new URL(request.url);
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

  // 1. 오늘의 재료를 모은다 (기존 source-data 엔드포인트를 그대로 재사용).
  let sourceData;
  try {
    const res = await fetch(`${origin}/api/daily-review/source-data?secret=${encodeURIComponent(cronSecret || "")}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return Response.json(
        { ok: false, skipped: true, reason: `source-data 요청 실패 (status ${res.status}): ${text.slice(0, 200)}` },
        { status: 200 }
      );
    }
    sourceData = await res.json();
  } catch (err) {
    return Response.json(
      { ok: false, skipped: true, reason: "source-data 요청 중 오류: " + String(err.message || err) },
      { status: 200 }
    );
  }

  // 2. 조용히 건너뛰어야 하는 경우들 — 재성님한테 따로 알릴 필요 없음
  //    (다음 평일에 다시 시도됨).
  if (!sourceData?.basDt) {
    return Response.json({ ok: false, skipped: true, reason: "basDt가 없습니다(데이터 없음)." });
  }
  if (sourceData.basDt !== todayKstBasDt()) {
    return Response.json({
      ok: false,
      skipped: true,
      reason: `basDt(${sourceData.basDt})가 오늘(KST) 날짜와 다릅니다 — 휴장일로 추정, 건너뜁니다.`,
    });
  }
  const hasData =
    (sourceData.topGainers?.length || 0) > 0 ||
    (sourceData.topLosers?.length || 0) > 0 ||
    (sourceData.topThemesUp?.length || 0) > 0;
  if (!hasData) {
    return Response.json({ ok: false, skipped: true, reason: "오늘자 등락률/테마 데이터가 비어있습니다." });
  }

  // 3. 글을 쓴다.
  let written;
  try {
    written = await synthesizeDailyReview(sourceData);
  } catch (err) {
    return Response.json(
      { ok: false, error: "글 작성 실패: " + String(err.message || err) },
      { status: 502 }
    );
  }

  // 4. 저장한다 (예전엔 이 단계가 별도 세션의 POST 요청이었지만, 이제
  //    같은 서버 안이므로 바로 저장).
  const date = basDtToIso(sourceData.basDt);
  const record = await saveDailyReview(redis, date, written);

  return Response.json({ ok: true, post: record });
}
