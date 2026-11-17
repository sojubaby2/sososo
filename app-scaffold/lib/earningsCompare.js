// lib/earningsCompare.js
//
// [2026-11-15 신설] 실적 캘린더 — 영업이익을 전년 같은 분기와 비교한 상태(서버·브라우저 공용, 다른 파일을 부르지 않음)

// 전년 같은 분기와 비교한 상태
export function compare(cur, prev) {
  if (typeof cur !== "number") return { state: "none", pct: null };
  if (typeof prev !== "number") return { state: cur > 0 ? "profit" : "loss", pct: null };
  if (prev <= 0 && cur > 0) return { state: "turn-profit", pct: null }; // 흑자전환
  if (prev > 0 && cur <= 0) return { state: "turn-loss", pct: null }; // 적자전환
  if (prev <= 0 && cur <= 0) return { state: cur > prev ? "loss-less" : "loss-more", pct: null }; // 적자 축소·확대
  return { state: cur >= prev ? "up" : "down", pct: ((cur - prev) / prev) * 100 };
}

// [2026-11-15 추가] 어닝 서프라이즈 / 어닝 쇼크 구분
//   재성님: "어닝서프라이즈 종목 어닝쇼크 종목 따로 구분해서 볼 수 있게 해줘"
//   ★ 원래 뜻은 "증권사 예상치보다 훨씬 좋다/나쁘다"인데, 예상치는 무료 공식 자료가 없습니다.
//     그래서 여기서는 "전년 같은 분기 대비"로 나눕니다(화면에도 이 기준을 그대로 적어 둠).
//       서프라이즈: 영업이익이 30% 이상 늘었거나 흑자전환
//       쇼크:       영업이익이 30% 이상 줄었거나 적자전환·적자 확대
//   기준을 바꾸려면 아래 숫자 30만 고치면 됩니다.
export const SURPRISE_PCT = 30;
export const SHOCK_PCT = -30;
export function gradeOf(c) {
  if (!c) return null;
  if (c.state === "turn-profit" || (c.state === "up" && c.pct >= SURPRISE_PCT)) return "surprise";
  if (c.state === "turn-loss" || c.state === "loss-more" || (c.state === "down" && c.pct <= SHOCK_PCT)) return "shock";
  return null;
}
