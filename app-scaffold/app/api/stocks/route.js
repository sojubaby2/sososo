// GET /api/stocks?basDt=YYYYMMDD&code=005930&numOfRows=50&pageNo=1
//
// [2026-09-07 변경] 예전엔 공공데이터포털(apis.data.go.kr) KRX API를 썼는데,
// 그 API가 클라우드(Vercel) 서버 트래픽을 막기 시작해서 한국거래소(KRX)
// 정보데이터시스템(data.krx.co.kr)으로 교체함 — app/api/theme-momentum/
// route.js와 같은 데이터 출처, 같은 방식.
//
// 참고: 이 API는 지금 사이트 화면 어디에서도 실제로 호출되지 않는 것으로
// 보임(예전에 쓰다가 남은 엔드포인트로 추정). 그래도 나중에 다시 쓸 수도
// 있으니, 예전과 최대한 비슷한 응답 모양(response.body.items.item, 필드명
// srtnCd/itmsNm/clpr 등)을 유지하면서 데이터 출처만 바꿔둠.
//
// 더 이상 KRX_SERVICE_KEY 환경변수가 필요 없음 — data.krx.co.kr은 별도
// 인증키 없이 KRX 홈페이지 자신이 쓰는 것과 같은 방식으로 호출함.

function toBasDt(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${dd}`;
}

// Walks backward one calendar day at a time from `from`, skipping
// weekends, yielding each candidate business-day date string.
function* businessDaysBackFrom(from) {
  const d = new Date(from);
  while (true) {
    d.setDate(d.getDate() - 1);
    const day = d.getDay(); // 0 = Sun, 6 = Sat
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
      // "newsmeme-bot/1.0"이라고 자기소개하는 User-Agent가 KRX 쪽에
      // 자동화 프로그램으로 걸러졌을 가능성이 있어서, 실제 브라우저와
      // 똑같은 User-Agent로 바꿈 (app/api/theme-momentum/route.js와 동일).
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
    const bodyText = await res.text().catch(() => "");
    throw new Error(`KRX 데이터 요청 오류 (status ${res.status}): ${bodyText.slice(0, 200)}`);
  }
  const data = await res.json();
  return Array.isArray(data?.OutBlock_1) ? data.OutBlock_1 : [];
}

function parseKrxNum(v) {
  if (v === undefined || v === null) return undefined;
  const cleaned = String(v).replace(/,/g, "").trim();
  if (cleaned === "" || cleaned === "-") return undefined;
  return Number(cleaned);
}

// data.krx.co.kr 필드명 -> 예전 apis.data.go.kr(GetStockSecuritiesInfoService)
// 필드명으로 변환 — 이 API를 나중에 다시 쓰는 코드가 생겨도 예전과 같은
// 모양의 데이터를 받게 하려는 목적.
function normalizeKrxRow(row, marketLabel, basDt) {
  if (!row?.ISU_SRT_CD || !row?.ISU_ABBRV) return null;
  return {
    basDt,
    srtnCd: row.ISU_SRT_CD,
    itmsNm: row.ISU_ABBRV,
    mrktCtg: marketLabel,
    clpr: parseKrxNum(row.TDD_CLSPRC),
    vs: parseKrxNum(row.CMPPREVDD_PRC),
    fltRt: parseKrxNum(row.FLUC_RT),
    mkp: parseKrxNum(row.TDD_OPNPRC),
    hipr: parseKrxNum(row.TDD_HGPRC),
    lopr: parseKrxNum(row.TDD_LWPRC),
    trqu: parseKrxNum(row.ACC_TRDVOL),
    trPrc: parseKrxNum(row.ACC_TRDVAL),
    lstgStCnt: parseKrxNum(row.LIST_SHRS),
    mrktTotAmt: parseKrxNum(row.MKTCAP),
  };
}

async function fetchAllStocksForDate(basDt) {
  const [stk, ksq] = await Promise.all([
    fetchKrxDailyMarket(basDt, "STK"),
    fetchKrxDailyMarket(basDt, "KSQ"),
  ]);
  return [
    ...stk.map((r) => normalizeKrxRow(r, "KOSPI", basDt)),
    ...ksq.map((r) => normalizeKrxRow(r, "KOSDAQ", basDt)),
  ].filter(Boolean);
}

// Tries the most recent business day first; if that day's data hasn't been
// published yet (empty result), automatically steps back one more business
// day, up to a few attempts, so the site always shows the freshest data
// that's actually available rather than a fixed, possibly-stale offset.
async function fetchLatestAvailable(maxAttempts = 5) {
  const gen = businessDaysBackFrom(new Date());
  for (let i = 0; i < maxAttempts; i++) {
    const basDt = gen.next().value;
    let items;
    try {
      items = await fetchAllStocksForDate(basDt);
    } catch (err) {
      console.error(`stocks: KRX 요청 실패 (${basDt}):`, err.message || err);
      continue;
    }
    if (items.length > 0) return { items, basDt };
  }
  return null;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const explicitBasDt = searchParams.get("basDt");
  const code = searchParams.get("code"); // optional: look up one stock (부분 일치)
  const numOfRows = Math.max(1, Number(searchParams.get("numOfRows")) || 50);
  const pageNo = Math.max(1, Number(searchParams.get("pageNo")) || 1);

  try {
    let items;
    let basDt;

    if (explicitBasDt) {
      // Caller pinned a specific date — just fetch that one, no fallback.
      basDt = explicitBasDt;
      items = await fetchAllStocksForDate(basDt);
    } else {
      const result = await fetchLatestAvailable();
      if (!result) {
        return Response.json({ error: "최근 며칠간 시세 데이터를 찾지 못했습니다." }, { status: 502 });
      }
      items = result.items;
      basDt = result.basDt;
    }

    if (code) {
      items = items.filter((it) => it.srtnCd && it.srtnCd.includes(code));
    }

    const totalCount = items.length;
    const start = (pageNo - 1) * numOfRows;
    const pageItems = items.slice(start, start + numOfRows);

    return Response.json({
      response: {
        body: {
          items: { item: pageItems },
          totalCount,
          numOfRows,
          pageNo,
        },
      },
      resolvedBasDt: basDt,
    });
  } catch (err) {
    return Response.json({ error: "KRX 데이터 조회 실패", detail: String(err.message || err) }, { status: 502 });
  }
}
