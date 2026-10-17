// app/api/world-indices/route.js
//
// [2026-10-17 신설] 홈 화면 맨 위 "오늘의 세계증시" 지도가 쓰는 데이터 통로입니다.
//
// 비용 구조가 핵심입니다. 아래 CACHE_HEADERS와 revalidate 덕분에 이 주소의
// 결과는 5분 동안 저장되고, 그 사이 들어온 방문자는 전부 저장된 값을 받습니다.
// 방문자가 1,000명이어도 Stooq와 FRED를 부르는 횟수는 5분에 한 번입니다.
//
// 문제가 생겼을 때: 주소 뒤에 ?debug=1 을 붙이면 어느 종목기호를 못 받아왔는지
// 그대로 보여줍니다. 지도에서 특정 나라만 "—"로 비어 있을 때 여기부터 보세요.
// (민감한 정보가 아니라 종목기호뿐이라 시크릿 없이 열어둡니다.)

import { buildWorldIndices } from "../../../lib/worldIndices";

export const revalidate = 300; // 5분

const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600",
};

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const wantDebug = searchParams.get("debug") === "1";

  try {
    const result = await buildWorldIndices();
    return Response.json(
      wantDebug ? result : { generatedAt: result.generatedAt, items: result.items },
      { headers: CACHE_HEADERS }
    );
  } catch (err) {
    // 실패해도 홈 화면이 깨지면 안 됩니다 — 빈 목록을 돌려주면 지도는
    // 그대로 뜨고 숫자 자리만 "—"가 됩니다.
    return Response.json(
      { generatedAt: new Date().toISOString(), items: [], error: String(err?.message || err) },
      { headers: CACHE_HEADERS }
    );
  }
}
