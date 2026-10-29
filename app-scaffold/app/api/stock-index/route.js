// app/api/stock-index/route.js
//
// [2026-10-29 신설] 종목 검색창(components/StockSearch.js)이 처음 열릴 때 한 번 받아 가는 전 종목 목록.
//   형식: { asOf: "2026-10-28", rows: [[코드, 이름, "P"(코스피)/"Q"(코스닥), 종가, 등락률, "테마1|테마2"], ...] }
//   자료는 lib/stockIndex.js(1시간 저장). 이 응답도 1시간 저장해서 방문자가 많아도 서버 일이 늘지 않습니다.

import { getStockIndex } from "../../../lib/stockIndex";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const idx = await getStockIndex();
    return Response.json(idx, { headers: { "Cache-Control": "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400" } });
  } catch (err) {
    return Response.json({ asOf: null, rows: [], error: String(err?.message || err) }, { status: 200 });
  }
}
