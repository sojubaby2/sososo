"use client";

// components/ChatMessage.js
//
// [2026-10-21 신설] 속보 한 건을 "채팅 말풍선"으로 보여줍니다.
// 재성님 요청: "실시간 속보 UI를 채팅창처럼 보이게"
//
// 기존 components/NewsCard.js는 지우지 않았습니다. 패턴검색·테마 같은
// 다른 페이지에서 계속 쓰고 있고, 혹시 채팅 모양이 마음에 안 드실 때
// 되돌릴 곳이 필요하기 때문입니다.
//
// ── 말풍선 구성 ──────────────────────────────────────────────────────
//   [테마]  ← 동그란 아이콘. 보낸 사람 자리입니다.
//           테마 이름 · 09:14 · NEW
//           ┌────────────────────────┐
//           │ 기사 제목               │
//           │ 요약                    │
//           └────────────────────────┘
//           [뷰노 +0.8%] [루닛 +1.4%]   ← 말풍선 밖에 붙는 칩
//           왜 이 종목인가 ▾            ← 눌러야 펼쳐집니다
//
// "왜 이 종목인가"를 접어둔 이유: 채팅은 짧아야 채팅처럼 보입니다.
// 근거까지 전부 펼쳐두면 말풍선이 카드만큼 길어져서 의미가 없어집니다.

import { useState } from "react";
import { CheckCircle2, ShieldAlert, AlertTriangle, ExternalLink, ChevronDown } from "lucide-react";
import StockChip from "./StockChip";

// 동그란 아이콘 안에 넣을 짧은 글자를 만듭니다.
// "인공지능(AI)" -> "AI", "사이버 보안" -> "보안" 처럼 뒤쪽을 씁니다.
// 괄호 안에 영문 약자가 있으면 그걸 우선합니다 — 제일 알아보기 쉽습니다.
function shortLabel(theme, source) {
  const base = String(theme || source || "속보").trim();
  const paren = base.match(/\(([A-Za-z0-9]{2,4})\)/);
  if (paren) return paren[1];
  const words = base.replace(/\(.*?\)/g, "").trim().split(/\s+/);
  const last = words[words.length - 1] || base;
  return last.slice(0, 3);
}

export default function ChatMessage({ n, isNew, onThemeClick }) {
  const [open, setOpen] = useState(false);
  const isRumor = n.confidence === "rumor";
  const reasons = Array.isArray(n.reasons) && n.reasons.length ? n.reasons : n.reason ? [n.reason] : [];

  // time은 "2026/10/21 09:14" 형태입니다. 말풍선에는 시:분만 씁니다
  // (날짜는 위쪽 날짜 구분선이 알려줍니다).
  const clock = String(n.time || "").split(" ")[1] || n.time;
  const sender = n.theme || n.source || "속보";

  return (
    <div className={`chat-row ${isNew ? "new-enter" : ""}`}>
      <div className={`chat-av ${n.badCatalyst ? "bad" : isRumor ? "rumor" : ""}`} aria-hidden="true">
        {shortLabel(n.theme, n.source)}
      </div>

      <div className="chat-main">
        <div className="chat-meta">
          {n.theme ? (
            <button type="button" className="chat-sender" onClick={() => onThemeClick?.(n.theme)}>
              {sender}
            </button>
          ) : (
            <span className="chat-sender as-text">{sender}</span>
          )}
          <span className="chat-clock mono">{clock}</span>
          {isNew && <span className="chat-new">NEW</span>}
          {n.badCatalyst && (
            <span className="chat-flag bad" title={n.badCatalyst}>
              <AlertTriangle size={10} />
              악재
            </span>
          )}
          {isRumor && (
            <span className="chat-flag rumor">
              <ShieldAlert size={10} />
              시장 추정
            </span>
          )}
          {!isRumor && !n.badCatalyst && (
            <span className="chat-flag ok">
              <CheckCircle2 size={10} />
              관련주 확정
            </span>
          )}
        </div>

        <div className={`chat-bubble ${isNew ? "unread" : ""}`}>
          <h3 className="chat-title">{n.headline}</h3>
          {n.summary && <p className="chat-sum">{n.summary}</p>}
        </div>

        {n.stocks?.length > 0 && (
          <div className="chip-row chat-chips">
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

        <div className="chat-foot">
          {reasons.length > 0 && (
            <button type="button" className="chat-more" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
              왜 이 종목인가
              <ChevronDown size={12} className={open ? "flip" : ""} />
            </button>
          )}
          {/* [2026-10-21 수정] 재성님 — "원문 보러 가기 있어야 된다".
              작은 회색 글씨 "원문"이라 잘 안 보였습니다. 알약 모양 단추로
              바꾸고 이름도 제대로 적었습니다. */}
          {n.link && (
            <a href={n.link} target="_blank" rel="noopener noreferrer" className="chat-link">
              원문 보러 가기
              <ExternalLink size={11} />
            </a>
          )}
        </div>

        {open && reasons.length > 0 && (
          <ul className="chat-why">
            {reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
