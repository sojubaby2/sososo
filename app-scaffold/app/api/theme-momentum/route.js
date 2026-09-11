// GET /api/theme-momentum
//
// We only have daily KRX snapshots, not a real historical time series, so
// "N-day change" here is computed by diffing snapshots: the most recent
// available business day, against the closest available business day ~7 and
// ~30 calendar days earlier. This deliberately replaces daily change%
// everywhere it was shown next to news/theme data that isn't itself
// real-time — a same-day % next to a headline read like "this just
// happened", which was misleading. A multi-day figure doesn't carry that
// same false-immediacy problem.
//
// 1주일/1개월 두 기간을 동시에 계산해서 프론트(HOT 테마 패널의 토글)에서
// 고르게 함.
//
// 전일 등락률(change1D)은 스냅샷을 새로 안 받아옴 — 최신 스냅샷(recent.items)에
// 이미 "전일 대비 등락률"(fltRt)이 계산되어 들어있어서 그냥 그 값을 그대로
// 씀. 이 값은 KRX 쪽에서 감자/병합 등이 있으면 기준가를 다시 잡아서
// 계산하므로, 우리가 직접 두 종가를 빼서 만드는 1주일/1개월 수치와 달리
// 상장주식수 필터가 따로 필요 없음.
//
// 상장주식수(lstgStCnt) 변동 종목 제외: KRX 종가는 감자·주식병합·유상증자·
// 무상증자 같은 이벤트가 있어도 그 사실을 전혀 반영하지 않고 그냥 "그날의
// 1주 가격"만 줌. 예를 들어 삼부토건은 2026년 6월 법원 회생계획 인가로
// 27대 1 주식병합(96.3% 감자)을 거쳐 2026-09-01에 신주가 새로 상장됐는데,
// 병합 전/후 종가를 그대로 비교하면 실제로는 아무 일도 없었는데(가치는
// 그대로, 주식 수만 27분의 1로 줄고 주당가격만 그만큼 뛴 것) 등락률이
// +1500%대로 튀어 보이는 문제가 있었음. 상장주식수가 두 시점 사이에 크게
// 달라진 종목은 애초에 "종가 비교"라는 계산 자체가 성립하지 않으므로,
// 개별 종목의 등락률(stockChanges)과 테마 평균 양쪽 모두에서 제외함.
//
// [시세 데이터 출처 변경 이력]
// 1차: 공공데이터포털(apis.data.go.kr)의 KRX 시세 API — 클라우드(Vercel)
//      서버 트래픽을 막기 시작해서 죽음(ConnectTimeout).
// 2차: data.krx.co.kr의 내부 API(getJsonData.cmd, KRX 홈페이지 자신이
//      화면에 표를 그릴 때 쓰는 비공식 엔드포인트) — 처음엔 됐지만 며칠 안
//      가서 전부 status 400으로 막힘. 원인: KRX가 pykrx 같은 "비공식
//      라이브러리"의 과도한 접속을 이유로 이 내부 API를 IP 단위로 차단하는
//      정책을 공식 운영 중이었음(github.com/sharebook-kr/pykrx issue #151
//      에서 KRX 데이터사업부가 직접 확인). Vercel처럼 여러 사용자가 IP
//      대역을 공유하는 클라우드에서는 나만 안 써도 남의 트래픽 때문에
//      막힐 수 있어서 근본적으로 불안정함.
// 3차(임시): "오늘 시세"만 네이버 금융 스크래핑으로 우회, "1주일/1개월"은
//      계속 data.krx.co.kr 시도 — 부분적으로만 복구.
// 4차(현재): KRX가 직접 운영하는 정식 Open API(openapi.krx.co.kr, "KRX
//      Data Marketplace")로 완전히 교체. 회원가입 → 인증키 발급 →
//      "유가증권 일별매매정보"(stk_bydd_trd)/"코스닥 일별매매정보"
//      (ksq_bydd_trd) 서비스 개별 활용신청, 이렇게 3단계 승인을 거쳐야
//      쓸 수 있는 공식 경로라 비공식 스크래핑과 달리 차단될 위험이 없고,
//      무료 + 하루 10,000회 호출 한도로 우리 사용량(하루 수십~수백 회)엔
//      넉넉함. 인증키는 Vercel 환경변수 KRX_OPENAPI_KEY로 설정.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import rawThemeData from "../../../lib/themeData.json";
import { fetchLatestAvailable } from "../../../lib/krxOpenApi";

// [2026-09-11 수정] KRX 정식 API를 호출하는 공통 로직(인증키 처리,
// 영업일 계산, 필드 정규화 등)을 lib/krxOpenApi.js로 옮기고 여기서는
// import해서 씀 — lib/newsPipeline.js(텔레그램 뉴스 관련주 매칭)도 같은
// 코드를 재사용할 수 있게 하기 위함. 아래 SHARE_CHANGE_THRESHOLD부터는 이
// 파일(HOT테마 패널)만의 고유 로직이라 그대로 둠.

// 상장주식수가 두 시점 사이에 이 비율 이상 달라지면 감자/병합/증자 등으로
// 보고, 가격 비교 대상에서 제외함. 상장주식수는 평소엔 거의 안 바뀌므로
// 넉넉하게 잡아도(0.5%) 오탐은 거의 없음.
const SHARE_CHANGE_THRESHOLD = 0.005;

function toPriceMap(items) {
  const map = new Map();
  for (const it of items) {
    if (!it.srtnCd || !it.clpr) continue;
    map.set(it.srtnCd, Number(it.clpr));
  }
  return map;
}

// 종목코드 -> 상장주식수(lstgStCnt) 맵. 값이 없거나 0이면 그 종목은 그냥
// 건너뜀(있는 값만 가지고 비교).
function toSharesMap(items) {
  const map = new Map();
  for (const it of items) {
    if (!it.srtnCd || !it.lstgStCnt) continue;
    const n = Number(it.lstgStCnt);
    if (Number.isFinite(n) && n > 0) map.set(it.srtnCd, n);
  }
  return map;
}

// recentPrices/pastPrices 두 시점의 가격 맵을 비교해 종목코드 -> 등락률(%) 맵을
// 만듦. recentShares/pastShares로 상장주식수가 크게 달라진 종목(감자·병합·
// 증자 등)은 가격 비교 자체가 무의미하므로 결과에서 제외함.
function computeChanges(recentPrices, pastPrices, recentShares, pastShares) {
  const changes = {};
  for (const [code, nowPrice] of recentPrices.entries()) {
    const pastPrice = pastPrices.get(code);
    if (!pastPrice) continue;

    const nowShares = recentShares.get(code);
    const pastSharesCount = pastShares.get(code);
    if (nowShares && pastSharesCount) {
      const shareDiffRatio = Math.abs(nowShares - pastSharesCount) / pastSharesCount;
      if (shareDiffRatio > SHARE_CHANGE_THRESHOLD) continue; // 감자/병합/증자 등 — 비교 불가
    }

    changes[code] = ((nowPrice - pastPrice) / pastPrice) * 100;
  }
  return changes;
}

// 최신 스냅샷에서 종목코드 -> 전일 대비 등락률(fltRt) 맵을 만듦. KRX가 직접
// 계산해서 주는 값이라 별도 비교 로직이 필요 없음.
function toDailyChangeMap(items) {
  const map = {};
  for (const it of items) {
    if (!it.srtnCd) continue;
    const pct = Number(it.fltRt);
    if (Number.isFinite(pct)) map[it.srtnCd] = pct;
  }
  return map;
}

// 최신 스냅샷 전체(테마 등록 여부와 무관하게 시장 전체)에서 전일 등락률
// 상위/하위 종목을 뽑아 "전일 급등주/급락주" 랭킹을 만듦. 거래량(trqu)이
// 0인 종목(거래정지 등으로 그날 매매가 없었던 종목)은 제외.
//
// [2026-09-08 추가] direction 파라미터 — 원래 상승률 기준(desc)만 있었는데,
// "마감시황" 자동 작성(app/api/daily-review/source-data)이 오늘 급락주도
// 같이 참고할 수 있게 하락률 기준(asc)도 뽑을 수 있게 함. 기본값은 기존
// 동작(desc) 그대로라 다른 호출부(프론트 등)엔 영향 없음.
function topDailyMovers(items, count, direction = "desc") {
  return items
    .filter((it) => it.srtnCd && it.itmsNm && Number.isFinite(Number(it.fltRt)) && Number(it.trqu) > 0)
    .map((it) => ({
      name: it.itmsNm,
      code: it.srtnCd,
      market: it.mrktCtg || null,
      change: Number(it.fltRt),
    }))
    .sort((a, b) => (direction === "asc" ? a.change - b.change : b.change - a.change))
    .slice(0, count);
}

// stockChanges(종목코드 -> 등락률)를 테마별로 집계.
function aggregateByTheme(stockChanges) {
  const themeAgg = new Map();
  for (const row of rawThemeData) {
    const pct = stockChanges[row.code];
    if (typeof pct !== "number") continue;
    if (!themeAgg.has(row.theme)) themeAgg.set(row.theme, { sum: 0, count: 0 });
    const agg = themeAgg.get(row.theme);
    agg.sum += pct;
    agg.count += 1;
  }
  return themeAgg;
}

export async function GET() {
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const monthAgo = new Date(now);
  monthAgo.setDate(monthAgo.getDate() - 30);

  // recent/week/month 셋 다 이제 같은 소스(KRX 정식 Open API)에서 가져옴.
  const [recent, week, month] = await Promise.all([
    fetchLatestAvailable(now),
    fetchLatestAvailable(weekAgo),
    fetchLatestAvailable(monthAgo),
  ]);

  // recent(오늘 기준 최신 시세)가 없으면 아무것도 계산할 수 없으니 진짜
  // 실패. 하지만 week나 month만 실패한 경우엔 — 예를 들어 KRX 쪽 일시적
  // 오류로 한쪽만 못 받아온 경우 — 굳이 화면 전체를 에러로 띄우지 않고,
  // 받아온 만큼만(예: 1일치만) 보여주고 나머지는 "데이터 없음"으로 둠.
  if (!recent) {
    console.error("theme-momentum: 최신 시세를 가져오지 못함 (KRX 정식 API 응답 오류)");
    return Response.json({ error: "시세 데이터를 가져오지 못했습니다." }, { status: 502 });
  }
  if (!week) console.error("theme-momentum: 1주일 전 시세를 가져오지 못함 — 1주일 등락률은 비어서 나감");
  if (!month) console.error("theme-momentum: 1개월 전 시세를 가져오지 못함 — 1개월 등락률은 비어서 나감");

  const recentPrices = toPriceMap(recent.items);
  const weekPrices = week ? toPriceMap(week.items) : new Map();
  const monthPrices = month ? toPriceMap(month.items) : new Map();

  const recentShares = toSharesMap(recent.items);
  const weekShares = week ? toSharesMap(week.items) : new Map();
  const monthShares = month ? toSharesMap(month.items) : new Map();

  const stockChanges1D = toDailyChangeMap(recent.items);
  const stockChanges1W = week ? computeChanges(recentPrices, weekPrices, recentShares, weekShares) : {};
  const stockChanges1M = month ? computeChanges(recentPrices, monthPrices, recentShares, monthShares) : {};

  const themeAgg1D = aggregateByTheme(stockChanges1D);
  const themeAgg1W = aggregateByTheme(stockChanges1W);
  const themeAgg1M = aggregateByTheme(stockChanges1M);

  const themeNames = new Set([...themeAgg1D.keys(), ...themeAgg1W.keys(), ...themeAgg1M.keys()]);
  const themeChanges = Array.from(themeNames).map((theme) => {
    const d = themeAgg1D.get(theme);
    const w = themeAgg1W.get(theme);
    const m = themeAgg1M.get(theme);
    return {
      theme,
      change1D: d ? d.sum / d.count : null,
      sampleSize1D: d ? d.count : 0,
      change1W: w ? w.sum / w.count : null,
      sampleSize1W: w ? w.count : 0,
      change1M: m ? m.sum / m.count : null,
      sampleSize1M: m ? m.count : 0,
    };
  });

  const dailyMovers = topDailyMovers(recent.items, 20, "desc");
  // [2026-09-08 추가] 마감시황 자동 작성용 — 급락주 랭킹.
  const dailyLosers = topDailyMovers(recent.items, 20, "asc");

  return Response.json(
    {
      recentBasDt: recent.basDt,
      weekBasDt: week ? week.basDt : null,
      monthBasDt: month ? month.basDt : null,
      themeChanges,
      stockChanges1D,
      stockChanges1W,
      stockChanges1M,
      dailyMovers,
      dailyLosers,
    },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=1800, stale-while-revalidate=3600" } }
  );
}
