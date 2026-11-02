// app/api/ipo/route.js
//
// [2026-10-26 신설] 공모주 일정 점검 창구 — DART에서 받아온 그대로 보여줍니다.
//   https://newsmeme.co.kr/api/ipo
// 공모주 페이지(/ipo)가 비어 보이면 여기부터 열어 보세요. error 칸에 이유가 나옵니다.
// 계산은 전부 lib/ipo.js에 있습니다. 비용 0원(DART 무료, 3시간에 한 번만 실제로 물어봄).

import { fetchIpoSchedule } from "../../../lib/ipo";

export const revalidate = 10800; // 3시간
// [2026-11-02 추가] 안쪽 DART 호출이 "저장 안 함(no-store)"이라 이 화면이 매번 새로 만들어지며 10초 넘게 걸렸음.
//   아래 한 줄로 다시 "만들어 둔 화면을 3시간 동안 바로 보여 주는" 방식으로 되돌림.
export const dynamic = "force-static";

export async function GET() {
  try {
    const data = await fetchIpoSchedule();
    return Response.json(data, { headers: { "Cache-Control": "public, max-age=0, s-maxage=3600" } });
  } catch (err) {
    return Response.json({ items: [], error: String(err?.message || err) }, { headers: { "Cache-Control": "public, max-age=0, s-maxage=300" } });
  }
}
