"use client";

import { AlertTriangle, CandlestickChart } from "lucide-react";
import { openStockChart } from "../lib/openStockChart";
import LivePct from "./LivePct"; // [2026-11-04] 등락률 칸을 부드럽게(받는 중 뼈대 · 떠오르기 · 바뀌면 반짝)

// `change` is optional (themes page has it, news feed doesn't). `catalyst`
// is the (optional) confirmed negative-catalyst label for this specific
// stock (e.g. "유상증자") — set by the poll route when Claude flags one.
//
// [2026-10-26 변경] 누르면 "종목코드 복사" 대신 일봉 차트 창이 뜹니다.
// (코드 복사는 차트 창 아래 "코드 복사" 단추로 옮겼습니다.)
// 재성님 요청: "종목을 누르면 당일을 포함한 일봉이 보이는 차트를 표시"
export default function StockChip({ name, code, market, change, catalyst, pending = false }) {

  function handleClick() {
    openStockChart({ code, name, market });
  }

  return (
    <button type="button" onClick={handleClick} className={`chip ${catalyst ? "chip-bad" : ""}`} title={`${name} 일봉 차트 보기`}>
      {catalyst && <AlertTriangle size={11} className="chip-bad-icon" title={`악재: ${catalyst}`} />}
      <span style={{ fontWeight: 500 }}>{name}</span>
      <span className="code">{code}</span>
      <LivePct value={change} pending={pending} icon className="chip-pct" />
      <CandlestickChart size={11} className="chip-chart-icon" aria-hidden="true" />
    </button>
  );
}
