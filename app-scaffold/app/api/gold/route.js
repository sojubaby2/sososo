// GET /api/gold
//
// Proxies gold-api.com's live XAU (gold) price. This API is free, needs no
// key, and even has CORS enabled for direct browser use — but we still route
// it through our own server so the frontend has one consistent place to add
// the KRW conversion once the exchange-rate API is wired in.
//
// NOTE: the exact response field names from gold-api.com haven't been
// verified end-to-end yet (their docs page didn't show a sample payload for
// this endpoint). This route passes the raw JSON straight through — check
// the actual response shape at https://gold-api.com/docs once deployed and
// adjust the frontend's field access (currently assumes something like
// `price`) if needed.

export async function GET() {
  try {
    const res = await fetch("https://api.gold-api.com/price/XAU", {
      next: { revalidate: 300 }, // cache 5 min
    });
    const data = await res.json();
    return Response.json(data);
  } catch (err) {
    return Response.json({ error: "금 시세 조회 실패", detail: String(err) }, { status: 502 });
  }
}
