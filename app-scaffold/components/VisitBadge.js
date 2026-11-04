"use client";

// components/VisitBadge.js
//
// [2026-11-04 신설] 머리띠 오른쪽 위 👁 누적 방문 숫자 (예: 👁 5.28k)
//   재성님: "눈 모양 해놓고 숫자 띄우기, 단위도 Cloudflare처럼 5.28k 식으로"
//   숫자는 실제로 센 값만 씁니다 — 설명은 app/api/visits/route.js
//
//   · 이 브라우저가 오늘 처음 들어왔으면 1을 더하고(POST), 이미 셌으면 숫자만 받아 옴(GET)
//   · 숫자를 못 받아 오면 칸 자체를 안 보여 줌

import { useEffect, useState } from "react";
import { Eye } from "lucide-react";

// 5280 → "5.28k", 12340 → "12.3k", 123400 → "123k", 1234000 → "1.23M"
export function shortCount(n) {
  if (!Number.isFinite(n)) return "";
  if (n < 1000) return String(n);
  const units = [
    [1e6, "M"],
    [1e3, "k"],
  ];
  for (const [v, u] of units) {
    if (n >= v) {
      const x = n / v;
      const digits = x >= 100 ? 0 : x >= 10 ? 1 : 2;
      // 반올림 대신 내림 — 실제보다 큰 숫자로 보이지 않게
      const f = Math.floor(x * 10 ** digits) / 10 ** digits;
      return `${f.toFixed(digits)}${u}`;
    }
  }
  return String(n);
}

function kstDay() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export default function VisitBadge() {
  const [total, setTotal] = useState(null);

  useEffect(() => {
    let first = false;
    try {
      const today = kstDay();
      if (localStorage.getItem("nm-visit-day") !== today) {
        localStorage.setItem("nm-visit-day", today);
        first = true;
      }
    } catch {}
    fetch("/api/visits", { method: first ? "POST" : "GET" })
      .then((r) => r.json())
      .then((d) => {
        if (typeof d?.total === "number") setTotal(d.total);
      })
      .catch(() => {});
  }, []);

  if (total === null) return null;
  return (
    <span className="visit-badge" title={`누적 방문 ${total.toLocaleString("ko-KR")} (10월 5일부터, 한 사람 하루 한 번씩 셈)`}>
      <Eye size={14} strokeWidth={2.2} aria-hidden="true" />
      <span className="mono">{shortCount(total)}</span>
      <span className="sr-only">누적 방문</span>
    </span>
  );
}
