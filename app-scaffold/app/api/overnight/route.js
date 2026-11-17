// app/api/overnight/route.js
//
// [2026-11-15 신설] 내일 장 미리 보기 자료(lib/overnight.js). 야후 무료 시세, 서버에서 1분 저장. 비밀값 없음.

import { getOvernight } from "../../../lib/overnight";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getOvernight();
    return Response.json(data, { headers: { "Cache-Control": "public, max-age=0, s-maxage=30" } });
  } catch {
    return Response.json({ groups: [], korea: [], error: "해외 시세를 받아오지 못했습니다." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
