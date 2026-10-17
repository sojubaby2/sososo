// lib/worldIndices.js
//
// [2026-10-17 신설] 홈 화면 맨 위의 "오늘의 세계증시" 지도에 쓸 지수 데이터를
// 모으는 파일입니다.
//
// 어디서 가져오나 — 두 군데를 섞어 씁니다(재성님이 고른 C안):
//  ① Stooq (stooq.com) — 무료, 인증키 불필요. 전 세계 주요 지수를 한 번의
//     요청으로 받아옵니다. 공식 거래소 시세가 아니라 15~20분 정도 지연된
//     값입니다. 비공식 서비스라 언제든 막힐 수 있습니다.
//  ② FRED (미국 세인트루이스 연방준비은행) — 공식 통계 서비스, 무료, 이미
//     FRED_API_KEY를 쓰고 있습니다. 전일 종가만 주지만 대단히 안정적입니다.
//
// 왜 섞나: Stooq가 막히면 지도가 통째로 비어버립니다. 그래서 다우·나스닥·
// 닛케이 같은 핵심 지수는 Stooq가 실패하면 FRED 값으로 대신 채웁니다.
// 나머지 나라는 Stooq가 실패하면 그 칸만 "—"로 비워둡니다(지도는 그대로).
//
// 비용: 이 함수는 app/api/world-indices/route.js에서만 호출되고, 그 주소에
// 5분짜리 캐시가 걸려 있습니다. 방문자가 몇 명이든 바깥 요청은 5분에 한 번뿐
// 입니다. Claude(AI) 비용과는 아무 관계가 없습니다.
//
// 처음 배포한 뒤 확인할 것:
// Stooq 종목기호가 바뀌거나 틀리면 그 나라만 "—"로 뜹니다. 그럴 때는
// https://newsmeme.co.kr/api/world-indices?debug=1 을 열어보면 어느 기호가
// 실패했는지 그대로 나옵니다. 아래 MARKETS 배열의 stooq 값만 고치면 됩니다.

// 지도에 표시할 나라들. x/y는 지도 SVG(가로 1000, 세로 500) 안에서의 위치라,
// 지도 그림을 바꾸지 않는 한 건드릴 일이 없습니다.
//
// region은 화면 위쪽 탭(전체/아시아/북아메리카/남아메리카/유럽)으로 거르는 데
// 씁니다.
export const MARKETS = [
  { key: "kr", label: "한국", flag: "🇰🇷", indexName: "코스피", region: "아시아", stooq: "^kospi", fred: null, x: 853, y: 146, tz: 9 },
  { key: "jp", label: "일본", flag: "🇯🇵", indexName: "닛케이225", region: "아시아", stooq: "^nkx", fred: "NIKKEI225", x: 888, y: 151, tz: 9 },
  { key: "cn", label: "중국", flag: "🇨🇳", indexName: "상하이종합", region: "아시아", stooq: "^shc", fred: null, x: 838, y: 163, tz: 8 },
  { key: "hk", label: "홍콩", flag: "🇭🇰", indexName: "항셍", region: "아시아", stooq: "^hsi", fred: null, x: 817, y: 188, tz: 8 },
  { key: "tw", label: "대만", flag: "🇹🇼", indexName: "가권", region: "아시아", stooq: "^twse", fred: null, x: 836, y: 184, tz: 8 },
  { key: "in", label: "인도", flag: "🇮🇳", indexName: "센섹스", region: "아시아", stooq: "^snx", fred: null, x: 703, y: 197, tz: 5.5 },
  { key: "gb", label: "영국", flag: "🇬🇧", indexName: "FTSE100", region: "유럽", stooq: "^ukx", fred: null, x: 500, y: 107, tz: 0 },
  { key: "de", label: "독일", flag: "🇩🇪", indexName: "DAX", region: "유럽", stooq: "^dax", fred: null, x: 537, y: 104, tz: 1 },
  { key: "us-dow", label: "미국-다우", flag: "🇺🇸", indexName: "다우존스", region: "북아메리카", stooq: "^dji", fred: "DJIA", x: 294, y: 137, tz: -5 },
  { key: "us-nasdaq", label: "미국-나스닥", flag: "🇺🇸", indexName: "나스닥", region: "북아메리카", stooq: "^ndq", fred: "NASDAQCOM", x: 312, y: 168, tz: -5 },
  { key: "br", label: "브라질", flag: "🇧🇷", indexName: "보베스파", region: "남아메리카", stooq: "^bvp", fred: null, x: 371, y: 315, tz: -3 },
];

const STOOQ_URL = "https://stooq.com/q/l/";
const FRED_URL = "https://api.stlouisfed.org/fred/series/observations";

// 아주 작은 CSV 한 줄 쪼개기. Stooq 응답에는 따옴표로 감싼 값이 거의 없지만,
// 혹시 들어와도 깨지지 않게 처리합니다.
function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuote = false;
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === "," && !inQuote) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function toNum(value) {
  const n = Number(String(value ?? "").trim());
  return Number.isFinite(n) ? n : null;
}

// Stooq에서 여러 지수를 한 번에 받아옵니다.
// 기호를 "+"로 이어 붙이면 한 요청으로 전부 받을 수 있어서, 나라 수만큼
// 요청을 날리지 않아도 됩니다.
//
// f=sd2t2ohlcvn 은 "기호, 날짜, 시각, 시가, 고가, 저가, 종가, 거래량, 이름"을
// 달라는 뜻입니다. 전일 종가는 안 주기 때문에, 등락률은 아래에서 시가 대비로
// 계산하지 않고 FRED나 직전 영업일 값과 비교하는 대신 Stooq가 주는 종가와
// 시가를 함께 내려보내 화면에서 판단할 수 있게 합니다.
async function fetchFromStooq(markets) {
  const symbols = markets.map((m) => m.stooq).filter(Boolean);
  if (symbols.length === 0) return { rows: {}, error: "기호 없음" };

  const url = `${STOOQ_URL}?s=${encodeURIComponent(symbols.join("+"))}&f=sd2t2ohlcv&h&e=csv`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; newsmeme-bot/1.0)" },
      // 바깥에서 5분 캐시를 하므로 여기서는 매번 새로 받아옵니다.
      cache: "no-store",
    });
    if (!res.ok) return { rows: {}, error: `요청 실패 (status ${res.status})` };

    const text = await res.text();
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return { rows: {}, error: "빈 응답" };

    const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
    const idx = (name) => header.indexOf(name);
    const iSym = idx("symbol");
    const iDate = idx("date");
    const iOpen = idx("open");
    const iClose = idx("close");

    const rows = {};
    for (const line of lines.slice(1)) {
      const cells = splitCsvLine(line);
      const symbol = String(cells[iSym] ?? "").trim().toLowerCase();
      if (!symbol) continue;
      const close = toNum(cells[iClose]);
      const open = toNum(cells[iOpen]);
      // Stooq는 값이 없을 때 "N/D"를 돌려줍니다 — 그런 줄은 버립니다.
      if (close === null) continue;
      rows[symbol] = { close, open, date: String(cells[iDate] ?? "").trim() };
    }
    return { rows, error: null };
  } catch (err) {
    return { rows: {}, error: String(err?.message || err) };
  }
}

// FRED에서 한 지수의 최근 관측값 2개를 가져옵니다(오늘과 직전 영업일).
// 전일 대비 등락률을 계산하려면 두 개가 필요합니다.
async function fetchFromFred(seriesId, apiKey) {
  if (!seriesId || !apiKey) return null;
  const qs = new URLSearchParams({
    series_id: seriesId,
    api_key: apiKey,
    file_type: "json",
    sort_order: "desc",
    limit: "5",
  });
  try {
    const res = await fetch(`${FRED_URL}?${qs.toString()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    // 값이 아직 안 들어온 날은 "."로 옵니다 — 걸러내고 숫자만 추립니다.
    const points = (data?.observations || [])
      .map((o) => ({ date: o.date, value: toNum(o.value) }))
      .filter((o) => o.value !== null);
    if (points.length < 2) return null;
    const [latest, prev] = points;
    return {
      close: latest.value,
      prevClose: prev.value,
      changePct: prev.value ? ((latest.value - prev.value) / prev.value) * 100 : null,
      date: latest.date,
    };
  } catch {
    return null;
  }
}

// 지도에 쓸 데이터를 한 번에 만들어 돌려줍니다.
//
// 반환 형태:
//   { generatedAt, items: [{ key, label, flag, indexName, region, x, y,
//                            close, changePct, source, asOf }], debug }
// changePct가 null이면 화면에서 "—"로 표시됩니다.
export async function buildWorldIndices() {
  const fredKey = process.env.FRED_API_KEY || "";

  const stooq = await fetchFromStooq(MARKETS);

  // Stooq는 전일 종가를 안 주기 때문에, 등락률은 FRED가 있는 지수만 정확히
  // 계산됩니다. 나머지는 Stooq의 시가 대비 변동으로 대신합니다 — 장중
  // 흐름을 보여주는 용도로는 충분하고, 화면에 기준을 함께 적어둡니다.
  const fredResults = {};
  await Promise.all(
    MARKETS.filter((m) => m.fred).map(async (m) => {
      fredResults[m.key] = await fetchFromFred(m.fred, fredKey);
    })
  );

  const debug = { stooqError: stooq.error, stooqSymbolsFound: Object.keys(stooq.rows), missing: [] };

  const items = MARKETS.map((m) => {
    const row = m.stooq ? stooq.rows[m.stooq.toLowerCase()] : null;
    const fred = fredResults[m.key] || null;

    let close = null;
    let changePct = null;
    let source = null;
    let basis = null;
    let asOf = null;

    if (row && row.close !== null) {
      close = row.close;
      source = "stooq";
      asOf = row.date || null;
      if (row.open) {
        changePct = ((row.close - row.open) / row.open) * 100;
        basis = "시가대비";
      }
      // FRED가 있으면 전일 종가 기준으로 바꿔 더 정확하게 표시합니다.
      if (fred && fred.prevClose) {
        changePct = ((row.close - fred.prevClose) / fred.prevClose) * 100;
        basis = "전일종가대비";
      }
    } else if (fred) {
      close = fred.close;
      changePct = fred.changePct;
      source = "fred";
      basis = "전일종가대비";
      asOf = fred.date;
    } else {
      debug.missing.push({ key: m.key, stooq: m.stooq });
    }

    return {
      key: m.key,
      label: m.label,
      flag: m.flag,
      indexName: m.indexName,
      region: m.region,
      x: m.x,
      y: m.y,
      close,
      changePct,
      source,
      basis,
      asOf,
    };
  });

  return { generatedAt: new Date().toISOString(), items, debug };
}
