// lib/patternsScan.js
//
// [2026-09-07 추가 — 패턴검색 페이지 로딩 지연 수정] 재성님이 "패턴검색
// 페이지 들어가면 검색창만 바로 뜨고 내용(패턴 목록·종목)이 한참 늦게
// 뜬다"고 리포트해주셔서 원인을 찾아봄. 원래는 app/api/patterns/route.js가
// 요청을 받을 때마다 "캐시가 있으면 바로 반환, 없으면(=30분 캐시가 막
// 끝난 직후) 그 자리에서 직접" 전체 종목(~2,800개) x 24개 패턴을 스캔했음.
// 이 스캔 자체가 원래도 무거운 작업인데, 마침 전고점돌파를 1년->3년치
// 데이터로 넓히면서(HISTORY_LOOKBACK_DAYS 260->750, lib/priceHistory.js
// 참고) 계산량도 늘고 캐시도 새로 비웠던 시점이라 체감 지연이 더 컸음.
//
// 근본 해결: 이 무거운 스캔을 "사용자가 페이지를 열 때"가 아니라, 이미
// 30분마다 자동으로 도는 백그라운드 작업(app/api/poll/route.js)이 미리
// 돌려서 Redis에 캐시로 저장해두도록 옮김. app/api/patterns/route.js는
// 이제 그 캐시를 읽기만 함 — 계산이 아무리 오래 걸려도 그건 백그라운드
// 얘기고, 사용자가 페이지를 열 때는 항상 이미 계산된 결과가 즉시 옴.
//
// 캐시 키/버전 문자열도 예전엔 app/api/patterns/route.js 안에서만
// 관리했는데(v1~v12까지 계속 올렸던 이력이 그 파일 주석에 남아있음), 이제
// poll과 patterns 라우트 둘 다 같은 값을 알아야 해서 여기 한 곳으로
// 모음 — 스캔 로직이 바뀔 때마다 이 파일의 버전만 올리면 됨.

import { buildPriceSeriesForAllStocks } from "./priceHistory";
import { scanAllStocksForPatterns, PATTERN_DEFS } from "./patternDetection";

// v12(app/api/patterns/route.js에 있던 마지막 버전)를 이어받아 v13으로 시작.
export const RESULTS_CACHE_KEY = "patterns:results:v13";

// [2026-09-07] 예전엔 30분이었는데, 이제 이 캐시를 채우는 쪽(poll)이
// 백필(과거 데이터 쌓기)과 시간 예산을 나눠 쓰다 보니 어떤 사이클엔
// 스캔을 건너뛸 수도 있음(아래 poll/route.js 참고) — 그래도 사용자한테는
// "약간 오래된(최대 몇 시간 이내) 결과"가 "텅 빈 화면"보다 훨씬 나으므로,
// 유효기간을 넉넉히 잡아 poll이 한두 번 스캔을 건너뛰어도 이전 결과가
// 계속 제공되게 함. 시세 데이터 자체가 하루 한 번(장 마감 후)만 바뀌는
// 성격이라, 몇 시간 지난 결과라도 틀린 결과는 아님. 다만 poll이 정말
// 오랫동안(예: 몇 시간 넘게) 완전히 멈춘 경우까지 무한정 옛날 결과를
// 보여주진 않도록 상한은 둠.
export const RESULTS_CACHE_TTL_SECONDS = 60 * 60 * 3; // 3시간

// 전체 종목 시세를 읽어와 24개 패턴에 대해 스캔하고, 결과를 Redis에
// 캐시로 저장함. app/api/poll/route.js가 30분마다 자동으로 호출하고,
// app/api/patterns/route.js는 관리자가 수동으로 새로고침할 때(?refresh=1)만
// 직접 호출함 — 일반 사용자 요청 경로에서는 절대 호출되지 않음(그래서
// 사용자 체감 속도에 영향이 없음).
export async function runPatternsScanAndCache(redis) {
  const priceSeriesMap = await buildPriceSeriesForAllStocks(redis);
  if (priceSeriesMap.size === 0) {
    return { skipped: true, reason: "저장된 시세 히스토리가 아직 없음" };
  }

  const patterns = scanAllStocksForPatterns(priceSeriesMap, {});
  const payload = {
    generatedAt: new Date().toISOString(),
    patternDefs: PATTERN_DEFS,
    patterns,
  };

  await redis.set(RESULTS_CACHE_KEY, payload, { ex: RESULTS_CACHE_TTL_SECONDS });

  return {
    skipped: false,
    stockCount: priceSeriesMap.size,
    patternCount: Object.keys(patterns).length,
  };
}
