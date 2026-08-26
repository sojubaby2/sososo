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
  if (!res.ok) return { ok: false, status: res.status };
  try {
    const json = await res.json();
    return { ok: true, json };
  } catch {
    return { ok: false, status: res.status, parseError: true };
  }
}

async function fetchLatestExim(authkey) {
  const gen = businessDaysFrom(new Date());
  let lastAttempt = null;
  for (let i = 0; i < 7; i++) {
    const date = gen.next().value;
    const result = await fetchExim(authkey, date);
    lastAttempt = { date, result };
    if (result.ok && Array.isArray(result.json) && result.json.length > 0) {
      return { data: result.json, date };
    }
  }
  return { data: null, lastAttempt };
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

  if (!authkey) {
    result.fxError = "EXIM_API_KEY 환경변수가 설정되지 않았습니다.";
  } else {
    const exim = await fetchLatestExim(authkey);
    if (exim.data) {
      result.fxDate = exim.date;
      result.usd = parseRate(exim.data.find((r) => r.cur_unit === "USD"));
      // JPY is quoted per 100 yen by convention (both by the bank and by
      // Korean media) — displayed as-is, not divided down to per-1-yen.
      result.jpy = parseRate(exim.data.find((r) => r.cur_unit === "JPY(100)"));
    } else {
      // Surface exactly what the last attempt returned, so a bad key vs an
      // empty/holiday response are distinguishable instead of both being null.
      result.fxError = "7영업일 내에 환율 데이터를 찾지 못했습니다.";
      result.fxDebug = exim.lastAttempt;
    }
  }

  result.gold = await fetchGold();

  return Response.json(result);
}
