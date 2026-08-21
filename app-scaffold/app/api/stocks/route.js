// GET /api/stocks?basDt=YYYYMMDD&code=005930&numOfRows=50&pageNo=1
//
// Proxies 금융위원회_주식시세정보 (data.go.kr, GetStockSecuritiesInfoService).
// Runs server-side only, so:
//   1) the private service key never reaches the browser
//   2) we sidestep the CORS restriction that blocks calling apis.data.go.kr
//      directly from client-side JS
//
// IMPORTANT: KRX_SERVICE_KEY must be the "Encoding" (URL-encoded) key from
// data.go.kr — the one that already contains things like %2F and %3D%3D.
// Do NOT run it through encodeURIComponent again or it will be double-encoded
// and the API will reject it.

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

async function fetchStockPage(serviceKey, basDt, numOfRows, pageNo) {
  const qs = new URLSearchParams({ numOfRows, pageNo, resultType: "json", basDt });
  const url = `https://apis.data.go.kr/1160100/service/GetStockSecuritiesInfoService/getStockPriceInfo?serviceKey=${serviceKey}&${qs.toString()}`;
  const res = await fetch(url, { next: { revalidate: 600 } });
  return res.json();
}

// Tries the most recent business day first; if that day's data hasn't been
// published yet (empty result), automatically steps back one more business
// day, up to a few attempts, so the site always shows the freshest data
// that's actually available rather than a fixed, possibly-stale offset.
async function fetchLatestAvailable(serviceKey, numOfRows, pageNo, maxAttempts = 5) {
  const gen = businessDaysBackFrom(new Date());
  for (let i = 0; i < maxAttempts; i++) {
    const basDt = gen.next().value;
    const data = await fetchStockPage(serviceKey, basDt, numOfRows, pageNo);
    const count = data?.response?.body?.totalCount ?? 0;
    if (count > 0) return { data, basDt };
  }
  return { data: null, basDt: null };
}

export async function GET(request) {
  const serviceKey = process.env.KRX_SERVICE_KEY;
  if (!serviceKey) {
    return Response.json(
      { error: "KRX_SERVICE_KEY 환경변수가 설정되지 않았습니다. Vercel 프로젝트 설정에서 추가해주세요." },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const explicitBasDt = searchParams.get("basDt");
  const code = searchParams.get("code"); // optional: look up one stock (likeSrtnCd)
  const numOfRows = searchParams.get("numOfRows") || "50";
  const pageNo = searchParams.get("pageNo") || "1";

  try {
    if (explicitBasDt) {
      // Caller pinned a specific date — just fetch that one, no fallback.
      const qs = new URLSearchParams({ numOfRows, pageNo, resultType: "json", basDt: explicitBasDt });
      if (code) qs.set("likeSrtnCd", code);
      const url = `https://apis.data.go.kr/1160100/service/GetStockSecuritiesInfoService/getStockPriceInfo?serviceKey=${serviceKey}&${qs.toString()}`;
      const res = await fetch(url, { next: { revalidate: 600 } });
      const data = await res.json();
      return Response.json(data);
    }

    // No date given — auto-pick the freshest business day that actually has data.
    const { data, basDt } = await fetchLatestAvailable(serviceKey, numOfRows, pageNo);
    if (!data) {
      return Response.json({ error: "최근 며칠간 시세 데이터를 찾지 못했습니다." }, { status: 502 });
    }
    return Response.json({ ...data, resolvedBasDt: basDt });
  } catch (err) {
    return Response.json({ error: "KRX API 호출 실패", detail: String(err) }, { status: 502 });
  }
}
