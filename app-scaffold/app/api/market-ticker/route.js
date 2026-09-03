// GET /api/market-ticker
//
// Combines 원/달러·원/엔 환율(Frankfurter, ECB 기준) + 금 시세(gold-api.com) +
// WTI·브렌트유 국제유가(FRED, 미 연준 세인트루이스 지점) for the header ticker
// strip. FX/oil series update once a day (not published on weekends/
// holidays), gold is close to real-time. Cached a few hours since none of
// this needs to be second-by-second fresh.
//
// 환율 출처를 한국수출입은행에서 Frankfurter(ECB 기준 환율, 키 불필요)로
// 교체함: 수출입은행 서버가 클라우드/해외발 트래픽을 광범위하게 막고 있어서
// (Vercel에서는 "fetch failed / ECONNRESET", Cloudflare에서는 HTTP 525 SSL
// handshake 실패로 확인 — 리전을 서울로 고정해도 동일) 어느 플랫폼에서도
// 안정적으로 호출할 수 없었음. Frankfurter는 ECB가 매 영업일 발표하는
// 공개 데이터로, 수출입은행 고시환율과 완전히 동일하진 않지만(보통 오차가
// 매우 작음) 클라우드에서 막힘없이 접근 가능함.
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

// Frankfurter returns ECB reference rates with base=USD, so rates.KRW is
// already 원/달러. rates.JPY is 엔/달러 (JPY per 1 USD), not what we want —
// 원/엔(100엔) is derived as (rates.KRW / rates.JPY) * 100, cross-computed
// from the same single response instead of a second API call.
async function fetchFx() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch("https://api.frankfurter.dev/v1/latest?from=USD&to=KRW,JPY", {
      next: { revalidate: 10800 }, // 3h cache
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, status: res.status };
    const data = await res.json();
    const usdKrw = data?.rates?.KRW;
    const jpyUsd = data?.rates?.JPY;
    if (!Number.isFinite(usdKrw) || !Number.isFinite(jpyUsd) || jpyUsd === 0) {
      return { ok: false, malformed: true };
    }
    return { ok: true, usd: usdKrw, jpy: (usdKrw / jpyUsd) * 100, date: data?.date || null };
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
// FRED returns "." for a day with no published value instead of omitting the
// row, so we ask for the last few observations and skip holiday gaps rather
// than just taking observations[0].
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

export async function GET() {
  const fredKey = process.env.FRED_API_KEY;
  const result = { usd: null, jpy: null, gold: null, wti: null, brent: null, fxDate: null };

  // Each block is isolated in its own try/catch: one source failing should
  // never be able to crash the others (or the whole route) — worst case is
  // one field missing, never a 500.
  try {
    const fx = await fetchFx();
    if (fx.ok) {
      result.usd = fx.usd;
      result.jpy = fx.jpy;
      result.fxDate = fx.date;
    } else {
      result.fxError = "환율 데이터를 가져오지 못했습니다.";
      result.fxDebug = fx;
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
