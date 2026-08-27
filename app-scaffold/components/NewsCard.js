import { Clock, CheckCircle2, ShieldAlert, ExternalLink } from "lucide-react";
import StockChip from "./StockChip";

export default function NewsCard({ n, isNew }) {
  const isRumor = n.confidence === "rumor";
  return (
    <article className={`news-card ${isRumor ? "rumor" : ""} ${isNew ? "new-enter" : ""}`}>
      <div className="news-meta">
        <Clock size={12} />
        <span>{n.time}</span>
        <span>·</span>
        <span>{n.source}</span>
      </div>

      <h3 className="news-title">{n.headline}</h3>

      <span className={`credibility-tag ${isRumor ? "rumor" : "confirmed"}`}>
        {isRumor ? <ShieldAlert size={11} /> : <CheckCircle2 size={11} />}
        {isRumor ? "시장 추정" : "관련주 확정"}
      </span>

      <div className="chip-row">
        {n.stocks.map((s, i) => (
          <StockChip key={s.code} name={s.name} code={s.code} market={s.market} change={s.change} isLead={i === 0 && n.stocks.length > 1} />
        ))}
      </div>

      <p className="news-summary">{n.summary}</p>

      <p className="news-reason">
        <strong>근거</strong> · {n.reason}
      </p>

      {n.link && (
        <a href={n.link} target="_blank" rel="noopener noreferrer" className="news-link">
          <ExternalLink size={12} />
          원문 기사 전체 보기
        </a>
      )}
    </article>
  );
}
