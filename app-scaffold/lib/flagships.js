// lib/flagships.js
//
// [2026-10-26 신설] 홈 화면 "대표 종목" 칸 — 삼성전자·SK하이닉스의 국내 시세와
// 해외 시세를 함께 가져옵니다.
//
// 재성님 요청: "많이 불린 종목은 삭제하고, 그 자리에 삼성·하이닉스를 넣자.
//              해외 시세도 가져와서 보여주자."
//
// ── 해외에서 어디서 거래되나 ─────────────────────────────────────────────
//   · 삼성전자   → 런던 거래소 GDR(주식예탁증서), 기호 SMSN, 달러로 거래.
//                 GDR 1주 = 국내 보통주 25주.
//                 (예전에는 "GDR 1주 = 0.5주"였는데, 2018년 액면분할 50:1 이후
//                  0.5 × 50 = 25주가 됐습니다.)
//   · SK하이닉스 → 2026-07-10 미국 나스닥 상장 ADR, 기호 SKHY, 달러로 거래.
//                 ADR 10주 = 국내 1주 (ADR 1주 = 0.1주).
//
// ── 화면에 보여주는 것 ────────────────────────────────────────────────────
//   1. 국내 현재가와 등락률 (야후, 15~20분 지연)
//   2. 해외 가격을 "국내 1주 값"으로 바꾼 원화 금액
//      = 해외 가격 ÷ (해외 1주가 국내 몇 주인지) × 원/달러 환율
//   3. 그 원화 금액이 국내 종가보다 몇 % 높은지/낮은지
//      → 밤사이 해외 투자자들이 어떻게 반응했는지 = 다음 날 아침 참고값
//
// ── 비교 기준을 고르는 법 (중요) ─────────────────────────────────────────
//   해외 시세와 국내 시세 중 "어느 쪽이 더 최근 것인지"로 정합니다.
//   · 낮(국내 장 중): 해외 시세는 지난밤 것 → 국내 "전일 종가"와 비교해야
//     "밤사이 해외에서 얼마나 움직였나"가 됩니다.
//   · 저녁~새벽(해외 장 중), 주말: 해외 시세가 더 최근 → 국내 "마지막 종가"와 비교.
//
// ── 안전장치 ─────────────────────────────────────────────────────────────
//   · 비율(25주, 0.1주)이 혹시 바뀌면 환산값이 터무니없어집니다. 그래서
//     환산값이 국내 가격과 40% 넘게 차이 나면 "비율이 틀렸다"고 보고
//     환산·비교를 아예 하지 않고 해외 가격만 보여줍니다(틀린 숫자를
//     보여주는 것보다 안 보여주는 게 낫습니다).
//   · 야후가 응답을 안 주면 그 칸만 "—"로 비웁니다. 화면 전체가 멈추지 않습니다.
//   · 5일 넘게 오래된 값은 버립니다(lib/quotes.js와 같은 이유 — 야후가
//     가끔 옛날 값을 현재가처럼 줍니다).
//
// 비용: 야후 무료 시세라 돈이 들지 않습니다. 아래 CACHE_SECONDS 동안은 같은
// 값을 재사용하므로 방문자가 몇 명이든 바깥 요청은 1분에 한 번입니다.

const YAHOO_URL = "https://query1.finance.yahoo.com/v8/finance/chart";
const CACHE_SECONDS = 60;
const REQUEST_TIMEOUT_MS = 5000;
const MAX_STALE_DAYS = 5;
const MAX_RATIO_GAP = 0.4; // 환산값이 국내가와 40% 넘게 다르면 비율이 틀린 것으로 봄

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

// 대표 종목 목록. 나중에 종목을 더 넣고 싶으면 여기에 한 줄 추가하면 됩니다.
export const FLAGSHIPS = [
  {
    code: "005930",
    name: "삼성전자",
    domesticSymbol: "005930.KS",
    // [2026-10-27 수정] 야후는 런던 GDR(국제주문장)을 ".IL"로 적습니다. "SMSN.L"은
    // 야후에 없는 기호라 "해외 시세를 못 받아왔어요"가 떴습니다. 앞에서부터 차례로
    // 시도해서 먼저 값이 오는 기호를 씁니다.
    abroad: { symbols: ["SMSN.IL", "SMSN.L"], venue: "런던 GDR", ticker: "SMSN", sharesPerUnit: 25 },
  },
  {
    code: "000660",
    name: "SK하이닉스",
    domesticSymbol: "000660.KS",
    abroad: { symbols: ["SKHY"], venue: "나스닥", ticker: "SKHY", sharesPerUnit: 0.1 },
  },
];

// 후보 기호를 앞에서부터 차례로 시도해 처음 성공한 값을 돌려줍니다. 전부 실패하면 null.
async function fetchFirstQuote(symbols) {
  for (const s of symbols) {
    const q = await fetchQuote(s);
    if (q) return q;
  }
  return null;
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// 야후에서 기호 하나의 최신 값을 가져옵니다. 실패하면 null.
async function fetchQuote(symbol) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${YAHOO_URL}/${encodeURIComponent(symbol)}?range=5d&interval=1d`, {
      headers: { "User-Agent": BROWSER_UA, Accept: "application/json,text/plain,*/*" },
      signal: controller.signal,
      next: { revalidate: CACHE_SECONDS },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    const meta = result?.meta;
    if (!meta) return null;

    const price = toNum(meta.regularMarketPrice);
    const ts = toNum(meta.regularMarketTime);
    if (price === null || !ts) return null;
    if ((Date.now() - ts * 1000) / 86400000 > MAX_STALE_DAYS) return null;

    // 등락률: regularMarketChangePercent 우선. 없으면 최근 종가 둘을 비교.
    // (chartPreviousClose는 "5일 전 종가"라서 쓰면 안 됩니다 — lib/quotes.js 참고)
    let changePct = toNum(meta.regularMarketChangePercent);
    if (changePct === null) {
      const closes = (result?.indicators?.quote?.[0]?.close || []).filter((v) => typeof v === "number" && Number.isFinite(v));
      if (closes.length >= 2 && closes[closes.length - 2]) {
        changePct = ((price - closes[closes.length - 2]) / closes[closes.length - 2]) * 100;
      }
    }

    return { symbol, price, changePct, currency: meta.currency || null, asOf: new Date(ts * 1000).toISOString() };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// 해외 통화 → 원화 환율 기호. 런던은 가끔 "GBp"(펜스, 1/100파운드)로 옵니다.
function fxSymbolFor(currency) {
  if (!currency) return null;
  if (currency === "USD") return "KRW=X";
  if (currency === "GBp" || currency === "GBX") return "GBPKRW=X";
  return `${currency.toUpperCase()}KRW=X`;
}
function unitScale(currency) {
  return currency === "GBp" || currency === "GBX" ? 0.01 : 1; // 펜스 → 파운드
}

// 대표 종목 전체를 계산해서 돌려줍니다.
export async function fetchFlagships() {
  // 1단계: 국내·해외 시세를 한꺼번에 (해외는 후보 기호를 차례로 시도)
  const [domQuotes, abrQuotes] = await Promise.all([
    Promise.all(FLAGSHIPS.map((f) => fetchQuote(f.domesticSymbol))),
    Promise.all(FLAGSHIPS.map((f) => fetchFirstQuote(f.abroad.symbols))),
  ]);
  const domBy = new Map(FLAGSHIPS.map((f, i) => [f.code, domQuotes[i]]));
  const abrBy = new Map(FLAGSHIPS.map((f, i) => [f.code, abrQuotes[i]]));

  // 2단계: 필요한 환율만 가져오기 (보통 원/달러 하나)
  const fxSymbols = [...new Set(FLAGSHIPS.map((f) => fxSymbolFor(abrBy.get(f.code)?.currency)).filter(Boolean))];
  const fxQuotes = await Promise.all(fxSymbols.map((s) => fetchQuote(s)));
  const fx = new Map(fxSymbols.map((s, i) => [s, fxQuotes[i]?.price ?? null]));

  // 3단계: 종목별로 환산·비교
  const items = FLAGSHIPS.map((f) => {
    const dom = domBy.get(f.code);
    const abr = abrBy.get(f.code);

    const out = {
      code: f.code,
      name: f.name,
      domestic: dom ? { price: dom.price, changePct: dom.changePct, asOf: dom.asOf } : null,
      abroad: abr
        ? { venue: f.abroad.venue, ticker: f.abroad.ticker, price: abr.price, currency: abr.currency, changePct: abr.changePct, asOf: abr.asOf, krwPerShare: null, gapPct: null, gapBase: null }
        : null,
    };

    if (dom && abr) {
      const rate = fx.get(fxSymbolFor(abr.currency));
      if (rate) {
        // 해외 1주 가격 → 국내 1주 값(원)
        const krw = ((abr.price * unitScale(abr.currency)) / f.abroad.sharesPerUnit) * rate;

        // 비교 기준: 해외 값이 더 최근이면 국내 현재가(=오늘 종가), 아니면 국내 전일 종가
        const abroadNewer = new Date(abr.asOf) > new Date(dom.asOf);
        const prevClose = typeof dom.changePct === "number" ? dom.price / (1 + dom.changePct / 100) : null;
        const base = abroadNewer ? dom.price : prevClose;

        // 안전장치: 비율이 틀렸으면 환산하지 않음
        if (Math.abs(krw / dom.price - 1) <= MAX_RATIO_GAP) {
          out.abroad.krwPerShare = Math.round(krw);
          if (base) {
            out.abroad.gapPct = (krw / base - 1) * 100;
            out.abroad.gapBase = abroadNewer ? "국내 마지막 종가" : "국내 전일 종가";
          }
        }
      }
    }
    return out;
  });

  return { items, fetchedAt: new Date().toISOString() };
}
