// lib/openStockSearch.js
//
// [2026-10-29 신설] 어디서든 종목 검색 창을 여는 신호 — openStockChart(lib/openStockChart.js)와 같은 방식.
//   검색 창(components/StockSearch.js)은 app/layout.js에 한 번만 달려 있고 이 신호를 듣고 열립니다.
//   사용법: openStockSearch()  또는  openStockSearch("삼성")  (검색어를 미리 넣어서 열기)

export const OPEN_SEARCH_EVENT = "newsmeme:open-search";

export function openStockSearch(query = "") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_SEARCH_EVENT, { detail: { query } }));
}
