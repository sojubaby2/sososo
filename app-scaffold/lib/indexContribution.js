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
//   종목 하나가 지수에 준 힘 ≈ (그 종목 시가총액 ÷ 코스피 전체 시가총액) × 그 종목 오늘 등락률
//   테마가 준 힘 = 그 테마 대형주들(lib/krThemes.js의 members) 힘의 합
//
//   예) 반도체 +1% × 비중 35% = 지수 약 +0.35%p
//       조선   +8% × 비중 3%  = 지수 약 +0.24%p   → 지수 기여 1위는 반도체
//
//   "%p"는 "코스피 등락률 중 이 테마 몫"이라는 뜻입니다.
//
// ── [2026-10-26 오후 변경] 시가총액을 KRX에서 받지 않고 아래 표에 적어 둡니다 ──
//   처음 버전은 KRX에서 시가총액을 6시간마다 받아왔는데, 배포해 보니 "지수 기여 1위"
//   줄이 나오지 않았습니다(재성님 확인). 페이지를 만드는 짧은 시간 안에 KRX 응답이
//   오지 않은 것으로 보입니다(장중에는 KRX에 "오늘" 자료가 없어서 하루 전으로
//   한 번 더 물어보느라 시간이 더 걸림).
//   지수 안에서 각 종목의 비중은 하루하루 거의 변하지 않으므로, 2026-10-22 종가 기준
//   시가총액을 아래 표에 적어 두고 그대로 씁니다.
//     · 장점: 바깥 서버를 전혀 부르지 않아 실패할 곳이 없고 빠름(비용 0)
//     · 한계: 몇 달 지나면 비중이 조금씩 달라짐 → 테마 점검할 때 같이 새로 고치면 충분
//       (대형주 상장·합병처럼 큰일이 있으면 그때 갱신)
//   오늘 등락률은 그대로 야후(15~20분 지연)에서 5분마다 받아옵니다.
//
// 문제가 생겼을 때: https://newsmeme.co.kr/api/index-contribution 을 열면 계산 과정이 보입니다.

import { KR_THEMES } from "./krThemes";

// 단위: 억 원. 코스피 상장 종목 시가총액(2026-10-22 종가 기준, 출처: KRX 시세를 모은 공개 자료 FinanceData/marcap)
export const KOSPI_CAP_SNAPSHOT = {
  asOf: "2026-10-22",
  totalCap: 45690530, // 코스피 전체
  caps: {
    "005930": 12540268,
    "000660": 8933922,
    "373220": 912600,
    "207940": 630020,
    "005380": 613451,
    "105560": 561116,
    "068270": 450918,
    "000270": 424769,
    "055550": 423914,
    "012450": 418179,
    "006400": 412598,
    "086790": 324893,
    "329180": 324330,
    "012330": 302695,
    "035420": 268320,
    "096770": 239548,
    "316140": 230246,
    "005490": 226631,
    "011200": 213643,
    "010130": 185978,
    "042700": 182237,
    "009540": 178348,
    "042660": 175268,
    "018260": 160172,
    "024110": 158289,
    "010140": 152416,
    "003670": 148362,
    "006800": 135212,
    "035720": 134451,
    "086280": 133575,
    "079550": 106260,
    "000720": 103561,
    "047810": 103226,
    "003490": 97394,
    "323410": 95663,
    "064350": 93317,
    "259960": 88067,
    "005940": 87133,
    "071050": 82140,
    "090430": 78088,
    "161390": 76307,
    "016360": 69208,
    "000100": 61837,
    "047040": 59702,
    "326030": 58657,
    "039490": 56784,
    "128940": 47465,
    "036570": 45566,
    "000990": 43026,
    "051900": 40284,
    "004020": 36364,
    "028670": 33785,
    "192820": 30927,
    "161890": 29459,
    "006360": 25161,
    "375500": 22636,
    "204320": 17867,
    "000120": 15125,
  },
};

// 예전 이름 그대로 둡니다(app/page.js가 이 이름으로 부름). 이제 바깥 호출 없이 바로 돌려줍니다.
export async function getKospiCapTable() {
  return KOSPI_CAP_SNAPSHOT;
}

// 테마별 지수 기여(%p)를 계산합니다.
//   capTable: KOSPI_CAP_SNAPSHOT
//   memberQuotes: Map(종목코드 → { changePct }) — 대형주들의 오늘 등락률
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
