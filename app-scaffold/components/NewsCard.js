import { Clock, CheckCircle2, ShieldAlert, AlertTriangle, ExternalLink } from "lucide-react";
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

      <div className="credibility-row">
        <span className={`credibility-tag ${isRumor ? "rumor" : "confirmed"}`}>
          {isRumor ? <ShieldAlert size={11} /> : <CheckCircle2 size={11} />}
          {isRumor ? "시장 추정" : "관련주 확정"}
        </span>
                {n.badCatalyst && (
          <span className="credibility-tag bad" title={n.badCatalyst}>
            <AlertTriangle size={11} />
            악재
          </span>
        )}
      </div>

      <div className="chip-row">
        {n.stocks.map((s) => (
          <StockChip key={s.code} name={s.name} code={s.code} market={s.market} change={s.change} catalyst={s.catalyst} />
        ))}
      </div>

      {/* [2026-09-08 수정] 제목+링크만 있고 본문이 없던 메시지는 summary가
          빈 문자열로 옴(app/api/telegram-ingest/route.js 참고) — 그 경우
          제목을 또 보여주는 대신 이 줄 자체를 생략함. */}
      {n.summary && <p className="news-summary">{n.summary}</p>}

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
