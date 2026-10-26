// app/api/live-quotes/route.js
//
// [2026-10-26 신설] 홈 화면 속보에 붙은 종목들의 "오늘 등락률"을 화면이 직접 다시 받아가는 통로.
//   예) /api/live-quotes?s=214450.KQ,005930.KS
//
// 왜 만들었나 — 재성님 질문: "종목을 누르기 전 등락률과 눌렀을 때 등락률이 왜 다르냐"
//   (파마리서치: 칩 -3.1%, 차트 -3.97%)
//   원인: 칩 숫자는 두 군데서 왔습니다.
//     ① 페이지를 처음 열 때 서버가 넣어준 "오늘 시세" — 그 뒤로 새로 고치지 않음
//     ② ①이 없으면 기사가 들어올 때 찍어둔 KRX 값 — 이건 "전 거래일" 등락률입니다
//        (KRX 무료 자료는 장 마감 후에 그날 값이 나와서, 장중에는 어제 값만 있음)
//   페이지를 연 뒤에 들어온 속보는 ①이 없어서 ②(어제 등락률)가 그대로 보였습니다.
//   차트는 열 때마다 오늘 값을 새로 받으니 숫자가 달랐던 것입니다.
//   → 이제 화면이 1분마다 이 통로로 오늘 등락률을 다시 받아서 칩을 덮어씁니다.
//
// 비용: 0원(야후 무료, AI·Redis 안 씀). 같은 종목 묶음은 1분 동안 공용으로 저장해서
//   방문자가 몇 명이든 같은 요청은 1분에 한 번만 실제로 처리합니다.

import { fetchDomesticQuotes } from "../../../lib/quotes";

export const dynamic = "force-dynamic";

const MAX_SYMBOLS = 60;
const SYMBOL_RE = /^([0-9A-Z]{6})\.(KS|KQ)$/;

export async function GET(request) {
  const raw = new URL(request.url).searchParams.get("s") || "";
  const stocks = [];
  for (const s of raw.split(",")) {
    const m = SYMBOL_RE.exec(s.trim().toUpperCase());
    if (m) stocks.push({ code: m[1], market: m[2] === "KQ" ? "코스닥" : "코스피" });
    if (stocks.length >= MAX_SYMBOLS) break;
  }

  const quotes = {};
  if (stocks.length) {
    try {
      const map = await fetchDomesticQuotes(stocks);
      for (const [code, q] of map) {
        if (typeof q.changePct === "number") quotes[code] = { price: q.price, changePct: q.changePct };
      }
    } catch {
      // 야후가 응답을 안 주면 빈 값 — 화면은 기존 숫자를 그대로 둡니다
    }
  }

  return Response.json(
    { quotes },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=60" } }
  );
}
