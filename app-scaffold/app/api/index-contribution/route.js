// app/api/index-contribution/route.js
//
// [2026-10-26 신설] "지수 기여 1위" 점검 창구 — https://newsmeme.co.kr/api/index-contribution
// 홈 화면 한국 칸에 "지수 기여 1위"가 안 보일 때 열어 보면 어디서 막혔는지 나옵니다.
//   · quotesReceived: 대형주 58개 중 야후에서 오늘 등락률을 받아온 개수 (0이면 야후 문제)
//   · kospiPct: 코스피 오늘 등락률 (null이면 코스피를 못 받아옴)
//   · themes: 테마별 지수 기여(%p), 큰 순서
//   · top / text: 홈 화면에 나갈 문구 (빈 값이면 기준 미달 — 예: 코스피는 올랐는데 오른 테마가 없음)
// 비용 0원(야후 무료, AI·Redis 안 씀). 5분 동안 같은 값을 재사용합니다.

import { fetchDomesticQuotes, fetchEtfQuotes } from "../../../lib/quotes";
import { KR_THEME_MEMBER_CODES } from "../../../lib/krThemes";
import {
  getKospiCapTable,
  computeThemeContributions,
  pickTopContributor,
  contributionText,
} from "../../../lib/indexContribution";

export const revalidate = 300;

export async function GET() {
  const started = Date.now();
  const [memberQuotes, kospiQuotes, capTable] = await Promise.all([
    fetchDomesticQuotes(KR_THEME_MEMBER_CODES.map((code) => ({ code, market: "코스피" }))).catch(() => new Map()),
    fetchEtfQuotes(["^KS11"]).catch(() => new Map()),
    getKospiCapTable(),
  ]);
  const kospi = kospiQuotes.get("^KS11") || null;
  const kospiPct = typeof kospi?.changePct === "number" ? kospi.changePct : null;
  const rows = computeThemeContributions(capTable, memberQuotes);
  const top = pickTopContributor(rows, kospiPct);
  return Response.json(
    {
      capAsOf: capTable?.asOf || null,
      quotesReceived: memberQuotes.size,
      quotesWanted: KR_THEME_MEMBER_CODES.length,
      kospiPct,
      themes: [...rows].sort((a, b) => b.contribPct - a.contribPct).map((r) => ({ ...r, contribPct: Math.round(r.contribPct * 1000) / 1000 })),
      top,
      text: contributionText(top),
      tookMs: Date.now() - started,
    },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=300" } }
  );
}
