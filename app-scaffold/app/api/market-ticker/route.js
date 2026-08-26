// GET /api/market-ticker
//
// Combines 원/달러·원/엔 환율(한국수출입은행) + 금 시세(gold-api.com) for the
// header ticker strip. Bank FX rates update once a day (not published on
// weekends/holidays — same "walk back to the last business day with data"
// pattern used elsewhere), gold is close to real-time. Cached a few hours
// since none of this needs to be second-by-second fresh.

function toYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${dd}`;
}

// Yields today, then each earlier business day (skips Sat/Sun).
function* businessDaysFrom(from) {
  const d = new Date(from);
  while (true) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) yield toYmd(d);
    d.setDate(d.getDate() - 1);
  }
}

async function fetchExim(authkey, searchdate) {
  const qs = new URLSearchParams({ authkey, searchdate, data: "AP01" });
  const url = `https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON?${qs.toString()}`;
  const res = await fetch(url, { next: { revalidate: 10800 } }); // 3h cache
  if (!res.ok) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchLatestExim(authkey) {
  const gen = businessDaysFrom(new Date());
  for (let i = 0; i < 7; i++) {
    const date = gen.next().value;
    const data = await fetchExim(authkey, date);
    if (Array.isArray(data) && data.length > 0) return { data, date };
  }
  return null;
}

async function fetchGold() {
  try {
    const res = await fetch("https://api.gold-api.com/price/XAU", { next: { revalidate: 300 } });
    const data = await res.json();
    return data?.price ?? data?.rates?.XAU ?? null;
  } catch {
    return null;
  }
}

function parseRate(row) {
  if (!row?.deal_bas_r) return null;
  const n = parseFloat(String(row.deal_bas_r).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

export async function GET() {
  const authkey = process.env.EXIM_API_KEY;
  const result = { usd: null, jpy: null, gold: null, fxDate: null };

  if (authkey) {
    const exim = await fetchLatestExim(authkey);
    if (exim) {
      result.fxDate = exim.date;
      result.usd = parseRate(exim.data.find((r) => r.cur_unit === "USD"));
      // JPY is quoted per 100 yen by convention (both by the bank and by
      // Korean media) — displayed as-is, not divided down to per-1-yen.
      result.jpy = parseRate(exim.data.find((r) => r.cur_unit === "JPY(100)"));
    }
  }

  result.gold = await fetchGold();

  return Response.json(result);
}
