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
//
// [2026-10-26 오후 추가] "속보 느낌" — 재성님: "뭔가 속보 느낌이 안 난다"
//   TV 뉴스 속보 화면에서 가져온 네 가지:
//   ① 빨간 "속보" 딱지 — 15분 안에 들어온 속보에만 붙습니다. 그래서 딱지가
//      붙어 있으면 "지금 막 터진 것"이라는 뜻이 됩니다.
//   ② 아래로 흐르는 자막 띠 — 맨 위에 최근 속보 제목 6개가 오른쪽→왼쪽으로
//      흘러갑니다(마우스를 올리면 멈춤). 오른쪽 끝에 초 단위 시계.
//   ③ 말머리 딱지 — 제목 앞의 [단독]·[속보]·[특징주] 같은 말머리를 글자에서
//      떼어내 딱지로 붙입니다. [단독]·[속보]는 빨간 테두리라 눈에 띕니다.
//   ④ 새 속보가 들어오면 빨갛게 번쩍였다가 사라집니다(예전엔 호박색).
//   빨강(#e5383b 계열)은 "속보 표시" 전용입니다. 주가 상승 빨강(--up)과는
//   모양으로 구분됩니다 — 속보는 꽉 찬 딱지, 주가는 숫자 글자색.
//   ★ 컴퓨터에서 "움직임 줄이기"를 켜둔 사람에게는 자막이 흐르지 않고
//     첫 제목만 가만히 보입니다.

import { Fragment, useEffect, useState } from "react";
import { ChevronRight, AlertTriangle, ShieldAlert, ExternalLink } from "lucide-react";
import StockChip from "./StockChip";
import { openStockChart } from "../lib/openStockChart";

const FRESH_MINUTES = 15; // 이 시간 안에 들어온 속보에 빨간 "속보" 딱지 + 시각 빨강
const CRAWL_COUNT = 6; // 자막 띠에 흘릴 최근 속보 개수

// 제목 앞 말머리 떼어내기: "[단독] 삼성..." → { tags: ["단독"], text: "삼성..." }
// 여러 개가 붙어 있어도 됩니다("[속보][단독] ..."). 7글자 넘는 괄호는 말머리로 안 봅니다.
const HOT_TAGS = new Set(["단독", "속보", "긴급", "1보", "2보"]);
function splitTags(headline) {
  let text = String(headline || "");
  const tags = [];
  for (;;) {
    const m = text.match(/^\s*[\[【]([^\]】]{1,7})[\]】]\s*/);
    if (!m) break;
    tags.push(m[1].trim());
    text = text.slice(m[0].length);
  }
  return { tags, text };
}
function TagBadges({ tags }) {
  if (!tags.length) return null;
  return tags.map((t) => (
    <span key={t} className={`nb-tag ${HOT_TAGS.has(t) ? "hot" : ""}`}>{t}</span>
  ));
}
function BreakingBadge() {
  return <span className="nb-breaking">속보</span>;
}

// 자막 띠 오른쪽 끝 시계 — 1초마다 바뀝니다(한국 시간).
function LiveClock() {
  const [t, setT] = useState(null);
  useEffect(() => {
    const tick = () => {
      const k = new Date(Date.now() + 9 * 3600 * 1000);
      setT([k.getUTCHours(), k.getUTCMinutes(), k.getUTCSeconds()].map((x) => String(x).padStart(2, "0")).join(":"));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="nb-clock mono" aria-hidden="true">{t || "\u00a0"}</span>;
}

// 흐르는 자막 띠. 같은 목록을 두 번 이어 붙여서 끊김 없이 돌게 합니다.
function Crawl({ items }) {
  const list = items.slice(0, CRAWL_COUNT).map((n) => ({ id: n.id, ...splitTags(n.headline) }));
  if (!list.length) return null;
  const seq = (dup) =>
    list.map((n) => (
      <span className="nb-crawl-item" key={`${dup}-${n.id}`} aria-hidden={dup ? "true" : undefined}>
        {n.text}
      </span>
    ));
  return (
    <div className="nb-crawl" role="marquee" aria-label="최근 속보 제목">
      <span className="nb-crawl-label">
        <span className="nb-live-dot" aria-hidden="true" />
        속보
      </span>
      <div className="nb-crawl-view">
        <div className="nb-crawl-track" style={{ animationDuration: `${Math.max(28, list.length * 9)}s` }}>
          {seq(0)}
          {seq(1)}
        </div>
      </div>
      <LiveClock />
    </div>
  );
}

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

// [2026-10-27] 휴대폰에서 처음에 보여 줄 한 줄 속보 수(맨 위 큰 속보 3건은 별도)
//   [2026-10-27 오후 12 → 30] 휴대폰 화면이 탭으로 나뉘면서 "속보" 탭에는 속보만 있으니 더 많이 보여 줍니다.
const MOBILE_TAPE = 30;

// [2026-10-27 추가] ad: 큰 기사 3건 바로 아래에 끼울 광고 칸(app/HomeClient.js가 <AdSlot />을 넘김)
// [2026-10-28 추가] 같은 광고 칸을 한 줄 목록 20번째 줄 뒤에도 하나 더(AD_TAPE_AT) — 목록이 길 때만
const AD_TAPE_AT = 20;
export default function NewsBoard({ items, newIds, ad = null }) {
  // "몇 분 전"을 1분마다 다시 계산하기 위한 시계
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  // 한 줄 목록에서 펼쳐 둔 속보들(id 묶음)
  const [open, setOpen] = useState(() => new Set());
  // [2026-10-27 추가] 휴대폰에서는 한 줄 목록을 처음 MOBILE_TAPE건만 보여 줍니다.
  //   속보 60건이 화면 7개 길이를 차지해서 그 아래(대표 종목·급등주·HOT 테마)가 사실상 안 보였기 때문.
  //   숨기는 건 CSS(globals.css의 .nb-mhide, 860px 이하에서만)라 PC 화면은 그대로입니다.
  const [showAll, setShowAll] = useState(false);
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
  const isFresh = (m) => m !== null && m < FRESH_MINUTES;
  const leadT = splitTags(lead.headline);

  return (
    <div className="nb">
      <Crawl items={items} />

      {/* ── 헤드라인: 가장 최근 1건 ── */}
      <article className={`nb-lead ${isFresh(leadM) ? "is-fresh" : ""} ${isNew(lead) ? "nb-arrive" : ""}`}>
        <div className="nb-lead-main">
          <div className="nb-meta">
            {isFresh(leadM) && <BreakingBadge />}
            <TagBadges tags={leadT.tags} />
            <span className={`nb-ago ${isFresh(leadM) ? "fresh" : ""}`}>{agoText(leadM)}</span>
            <span className="mono">{clockText(lead.time, leadM)}</span>
            {lead.theme && <span>{lead.theme}</span>}
            <Flags n={lead} />
          </div>
          <h2 className="nb-lead-title">{leadT.text}</h2>
          {lead.summary && <p className="nb-lead-sum">{lead.summary}</p>}
          <div className="nb-actions">
            <OriginalLink n={lead} />
          </div>
        </div>
        {lead.stocks?.length > 0 && (
          <aside className="nb-lead-side" aria-label="관련 종목">
            <p className="nb-label">관련 종목</p>
            {/* [2026-10-26 변경] 종목 한 줄을 누르면 일봉 차트 창이 뜹니다
                [2026-10-28 변경] 재성님: "관련주가 많으면 하단 공간이 너무 여백이 큰데 관련주를 그냥 밑으로 넣는게 낫지않아?"
                → 오른쪽 세로 칸 대신 기사 아래에 바둑판(한 줄에 3~4개)으로. 모양은 globals.css .nb-stk-grid */}
            <div className="nb-stk-grid">
            {lead.stocks.map((s, i) => (
              <button
                type="button"
                className="nb-stk"
                key={s.code}
                onClick={() => openStockChart({ code: s.code, name: s.name, market: s.market })}
                title={`${s.name} 일봉 차트 보기`}
              >
                <span className="nb-stk-nm">
                  {s.catalyst && <AlertTriangle size={12} className="chip-bad-icon" aria-label="악재" />}
                  {s.name}
                  <span className="mono nb-stk-code">{s.code}</span>
                </span>
                <span className={`mono nb-stk-pct ${tone(s.change)}`}>{pct(s.change)}</span>
                {lead.reasons?.[i] && <span className="nb-stk-why">{lead.reasons[i]}</span>}
              </button>
            ))}
            </div>
          </aside>
        )}
      </article>

      {/* ── 다음 2건: 중간 크기 ── */}
      {second.length > 0 && (
        <div className="nb-second">
          {second.map((n) => {
            const m = minutesAgo(n.ts, now);
            const tt = splitTags(n.headline);
            return (
              <article key={n.id} className={`${isFresh(m) ? "is-fresh" : ""} ${isNew(n) ? "nb-arrive" : ""}`}>
                <div className="nb-meta">
                  {isFresh(m) && <BreakingBadge />}
                  <TagBadges tags={tt.tags} />
                  <span className={`nb-ago ${isFresh(m) ? "fresh" : ""}`}>{agoText(m)}</span>
                  <span className="mono">{clockText(n.time, m)}</span>
                  {n.theme && <span>{n.theme}</span>}
                  <Flags n={n} />
                </div>
                <h3 className="nb-second-title">{tt.text}</h3>
                <Chips n={n} />
                <div className="nb-actions">
                  <OriginalLink n={n} />
                </div>
              </article>
            );
          })}
        </div>
      )}

      {ad}

      {/* ── 나머지: 한 줄에 한 건, 누르면 펼침 ── */}
      {rest.length > 0 && (
        <ul className="nb-tape">
          {rest.map((n, idx) => {
            const m = minutesAgo(n.ts, now);
            const lead0 = n.stocks?.[0];
            const isOpen = open.has(n.id);
            const tt = splitTags(n.headline);
            const mHide = !showAll && idx >= MOBILE_TAPE;
            return (
              <Fragment key={n.id}>
              {ad && idx === AD_TAPE_AT && (
                <li className={`nb-adrow ${mHide ? "nb-mhide" : ""}`}>{ad}</li>
              )}
              <li className={`${isOpen ? "open" : ""} ${isNew(n) ? "nb-arrive" : ""} ${mHide ? "nb-mhide" : ""}`}>
                <button type="button" className="nb-row" aria-expanded={isOpen} onClick={() => toggle(n.id)}>
                  <span className={`nb-time mono ${isFresh(m) ? "fresh" : ""}`} title={agoText(m)}>
                    {clockText(n.time, m)}
                  </span>
                  <span className="nb-theme">{n.theme || ""}</span>
                  <span className="nb-head">
                    {isFresh(m) && <BreakingBadge />}
                    <TagBadges tags={tt.tags} />
                    <span className="nb-head-text">{tt.text}</span>
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
              </Fragment>
            );
          })}
        </ul>
      )}
      {!showAll && rest.length > MOBILE_TAPE && (
        <button type="button" className="nb-mmore" onClick={() => setShowAll(true)}>
          지난 속보 더 보기 ({rest.length - MOBILE_TAPE}건)
        </button>
      )}
    </div>
  );
}
