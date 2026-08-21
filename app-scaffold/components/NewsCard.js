import { Clock, ShieldAlert, ShieldCheck, ExternalLink } from "lucide-react";
import StockChip from "./StockChip";

export default function NewsCard({ n }) {
  const isRumor = n.confidence === "rumor";
  return (
    <article className={`news-card ${isRumor ? "rumor" : ""}`}>
      <div className="news-meta">
        <Clock size={12} />
        <span>{n.time}</span>
        <span>·</span>
        <span>{n.source}</span>
      </div>
      <h3 className="news-title">{n.headline}</h3>
      <p className="news-summary">{n.summary}</p>
      {n.link && (
        <a href={n.link} target="_blank" rel="noopener noreferrer" className="news-link">
          <ExternalLink size={12} />
          원문 기사 전체 보기
        </a>
      )}
      <div className={`reason-box ${isRumor ? "rumor" : "confirmed"}`}>
        {isRumor ? <ShieldAlert size={14} style={{ marginTop: 2, flexShrink: 0 }} /> : <ShieldCheck size={14} style={{ marginTop: 2, flexShrink: 0 }} />}
        <span>
          <strong>{isRumor ? "시장 추정 · 검증되지 않은 연관 — " : "관련주 (사업근거 확인) — "}</strong>
          {n.reason}
        </span>
      </div>
      <div className="chip-row">
        {n.stocks.map((s) => (
          <StockChip key={s.code} name={s.name} code={s.code} market={s.market} change={s.change} />
        ))}
      </div>
    </article>
  );
}
