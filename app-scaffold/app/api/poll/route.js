// GET /api/poll
//
// [2026-09-07 변경] 예전에는 네이버 뉴스 검색 API로 키워드(특징주·수주·
// 공시 등)를 폴링해서 기사를 가져오고, 그걸 종목에 매칭해서 피드에
// 올리는 역할까지 이 엔드포인트가 했었음. 이제 뉴스 소스는 텔레그램
// (app/api/telegram-ingest/route.js)만 쓰기로 해서, 그 매칭 파이프라인은
// 여기서 완전히 뺐음 — 네이버 뉴스 기사 가져오기(fetchNaverNews), 감시
// 키워드 목록(WATCHED_KEYWORDS), 기사 단위 필터링/매칭/게재 로직 전부
// 삭제.
//
// 이 엔드포인트 자체는 그대로 남겨둠 — cron-job.org가 지금도 이 주소를
// 주기적으로(예: 30분마다) 호출하도록 설정돼 있는데, 그 호출이 계속
// 필요한 이유가 하나 남아있음: 일봉(OHLC) 시세 히스토리 저장
// (lib/priceHistory.js — 아직 화면에 안 나오는 "차트패턴" 기능용
// 데이터베이스)을 하루에 한 번씩 채워넣는 appendTodaysSnapshotIfMissing()
// 호출이 이 파일에 있었기 때문. 그래서 그 부분만 남기고, cron-job.org
// 설정(호출 주소)은 안 바꿔도 되게 이 파일을 그대로 유지함.
//
// (참고: appendTodaysSnapshotIfMissing 자체는 아직 예전 KRX 공공데이터
// API를 쓰고 있어서, 그 API가 클라우드 트래픽을 막고 있는 지금은 이
// 호출도 실패함 — best-effort라 실패해도 이 엔드포인트 전체가 에러나진
// 않음. 이건 차트패턴 기능을 실제로 쓰기 전에 별도로 고쳐야 함.)

import { getRedis } from "../../../lib/redis";
import { getCachedUniverse } from "../../../lib/newsPipeline";
import { appendTodaysSnapshotIfMissing } from "../../../lib/priceHistory";

// Vercel terminates a function that runs past this many seconds.
export const maxDuration = 60;

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
    return Response.json({ error: "Redis(Upstash) 환경변수가 아직 설정되지 않았습니다." }, { status: 500 });
  }

  // getCachedUniverse는 뉴스 매칭에 더 이상 안 쓰지만, 오늘 날짜(basDt)를
  // 이미 알고 있는 형태로 계산해주기 때문에 시세 히스토리 저장 호출에
  // basDt를 넘기려고 그대로 재사용함 — KRX(네이버 시세) 호출을 두 번
  // 하지 않아도 됨.
  const universe = await getCachedUniverse(redis);
  if (!universe) {
    return Response.json(
      { error: "시세 데이터를 가져오지 못했습니다 (네이버 시세 페이지 응답 오류)." },
      { status: 500 }
    );
  }
  const { basDt } = universe;

  // Best-effort — 실패해도 이 엔드포인트 전체가 에러가 되진 않음. 다음
  // 사이클에 다시 시도됨.
  let snapshotResult = "skipped";
  try {
    const result = await appendTodaysSnapshotIfMissing(redis, basDt);
    snapshotResult = result?.added ? "added" : result?.error ? "error: " + result.error : "already-had-today";
  } catch (err) {
    snapshotResult = "error: " + String(err.message || err);
  }

  return Response.json({
    checkedAt: new Date().toISOString(),
    basDt,
    snapshotResult,
    note: "뉴스 매칭은 이제 텔레그램(app/api/telegram-ingest)만 사용합니다. 이 엔드포인트는 시세 히스토리 저장용으로만 남아있습니다.",
  });
}
