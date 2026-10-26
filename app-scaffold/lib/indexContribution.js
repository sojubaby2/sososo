// lib/indexContribution.js
//
// [2026-10-26 신설] "지수 기여 1위" — 오늘 코스피를 실제로 가장 많이 밀어 올린
// (또는 끌어내린) 테마를 계산합니다.
//
// 재성님 질문: "+, - 등락률로만 따지는 건지, 시가총액을 따져서 진짜 올렸고 내린 걸
//              따지는 건지" → 1번 방식으로 결정:
//   · 큰 글씨(주인공 테마)는 지금처럼 등락률 1등 — 그날 제일 뜨거운 테마
//   · 그 아래 작은 글씨에 "지수 기여 1위 ○○ +0.35%p"를 덧붙임 — 진짜 지수를 움직인 테마
//
// ── 계산 방법 ─────────────────────────────────────────────────────────
//   코스피는 덩치(시가총액) 큰 종목이 많이 반영되는 지수입니다.
//   종목 하나가 지수에 준 힘 ≈ (그 종목 시가총액 ÷ 코스피 전체 시가총액) × 그 종목 등락률
//   테마가 준 힘 = 그 테마 대형주들(lib/krThemes.js의 members) 힘의 합
//
//   예) 반도체 +1% × 비중 35% = 지수 약 +0.35%p
//       조선   +8% × 비중 3%  = 지수 약 +0.24%p   → 지수 기여 1위는 반도체
//
//   "%p"는 "코스피 등락률 중 이 테마 몫"이라는 뜻입니다.
//   (코스피 +1.10% 중 +0.35%p는 반도체가 만든 것)
//
// ── 숫자는 어디서 ─────────────────────────────────────────────────────
//   · 시가총액: KRX 정식 Open API(이미 쓰고 있는 것, 무료)의 "전 영업일 종가 × 상장주식수".
//     하루에 거의 안 변하는 값이라 6시간에 한 번만 받아옵니다(Next.js 저장 기능,
//     Redis 안 씀). KRX 하루 한도 10,000회 중 하루 몇 회만 씁니다.
//   · 오늘 등락률: 야후(이미 쓰고 있는 것, 무료, 15~20분 지연). 5분마다 갱신.
//
// 비용: 0원. AI·Redis를 전혀 쓰지 않습니다.
//
// 실패하면: 이 한 줄만 안 나오고, 문장 나머지는 예전과 똑같이 나옵니다.

import { unstable_cache } from "next/cache";
import { fetchLatestAvailable } from "./krxOpenApi";
import { KR_THEMES, KR_THEME_MEMBER_CODES } from "./krThemes";

const CAP_CACHE_SECONDS = 6 * 3600; // 6시간
const KRX_TIMEOUT_MS = 8000;

// KRX에서 코스피 전체 시가총액과, 우리가 쓰는 대형주들의 시가총액만 뽑아 작은 표로 만듭니다.
// (전 종목 2,700개를 들고 다닐 필요가 없어서 59개만 남깁니다)
async function buildCapTable() {
  const krx = await Promise.race([
    fetchLatestAvailable(new Date()),
    new Promise((_, reject) => setTimeout(() => reject(new Error("KRX 시간 초과")), KRX_TIMEOUT_MS)),
  ]);
  if (!krx?.items?.length) throw new Error("KRX 데이터 없음"); // 던져야 "실패"가 6시간 저장되지 않음

  const want = new Set(KR_THEME_MEMBER_CODES);
  let totalCap = 0;
  const caps = {};
  for (const it of krx.items) {
    if (it.mrktCtg !== "KOSPI") continue;
    const cap = it.clpr * it.lstgStCnt;
    if (!Number.isFinite(cap) || cap <= 0) continue;
    totalCap += cap;
    if (want.has(it.srtnCd)) caps[it.srtnCd] = cap;
  }
  if (totalCap <= 0 || Object.keys(caps).length === 0) throw new Error("시가총액 계산 불가");
  return { basDt: krx.basDt, totalCap, caps };
}

const getCapTableCached = unstable_cache(buildCapTable, ["kospi-cap-table-v1"], {
  revalidate: CAP_CACHE_SECONDS,
});

export async function getKospiCapTable() {
  if (!process.env.KRX_OPENAPI_KEY) return null;
  try {
    return await getCapTableCached();
  } catch {
    return null;
  }
}

// 테마별 지수 기여(%p)를 계산합니다.
//   capTable: getKospiCapTable() 결과
//   memberQuotes: Map(종목코드 → { changePct }) — 대형주들의 오늘 등락률
// 돌려주는 값: [{ label, contribPct, covered }] (기여 큰 순서 아님 — 고르는 쪽에서 정함)
export function computeThemeContributions(capTable, memberQuotes) {
  if (!capTable || !memberQuotes || memberQuotes.size === 0) return [];
  const rows = [];
  for (const t of KR_THEMES) {
    let sum = 0;
    let covered = 0;
    for (const code of t.members || []) {
      const cap = capTable.caps[code];
      const q = memberQuotes.get(code);
      if (!cap || !q || typeof q.changePct !== "number" || !Number.isFinite(q.changePct)) continue;
      sum += (cap / capTable.totalCap) * q.changePct;
      covered += 1;
    }
    if (covered > 0) rows.push({ label: t.label, contribPct: sum, covered });
  }
  return rows;
}

// 코스피 방향에 맞는 "지수 기여 1위"를 고릅니다.
//   코스피가 오른 날 → 가장 많이 밀어 올린 테마
//   코스피가 내린 날 → 가장 많이 끌어내린 테마
//   코스피를 모르면  → 어느 쪽이든 힘이 가장 큰 테마
// 기여가 0.01%p도 안 되면(의미 없음) null.
export function pickTopContributor(rows, kospiPct) {
  if (!rows?.length) return null;
  let best = null;
  for (const r of rows) {
    if (best === null) { best = r; continue; }
    if (typeof kospiPct === "number") {
      if (kospiPct >= 0 ? r.contribPct > best.contribPct : r.contribPct < best.contribPct) best = r;
    } else if (Math.abs(r.contribPct) > Math.abs(best.contribPct)) best = r;
  }
  if (!best || Math.abs(best.contribPct) < 0.01) return null;
  if (typeof kospiPct === "number" && kospiPct !== 0 && Math.sign(best.contribPct) !== Math.sign(kospiPct)) return null;
  return best;
}

// 화면 문구: "지수 기여 1위 반도체 +0.35%p"
export function contributionText(top) {
  if (!top) return "";
  const v = top.contribPct;
  return `지수 기여 1위 ${top.label} ${v >= 0 ? "+" : ""}${v.toFixed(2)}%p`;
}
