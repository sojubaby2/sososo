// app/api/candles/route.js
//
// [2026-10-26 신설] 종목 일봉 차트 데이터 통로입니다.
//   예) /api/candles?code=005930&market=코스피
// 계산은 전부 lib/candles.js에 있고, 여기는 결과를 넘겨주기만 합니다.
//
// 비용: 결과를 2분 동안 저장해 두고(종목별로 따로) 그 사이엔 저장된 값을 줍니다.
// AI·Redis를 전혀 쓰지 않아서 돈이 들지 않습니다.
//
// 문제가 생겼을 때: 브라우저에서 https://newsmeme.co.kr/api/candles?code=005930
// 을 열어 보세요. candles가 비어 있으면 야후에서 그 종목을 못 받아온 것입니다.

import { fetchDailyCandles } from "../../../lib/candles";

export const dynamic = "force-dynamic";

// [2026-10-30] 공용 저장 2분 → 1분, 브라우저 저장 1분 → 30초(시세 지연 줄이기)
const OK_HEADERS = { "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=30" };
const FAIL_HEADERS = { "Cache-Control": "public, max-age=0, s-maxage=30" };

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = String(searchParams.get("code") || "").trim().toUpperCase();
  const market = String(searchParams.get("market") || "").trim();

  if (!/^[0-9A-Z]{6}$/.test(code)) {
    return Response.json({ error: "종목코드(6자리)가 필요합니다.", candles: [] }, { status: 400, headers: FAIL_HEADERS });
  }

  try {
    const r = await fetchDailyCandles(code, market);
    if (!r) return Response.json({ code, candles: [], error: "차트 데이터를 받아오지 못했어요." }, { headers: FAIL_HEADERS });
    return Response.json(r, { headers: OK_HEADERS });
  } catch (err) {
    return Response.json({ code, candles: [], error: String(err?.message || err) }, { headers: FAIL_HEADERS });
  }
}
