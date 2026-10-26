"use client";

import { TrendingUp, TrendingDown, Minus, AlertTriangle, CandlestickChart } from "lucide-react";
import { openStockChart } from "../lib/openStockChart";

// `change` is optional (themes page has it, news feed doesn't). `catalyst`
// is the (optional) confirmed negative-catalyst label for this specific
// stock (e.g. "유상증자") — set by the poll route when Claude flags one.
//
// [2026-10-26 변경] 누르면 "종목코드 복사" 대신 일봉 차트 창이 뜹니다.
// (코드 복사는 차트 창 아래 "코드 복사" 단추로 옮겼습니다.)
// 재성님 요청: "종목을 누르면 당일을 포함한 일봉이 보이는 차트를 표시"
export default function StockChip({ name, code, market, change, catalyst }) {
  const hasChange = typeof change === "number";
  const isUp = hasChange && change > 0;
  const isDown = hasChange && change < 0;
  const cls = isUp ? "up" : isDown ? "down" : "flat";
  const Icon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;

  function handleClick() {
    openStockChart({ code, name, market });
  }

  return (
    <button type="button" onClick={handleClick} className={`chip ${catalyst ? "chip-bad" : ""}`} title={`${name} 일봉 차트 보기`}>
      {catalyst && <AlertTriangle size={11} className="chip-bad-icon" title={`악재: ${catalyst}`} />}
      <span style={{ fontWeight: 500 }}>{name}</span>
      <span className="code">{code}</span>
      {hasChange && (
        <span className={`mono ${cls}`} style={{ display: "inline-flex", alignItems: "center", gap: 2, fontWeight: 600 }}>
          <Icon size={11} strokeWidth={2.5} />
          {isUp ? "+" : ""}
          {change.toFixed(1)}%
        </span>
      )}
      <CandlestickChart size={11} className="chip-chart-icon" aria-hidden="true" />
    </button>
  );
}
