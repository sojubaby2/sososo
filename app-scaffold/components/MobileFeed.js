"use client";

// components/MobileFeed.js
//
// [2026-10-27 신설] 휴대폰 화면 부품 모음.
// [2026-10-28 개편] 재성님: "모바일 화면 맘에안드는데 다시 바꾸자 — 훨씬 혁신적인 모바일 화면" → 시안 A+B 선택.
//   · 속보 탭  → components/MobileShorts.js (A. 숏폼 속보 — 속보 한 건이 화면 하나, 위로 밀면 다음)
//   · 테마 탭  → components/ThemeRadar.js  (B. 테마 레이더 — 속보 많이 나온 테마일수록 큰 동그라미)
//   예전 큰 카드(MobileHero)·오늘 숫자(MobilePulse)·테마 지도(ThemeMap)는 위 두 화면으로 바뀌어 지웠습니다.
//
// 이 파일에 남은 것:
//   · 여러 화면이 같이 쓰는 작은 도우미들(시간 계산, 등락률 글자, 테마별 집계, 가격 그림 Spark)
//   · HourTimeline — 속보를 1시간씩 묶은 목록. 지금은 휴대폰 "관심" 탭(관심종목 속보)에서 씁니다.
//   · [2026-10-28 오전] 속보 탭을 채팅형(C, components/MobileChat.js)으로도 바꿀 수 있게 됨 — lib/mobileLayout.js
//
// ★ PC 화면(761px 이상)에서는 이 부품들이 보이지 않고 예전 화면(components/NewsBoard.js)이 그대로 나옵니다.
//   (globals.css의 .m-only / .desk-only)
// ★ 비용: 가격 그림은 종목 차트 창과 같은 자료(/api/candles, 2분 공용 저장)를 지금 보이는 카드의 종목만 받아 옵니다.
//   나머지는 이미 화면에 있는 속보 자료로 계산합니다(추가 비용 0).

import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronDown, ExternalLink, AlertTriangle } from "lucide-react";
import { openStockChart } from "../lib/openStockChart";
import { isPoliticalTheme } from "../lib/themeData";

export const FRESH_MINUTES = 15; // 이 시간 안의 속보에 빨간 "속보" 딱지
const OPEN_GROUPS = 2; // 처음에 펼쳐 둘 시간 묶음 수

// ── 작은 도우미들 ──────────────────────────────────────────────
const KST = 9 * 3600 * 1000;
export function kstParts(ts) {
  const ms = Date.parse(ts || "");
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms + KST);
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes() };
}
export const dayKey = (p) => (p ? `${p.y}-${p.mo}-${p.d}` : "");
export const hhmm = (p) => (p ? `${String(p.h).padStart(2, "0")}:${String(p.mi).padStart(2, "0")}` : "");
export function hourLabel(h) {
  if (h === 0) return "밤 12시";
  if (h < 6) return `새벽 ${h}시`;
  if (h < 12) return `오전 ${h}시`;
  if (h === 12) return "낮 12시";
  return `오후 ${h - 12}시`;
}
export function minutesAgo(ts, now) {
  const t = Date.parse(ts || "");
  return Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / 60000)) : null;
}
export function agoText(m) {
  if (m === null) return "";
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  if (m < 1440) return `${Math.floor(m / 60)}시간 전`;
  return `${Math.floor(m / 1440)}일 전`;
}
export const isNum = (v) => typeof v === "number" && Number.isFinite(v);
export const pct = (v) => (isNum(v) ? `${v > 0 ? "+" : ""}${v.toFixed(1)}%` : "—");
export const tone = (v) => (isNum(v) ? (v > 0 ? "up" : v < 0 ? "down" : "flat") : "flat");
// 제목 앞 말머리("[단독]")는 떼어서 딱지로
export function splitTags(headline) {
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
export const HOT_TAGS = new Set(["단독", "속보", "긴급", "1보", "2보"]);

// 1분마다 다시 그리기("3분 전" 갱신용)
export function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  return now;
}

// "오늘" 속보: 가장 최근 속보와 같은 날(한국 시간). 너무 적으면(장 시작 전 등) 최근 60건.
export function todaysOf(items) {
  const k = dayKey(kstParts(items[0]?.ts));
  const today = items.filter((n) => dayKey(kstParts(n.ts)) === k);
  return today.length >= 8 ? today : items.slice(0, 60);
}

// 테마별: 속보 수 + 관련 종목 평균 등락률
export function themeStats(items) {
  const by = new Map();
  for (const n of items) {
    for (const t of n.themes || []) {
      if (!t || isPoliticalTheme(t)) continue;
      let row = by.get(t);
      if (!row) by.set(t, (row = { theme: t, count: 0, chg: new Map() }));
      row.count += 1;
      for (const s of n.stocks || []) if (isNum(s.change)) row.chg.set(s.code, s.change);
    }
  }
  return [...by.values()]
    .map((r) => {
      const vals = [...r.chg.values()];
      return { theme: r.theme, count: r.count, avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null };
    })
    .sort((a, b) => b.count - a.count || (b.avg ?? -99) - (a.avg ?? -99));
}

// ── 가격 그림(최근 20거래일 종가) ───────────────────────────────
const sparkCache = new Map(); // code → { at, closes }
const SPARK_MS = 5 * 60 * 1000;
export function Spark({ code, market, active }) {
  const [closes, setCloses] = useState(() => sparkCache.get(code)?.closes || null);
  useEffect(() => {
    if (!active || !code) return;
    const hit = sparkCache.get(code);
    if (hit && Date.now() - hit.at < SPARK_MS) {
      setCloses(hit.closes);
      return;
    }
    let alive = true;
    fetch(`/api/candles?${new URLSearchParams({ code, market: market || "" })}`)
      .then((r) => r.json())
      .then((d) => {
        const c = Array.isArray(d?.candles) ? d.candles.slice(-20).map((b) => b.c).filter(isNum) : [];
        if (c.length >= 2) {
          sparkCache.set(code, { at: Date.now(), closes: c });
          if (alive) setCloses(c);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [code, market, active]);
  if (!closes) return <span className="mf-spark mf-spark-empty" aria-hidden="true" />;
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const W = 100;
  const H = 24;
  const pts = closes
    .map((c, i) => `${((i / (closes.length - 1)) * W).toFixed(1)},${(H - 2 - ((c - min) / (max - min || 1)) * (H - 4)).toFixed(1)}`)
    .join(" ");
  const up = closes[closes.length - 1] >= closes[0];
  return (
    <svg className={`mf-spark ${up ? "up" : "down"}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// 테마 평균 등락률 → 색 단계(빨강 3단계·파랑 3단계·회색). ThemeRadar.js·MobileShorts.js가 씀
export function heatClass(avg) {
  if (!isNum(avg)) return "h0";
  if (avg >= 3) return "hu3";
  if (avg >= 1) return "hu2";
  if (avg > 0.2) return "hu1";
  if (avg <= -3) return "hd3";
  if (avg <= -1) return "hd2";
  if (avg < -0.2) return "hd1";
  return "h0";
}

// ── C. 시간대별 묶음 목록 ───────────────────────────────────────
export function groupSummary(list) {
  const stats = themeStats(list).slice(0, 2);
  let mover = null;
  for (const n of list) {
    const s = n.stocks?.[0];
    if (s && isNum(s.change) && (!mover || Math.abs(s.change) > Math.abs(mover.s.change))) mover = { n, s };
  }
  const avgs = stats.map((t) => t.avg).filter(isNum);
  const avg = avgs.length ? avgs.reduce((a, b) => a + b, 0) / avgs.length : null;
  const word = !isNum(avg) ? "" : avg >= 0.5 ? "강세" : avg <= -0.5 ? "약세" : "보합";
  return { themes: stats.map((t) => t.theme), word, wordTone: word === "보합" ? "flat" : tone(avg), mover };
}

// ad: 시간대 묶음 사이에 끼울 광고 칸(app/HomeClient.js가 <AdSlot />을 넘김)
//   [2026-10-28] 첫 묶음 아래 + 6번째 묶음 아래, 최대 2개(AD_AFTER_GROUPS). 맨 위 큰 카드·테마 지도엔 광고 없음.
const AD_AFTER_GROUPS = [1, 6];
export function HourTimeline({ items, newIds, filterKey, ad = null }) {
  const now = useNow();
  const todayKey = dayKey(kstParts(new Date().toISOString()));
  const groups = useMemo(() => {
    const out = [];
    for (const n of items) {
      const p = kstParts(n.ts);
      const key = p ? `${dayKey(p)}-${p.h}` : "etc";
      let g = out[out.length - 1];
      if (!g || g.key !== key) {
        const label = !p ? "시각 모름" : dayKey(p) === todayKey ? hourLabel(p.h) : `${p.mo}/${p.d} ${hourLabel(p.h)}`;
        out.push((g = { key, label, list: [] }));
      }
      g.list.push(n);
    }
    return out.map((g) => ({ ...g, sum: groupSummary(g.list) }));
  }, [items, todayKey]);

  // 펼침 상태: 처음엔 최근 두 묶음만. 거르기(테마 등)를 바꾸면 다시 처음 상태로.
  const [toggled, setToggled] = useState(() => new Set());
  const [openRow, setOpenRow] = useState(null);
  useEffect(() => {
    setToggled(new Set());
  }, [filterKey]);
  const isOpen = (g, i) => (i < OPEN_GROUPS) !== toggled.has(g.key);
  function flip(key) {
    setToggled((cur) => {
      const next = new Set(cur);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  if (!items.length) return null;
  return (
    <div className="mf-tl m-only">
      {groups.map((g, gi) => {
        const open = isOpen(g, gi);
        const { themes, word, wordTone, mover } = g.sum;
        return (
          <Fragment key={g.key}>
          {ad && AD_AFTER_GROUPS.includes(gi) && <Fragment key={`ad-${gi}`}>{ad}</Fragment>}
          <section className={`mf-hour ${open ? "open" : ""}`}>
            <button type="button" className="mf-hour-head" aria-expanded={open} onClick={() => flip(g.key)}>
              <span className="mf-hour-lb">{g.label}</span>
              <span className="mf-hour-n mono">속보 {g.list.length}건</span>
              <ChevronDown size={16} className="mf-hour-chev" aria-hidden="true" />
              <span className="mf-hour-sum">
                {themes.length > 0 && (
                  <>
                    <b className={wordTone}>{themes.join("·")}</b>
                    {word && <span className={wordTone}> {word}</span>}
                  </>
                )}
                {mover && (
                  <span className="mf-hour-mover">
                    {themes.length > 0 ? " — " : ""}
                    {mover.s.name} <span className={`mono ${tone(mover.s.change)}`}>{pct(mover.s.change)}</span>
                  </span>
                )}
              </span>
            </button>
            {open && (
              <ul className="mf-rows">
                {g.list.map((n) => {
                  const m = minutesAgo(n.ts, now);
                  const fresh = m !== null && m < FRESH_MINUTES;
                  const lead = n.stocks?.[0];
                  const big = lead && isNum(lead.change) && Math.abs(lead.change) >= 3;
                  const { tags: rawTags, text } = splitTags(n.headline);
                  const tags = fresh ? rawTags.filter((t) => t !== "속보") : rawTags;
                  const rowOpen = openRow === n.id;
                  return (
                    <li key={n.id} className={`mf-row ${newIds?.has(n.id) ? "mf-new" : ""} ${rowOpen ? "open" : ""}`}>
                      <span className={`mf-dot ${tone(lead?.change)} ${big ? "big" : ""}`} aria-hidden="true" />
                      <span className={`mf-time mono ${fresh ? "fresh" : ""}`}>{hhmm(kstParts(n.ts))}</span>
                      <div className="mf-body">
                        <button
                          type="button"
                          className="mf-title"
                          aria-expanded={rowOpen}
                          onClick={() => setOpenRow(rowOpen ? null : n.id)}
                        >
                          {fresh && <span className="mf-brk">속보</span>}
                          {tags.map((t) => (
                            <span key={t} className={`mf-tag ${HOT_TAGS.has(t) ? "hot" : ""}`}>
                              {t}
                            </span>
                          ))}
                          {n.badCatalyst && <span className="mf-tag bad">악재</span>}
                          {text}
                        </button>
                        {n.stocks?.length > 0 && (
                          <div className="mf-stocks">
                            {n.stocks.slice(0, 3).map((s) => (
                              <button
                                type="button"
                                key={s.code}
                                onClick={() => openStockChart({ code: s.code, name: s.name, market: s.market })}
                              >
                                {s.name} <b className={`mono ${tone(s.change)}`}>{pct(s.change)}</b>
                              </button>
                            ))}
                            {n.stocks.length > 3 && <span className="mf-more mono">+{n.stocks.length - 3}</span>}
                          </div>
                        )}
                        {rowOpen && (
                          <div className="mf-detail">
                            {n.summary && <p>{n.summary}</p>}
                            {n.reasons?.length > 0 && (
                              <ul className="mf-why">
                                {n.reasons.map((r, i) => (
                                  <li key={i}>{r}</li>
                                ))}
                              </ul>
                            )}
                            <div className="mf-detail-foot">
                              {n.link && (
                                <a href={n.link} target="_blank" rel="noopener noreferrer">
                                  원문 보기 <ExternalLink size={12} />
                                </a>
                              )}
                              <span>{agoText(m)}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          </Fragment>
        );
      })}
      {groups.length === 1 && ad}
    </div>
  );
}
