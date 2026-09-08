// GET /api/patterns
//
// 패턴 정의(patternDefs)와 히스토리 진행률(historyDays/historyTarget)은
// 매 요청마다 새로 계산해서 내려주고 — 이유는 아래 [2026-09-07 변경]
// 참고 — 정말 무거운 scanAllStocksForPatterns 결과(patterns)만 Redis
// 캐시에서 읽어옴.
//
// [2026-09-07 대규모 변경 — 패턴검색 페이지 로딩 지연 수정] 예전엔 이
// 라우트가 캐시가 없을 때(30분마다 한 번씩) 직접 전체 종목 스캔을
// 돌렸는데, 이게 무거워서 하필 그 타이밍에 들어온 사용자가 몇 초~십몇
// 초씩 기다려야 했음(재성님 리포트로 확인). 이제 그 무거운 스캔은
// lib/patternsScan.js의 runPatternsScanAndCache()로 옮겨서 이미 30분마다
// 자동으로 도는 app/api/poll/route.js가 백그라운드에서 미리 계산해두고,
// 이 라우트는 Redis 캐시를 읽기만 함 — 그래서 사용자가 페이지를 열 때는
// 계산이 얼마나 오래 걸리든 상관없이 항상 즉시 응답함. 캐시가 아직 한
// 번도 안 채워진 경우(배포 직후 등)만 빈 결과 + warming 플래그를 내려주고,
// 다음 poll 사이클(최대 30분 이내)에 자동으로 채워짐.
//
// ?refresh=1: 관리자가 수동으로 즉시 재계산하고 싶을 때만 쓰는 수동
// 새로고침 — 이때만 이 라우트가 직접 무거운 스캔을 돌림(그래서
// maxDuration을 60초로 유지함). 일반 사용자 화면에서는 절대 안 쓰임.
//
// [2026-09-07 변경] patternDefs/historyDays를 예전엔 위 30분 캐시 안에
// scan 결과랑 같이 통째로 저장했었는데, 그러면 캐시가 살아있는 동안엔
// (1) lib/patternDetection.js에 새 패턴을 추가해도 최대 30분간 목록에
// 안 보이고, (2) 자동 백필로 히스토리가 계속 쌓이고 있어도 진행률
// (historyDays)이 캐시가 만료될 때까지 그 시점 숫자에 멈춰 보이는 문제가
// 있었음 (52주 신고가 패턴을 추가했는데 화면에 안 뜨는 문제로 발견됨).
// 그래서 이 둘은 캐시 히트/미스와 상관없이 매 요청마다 새로 계산해서
// 내려주고, 정말 무거운 scanAllStocksForPatterns 결과만 캐시함.

import { getRedis } from "../../../lib/redis";
import { getStoredDayCount, HISTORY_LOOKBACK_DAYS } from "../../../lib/priceHistory";
import { PATTERN_DEFS } from "../../../lib/patternDetection";
import { RESULTS_CACHE_KEY, runPatternsScanAndCache } from "../../../lib/patternsScan";

// ?refresh=1 수동 새로고침 경로에서만 실제로 무거운 스캔을 도므로 유지.
// 일반 경로(캐시 읽기)는 훨씬 빨리 끝남.
export const maxDuration = 60;

export async function GET(request) {
  const redis = getRedis();
  if (!redis) {
    return Response.json({ error: "Redis(Upstash) 환경변수가 아직 설정되지 않았습니다." }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const force = searchParams.get("refresh") === "1";

  // /patterns 페이지가 "히스토리 쌓는 중" 진행률을 보여줄 수 있게, 항상
  // 최신 값으로 계산함 (아래 scan 결과 캐시와는 별개 — 캐시 적중 여부와
  // 무관하게 매번 새로 구함).
  const historyDays = await getStoredDayCount(redis).catch(() => 0);
  const historyTarget = HISTORY_LOOKBACK_DAYS;

  if (force) {
    try {
      await runPatternsScanAndCache(redis);
    } catch (err) {
      return Response.json(
        { error: "수동 재계산 실패: " + String(err.message || err), patternDefs: PATTERN_DEFS, historyDays, historyTarget },
        { status: 500 }
      );
    }
  }

  try {
    const cached = await redis.get(RESULTS_CACHE_KEY);
    if (cached) {
      const data = typeof cached === "string" ? JSON.parse(cached) : cached;
      if (data?.patterns) {
        return Response.json({ ...data, patternDefs: PATTERN_DEFS, historyDays, historyTarget });
      }
    }
  } catch {
    // corrupt/unreadable cache entry — fall through to the warming response
  }

  // 캐시가 아직 한 번도 안 채워진 상태 — 배포 직후라 poll이 아직 한 번도
  // 안 돌았거나, 시세 히스토리 자체가 아직 없는 경우. 예전처럼 여기서
  // 직접 스캔을 돌리지 않고(그러면 다시 사용자가 기다리게 됨), 빈 결과 +
  // warming 플래그만 내려줌 — 프론트가 "곧 채워집니다" 안내를 보여주고,
  // 실제로는 다음 poll 사이클(최대 30분 이내)에 자동으로 채워짐.
  return Response.json({
    patternDefs: PATTERN_DEFS,
    patterns: {},
    historyDays,
    historyTarget,
    warming: true,
  });
}
