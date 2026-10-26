// lib/openStockChart.js
//
// [2026-10-26 신설] 어느 화면에서든 종목을 누르면 일봉 차트 창을 띄우는 "호출 버튼"입니다.
//
// 사용법:  openStockChart({ code: "005930", name: "삼성전자", market: "코스피" })
//          (onFilter를 같이 넘기면 차트 창에 "관련 속보만 보기" 단추가 생깁니다)
//
// 차트 창(components/StockChartModal.js)은 app/layout.js에 한 번만 달려 있고,
// 여기서 보내는 신호를 듣고 열립니다. 그래서 홈·테마 등 어느 페이지의
// 종목이든 똑같이 이 한 줄로 차트를 띄울 수 있습니다.

export const OPEN_CHART_EVENT = "newsmeme:open-chart";

export function openStockChart(stock) {
  if (typeof window === "undefined" || !stock?.code) return;
  window.dispatchEvent(new CustomEvent(OPEN_CHART_EVENT, { detail: stock }));
}
