"use client";

import { useState } from "react";
import { TrendingUp, TrendingDown, Minus, AlertTriangle } from "lucide-react";

// `change` is optional (themes page has it, news feed doesn't). `catalyst`
// is the (optional) confirmed negative-catalyst label for this specific
// stock (e.g. "유상증자") — set by the poll route when Claude flags one.
export default function StockChip({ name, code, market, change, catalyst }) {
  const [copied, setCopied] = useState(false);
  const hasChange = typeof change === "number";
  const isUp = hasChange && change > 0;
  const isDown = hasChange && change < 0;
  const cls = isUp ? "up" : isDown ? "down" : "flat";
  const Icon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;

  async function handleClick() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // clipboard API unavailable (e.g. insecure context) — fail quietly
    }
  }

  return (
    <button type="button" onClick={handleClick} className={`chip ${catalyst ? "chip-bad" : ""}`}>
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
      {copied && <span className="chip-copied">코드 복사됨!</span>}
    </button>
  );
}
