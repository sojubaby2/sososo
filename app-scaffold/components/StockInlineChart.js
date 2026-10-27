"use client";

// components/StockInlineChart.js
//
// [2026-10-27 신설] 종목 페이지 본문에 바로 보이는 일봉 차트.
// 그림은 차트 창(components/StockChartModal.js)과 똑같은 것을 씁니다.
// 서버가 페이지를 만들 때 이미 받아 둔 일봉(candles)을 그대로 받아서 그리므로
// 따로 다시 받아오지 않습니다(비용 0).

import { useState } from "react";
import { CandleChart, won, pctText, toneOf, shortDate, kstToday, volText } from "./StockChartModal";

export default function StockInlineChart({ candles }) {
  const [hoverIdx, setHoverIdx] = useState(null);
  if (!Array.isArray(candles) || candles.length < 2) {
    return <div className="sc-empty">차트 데이터를 받아오지 못했어요. 잠시 뒤 새로 고쳐 주세요.</div>;
  }
  const lastI = candles.length - 1;
  const i = hoverIdx ?? lastI;
  const bar = candles[i];
  const prev = candles[i - 1];
  const chg = bar && prev ? ((bar.c - prev.c) / prev.c) * 100 : null;
  return (
    <div className="stock-chart-box">
      <p className="sc-ohlc mono" aria-live="polite">
        <b>{shortDate(bar.d)}</b>
        {bar.d === kstToday() && <span className="sc-today">오늘</span>}
        {" · "}시 {won(bar.o)} 고 <span className="up">{won(bar.h)}</span> 저 <span className="down">{won(bar.l)}</span> 종{" "}
        <b>{won(bar.c)}</b>
        {chg !== null && <span className={toneOf(chg)}> ({pctText(chg)})</span>}
        {" · "}거래량 {volText(bar.v)}
      </p>
      <CandleChart all={candles} onHover={setHoverIdx} />
      <div className="sc-legend">
        <span>
          <i className="sc-key ma5" /> 5일선
        </span>
        <span>
          <i className="sc-key ma20" /> 20일선
        </span>
        <span className="sc-note">일봉 · 15~20분 지연</span>
      </div>
    </div>
  );
}
