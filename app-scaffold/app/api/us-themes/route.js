// app/api/us-themes/route.js
//
// [2026-11-18 신설] 미국 주식 테마와 밤사이 등락률 — 설명은 lib/usThemeQuotes.js
//   시세를 못 받아도 테마·종목 표는 그대로 내줍니다(등락률만 빈칸).
import { getUsThemes, getUsThemesBare } from "../../../lib/usThemeQuotes";

export const dynamic = "force-dynamic";

export async function GET() {
  let data;
  try {
    data = await getUsThemes();
  } catch {
    data = getUsThemesBare();
  }
  return Response.json(data, { headers: { "Cache-Control": "public, max-age=300, s-maxage=600, stale-while-revalidate=3600" } });
}
