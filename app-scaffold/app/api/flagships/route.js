// app/api/flagships/route.js
//
// [2026-10-26 신설] 홈 화면 "대표 종목" 칸(삼성전자·SK하이닉스)이 쓰는 데이터 통로입니다.
// 계산은 전부 lib/flagships.js에 있고, 여기는 결과를 넘겨주기만 합니다.
//
// 비용: 결과를 1분 동안 저장해 두고 그 사이 방문자에게는 저장된 값을 줍니다.
// 방문자가 몇 명이든 야후를 부르는 횟수는 1분에 한 번 정도입니다.
//
// 문제가 생겼을 때: 브라우저에서 https://newsmeme.co.kr/api/flagships 를 열어
// 보세요. domestic이나 abroad가 null이면 그 시세를 야후에서 못 받아온 것이고,
// krwPerShare가 null이면 환산 안전장치(국내가와 40% 넘게 차이)가 걸린 것입니다.

import { fetchFlagships } from "../../../lib/flagships";

export const revalidate = 60; // 1분

const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=120",
};

export async function GET() {
  try {
    const result = await fetchFlagships();
    return Response.json(result, { headers: CACHE_HEADERS });
  } catch (err) {
    // 실패해도 홈 화면이 깨지면 안 됩니다 — 빈 목록을 주면 칸에 "—"만 뜹니다.
    return Response.json(
      { items: [], fetchedAt: new Date().toISOString(), error: String(err?.message || err) },
      { headers: CACHE_HEADERS }
    );
  }
}
