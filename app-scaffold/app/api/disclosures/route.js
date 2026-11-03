// app/api/disclosures/route.js
//
// [2026-11-03 신설] 공시 일정 자료를 그대로 내려주는 창구.
//   새 사이트(Cloudflare)에서 DART 호출이 자주 시간 초과로 실패해서, 예전 Vercel 주소에서 받은 자료를
//   이 창구로 넘겨받아 씁니다(lib/disclosures.js의 fromVercel 참고). 사람이 열어 봐도 됩니다:
//   https://newsmeme.co.kr/api/disclosures — 비어 있으면 error 칸에 이유가 나옵니다.

import { getDisclosureData } from "../../../lib/disclosures";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const data = await getDisclosureData();
  if (!data) {
    return Response.json(
      { recent: [], events: [], error: "지금 DART에서 공시를 받아오지 못했습니다." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
  return Response.json(data, { headers: { "Cache-Control": "public, max-age=0, s-maxage=600" } });
}
