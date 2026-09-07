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
// 전일 등락률(change1D)은 스냅샷을 새로 안 받아옴 — KRX가 최신 스냅샷
// (recent.items)에 이미 "전일 대비 등락률"(fltRt)을 계산해서 넣어주기
// 때문에 그냥 그 값을 그대로 씀. 이 값은 KRX 쪽에서 감자/병합 등이 있으면
// 기준가를 다시 잡아서 계산하므로, 우리가 직접 두 종가를 빼서 만드는
// 1주일/1개월 수치와 달리 상장주식수 필터가 따로 필요 없음.
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
// [2026-09-07 변경] 시세 데이터 출처를 공공데이터포털(apis.data.go.kr)
// 에서 한국거래소(KRX) 정보데이터시스템(data.krx.co.kr)으로 교체함.
// apis.data.go.kr이 클라우드(Vercel) 서버 트래픽을 막기 시작해서 이 기능
// 전체가 죽어있었음(lib/newsPipeline.js와 동일한 증상). data.krx.co.kr은
// KRX 홈페이지 자체가 화면에 표를 그릴 때 쓰는 내부 API라, 이 API가 막히면
// KRX 홈페이지 자체가 안 되는 셈이라 상대적으로 막힐 가능성이 낮을 걸로
// 보임 — 다만 실제로 막히는지는 배포해서 확인하기 전엔 확신할 수 없음.
// 혹시 이것도 막히면 최신 스냅샷(recent) 쪽에서 바로 에러가 날 테니 Vercel
// Logs에서 바로 알 수 있음.
//
// 날짜(trdDd)별로 그 날 하루치 전 종목 시세를 한 번에 받아옴(KOSPI·KOSDAQ
// 각각 한 번씩, 총 2번 호출) — 예전 apis.data.go.kr 응답과 필드 이름이
// 달라서, normalizeKrxRow()로 예전 필드 이름(srtnCd/itmsNm/mrktCtg/clpr/
// fltRt/lstgStCnt/trqu)에 맞춰 변환함. 그래서 이 밑의 계산 로직
// (toPriceMap, computeChanges, aggregateByTheme 등)은 전혀 안 건드림.
export const dynamic = "force-dynamic";

import rawThemeData from "../../../lib/themeData.json";

// 상장주식수가 두 시점 사이에 이 비율 이상 달라지면 감자/병합/증자 등으로
// 보고, 가격 비교 대상에서 제외함. 상장주식수는 평소엔 거의 안 바뀌므로
// 넉넉하게 잡아도(0.5%) 오탐은 거의 없음.
const SHARE_CHANGE_THRESHOLD = 0.005;

function toBasDt(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${dd}`;
}

function* businessDaysBackFrom(from) {
  const d = new Date(from);
  while (true) {
    d.setDate(d.getDate() - 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) yield toBasDt(d);
  }
}

const KRX_JSON_URL = "https://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd";
const KRX_ALL_STOCKS_BLD = "dbms/MDC/STAT/standard/MDCSTAT01501";

// KRX 홈페이지 자신이 표를 그릴 때 보내는 것과 똑같은 헤더(Referer,
// X-Requested-With)를 안 보내면 KRX 쪽에서 요청을 거부함.
async function fetchKrxDailyMarket(trdDd, mktId) {
  const params = new URLSearchParams({ bld: KRX_ALL_STOCKS_BLD, mktId, trdDd });
  const res = await fetch(KRX_JSON_URL, {
    method: "POST",
    headers: {
      // [2026-09-07 변경] "newsmeme-bot/1.0"이라고 자기소개하는 User-Agent를
      // 썼었는데, 이게 KRX 쪽에서 "이건 자동화 프로그램이다"라고 걸러내는
      // 신호가 됐을 가능성이 높아서(status 400이 KRX 홈페이지가 사람이
      // 직접 브라우저로 접속했을 때 쓰는 것과 똑같은 실제 브라우저
      // User-Agent로 바꿈 — 다른 회사/공공기관 API에서도 자주 있는
      // 패턴이라 우선 이걸로 시도해봄.
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      Accept: "application/json, text/javascript, */*; q=0.01",
      Referer: "https://data.krx.co.kr/contents/MDC/MDI/outerLoader/index.cmd",
      "X-Requested-With": "XMLHttpRequest",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
    cache: "no-store",
  });
  if (!res.ok) {
    // 응답 본문에 KRX 쪽이 왜 거부했는지 힌트가 들어있는 경우가 많아서,
    // 다음에 또 실패하면 바로 원인을 알 수 있게 앞부분만 같이 남김.
    const bodyText = await res.text().catch(() => "");
    throw new Error(`KRX 데이터 요청 오류 (status ${res.status}): ${bodyText.slice(0, 200)}`);
  }
  const data = await res.json();
  return Array.isArray(data?.OutBlock_1) ? data.OutBlock_1 : [];
}

// data.krx.co.kr이 가끔 일시적으로 응답을 안 주는 경우가 있어서, 한 번
// 실패하면 짧게 쉬었다가 한 번만 더 시도함 — 매 시도마다 계속 재시도하면
// 오히려 더 막힐 수 있어서 딱 1회만.
async function fetchKrxDailyMarketWithRetry(trdDd, mktId) {
  try {
    return await fetchKrxDailyMarket(trdDd, mktId);
  } catch (err) {
    console.error(`theme-momentum: KRX 요청 실패, 0.5초 후 1회 재시도 (${trdDd}/${mktId}):`, err.message || err);
    await new Promise((resolve) => setTimeout(resolve, 500));
    return fetchKrxDailyMarket(trdDd, mktId);
  }
}

function parseKrxNum(v) {
  if (v === undefined || v === null) return NaN;
  const cleaned = String(v).replace(/,/g, "").trim();
  if (cleaned === "" || cleaned === "-") return NaN;
  return Number(cleaned);
}

// data.krx.co.kr 필드명 -> 예전 apis.data.go.kr 필드명으로 변환.
function normalizeKrxRow(row, marketLabel) {
  if (!row?.ISU_SRT_CD || !row?.ISU_ABBRV) return null;
  return {
    srtnCd: row.ISU_SRT_CD,
    itmsNm: row.ISU_ABBRV,
    mrktCtg: marketLabel,
    clpr: parseKrxNum(row.TDD_CLSPRC),
    fltRt: parseKrxNum(row.FLUC_RT),
    lstgStCnt: parseKrxNum(row.LIST_SHRS),
    trqu: parseKrxNum(row.ACC_TRDVOL),
  };
}

async function fetchStockPage(trdDd) {
  const [stk, ksq] = await Promise.all([
    fetchKrxDailyMarketWithRetry(trdDd, "STK"),
    fetchKrxDailyMarketWithRetry(trdDd, "KSQ"),
  ]);
  const items = [
    ...stk.map((r) => normalizeKrxRow(r, "KOSPI")),
    ...ksq.map((r) => normalizeKrxRow(r, "KOSDAQ")),
  ].filter(Boolean);
  return items;
}

async function fetchLatestAvailable(startFrom) {
  const gen = businessDaysBackFrom(startFrom);
  for (let i = 0; i < 6; i++) {
    const basDt = gen.next().value;
    let items;
    try {
      items = await fetchStockPage(basDt);
    } catch (err) {
      console.error(`theme-momentum: KRX 요청 실패 (${basDt}):`, err.message || err);
      continue;
    }
    if (items.length > 0) return { items, basDt };
  }
  return null;
}

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
// 상위 종목을 뽑아 "전일 급등주" 랭킹을 만듦. 거래량(trqu)이 0인 종목(거래
// 정지 등으로 그날 매매가 없었던 종목)은 제외.
function topDailyMovers(items, count) {
  return items
    .filter((it) => it.srtnCd && it.itmsNm && Number.isFinite(Number(it.fltRt)) && Number(it.trqu) > 0)
    .map((it) => ({
      name: it.itmsNm,
      code: it.srtnCd,
      market: it.mrktCtg || null,
      change: Number(it.fltRt),
    }))
    .sort((a, b) => b.change - a.change)
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

  const [recent, week, month] = await Promise.all([
    fetchLatestAvailable(now),
    fetchLatestAvailable(weekAgo),
    fetchLatestAvailable(monthAgo),
  ]);

  // recent(오늘 기준 최신 시세)가 없으면 아무것도 계산할 수 없으니 진짜
  // 실패. 하지만 week나 month만 실패한 경우엔 — 예를 들어 KRX 쪽 일시적
  // 오류로 한쪽만 못 받아온 경우 — 굳이 화면 전체를 에러로 띄우지 않고,
  // 받아온 만큼만(예: 1일치만) 보여주고 나머지는 "데이터 없음"으로 둠.
  // [2026-09-07 변경] 예전엔 셋 중 하나라도 실패하면 무조건 502를 반환해서
  // week/month 쪽 일시적 오류 하나로 테마 페이지 전체가 에러 배너만 뜨는
  // 문제가 있었음 — 이렇게 부분 실패를 허용하도록 고침.
  if (!recent) {
    console.error("theme-momentum: 최신 시세를 가져오지 못함");
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

  const dailyMovers = topDailyMovers(recent.items, 20);

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
    },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=1800, stale-while-revalidate=3600" } }
  );
}
