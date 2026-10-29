// app/api/market-flow/route.js
//
// [2026-10-29 신설] 장 마감 정리의 "지수 마감·투자자별 순매수" 자료 확인용 주소.
//   /api/market-flow?date=2026-10-28          → 화면에 쓰는 것과 같은 저장본(lib/investorFlow.js)
//   /api/market-flow?date=2026-10-28&diag=1   → 네이버·야후가 실제로 무엇을 돌려주는지(원인 찾기용, 저장 안 함)
// 비용: 바깥 무료 요청 몇 번. 개인정보·비밀값 없음.

import { getMarketFlow, diagnoseFlow } from "../../../lib/investorFlow";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const kst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.get("date") || "") ? searchParams.get("date") : kst;
  const body = searchParams.get("diag") === "1" ? await diagnoseFlow(date) : await getMarketFlow(date, { latest: true });
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
