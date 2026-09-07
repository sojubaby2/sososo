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
// (lib/priceHistory.js — "/patterns" 차트패턴 기능용 데이터베이스)을
// 채워넣는 appendTodaysSnapshotIfMissing() 호출이 이 파일에 있었기 때문.
// 그래서 그 부분만 남기고, cron-job.org 설정(호출 주소)은 안 바꿔도 되게 이
// 파일을 그대로 유지함.
//
// [2026-09-07 추가] lib/priceHistory.js가 KRX 정식 Open API로 교체되면서
// (theme-momentum과 동일 이슈 — 예전 비공식 내부 API가 클라우드 트래픽을
// 차단해서) 다시 정상적으로 시세를 받아올 수 있게 됨. 이 기회에 "오늘 치
// 저장"뿐 아니라 과거 날짜 백필도 이 사이클에서 조금씩(최대
// BACKFILL_DAYS_PER_CYCLE일) 같이 진행하도록 함 — 재성님이 /api/backfill-
// history를 따로 열어줄 필요 없이, 이미 30분마다 자동으로 돌고 있는 이
// 엔드포인트만으로 알아서 260일치가 다 쌓임(대략 반나절 정도 걸림). 둘 다
// best-effort라 실패해도 이 엔드포인트 전체가 에러나진 않고, 다음 사이클에
// 다시 시도됨.

import { getRedis } from "../../../lib/redis";
import { getCachedUniverse } from "../../../lib/newsPipeline";
import { appendTodaysSnapshotIfMissing, backfillHistory } from "../../../lib/priceHistory";

// 한 사이클(이 엔드포인트 1회 호출)당 과거로 더 채워넣을 최대 일수. 하루치가
// KRX 호출 2번(코스피/코스닥)이라, 10일이면 최대 20번 — 60초 제한 안에
// 오늘 치 저장까지 넉넉하게 끝남. 30분마다 도니까 10일씩이면 260일 전부
// 채우는 데 대략 13사이클(≈6.5시간)이면 충분함.
const BACKFILL_DAYS_PER_CYCLE = 10;

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

  // 오늘 치 저장이 끝난 뒤, 남은 60초 예산 안에서 과거 날짜도 조금씩 백필함.
  let backfillResult = "skipped";
  try {
    const result = await backfillHistory(redis, { maxNewDaysPerRun: BACKFILL_DAYS_PER_CYCLE });
    backfillResult = result?.error
      ? "error: " + result.error
      : result?.done
        ? `done (총 ${result.total}일)`
        : `+${result.added}일 (총 ${result.total}일)`;
  } catch (err) {
    backfillResult = "error: " + String(err.message || err);
  }

  return Response.json({
    checkedAt: new Date().toISOString(),
    basDt,
    snapshotResult,
    backfillResult,
    note: "뉴스 매칭은 이제 텔레그램(app/api/telegram-ingest)만 사용합니다. 이 엔드포인트는 시세 히스토리 저장/백필용으로만 남아있습니다.",
  });
}
