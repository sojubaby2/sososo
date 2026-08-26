import { TrendingUp, TrendingDown, Minus } from "lucide-react";

// `change` is optional (themes page has it, news feed doesn't — that's
// intentional, see the change log on why daily change was dropped from
// the news feed). `confidence` (confirmed | theme | rumor) is optional too,
// shown as a small colored dot when present.
export default function StockChip({ name, code, market, change, confidence }) {
  const hasChange = typeof change === "number";
  const isUp = hasChange && change > 0;
  const isDown = hasChange && change < 0;
  const cls = isUp ? "up" : isDown ? "down" : "flat";
  const Icon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;
  return (
    <span className="chip">
      {confidence && <span className={`dot ${confidence}`} />}
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
