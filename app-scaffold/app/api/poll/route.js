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
// 필요한 이유가 두 가지 남아있음: ① 일봉(OHLC) 시세 히스토리 저장
// (lib/priceHistory.js — "/patterns" 차트패턴 기능용 데이터베이스)을
// 채워넣는 appendTodaysSnapshotIfMissing() 호출, ② [2026-09-07 추가]
// "/patterns" 페이지가 보여주는 패턴 스캔 결과를 미리 계산해서 캐시해두는
// runPatternsScanAndCache() 호출(lib/patternsScan.js) — 원래 사용자가
// 페이지를 열 때 그 자리에서 계산하던 걸 여기로 옮겨서, 페이지 로딩이
// 느려지지 않게 함(아래 본문 주석 참고). 그래서 이 두 가지만 남기고,
// cron-job.org 설정(호출 주소)은 안 바꿔도 되게 이 파일을 그대로 유지함.
//
// [2026-09-07 추가] lib/priceHistory.js가 KRX 정식 Open API로 교체되면서
// (theme-momentum과 동일 이슈 — 예전 비공식 내부 API가 클라우드 트래픽을
// 차단해서) 다시 정상적으로 시세를 받아올 수 있게 됨. 이 기회에 "오늘 치
// 저장"뿐 아니라 과거 날짜 백필도 이 사이클에서 조금씩(최대
// BACKFILL_DAYS_PER_CYCLE일) 같이 진행하도록 함 — 재성님이 /api/backfill-
// history를 따로 열어줄 필요 없이, 이미 30분마다 자동으로 돌고 있는 이
// 엔드포인트만으로 알아서 260일치가 다 쌓임. 둘 다 best-effort라 실패해도
// 이 엔드포인트 전체가 에러나진 않고, 다음 사이클에 다시 시도됨.
//
// [2026-09-07 변경 — 2차] basDt(오늘 날짜, "YYYYMMDD")를 구하려고
// getCachedUniverse(redis)(= 네이버 시세 전체 페이지를 최대 100번 가까이
// 긁어오는 무거운 호출)를 재사용하고 있었는데, 이게 문제였음: ①
// 네이버쪽이 느리거나 한 번이라도 실패하면 이 함수가 통째로 500을 반환하고
// 끝나버려서 그 아래 있는 appendTodaysSnapshotIfMissing/backfillHistory가
// 아예 실행조차 안 되고, ② 설령 성공하더라도 이 스크래핑에 시간을 많이
// 써버려서 60초 제한(maxDuration) 안에 백필이 돌 시간이 얼마 안 남았음.
// 실제로 이것 때문에 "/patterns" 페이지의 히스토리가 하루치(1/260일)에서
// 전혀 늘지 않는 문제가 있었음. basDt는 그냥 오늘 날짜일 뿐이라 네트워크
// 호출 없이 로컬에서 바로 계산하면 되므로(theme-momentum/route.js,
// lib/priceHistory.js에서 이미 쓰던 것과 동일한 toBasDt 방식), 여기서도
// getCachedUniverse 의존을 완전히 제거함.

import { getRedis } from "../../../lib/redis";
import { appendTodaysSnapshotIfMissing, backfillHistory } from "../../../lib/priceHistory";
import { runPatternsScanAndCache } from "../../../lib/patternsScan";

function toBasDt(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${dd}`;
}

// 한 사이클(이 엔드포인트 1회 호출)당 과거로 더 채워넣을 최대 일수. 하루치가
// KRX 호출 2번(코스피/코스닥)이라, 24일이면 최대 48번 — 네이버 스크래핑을
// 뺀 덕분에 60초 제한 안에 오늘 치 저장까지 넉넉하게 끝남. 30분마다
// 도니까 24일씩이면 260일 전부 채우는 데 대략 11사이클(≈5.5시간)이면
// 충분함.
const BACKFILL_DAYS_PER_CYCLE = 24;

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

  const startedAt = Date.now();
  const basDt = toBasDt(new Date());

  // Best-effort — 실패해도 이 엔드포인트 전체가 에러가 되진 않음. 다음
  // 사이클에 다시 시도됨.
  let snapshotResult = "skipped";
  try {
    const result = await appendTodaysSnapshotIfMissing(redis, basDt);
    snapshotResult = result?.added ? "added" : result?.error ? "error: " + result.error : "already-had-today";
  } catch (err) {
    snapshotResult = "error: " + String(err.message || err);
  }

  // [2026-09-07 추가 — 패턴검색 페이지 로딩 지연 수정] 예전엔 "/patterns"
  // 페이지에 들어온 사용자가 직접 이 무거운 스캔을 기다려야 했음(재성님
  // 리포트로 확인). 이제 그 계산을 여기(30분마다 자동으로 도는
  // 백그라운드)로 옮겨서 Redis에 미리 캐시해두고, app/api/patterns/route.js는
  // 그 캐시를 읽기만 하도록 분리함 — 자세한 설명은 lib/patternsScan.js
  // 참고. 아래 백필보다 먼저 돌려서, 혹시 시간이 부족해 뭔가 하나를
  // 걸러야 한다면 백필(그냥 과거 데이터를 더 쌓는 것)이 아니라 이쪽이
  // 우선되도록 함 — 사용자가 실제로 보는 화면이라 더 중요함.
  let patternsScanResult = "skipped";
  try {
    const result = await runPatternsScanAndCache(redis);
    patternsScanResult = result.skipped
      ? `건너뜀 (${result.reason})`
      : `완료 (종목 ${result.stockCount}개, 패턴 ${result.patternCount}종)`;
  } catch (err) {
    patternsScanResult = "error: " + String(err.message || err);
  }

  // 남은 시간 예산을 봐서 이번 사이클에 백필을 할지 정함 — 위 패턴 스캔이
  // 오래 걸렸으면(저장 기간이 3년에 가까워질수록 스캔이 읽어야 할 날짜
  // 수가 늘어서 더 오래 걸릴 수 있음) 이번엔 건너뛰고 다음 사이클(30분
  // 뒤)에 다시 시도함. Vercel이 maxDuration(60초)을 넘기면 함수를 강제
  // 종료하는데, 그 시점에 이미 스냅샷 저장/패턴 캐시 저장이 끝나 있었다면
  // 그 결과는 안전하게 보존되므로(각각 독립적인 Redis 쓰기), 백필만 못
  // 하고 이번 사이클이 끝나는 건 전혀 문제 없음 — 그냥 과거 데이터가
  // 조금 늦게 쌓일 뿐, 다음 사이클에 이어서 진행됨.
  const elapsedMs = Date.now() - startedAt;
  const remainingMs = 55_000 - elapsedMs; // 60초 제한에서 5초 여유를 둠
  let backfillResult = "skipped";
  if (remainingMs > 5000) {
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
  } else {
    backfillResult = "건너뜀 (패턴 스캔에 시간을 많이 써서 이번 사이클은 생략 — 다음 사이클에 재시도)";
  }

  return Response.json({
    checkedAt: new Date().toISOString(),
    basDt,
    snapshotResult,
    patternsScanResult,
    backfillResult,
    note: "뉴스 매칭은 이제 텔레그램(app/api/telegram-ingest)만 사용합니다. 이 엔드포인트는 시세 히스토리 저장/백필 + 패턴검색 결과 캐시 갱신용으로 남아있습니다.",
  });
}
