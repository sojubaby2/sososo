// GET /api/debug-stock?name=삼부토건&secret=...
//
// [2026-09-07 임시 진단용 엔드포인트] 거래정지 종목(에스아이리소스,
// 삼부토건 등)이 필터링 수정 이후에도 계속 전고점돌파/52주 신고가 등에
// 잡힌다는 재성님 리포트를 조사하기 위한 도구. lib/patternDetection.js의
// isLikelyInactive() 필터가 "왜 안 걸러지는지"를 추측이 아니라 실제 저장된
// 원본 시세(날짜별 시가/고가/저가/종가/거래량)를 직접 눈으로 보고
// 확인하기 위함 — 원인이 확인되고 진짜 수정이 반영되면 이 파일은 지워도
// 됨(운영에 필요한 기능 아님).
//
// 인증: /api/poll과 같은 CRON_SECRET을 재사용함(새 환경변수 안 만들어도
// 되게). name 파라미터는 종목명 "일부"만 포함되면 매칭됨(정확한 종목코드를
// 몰라도 되게, 예: "삼부"만 넣어도 삼부토건이 걸림).

import { getRedis } from "../../../lib/redis";
import { buildPriceSeriesForAllStocks } from "../../../lib/priceHistory";
import { detectPatternsForStock, isLikelyInactive, trimAtLastDiscontinuity } from "../../../lib/patternDetection";

// buildPriceSeriesForAllStocks()가 저장된 날짜 수만큼(최대 260개) Redis를
// 순서대로 읽어오는 무거운 호출이라(=app/api/patterns/route.js와 동일한
// 병목), maxDuration을 짧게(30초) 잡았더니 타임아웃(504)이 났음. 그
// 라우트와 똑같이 60초로 맞춤(Vercel Hobby 플랜에서 쓸 수 있는 최대치).
export const maxDuration = 60;

export async function GET(request) {
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  if (cronSecret) {
    const provided =
      searchParams.get("secret") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (provided !== cronSecret) {
      return Response.json({ error: "인증되지 않은 요청입니다." }, { status: 401 });
    }
  }

  const nameQuery = (searchParams.get("name") || "").trim();
  if (!nameQuery) {
    return Response.json({ error: "?name=종목명 파라미터가 필요합니다 (예: ?name=삼부토건)." }, { status: 400 });
  }

  const redis = getRedis();
  if (!redis) {
    return Response.json({ error: "Redis(Upstash) 환경변수가 아직 설정되지 않았습니다." }, { status: 500 });
  }

  const priceSeriesMap = await buildPriceSeriesForAllStocks(redis);

  // 이 스캔에 실제로 참여한 종목들 중 가장 최신 날짜 — scanAllStocksForPatterns()의
  // 1차 필터(날짜 불일치 제외)와 똑같은 기준을 여기서도 보여주기 위함.
  let latestDate = null;
  for (const stock of priceSeriesMap.values()) {
    const series = stock?.series;
    if (!Array.isArray(series) || series.length === 0) continue;
    const d = series[series.length - 1]?.date;
    if (d && (latestDate === null || d > latestDate)) latestDate = d;
  }

  const matches = [];
  for (const [code, stock] of priceSeriesMap.entries()) {
    if (stock?.name && stock.name.includes(nameQuery)) {
      const series = Array.isArray(stock.series) ? stock.series : [];
      const lastEntry = series[series.length - 1];
      const trimmed = trimAtLastDiscontinuity(series);

      // 저장된 전체 구간에서 종가 최고/최저가 언제 찍혔는지 — "우리가 갖고
      // 있는 히스토리가 실제로 얼마나 오래전까지 닿아있는지", "그 안에
      // 정말 더 높은 종가가 있었는지"를 직접 확인하기 위함.
      let maxClose = null;
      let minClose = null;
      for (const p of series) {
        if (typeof p.c !== "number") continue;
        if (!maxClose || p.c > maxClose.c) maxClose = { date: p.date, c: p.c };
        if (!minClose || p.c < minClose.c) minClose = { date: p.date, c: p.c };
      }

      matches.push({
        code,
        name: stock.name,
        market: stock.market,
        totalStoredDays: series.length,
        oldestStoredDate: series[0]?.date ?? null,
        latestOverallDate: latestDate,
        thisStockLastDate: lastEntry?.date ?? null,
        excludedByDateCheck: latestDate !== null && lastEntry?.date !== latestDate,
        excludedByInactivityCheck: isLikelyInactive(series),
        // 저장된 전체 기간(오늘 기준 원본, 트림 전) 중 종가 최고/최저.
        fullSeriesMaxClose: maxClose,
        fullSeriesMinClose: minClose,
        // 감자/액면병합 등으로 하루 만에 종가가 ±32% 넘게 뛴 지점이
        // 있었는지 — 있었다면 그 이전 데이터는 패턴 분석에서 잘라내고
        // 씀(lib/patternDetection.js의 trimAtLastDiscontinuity 참고).
        discontinuityTrimmed: trimmed.length !== series.length,
        trimmedSeriesLength: trimmed.length,
        trimmedSeriesStartDate: trimmed[0]?.date ?? null,
        last10Days: series.slice(-10),
        // minSimilarity: 0 — 필터링 없이 각 패턴의 "원점수"를 그대로 보기 위함
        // (실제 화면에는 55% 이상만 노출됨). detectPatternsForStock 내부에서
        // 자체적으로 trimAtLastDiscontinuity를 적용한 뒤 계산함.
        rawPatternScores: detectPatternsForStock(series, { minSimilarity: 0 }).slice(0, 10),
      });
    }
  }

  return Response.json({
    query: nameQuery,
    latestOverallDate: latestDate,
    matchCount: matches.length,
    matches,
  });
}
