import { TrendingUp, TrendingDown, Minus } from "lucide-react";

// `change` is optional — pages that haven't merged in live price data yet
// (e.g. the sample news feed, before it's wired to /api/stocks) just omit it
// and the chip renders without a % badge.
export default function StockChip({ name, code, market, change }) {
  const hasChange = typeof change === "number";
  const isUp = hasChange && change > 0;
  const isDown = hasChange && change < 0;
  const cls = isUp ? "up" : isDown ? "down" : "flat";
  const Icon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;
  return (
    <span className="chip">
      <span style={{ fontWeight: 500 }}>{name}</span>
      <span className="code">{code}</span>
      {hasChange && (
        <span className={`mono ${cls}`} style={{ display: "inline-flex", alignItems: "center", gap: 2, fontWeight: 600 }}>
          <Icon size={11} strokeWidth={2.5} />
          {isUp ? "+" : ""}
          {change.toFixed(1)}%
        </span>
      )}
    </span>
  );
}
