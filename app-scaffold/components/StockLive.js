"use client";

// components/StockLive.js
//
// [2026-11-11 신설] 종목 페이지(/stock/종목코드)의 가격·차트·"한눈에 보기"를 들어온 순간 새 숫자로 맞추기
//   재성님: "누르기 전하고 누른 후가 똑같아야 할 거 아냐. 사이트에 이런 세세한 오류들 싹 다 수정해"
//   확인해 보니 종목 페이지는 "미리 만들어 둔 화면"을 보여 주는데(검색엔진·속도용), Cloudflare에서
//   그 화면이 제때 새로 만들어지지 않아 몇 시간 전 가격이 그대로 보이는 일이 있었습니다
//   (실측: 파수AI 페이지 5,030원 +5.7% — 같은 시각 실제 값은 4,840원 +1.7%).
//   → 미리 만든 화면은 그대로 두고(검색엔진은 그걸 읽음), 사람이 들어오면 차트 창과 같은 곳(/api/candles)에서
//     새 값을 받아 가격·차트·요약 문장을 한꺼번에 바꿉니다. 받기 전·실패 시에는 미리 만든 화면이 그대로 보입니다.
//   비용 0원(차트 창이 쓰던 주소를 같이 씀 — 서버에서 종목별 1분 저장).

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import StockInlineChart from "./StockInlineChart";
import { syncCandlesWithQuotes } from "./StockChartModal";
import { QUOTE_EVENT } from "../lib/quoteBus";
import { summarizeCandles, describeSummary } from "../lib/stockSummary";

const Ctx = createContext(null);

const sign = (v) => (typeof v === "number" ? `${v > 0 ? "+" : ""}${v.toFixed(2)}%` : "—");
const tone = (v) => (typeof v === "number" ? (v > 0 ? "up" : v < 0 ? "down" : "flat") : "flat");

export function StockLiveProvider({ code, market = "", label, initialCandles = [], children }) {
  const [data, setData] = useState(() => ({ candles: initialCandles, asOf: null }));

  useEffect(() => {
    let alive = true;
    const load = () => {
      if (document.visibilityState === "hidden") return;
      const qs = new URLSearchParams({ code, market });
      fetch(`/api/candles?${qs}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!alive || !Array.isArray(d?.candles) || d.candles.length < 2) return;
          setData(syncCandlesWithQuotes(code, d));
        })
        .catch(() => {});
    };
    load();
    const t = setInterval(load, 60000); // 보고 있는 동안 1분마다
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    const onQuote = (e) => {
      if (e.detail?.code !== String(code)) return;
      setData((cur) => {
        const cs = cur?.candles;
        const q = e.detail.quote;
        if (!Array.isArray(cs) || cs.length < 2 || typeof q?.price !== "number") return cur;
        const last = cs[cs.length - 1];
        if (last.c === q.price) return cur;
        const day = new Date((Date.parse(q.asOf || "") || 0) + 9 * 3600 * 1000).toISOString().slice(0, 10);
        if (day !== last.d || (Date.parse(q.asOf || "") || 0) <= (Date.parse(cur.asOf || "") || 0)) return cur;
        const nl = { ...last, c: q.price, h: Math.max(last.h, q.price), l: Math.min(last.l, q.price) };
        return { ...cur, candles: [...cs.slice(0, -1), nl], asOf: q.asOf };
      });
    };
    window.addEventListener(QUOTE_EVENT, onQuote);
    return () => {
      alive = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(QUOTE_EVENT, onQuote);
    };
  }, [code, market]);

  const value = useMemo(() => {
    const candles = data.candles || [];
    const summary = summarizeCandles(candles);
    return { code, label, candles, summary, lines: describeSummary(label, summary) };
  }, [data, code, label]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// 맨 위 가격 한 줄
export function StockLivePrice() {
  const { code, summary } = useContext(Ctx);
  if (!summary) return <p className="stock-asof">시세를 받아오지 못했어요.</p>;
  return (
    <p className="stock-price">
      <span className="mono">{Math.round(summary.close).toLocaleString("ko-KR")}원</span>
      <span className={`mono ${tone(summary.change)}`}>{sign(summary.change)}</span>
      <span className="stock-asof">{summary.date} 기준 · 15~20분 지연</span>
      {/* [2026-10-30] 실시간 시세는 네이버 증권으로(링크만) */}
      <a className="stock-live" href={`https://finance.naver.com/item/main.naver?code=${code}`} target="_blank" rel="noopener noreferrer">
        실시간 시세는 네이버 ↗
      </a>
    </p>
  );
}

// 일봉 차트
export function StockLiveChart({ bars = 160 }) {
  const { candles } = useContext(Ctx);
  return <StockInlineChart candles={candles.slice(-bars)} />;
}

// "한눈에 보기" 칸(숫자 + 설명 문장)
export function StockLiveSummary() {
  const { summary, lines } = useContext(Ctx);
  if (!summary) return null;
  const stats = [
    ["1주", summary.week],
    ["1개월", summary.month],
    ["3개월", summary.quarter],
  ];
  return (
    <section className="panel stock-section">
      <h2 className="stock-h2">한눈에 보기</h2>
      <div className="stock-stats">
        {stats.map(([k, v]) => (
          <div key={k} className="stock-stat">
            <span className="stock-stat-k">{k}</span>
            <span className={`stock-stat-v mono ${tone(v)}`}>{sign(v)}</span>
          </div>
        ))}
        <div className="stock-stat">
          <span className="stock-stat-k">{summary.periodLabel} 고점</span>
          <span className="stock-stat-v mono">{Math.round(summary.periodHigh.price).toLocaleString("ko-KR")}</span>
        </div>
        <div className="stock-stat">
          <span className="stock-stat-k">{summary.periodLabel} 저점</span>
          <span className="stock-stat-v mono">{Math.round(summary.periodLow.price).toLocaleString("ko-KR")}</span>
        </div>
      </div>
      {lines.map((t, i) => (
        <p key={i} className="stock-text">
          {t}
        </p>
      ))}
    </section>
  );
}
