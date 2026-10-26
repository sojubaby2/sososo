"use client";

// components/NewsBoard.js
//
// [2026-10-26 신설] 실시간 속보 — "헤드라인 + 테이프" 방식
//
// 재성님: "채팅방 컨셉이 스크롤 내리는 게 불편하고 시인성이 안 나온다"
// → 시안 3개(속보 테이프 / 헤드라인+테이프 / 목록+상세) 중 2번으로 결정.
//
// 채팅방(components/ChatMessage.js)과 다른 점:
//   1. 최신이 맨 위입니다. 뉴스는 위에서 아래로 읽으니까요.
//   2. 속보 칸 안의 따로 스크롤이 없습니다. 페이지 하나만 내리면 됩니다
//      (예전엔 페이지 스크롤 + 속보 칸 스크롤 두 겹이라 휴대폰에서 불편했음).
//   3. 크기가 셋으로 나뉩니다.
//        ┌ 헤드라인(가장 최근 1건) ─ 신문 1면처럼 크게 + 오른쪽에 관련 종목 시세
//        ├ 다음 2건 ─ 중간 크기, 나란히
//        └ 나머지 ─ 한 줄에 한 건(시각·테마·제목·대장주 등락률). 누르면 펼쳐짐
//      그래서 "지금 뭐가 터졌는지"는 크게, 나머지는 한 화면에 많이 보입니다.
//   4. 시각 옆에 "3분 전"처럼 얼마나 됐는지 보여주고, 15분이 안 된 속보는
//      시각이 호박색입니다(따끈한 속보 표시). 1분마다 저절로 다시 계산합니다.
//
// 섞은 것(시안 1·3에서 가져옴):
//   · 한 줄 목록을 누르면 그 자리에서 펼쳐지는 방식(시안 1)
//   · 헤드라인 오른쪽 "관련 종목" 칸에 종목마다 왜 붙었는지 한 줄씩(시안 3)
//
// ChatMessage.js 파일은 지우지 않았습니다(되돌릴 때를 위해). 지금은 안 쓰입니다.

import { useEffect, useState } from "react";
import { ChevronRight, AlertTriangle, ShieldAlert, ExternalLink } from "lucide-react";
import StockChip from "./StockChip";

const FRESH_MINUTES = 15; // 이 시간 안에 들어온 속보는 시각을 호박색으로

function minutesAgo(ts, now) {
  const t = Date.parse(ts || "");
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now - t) / 60000));
}
function agoText(m) {
  if (m === null) return "";
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  if (m < 60 * 24) return `${Math.floor(m / 60)}시간 전`;
  return `${Math.floor(m / 1440)}일 전`;
}
// "2026/10/26 09:14" → "09:14", 오늘이 아니면 "10/24 17:43"
function clockText(time, m) {
  const [d, hm] = String(time || "").split(" ");
  if (!hm) return time || "";
  if (m !== null && m < 60 * 12) return hm;
  const [, mm, dd] = d.split("/");
  return `${Number(mm)}/${Number(dd)} ${hm}`;
}
function pct(v) {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
}
function tone(v) {
  if (typeof v !== "number" || !Number.isFinite(v)) return "flat";
  return v > 0 ? "up" : v < 0 ? "down" : "flat";
}

// 악재 / 시장 추정 표시. "관련주 확정"은 대부분이라 표시하지 않습니다(소음).
function Flags({ n }) {
  return (
    <>
      {n.badCatalyst && (
        <span className="nb-flag bad" title={n.badCatalyst}>
          <AlertTriangle size={11} aria-hidden="true" />
          악재
        </span>
      )}
      {n.confidence === "rumor" && !n.badCatalyst && (
        <span className="nb-flag rumor">
          <ShieldAlert size={11} aria-hidden="true" />
          시장 추정
        </span>
      )}
    </>
  );
}

function Chips({ n }) {
  if (!n.stocks?.length) return null;
  return (
    <div className="chip-row nb-chips">
      {n.stocks.map((s) => (
        <StockChip key={s.code} name={s.name} code={s.code} market={s.market} change={s.change} catalyst={s.catalyst} />
      ))}
    </div>
  );
}

function Reasons({ n }) {
  const reasons = Array.isArray(n.reasons) && n.reasons.length ? n.reasons : n.reason ? [n.reason] : [];
  if (!reasons.length) return null;
  return (
    <div className="nb-why">
      <p className="nb-label">왜 이 종목인가</p>
      <ul>
        {reasons.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
    </div>
  );
}

function OriginalLink({ n }) {
  if (!n.link) return null;
  return (
    <a href={n.link} target="_blank" rel="noopener noreferrer" className="nb-orig">
      원문 보기
      <ExternalLink size={12} aria-hidden="true" />
    </a>
  );
}

export default function NewsBoard({ items, newIds }) {
  // "몇 분 전"을 1분마다 다시 계산하기 위한 시계
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  // 한 줄 목록에서 펼쳐 둔 속보들(id 묶음)
  const [open, setOpen] = useState(() => new Set());
  function toggle(id) {
    setOpen((cur) => {
      const next = new Set(cur);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  if (!items?.length) return null;
  const [lead, ...others] = items;
  const second = others.slice(0, 2);
  const rest = others.slice(2);
  const isNew = (n) => newIds?.has(n.id);

  const leadM = minutesAgo(lead.ts, now);

  return (
    <div className="nb">
      {/* ── 헤드라인: 가장 최근 1건 ── */}
      <article className={`nb-lead ${isNew(lead) ? "nb-arrive" : ""}`}>
        <div className="nb-lead-main">
          <div className="nb-meta">
            <span className={`nb-ago ${leadM !== null && leadM < FRESH_MINUTES ? "fresh" : ""}`}>{agoText(leadM)}</span>
            <span className="mono">{clockText(lead.time, leadM)}</span>
            {lead.theme && <span>{lead.theme}</span>}
            <Flags n={lead} />
          </div>
          <h2 className="nb-lead-title">{lead.headline}</h2>
          {lead.summary && <p className="nb-lead-sum">{lead.summary}</p>}
          <div className="nb-actions">
            <OriginalLink n={lead} />
          </div>
        </div>
        {lead.stocks?.length > 0 && (
          <aside className="nb-lead-side" aria-label="관련 종목">
            <p className="nb-label">관련 종목</p>
            {lead.stocks.map((s, i) => (
              <div className="nb-stk" key={s.code}>
                <span className="nb-stk-nm">
                  {s.catalyst && <AlertTriangle size={12} className="chip-bad-icon" aria-label="악재" />}
                  {s.name}
                  <span className="mono nb-stk-code">{s.code}</span>
                </span>
                <span className={`mono nb-stk-pct ${tone(s.change)}`}>{pct(s.change)}</span>
                {lead.reasons?.[i] && <span className="nb-stk-why">{lead.reasons[i]}</span>}
              </div>
            ))}
          </aside>
        )}
      </article>

      {/* ── 다음 2건: 중간 크기 ── */}
      {second.length > 0 && (
        <div className="nb-second">
          {second.map((n) => {
            const m = minutesAgo(n.ts, now);
            return (
              <article key={n.id} className={isNew(n) ? "nb-arrive" : ""}>
                <div className="nb-meta">
                  <span className={`nb-ago ${m !== null && m < FRESH_MINUTES ? "fresh" : ""}`}>{agoText(m)}</span>
                  <span className="mono">{clockText(n.time, m)}</span>
                  {n.theme && <span>{n.theme}</span>}
                  <Flags n={n} />
                </div>
                <h3 className="nb-second-title">{n.headline}</h3>
                <Chips n={n} />
                <div className="nb-actions">
                  <OriginalLink n={n} />
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* ── 나머지: 한 줄에 한 건, 누르면 펼침 ── */}
      {rest.length > 0 && (
        <ul className="nb-tape">
          {rest.map((n) => {
            const m = minutesAgo(n.ts, now);
            const lead0 = n.stocks?.[0];
            const isOpen = open.has(n.id);
            return (
              <li key={n.id} className={`${isOpen ? "open" : ""} ${isNew(n) ? "nb-arrive" : ""}`}>
                <button type="button" className="nb-row" aria-expanded={isOpen} onClick={() => toggle(n.id)}>
                  <span className={`nb-time mono ${m !== null && m < FRESH_MINUTES ? "fresh" : ""}`} title={agoText(m)}>
                    {clockText(n.time, m)}
                  </span>
                  <span className="nb-theme">{n.theme || ""}</span>
                  <span className="nb-head">
                    <span className="nb-head-text">{n.headline}</span>
                    <Flags n={n} />
                  </span>
                  {lead0 ? (
                    <span className="nb-leadstk">
                      <span className="nm">{lead0.name}</span>
                      <span className={`mono ${tone(lead0.change)}`}>{pct(lead0.change)}</span>
                      {n.stocks.length > 1 && <span className="more mono">+{n.stocks.length - 1}</span>}
                    </span>
                  ) : (
                    <span />
                  )}
                  <ChevronRight size={14} className="nb-chev" aria-hidden="true" />
                </button>
                {isOpen && (
                  <div className="nb-detail">
                    {n.summary && <p className="nb-detail-sum">{n.summary}</p>}
                    <Chips n={n} />
                    <Reasons n={n} />
                    <div className="nb-actions">
                      <OriginalLink n={n} />
                      <span className="nb-ago">{agoText(m)}</span>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
