// GET /api/patterns
//
// Reads the stored price history (lib/priceHistory.js) and scans every
// stock against the 24 chart patterns in lib/patternDetection.js, keyed
// by pattern id -> ranked list of {code, name, similarity, ...}. The
// (expensive, ~2,800-stock) scan itself is cached in Redis for 30 minutes
// — history only actually changes once a day, so rescanning on every
// single page load is wasted work — pass ?refresh=1 to force a fresh scan.
//
// Returns { error } (still 200, so the frontend can show a friendly
// "run the backfill first" message) if no history has been backfilled yet.
//
// [2026-09-07 변경] patternDefs/historyDays를 예전엔 위 30분 캐시 안에
// scan 결과랑 같이 통째로 저장했었는데, 그러면 캐시가 살아있는 동안엔
// (1) lib/patternDetection.js에 새 패턴을 추가해도 최대 30분간 목록에
//안 보이고, (2) 자동 백필로 히스토리가 계속 쌓이고 있어도 진행률
// (historyDays)이 캐시가 만료될 때까지 그 시점 숫자에 멈춰 보이는 문제가
// 있었음 (52주 신고가 패턴을 추가했는데 화면에 안 뜨는 문제로 발견됨).
// 그래서 이 둘은 캐시 히트/미스와 상관없이 매 요청마다 새로 계산해서
// 내려주고, 정말 무거운 scanAllStocksForPatterns 결과만 캐시함.

import { getRedis } from "../../../lib/redis";
import { buildPriceSeriesForAllStocks, getStoredDayCount, HISTORY_LOOKBACK_DAYS } from "../../../lib/priceHistory";
import { scanAllStocksForPatterns, PATTERN_DEFS } from "../../../lib/patternDetection";

export const maxDuration = 60;

// v1 -> v2: 위 변경(구조 변경)으로 예전 캐시 값의 모양이 안 맞을 수 있어서
// 키를 올려 예전 캐시를 무시하도록 함.
// v2 -> v3: 패턴을 14개에서 24개로 늘리면서(천정형·하락형 카테고리 추가)
// scanAllStocksForPatterns()가 반환하는 patterns 객체의 키 구성이 달라져서
// 또 한 번 올림 — 이걸 안 올리면 예전 14개 패턴 결과만 담긴 캐시가 30분간
// 계속 나가서, 새로 추가한 10개는 목록엔 보여도(patternDefs는 항상 최신)
// 종목 수가 다 0으로만 보일 수 있음.
// v3 -> v4: 거래정지 종목이 전고점돌파/52주 신고가에 계속 100%로 잡히던
// 버그(lib/patternDetection.js — 최신 거래일 데이터 없는 종목 제외)를 고치면서,
// 예전 버그가 낀 결과가 30분 캐시에 남아 계속 나가는 걸 막으려고 또 올림.
// v4 -> v5: v4의 수정이 근본 원인을 못 잡았던 게 확인됨(거래정지 종목도
// KRX가 매일 "오늘" 날짜로 데이터를 주되 직전 가격을 그대로 반복해서 줌
// — 날짜만 봐선 못 걸러짐). lib/patternDetection.js에 "최근 며칠간 실제
// 가격 변동이 있었는가"를 직접 보는 필터(isLikelyInactive)를 추가하면서,
// 예전(여전히 버그 낀) 캐시 결과가 30분 더 나가는 걸 막으려고 또 올림.
const RESULTS_CACHE_KEY = "patterns:results:v5";
const RESULTS_CACHE_TTL_SECONDS = 60 * 30;

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

  if (!force) {
    try {
      const cached = await redis.get(RESULTS_CACHE_KEY);
      if (cached) {
        const data = typeof cached === "string" ? JSON.parse(cached) : cached;
        if (data?.patterns) {
          return Response.json({ ...data, patternDefs: PATTERN_DEFS, historyDays, historyTarget });
        }
      }
    } catch {
      // corrupt/unreadable cache entry — fall through to a fresh scan
    }
  }

  const priceSeriesMap = await buildPriceSeriesForAllStocks(redis);
  if (priceSeriesMap.size === 0) {
    return Response.json({
      error: "저장된 시세 히스토리가 아직 없습니다. 30분마다 자동으로 조금씩 쌓이는 중이니 잠시 후 다시 확인해주세요.",
      patternDefs: PATTERN_DEFS,
      patterns: {},
      historyDays,
      historyTarget,
    });
  }

  const patterns = scanAllStocksForPatterns(priceSeriesMap, {});
  const payload = {
    generatedAt: new Date().toISOString(),
    patternDefs: PATTERN_DEFS,
    patterns,
    historyDays,
    historyTarget,
  };

  try {
    await redis.set(RESULTS_CACHE_KEY, payload, { ex: RESULTS_CACHE_TTL_SECONDS });
  } catch {
    // caching is best-effort — a failed write just means the next request re-scans
  }

  return Response.json(payload);
}
