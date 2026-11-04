"use client";

// components/LivePct.js
//
// [2026-11-04 신설] 종목 옆 등락률 한 칸 — 홈 속보 칩·관련 종목·관심종목이 같이 씀
//   재성님: "메인화면 종목 옆 등락률이 너무 딱딱하고, 안 뜰 때도 많고, F5를 눌러야 뜬다.
//            부드럽고 자연스럽게 못 바꾸나?"
//   바꾼 점:
//     · 숫자를 받는 중이면 빈칸 대신 은은하게 반짝이는 자리(뼈대)를 먼저 보여 줌 → 칸이 갑자기 튀어나오지 않음
//     · 숫자가 처음 들어올 때 살짝 떠오르며 나타남
//     · 1분마다 새 숫자가 들어와 값이 바뀌면 그 칸이 잠깐 빨강(오름)/파랑(내림)으로 반짝였다가 사라짐(증권 앱처럼)
//   value: 등락률(숫자) / pending: 아직 받는 중 / empty: 숫자가 없을 때 보일 글자(없으면 아무것도 안 보임)

import { useEffect, useRef, useState } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

export default function LivePct({ value, pending = false, digits = 1, empty = null, icon = false, className = "" }) {
  const has = isNum(value);
  const prev = useRef(value);
  const [flash, setFlash] = useState("");

  useEffect(() => {
    const p = prev.current;
    prev.current = value;
    if (!isNum(p) || !isNum(value) || p.toFixed(digits) === value.toFixed(digits)) return undefined;
    setFlash(value > p ? "lp-flash-up" : "lp-flash-down");
    const t = setTimeout(() => setFlash(""), 1300);
    return () => clearTimeout(t);
  }, [value, digits]);

  if (!has) {
    if (pending) return <span key="w" className={`lp lp-wait ${className}`} role="status" aria-label="시세 받는 중" />;
    return empty === null ? null : <span className={`mono lp flat ${className}`}>{empty}</span>;
  }

  const tone = value > 0 ? "up" : value < 0 ? "down" : "flat";
  const Icon = value > 0 ? TrendingUp : value < 0 ? TrendingDown : Minus;
  return (
    <span key="v" className={`mono lp lp-in ${tone} ${flash} ${className}`}>
      {icon && <Icon size={11} strokeWidth={2.5} aria-hidden="true" />}
      {value > 0 ? "+" : ""}
      {value.toFixed(digits)}%
    </span>
  );
}
