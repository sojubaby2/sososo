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

// [2026-09-11 추가] 이 작업이 "마지막으로 언제, 어떤 결과로 돌았는지"를 Redis에
// 남겨둠 — 2026-09-11 점검에서 마감시황 글이 한 건도 없는데 그 원인이
// "cron이 호출을 안 한 것"인지 "호출은 됐는데 휴장일로 건너뛴 것"인지
// "글쓰기가 실패한 것"인지 알 방법이 없었기 때문. /health에서 확인 가능.
// [2026-09-13 변경 — 마감시황이 한 건도 안 쌓이던 문제 수정]
// 증상: cron-job.org는 매일 저녁 9시에 이 주소를 정상 호출(200 OK)하고
// 있는데도 마감시황 글이 0건이었음.
// 원인: 아래 2번 검사 — "KRX에서 받아온 최신 시세 날짜(basDt)가 오늘과
// 다르면 휴장일로 보고 건너뛴다" — 가 매일 걸렸음. KRX 정식 Open API가
// 그날 시세를 저녁 9시까지 안 올려주기 때문(2026-09-11 금요일 밤 10시
// 48분에 확인했을 때도 최신 데이터가 여전히 목요일 것이었음). 즉 진짜
// 휴장일이 아닌데 휴장일로 오판하고 매일 조용히 건너뛰고 있었음.
// 고친 방법(재성님이 고른 "여러 번 재시도" 방식):
//   1) "오늘 날짜여야만 한다"는 조건을 "오늘 또는 어제(KST)면 된다"로 완화.
//      → 밤늦게/다음날 아침에 다시 호출되면 그때 데이터가 올라와 있으므로
//        그 거래일자로 글이 써짐.
//   2) 이미 그 날짜 글이 있으면 바로 건너뜀 → 하루에 여러 번 호출돼도
//      중복 게시가 안 되고, 먼저 성공한 회차의 글이 그대로 유지됨.
// 그래서 cron-job.org에는 이 주소를 세 번 등록해두면 됨:
//   · 평일 21:00 (기존)  · 평일 23:00 (추가)  · 매일 08:00 (추가, 토요일에
//   금요일 치를 건지기 위해 주말 포함)
import { getRedis } from "../../../../lib/redis";
import { saveDailyReview, listDailyReviewDates } from "../../../../lib/dailyReview";
import { hasSnapshot } from "../../../../lib/priceHistory";
import { synthesizeDailyReview } from "../../../../lib/dailyReviewWriter";
import { recordRun, RUN_DAILY_REVIEW } from "../../../../lib/runStatus";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function basDtToIso(basDt) {
  // "20260908" -> "2026-09-08"
  return `${basDt.slice(0, 4)}-${basDt.slice(4, 6)}-${basDt.slice(6, 8)}`;
}

// 서버는 UTC로 돌아가므로 KST(UTC+9)로 보정한 날짜를 구함 —
// source-data가 돌려준 basDt가 최근 것인지 확인하는 용도.
// offsetDays: 0이면 오늘, -1이면 어제.
function kstBasDt(offsetDays = 0) {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000 + offsetDays * 24 * 60 * 60 * 1000);
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

  // [2026-09-11 추가] 어떤 경로로 끝나든(성공/건너뜀/실패) 결과를 한 줄
  // 기록하고 응답하도록, 모든 return을 이 함수 하나로 모음.
  const finish = async (payload, init) => {
    await recordRun(redis, RUN_DAILY_REVIEW, {
      ok: !!payload.ok,
      skipped: !!payload.skipped,
      reason: payload.reason || null,
      error: payload.error || null,
      date: payload.post?.date || null,
    });
    return Response.json(payload, init);
  };

  // ── 1. 가벼운 사전 점검 ────────────────────────────────────────────
  // [2026-09-13 추가 — 비용 안전장치] 아래 source-data 호출은 아주 무거움:
  // /api/theme-momentum(KRX 호출) + /api/patterns(수백 KB짜리 캐시 읽기) +
  // /api/market-ticker(외부 API 3곳) + 네이버 지수 페이지 2번 + 뉴스 피드
  // 250건 통째로 읽기를 전부 함. 이걸 하루 세 번(21시·23시·다음날 08시)
  // 무조건 돌리면 Upstash 대역폭이 세 배로 뛰므로, 그 전에 "이번 회차에
  // 글을 쓸 일이 있는지"를 Redis 가벼운 조회 두세 번으로 먼저 판단함.
  //
  // 참고로 이건 지금까지보다 오히려 싸짐 — 지금은 저녁 9시마다 이 무거운
  // 작업을 전부 해놓고 맨 마지막에 "휴장일인가 보다" 하고 버리고 있었음.
  //
  // 판단 기준:
  //  · 한국시간 16시(장 마감 15:30) 전이면 오늘 치가 있을 리 없으므로
  //    후보는 "어제"뿐. 그 이후면 "오늘 → 어제" 순으로 본다.
  //  · 이미 글이 있는 날짜는 건너뛴다(중복 게시 방지 + 재시도 비용 0).
  //  · hasSnapshot: 30분 자동작업이 그날 시세를 저장했는지를 zscore 한 번
  //    으로 확인 — KRX가 그날 데이터를 아직 안 올렸으면 여기서 바로 끝남.
  const kstHour = new Date(Date.now() + 9 * 60 * 60 * 1000).getUTCHours();
  const candidates = kstHour >= 16 ? [kstBasDt(0), kstBasDt(-1)] : [kstBasDt(-1)];
  const alreadyWritten = new Set(await listDailyReviewDates(redis, 5).catch(() => []));

  let targetBasDt = null;
  const skipNotes = [];
  for (const basDt of candidates) {
    const iso = basDtToIso(basDt);
    if (alreadyWritten.has(iso)) {
      skipNotes.push(`${iso}: 이미 작성됨`);
      continue;
    }
    const stored = await hasSnapshot(redis, basDt).catch(() => false);
    if (!stored) {
      skipNotes.push(`${iso}: 아직 시세가 안 올라옴(휴장일이거나 KRX 지연)`);
      continue;
    }
    targetBasDt = basDt;
    break;
  }

  if (!targetBasDt) {
    return finish({
      ok: false,
      skipped: true,
      reason: `이번 회차에 쓸 거래일이 없습니다 — ${skipNotes.join(" / ")}`,
    });
  }
  const targetDate = basDtToIso(targetBasDt);

  // ── 2. 재료를 모은다 (여기서부터 무거운 작업) ──────────────────────
  let sourceData;
  try {
    const res = await fetch(`${origin}/api/daily-review/source-data?secret=${encodeURIComponent(cronSecret || "")}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return finish(
        { ok: false, skipped: true, reason: `source-data 요청 실패 (status ${res.status}): ${text.slice(0, 200)}` },
        { status: 200 }
      );
    }
    sourceData = await res.json();
  } catch (err) {
    return finish(
      { ok: false, skipped: true, reason: "source-data 요청 중 오류: " + String(err.message || err) },
      { status: 200 }
    );
  }

  // 사전 점검에서 정한 날짜와 실제로 받아온 재료의 날짜가 다르면(사전
  // 점검과 이 호출 사이에 30분 작업이 새 날짜를 채워 넣은 경우 등) 이번엔
  // 건너뜀 — 엉뚱한 날짜 재료로 글을 쓰는 것보다 다음 회차에 다시 하는 게 안전.
  if (sourceData?.basDt !== targetBasDt) {
    return finish({
      ok: false,
      skipped: true,
      reason: `재료의 날짜(${sourceData?.basDt || "없음"})가 목표 거래일(${targetBasDt})과 다릅니다 — 건너뜁니다.`,
    });
  }

  const hasData =
    (sourceData.topGainers?.length || 0) > 0 ||
    (sourceData.topLosers?.length || 0) > 0 ||
    (sourceData.topThemesUp?.length || 0) > 0;
  if (!hasData) {
    return finish({ ok: false, skipped: true, reason: "오늘자 등락률/테마 데이터가 비어있습니다." });
  }

  // 3. 글을 쓴다.
  let written;
  try {
    written = await synthesizeDailyReview(sourceData);
  } catch (err) {
    return finish(
      { ok: false, error: "글 작성 실패: " + String(err.message || err) },
      { status: 502 }
    );
  }

  // 4. 저장한다 (예전엔 이 단계가 별도 세션의 POST 요청이었지만, 이제
  //    같은 서버 안이므로 바로 저장).
  const record = await saveDailyReview(redis, targetDate, written);

  return finish({ ok: true, post: record });
}
