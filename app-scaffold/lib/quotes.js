// lib/quotes.js
//
// [2026-10-19 신설] 종목·ETF의 "오늘 시세"를 가져오는 곳입니다.
//
// 왜 만들었나:
// 뉴스 카드에 붙는 종목 등락률은 지금까지 기사가 올라온 "그 순간"에 한 번
// 찍어둔 값이었습니다(lib/newsPipeline.js의 finalizeMatches). 아침에 올라온
// 기사를 오후에 보면 그때 숫자가 그대로 남아 있습니다. 홈 화면 맨 위 문장
// ("오늘 시장을 움직인 건 ○○이었습니다")을 등락률로 판단하려면 지금 이
// 순간의 값이 필요해서 따로 만들었습니다.
//
// 어디서 가져오나 — 야후 파이낸스:
// 2026-10-17에 세계 지수를 야후로 옮기면서 Vercel에서 잘 동작하는 것을
// 확인했고, 국내 종목도 재성님이 직접 열어서 확인했습니다.
//   · 코스피 종목 → 005930.KS
//   · 코스닥 종목 → 003280.KQ
//   · 미국 ETF   → BOTZ
//
// 지연: 실시간 체결가가 아니라 15~20분 지연된 참고값입니다.
//
// 비용: 종목 하나당 요청 하나지만, 아래 CACHE_SECONDS 덕분에 같은 종목은
// 5분에 한 번만 실제로 나갑니다. 방문자가 몇 명이든 똑같습니다. 그리고
// "홈 화면에 실제로 보이는 종목"만 조회합니다(전 종목이 아닙니다).
//
// 꼭 알아야 할 함정 두 가지 — 둘 다 실제로 겪은 것입니다:
//
//  ① chartPreviousClose를 쓰면 안 됩니다.
//     이름만 보면 "전일 종가" 같지만 실제로는 조회 구간(5일) 시작 전의
//     종가입니다. HMM으로 확인해보면 실제 +2.1%인데 이 값으로 계산하면
//     +10%가 나옵니다. regularMarketChangePercent를 써야 합니다.
//
//  ② 가끔 몇 년 전 값이 그대로 나오는 종목이 있습니다.
//     흥아해운(003280)을 열어보니 2024년 7월 시세가 "현재가"로 왔습니다
//     (거래정지 같은 사정으로 야후 쪽 데이터가 멈춘 경우로 보입니다).
//     그대로 쓰면 2년 전 가격을 오늘 가격처럼 보여주게 되고, 평균 등락률
//     계산까지 틀어집니다. 그래서 아래에서 날짜를 확인해 오래된 값은
//     아예 버립니다(그 종목만 "—"로 비워집니다).

const YAHOO_URL = "https://query1.finance.yahoo.com/v8/finance/chart";

// 같은 종목을 다시 부르지 않고 저장된 값을 쓰는 시간(초).
const CACHE_SECONDS = 300; // 5분

// 한 번의 요청이 이 시간을 넘기면 포기합니다. 종목 하나가 느리다는 이유로
// 홈 화면 전체가 늦어지면 안 되기 때문입니다.
const REQUEST_TIMEOUT_MS = 5000;

// 데이터가 이 날수보다 오래됐으면 버립니다(위 ② 함정 방어).
const MAX_STALE_DAYS = 5;

// 한 번에 동시에 보낼 요청 수. 너무 많이 한꺼번에 보내면 야후가 일부를
// 튕겨냅니다(세계 지수에서 대만·인도가 간헐적으로 비던 것이 이 현상이었음).
const BATCH_SIZE = 8;

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

function toNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// 종목코드 + 시장이름 -> 야후 기호.
// market 값은 피드에 "코스피" / "코스닥" 으로 들어옵니다.
export function toYahooSymbol(code, market) {
  const c = String(code || "").trim();
  if (!/^[0-9A-Za-z]{6}$/.test(c)) return null; // 우선주·신주인수권 등 이상한 코드 방어
  return String(market || "").includes("닥") ? `${c}.KQ` : `${c}.KS`;
}

async function fetchOne(symbol) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${YAHOO_URL}/${encodeURIComponent(symbol)}?range=5d&interval=1d`, {
      headers: { "User-Agent": BROWSER_UA, Accept: "application/json,text/plain,*/*" },
      signal: controller.signal,
      // Next.js가 이 응답을 5분 동안 저장해 둡니다 — 방문자가 몇 명이든
      // 바깥으로 나가는 요청은 5분에 한 번입니다.
      next: { revalidate: CACHE_SECONDS },
    });
    if (!res.ok) return null;

    const data = await res.json();
    const result = data?.chart?.result?.[0];
    const meta = result?.meta;
    if (!meta) return null;

    const price = toNum(meta.regularMarketPrice);
    if (price === null) return null;

    // ② 오래된 값 버리기.
    const ts = toNum(meta.regularMarketTime);
    if (!ts) return null;
    const ageDays = (Date.now() - ts * 1000) / 86400000;
    if (ageDays > MAX_STALE_DAYS) return null;

    // ① regularMarketChangePercent를 씁니다. 혹시 안 들어오면 종가 배열의
    // 마지막 둘을 직접 비교합니다(chartPreviousClose는 쓰지 않습니다).
    let changePct = toNum(meta.regularMarketChangePercent);
    if (changePct === null) {
      const closes = (result?.indicators?.quote?.[0]?.close || []).filter(
        (v) => typeof v === "number" && Number.isFinite(v)
      );
      if (closes.length >= 2) {
        const prev = closes[closes.length - 2];
        if (prev) changePct = ((price - prev) / prev) * 100;
      }
    }

    return {
      symbol,
      price,
      changePct,
      asOf: new Date(ts * 1000).toISOString(),
      name: meta.longName || meta.shortName || null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// 여러 기호를 나눠서 받아옵니다. 하나가 실패해도 나머지는 삽니다.
async function fetchMany(symbols) {
  const out = new Map();
  const unique = [...new Set(symbols.filter(Boolean))];

  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const slice = unique.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(slice.map((s) => fetchOne(s)));
    results.forEach((r, idx) => {
      if (r) out.set(slice[idx], r);
    });
  }

  // 실패한 것만 한 번 더 — 한꺼번에 많이 보내면 야후가 일부를 튕겨내는데,
  // 간격을 두고 다시 부르면 대개 들어옵니다.
  const missing = unique.filter((s) => !out.has(s));
  for (const s of missing) {
    await new Promise((r) => setTimeout(r, 150));
    const r = await fetchOne(s);
    if (r) out.set(s, r);
  }

  return out;
}

// 국내 종목 시세.
//   입력: [{ code, market }, ...]
//   출력: Map(종목코드 -> { price, changePct, asOf })
export async function fetchDomesticQuotes(stocks) {
  const bySymbol = new Map();
  for (const s of stocks || []) {
    const sym = toYahooSymbol(s.code, s.market);
    if (sym) bySymbol.set(sym, String(s.code));
  }
  if (bySymbol.size === 0) return new Map();

  const fetched = await fetchMany([...bySymbol.keys()]);

  const out = new Map();
  for (const [sym, code] of bySymbol) {
    const q = fetched.get(sym);
    if (q) out.set(code, { price: q.price, changePct: q.changePct, asOf: q.asOf });
  }
  return out;
}

// 미국 ETF 시세.
//   입력: ["BOTZ", "SMH", ...]
//   출력: Map(기호 -> { price, changePct, asOf })
export async function fetchEtfQuotes(symbols) {
  const fetched = await fetchMany(symbols || []);
  const out = new Map();
  for (const [sym, q] of fetched) {
    // name은 점검 창구(app/api/etf-check)에서 "코드가 맞는지" 확인하는 데
    // 씁니다 — 야후가 돌려준 실제 종목 이름입니다.
    out.set(sym, { price: q.price, changePct: q.changePct, asOf: q.asOf, name: q.name });
  }
  return out;
}
