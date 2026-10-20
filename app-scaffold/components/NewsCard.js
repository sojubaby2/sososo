import { CheckCircle2, ShieldAlert, AlertTriangle, ExternalLink } from "lucide-react";
import StockChip from "./StockChip";

// components/NewsCard.js
//
// [2026-10-19 디자인 개편] 신문 기사 모양으로 바꿨습니다.
//
// 바뀐 점:
//  · 제목을 키우고 명조체로 — 카드의 주인공이 됩니다
//  · 근거를 "/"로 이어 붙인 한 줄 대신 줄바꿈된 목록으로
//  · 종목 칩에 등락률 표시 (아래 설명 참고)
//  · "원문 기사 전체 보기"를 큰 주황 버튼에서 작은 글자 링크로 —
//    버튼이 제목보다 눈에 띄던 문제를 고쳤습니다
//
// [2026-10-19 수정] 재성님 요청 — "오늘의 머리기사"를 없애고 "실시간 속보"
// 최근 3건으로 바꿨습니다. 머리기사 하나만 크게 띄우는 방식은 하루를
// 정리해 보여주기엔 좋지만, 이 사이트는 지금 막 들어온 속보를 보러 오는
// 곳이라 최근 것 여러 건을 같이 보여주는 쪽이 맞습니다.
// 그래서 모양이 하나로 합쳐졌고, 크기만 다릅니다.
//
// 종목 등락률에 대해:
// 이 숫자는 원래부터 데이터에 들어 있었는데(lib/newsPipeline.js의
// finalizeMatches가 붙여줍니다) 화면으로 넘기는 과정에서 버려지고
// 있었습니다. 이제 app/HomeClient.js의 toCardShape가 같이 넘겨줍니다.
// 홈 화면에서는 app/page.js가 지금 시세로 한 번 더 갱신해 줍니다.
//
// variant:
//   "top"   — 실시간 속보. 가로로 넓고 제목이 큽니다(최근 3건).
//   "story" — 그 밖의 속보. 2단 격자에 들어가는 작은 카드.

export default function NewsCard({ n, isNew, variant = "story" }) {
  const isRumor = n.confidence === "rumor";
  const reasons = Array.isArray(n.reasons) && n.reasons.length ? n.reasons : n.reason ? [n.reason] : [];
  const isTop = variant === "top";

  return (
    <article className={`story ${isTop ? "story-top" : ""} ${isRumor ? "rumor" : ""} ${isNew ? "new-enter" : ""}`}>
      <div className="story-meta">
        <b>{n.time}</b>
        {n.badCatalyst && <span className="story-bad">악재</span>}
        {n.theme && <span>· {n.theme}</span>}
        {isRumor && <span>· 시장 추정</span>}
        {n.source && <span>· {n.source}</span>}
      </div>

      <h3 className="story-title">{n.headline}</h3>

      {n.summary && <p className="story-summary">{n.summary}</p>}

      {n.stocks?.length > 0 && (
        <div className="chip-row">
          {n.stocks.map((s) => (
            <StockChip
              key={s.code}
              name={s.name}
              code={s.code}
              market={s.market}
              change={s.change}
              catalyst={s.catalyst}
            />
          ))}
        </div>
      )}

      {reasons.length > 0 && (
        <div className="story-why">
          <div className="panel-label">{isTop ? "왜 이 종목인가" : "근거"}</div>
          <ul>
            {reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="story-foot">
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
        {n.link && (
          <a href={n.link} target="_blank" rel="noopener noreferrer" className="story-link">
            {isTop ? "원문 기사 전체 보기" : "원문 보기"}
            <ExternalLink size={11} />
          </a>
        )}
      </div>
    </article>
  );
}
