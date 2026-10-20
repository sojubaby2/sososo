// app/api/etf-check/route.js
//
// [2026-10-20 신설] 테마 ETF 종목코드 점검 창구입니다.
//
// 왜 만들었나:
// 홈 화면 맨 위 "오늘 한국을 움직인 건 ○○" 문장은 국내 테마 ETF 13개의
// 등락률로 뽑습니다(lib/krThemes.js). 그런데 종목코드가 하나라도 틀리면
// 그 테마는 조용히 빠지기만 하고 화면에는 아무 표시가 없습니다 — 원인을
// 찾기가 아주 어렵습니다.
//
// 그래서 주소 하나로 13개(+미국 12개)가 전부 제대로 잡히는지 한눈에 보게
// 만들었습니다. 브라우저 주소창에 아래를 치면 됩니다.
//
//   newsmeme.co.kr/api/etf-check
//
// 보는 법:
//   ok: false 인 줄  -> 그 종목코드가 틀렸거나 야후에 없는 것입니다.
//                      lib/krThemes.js에서 그 줄의 code를 고치세요.
//   name            -> 야후가 돌려준 실제 이름입니다. 기대한 ETF 이름과
//                      다르면 코드가 다른 종목을 가리키고 있는 것입니다.
//
// 민감한 정보가 없어서(종목코드와 공개 시세뿐) 따로 잠그지 않았습니다.
// 나중에 필요 없어지면 이 폴더를 통째로 지우면 됩니다.

import { fetchEtfQuotes } from "../../../lib/quotes";
import { KR_THEMES, KR_ETF_SYMBOLS } from "../../../lib/krThemes";
import { US_THEMES, US_ETF_SYMBOLS } from "../../../lib/usThemes";

export const revalidate = 300; // 5분

export async function GET() {
  const [kr, us] = await Promise.all([
    fetchEtfQuotes(KR_ETF_SYMBOLS).catch(() => new Map()),
    fetchEtfQuotes(US_ETF_SYMBOLS).catch(() => new Map()),
  ]);

  const krRows = KR_THEMES.map((t) => {
    const q = kr.get(`${t.code}.KS`);
    return {
      테마: t.label,
      코드: t.code,
      ok: !!q,
      이름: q?.name || null,
      등락률: typeof q?.changePct === "number" ? Number(q.changePct.toFixed(2)) : null,
      기준일: q?.asOf ? q.asOf.slice(0, 10) : null,
    };
  });

  const usRows = US_THEMES.map((t) => {
    const q = us.get(t.etf);
    return {
      테마: t.label,
      기호: t.etf,
      ok: !!q,
      이름: q?.name || null,
      등락률: typeof q?.changePct === "number" ? Number(q.changePct.toFixed(2)) : null,
    };
  });

  return Response.json(
    {
      안내: "ok가 false인 줄은 종목코드가 틀린 것입니다. lib/krThemes.js에서 고치세요.",
      국내: { 전체: krRows.length, 성공: krRows.filter((r) => r.ok).length, 목록: krRows },
      미국: { 전체: usRows.length, 성공: usRows.filter((r) => r.ok).length, 목록: usRows },
    },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600" } }
  );
}
