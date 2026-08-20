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

function defaultBasDt() {
  // Data publishes next business day afternoon, so step back a few calendar
  // days to land on a date that's safely already published, then walk back
  // further if it lands on a weekend.
  const d = new Date();
  d.setDate(d.getDate() - 3);
  const day = d.getDay(); // 0 = Sun, 6 = Sat
  if (day === 0) d.setDate(d.getDate() - 2);
  if (day === 6) d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${dd}`;
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
  const basDt = searchParams.get("basDt") || defaultBasDt();
  const code = searchParams.get("code"); // optional: look up one stock (likeSrtnCd)
  const numOfRows = searchParams.get("numOfRows") || "50";
  const pageNo = searchParams.get("pageNo") || "1";

  const qs = new URLSearchParams({ numOfRows, pageNo, resultType: "json", basDt });
  if (code) qs.set("likeSrtnCd", code);

  // serviceKey is appended raw (already URL-encoded by data.go.kr) — see note above.
  const url = `https://apis.data.go.kr/1160100/service/GetStockSecuritiesInfoService/getStockPriceInfo?serviceKey=${serviceKey}&${qs.toString()}`;

  try {
    const res = await fetch(url, { next: { revalidate: 600 } }); // cache 10 min
    const data = await res.json();
    return Response.json(data);
  } catch (err) {
    return Response.json({ error: "KRX API 호출 실패", detail: String(err) }, { status: 502 });
  }
}
