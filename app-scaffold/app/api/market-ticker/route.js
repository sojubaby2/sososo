// GET /api/market-ticker
//
// Combines 원/달러·원/엔 환율(한국수출입은행) + 금 시세(gold-api.com) + WTI·브렌트유
// 국제유가(FRED, 미 연준 세인트루이스 지점) for the header ticker strip. Bank FX
// rates and FRED oil series update once a day (not published on weekends/
// holidays — same "walk back to the last day with data" pattern used
// elsewhere), gold is close to real-time. Cached a few hours since none of
// this needs to be second-by-second fresh.
//
// 두바이유는 일부러 뺐음: 무료로 매일 갱신되는 신뢰할 만한 공식 API가 없어서
// (FRED에 있긴 하지만 IMF 월간 집계라 최대 한 달 넘게 지연됨) — WTI·브렌트유만
// 매일 갱신되는 걸로 통일.
//
// force-dynamic: without this, Next.js treats this route as static-eligible
// (no `request` param, cacheable fetch options) and tries to call the
// external FX/gold APIs once at BUILD time to prerender it. That build-time
// call can fail in Cloudflare's build environment ("fetch failed"), which
// fails the whole deploy. Forcing dynamic means it only ever runs per
// request, same as every other API route in this app.
export const dynamic = "force-dynamic";

export const preferredRegion = "icn1";

function toYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${dd}`;
}

function* businessDaysFrom(from) {
  const d = new Date(from);
  while (true) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) yield toYmd(d);
    d.setDate(d.getDate() - 1);
  }
}

// 4s hard timeout per request — without this, a slow/hanging EXIM API call
// can chain into the serverless function's own timeout and take down the
// WHOLE route (including the gold price, which has nothing to do with FX)
// with an unhandled 500 instead of just leaving 환율 blank.
async function fetchExim(authkey, searchdate) {
  const qs = new URLSearchParams({ authkey, searchdate, data: "AP01" });
  const url = `https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON?${qs.toString()}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(url, { next: { revalidate: 10800 }, signal: controller.signal }); // 3h cache
    if (!res.ok) return { ok: false, status: res.status };
    try {
      const json = await res.json();
      return { ok: true, json };
    } catch {
      return { ok: false, status: res.status, parseError: true };
    }
  } catch (err) {
    return {
      ok: false,
      timeout: err?.name === "AbortError",
      errorName: err?.name || null,
      errorMessage: err?.message || String(err),
      errorCause: err?.cause?.message || err?.cause?.code || null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// Was a sequential loop (up to 7 awaited calls back-to-back — worst case
// ~28s+ before the timeout fix, easily enough to trip a platform timeout on
// its own). Fired in parallel instead: total wall time is now bounded by one
// request's latency (~4s max), not the sum of up to 7 of them.
async function fetchLatestExim(authkey) {
  const gen = businessDaysFrom(new Date());
  const dates = [];
  for (let i = 0; i < 7; i++) dates.push(gen.next().value);

  const attempts = await Promise.all(
    dates.map(async (date) => ({ date, result: await fetchExim(authkey, date) }))
  );
  for (const { date, result } of attempts) {
    if (result.ok && Array.isArray(result.json) && result.json.length > 0) {
      return { data: result.json, date };
    }
  }
  return { data: null, lastAttempt: attempts[0] };
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

// FRED daily series: DCOILWTICO (WTI, Cushing OK) / DCOILBRENTEU (Brent, Europe).
// Same "ask for the last few observations and skip holiday gaps" pattern as
// the EXIM 환율 lookup — FRED returns "." for a day with no published value
// instead of omitting the row, so we can't just take observations[0].
async function fetchFredLatest(seriesId, apiKey) {
  const qs = new URLSearchParams({
    series_id: seriesId,
    api_key: apiKey,
    file_type: "json",
    sort_order: "desc",
    limit: "5",
  });
  const url = `https://api.stlouisfed.org/fred/series/observations?${qs.toString()}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(url, { next: { revalidate: 10800 }, signal: controller.signal });
    if (!res.ok) return null;
    const data = await res.json();
    const obs = (data?.observations || []).find((o) => o.value && o.value !== ".");
    if (!obs) return null;
    const value = parseFloat(obs.value);
    return Number.isFinite(value) ? { value, date: obs.date } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function parseRate(row) {
  if (!row?.deal_bas_r) return null;
  const n = parseFloat(String(row.deal_bas_r).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

export async function GET() {
  const authkey = process.env.EXIM_API_KEY;
  const fredKey = process.env.FRED_API_KEY;
  const result = { usd: null, jpy: null, gold: null, wti: null, brent: null, fxDate: null };

  // Each block is isolated in its own try/catch: an EXIM outage should never
  // be able to crash the gold price (or the whole route) and vice versa —
  // worst case is one field missing, never a 500.
  try {
    if (!authkey) {
      result.fxError = "EXIM_API_KEY 환경변수가 설정되지 않았습니다.";
    } else {
      const exim = await fetchLatestExim(authkey);
      if (exim.data) {
        result.fxDate = exim.date;
        result.usd = parseRate(exim.data.find((r) => r.cur_unit === "USD"));
        result.jpy = parseRate(exim.data.find((r) => r.cur_unit === "JPY(100)"));
      } else {
        result.fxError = "7영업일 내에 환율 데이터를 찾지 못했습니다.";
        result.fxDebug = exim.lastAttempt;
      }
    }
  } catch (err) {
    result.fxError = `환율 조회 중 오류: ${err?.message || "알 수 없는 오류"}`;
  }

  try {
    result.gold = await fetchGold();
  } catch (err) {
    result.goldError = `금 시세 조회 중 오류: ${err?.message || "알 수 없는 오류"}`;
  }

  try {
    if (!fredKey) {
      result.oilError = "FRED_API_KEY 환경변수가 설정되지 않았습니다.";
    } else {
      const [wti, brent] = await Promise.all([
        fetchFredLatest("DCOILWTICO", fredKey),
        fetchFredLatest("DCOILBRENTEU", fredKey),
      ]);
      if (wti) {
        result.wti = wti.value;
        result.wtiDate = wti.date;
      }
      if (brent) {
        result.brent = brent.value;
        result.brentDate = brent.date;
      }
    }
  } catch (err) {
    result.oilError = `국제유가 조회 중 오류: ${err?.message || "알 수 없는 오류"}`;
  }

  return Response.json(result, {
    headers: { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600" },
  });
}
