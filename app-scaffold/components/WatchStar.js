"use client";

// components/WatchStar.js
//
// [2026-10-27 신설] 관심종목 별표 단추. 누르면 담기/빼기(lib/watchlist.js).
// variant="btn"  → 차트 창 아래 단추 줄 모양(sc-btn)
// variant="big"  → 종목 페이지 제목 옆 큰 단추

import { Star } from "lucide-react";
import { useWatchlist } from "../lib/watchlist";

export default function WatchStar({ stock, variant = "btn" }) {
  const { has, toggle } = useWatchlist();
  if (!stock?.code) return null;
  const on = has(stock.code);
  const label = on ? "관심종목 빼기" : "관심종목 담기";
  return (
    <button
      type="button"
      className={`${variant === "big" ? "watch-star-big" : "sc-btn"} watch-star ${on ? "on" : ""}`}
      aria-pressed={on}
      onClick={() => toggle(stock)}
      title={label}
    >
      <Star size={variant === "big" ? 16 : 14} fill={on ? "currentColor" : "none"} />
      {on ? "관심종목" : "관심종목 담기"}
    </button>
  );
}
