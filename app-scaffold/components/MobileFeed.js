"use client";

// components/MobileFeed.js
//
// [2026-10-27 신설] 휴대폰 전용 "속보" 탭 — 시안 A + B + C를 합친 것.
// 재성님: "메인화면이 뭔가 아쉬운데 좀 혁신이 부족한 느낌" → 시안 3개 → "abc 다 합치면?"
//
// 위에서부터:
//   A. MobileHero   — "방금 터진 속보" 큰 카드 5장(옆으로 넘김). 관련 종목이 큰 숫자 + 최근 20일 가격 그림으로.
//                     새 속보가 오면 저절로 첫 장으로 돌아갑니다.
//      MobilePulse  — 오늘 숫자 한 줄: 오늘 속보 수 · 가장 뜨거운 테마 · 가장 많이 오른 종목
//   B. ThemeMap     — 테마 지도. 오늘 속보에 많이 나온 테마일수록 큰 네모, 관련 종목이 많이 올랐을수록 빨강
//                     (내렸으면 파랑). 누르면 아래 목록이 그 테마 속보만 남습니다.
//   C. HourTimeline — 속보를 1시간씩 묶고, 묶음마다 "이 시간엔 무슨 일이" 한 줄 요약. 최근 두 묶음만 펼쳐 두고
//                     나머지는 접어 둡니다(누르면 펼침). 속보 한 줄을 누르면 요약·근거·원문이 펼쳐집니다.
//
// ★ PC 화면(761px 이상)에서는 이 부품들이 보이지 않고 예전 화면(components/NewsBoard.js)이 그대로 나옵니다.
//   (globals.css의 .m-only / .desk-only)
// ★ 비용: 가격 그림은 종목 차트 창과 같은 자료(/api/candles, 2분 공용 저장)를 지금 보이는 카드의 종목만 받아 옵니다.
//   나머지는 이미 화면에 있는 속보 자료로 계산합니다(추가 비용 0).

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ExternalLink, Flame, AlertTriangle } from "lucide-react";
import { openStockChart } from "../lib/openStockChart";
import { isPoliticalTheme } from "../lib/themeData";

const FRESH_MINUTES = 15; // 이 시간 안의 속보에 빨간 "속보" 딱지
const HERO_COUNT = 5;
const MAP_COUNT = 8;
const OPEN_GROUPS = 2; // 처음에 펼쳐 둘 시간 묶음 수

// ── 작은 도우미들 ──────────────────────────────────────────────
const KST = 9 * 3600 * 1000;
function kstParts(ts) {
  const ms = Date.parse(ts || "");
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms + KST);
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes() };
}
const dayKey = (p) => (p ? `${p.y}-${p.mo}-${p.d}` : "");
const hhmm = (p) => (p ? `${String(p.h).padStart(2, "0")}:${String(p.mi).padStart(2, "0")}` : "");
function hourLabel(h) {
  if (h === 0) return "밤 12시";
  if (h < 6) return `새벽 ${h}시`;
  if (h < 12) return `오전 ${h}시`;
  if (h === 12) return "낮 12시";
  return `오후 ${h - 12}시`;
}
function minutesAgo(ts, now) {
  const t = Date.parse(ts || "");
  return Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / 60000)) : null;
}
function agoText(m) {
  if (m === null) return "";
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  if (m < 1440) return `${Math.floor(m / 60)}시간 전`;
  return `${Math.floor(m / 1440)}일 전`;
}
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const pct = (v) => (isNum(v) ? `${v > 0 ? "+" : ""}${v.toFixed(1)}%` : "—");
const tone = (v) => (isNum(v) ? (v > 0 ? "up" : v < 0 ? "down" : "flat") : "flat");
// 제목 앞 말머리("[단독]")는 떼어서 딱지로
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
const HOT_TAGS = new Set(["단독", "속보", "긴급", "1보", "2보"]);

// 1분마다 다시 그리기("3분 전" 갱신용)
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  return now;
}

// "오늘" 속보: 가장 최근 속보와 같은 날(한국 시간). 너무 적으면(장 시작 전 등) 최근 60건.
function todaysOf(items) {
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
function Spark({ code, market, active }) {
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

// ── A. 방금 터진 속보 큰 카드 ───────────────────────────────────
export function MobileHero({ items }) {
  const now = useNow();
  const list = useMemo(() => items.filter((n) => n.stocks?.length).slice(0, HERO_COUNT), [items]);
  const [idx, setIdx] = useState(0);
  const idxRef = useRef(0);
  const viewedRef = useRef(null); // 지금 보고 있는 카드의 속보 id
  const trackRef = useRef(null);
  const leadId = list[0]?.id;
  const prevLead = useRef(leadId);
  // [2026-10-27 추가] 새 속보가 들어왔을 때 — 재성님: "속보가 뜨면 카드뉴스는 어떻게 변해?" → 개선
  //   arrived: 방금 맨 앞에 들어온 카드 id(몇 초 동안 빨갛게 번쩍 + "NEW")
  //   pending: 다른 카드를 읽던 중이라 첫 장으로 끌고 가지 않고 "← 새 속보" 단추만 띄운 상태
  const [arrived, setArrived] = useState(null);
  const [pending, setPending] = useState(false);
  const step = () => {
    const card = trackRef.current?.firstElementChild;
    return card ? card.offsetWidth + 10 : 0;
  };

  // 화면이 그려지기 직전에 처리해야 카드가 한 칸 밀려 보이는 깜빡임이 없습니다.
  useLayoutEffect(() => {
    if (prevLead.current === leadId) return;
    const hadLead = prevLead.current !== undefined;
    prevLead.current = leadId;
    if (!hadLead || !leadId) return;
    setArrived(leadId);
    const el = trackRef.current;
    if (el && idxRef.current > 0) {
      // 읽던 카드 그대로: 그 카드가 새 순서에서 몇 번째인지 찾아 그 자리로(앞에 한 장이 끼어들었으니 보통 한 칸 뒤)
      //   (휴대폰 브라우저에 따라 스스로 자리를 지켜 주기도 해서, "몇 칸 더"가 아니라 "그 카드 자리"로 맞춥니다)
      const j = list.findIndex((n) => n.id === viewedRef.current);
      const target = j >= 0 ? j : list.length - 1;
      el.scrollLeft = target * step();
      idxRef.current = target;
      setIdx(target);
      setPending(true);
    } else if (el) {
      el.scrollLeft = 0;
    }
    const t = setTimeout(() => setArrived((cur) => (cur === leadId ? null : cur)), 6000);
    return () => clearTimeout(t);
  }, [leadId]);

  function onScroll() {
    const el = trackRef.current;
    const w = step();
    if (!el || !w) return;
    const i = Math.round(el.scrollLeft / w);
    idxRef.current = i;
    viewedRef.current = list[i]?.id ?? null;
    setIdx(i);
    if (i === 0) setPending(false);
  }
  function go(i) {
    const el = trackRef.current;
    const card = el?.firstElementChild;
    if (el && card) el.scrollTo({ left: i * (card.offsetWidth + 10), behavior: "smooth" });
  }

  if (!list.length) return null;
  return (
    <section className="mf-hero m-only" aria-label="방금 들어온 속보">
      <div className="mf-hero-track" ref={trackRef} onScroll={onScroll}>
        {list.map((n, i) => {
          const m = minutesAgo(n.ts, now);
          const fresh = m !== null && m < FRESH_MINUTES;
          const { tags: rawTags, text } = splitTags(n.headline);
          const tags = fresh ? rawTags.filter((t) => t !== "속보") : rawTags; // 빨간 "속보" 딱지와 겹치지 않게
          return (
            <article key={n.id} className={`mf-card ${arrived === n.id ? "is-new" : ""}`}>
              <div className="mf-card-meta">
                {arrived === n.id && <span className="mf-newtag">NEW</span>}
                {fresh && <span className="mf-brk">속보</span>}
                {tags.map((t) => (
                  <span key={t} className={`mf-tag ${HOT_TAGS.has(t) ? "hot" : ""}`}>
                    {t}
                  </span>
                ))}
                <span>{agoText(m)}</span>
                <span className="mono">{hhmm(kstParts(n.ts))}</span>
                {n.theme && <span>· {n.theme}</span>}
                <span className="mf-count mono">
                  {i + 1}/{list.length}
                </span>
              </div>
              <h2 className="mf-card-title">{text}</h2>
              <div className="mf-tiles">
                {n.stocks.slice(0, 3).map((s) => (
                  <button
                    type="button"
                    key={s.code}
                    className="mf-tile"
                    onClick={() => openStockChart({ code: s.code, name: s.name, market: s.market })}
                    title={`${s.name} 차트 보기`}
                  >
                    <span className="mf-tile-nm">
                      {s.catalyst && <AlertTriangle size={11} aria-label="악재" />}
                      {s.name}
                    </span>
                    <span className={`mf-tile-pct mono ${tone(s.change)}`}>{pct(s.change)}</span>
                    <Spark code={s.code} market={s.market} active={i === idx} />
                  </button>
                ))}
              </div>
              {n.link && (
                <a className="mf-card-link" href={n.link} target="_blank" rel="noopener noreferrer">
                  원문 <ExternalLink size={11} />
                </a>
              )}
            </article>
          );
        })}
      </div>
      {pending && (
        <button type="button" className="mf-newpill" onClick={() => go(0)}>
          ← 새 속보
        </button>
      )}
      {list.length > 1 && (
        <div className="mf-dots" role="tablist" aria-label="속보 카드 넘기기">
          {list.map((n, i) => (
            <button
              type="button"
              key={n.id}
              role="tab"
              aria-selected={i === idx}
              aria-label={`${i + 1}번째 속보`}
              className={i === idx ? "on" : ""}
              onClick={() => go(i)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ── 오늘 숫자 한 줄 ─────────────────────────────────────────────
export function MobilePulse({ items }) {
  const data = useMemo(() => {
    const today = todaysOf(items);
    const hot = themeStats(today)[0];
    let top = null;
    for (const n of today) for (const s of n.stocks || []) if (isNum(s.change) && (!top || s.change > top.change)) top = s;
    return { count: today.length, hot, top };
  }, [items]);
  if (!items.length) return null;
  return (
    <div className="mf-pulse m-only">
      <div className="mf-pc">
        오늘 속보<b className="mono">{data.count}건</b>
      </div>
      {data.hot && (
        <div className="mf-pc">
          가장 많이 나온 테마
          <b>
            <Flame size={13} aria-hidden="true" /> {data.hot.theme}
          </b>
        </div>
      )}
      {data.top && (
        <button
          type="button"
          className="mf-pc"
          onClick={() => openStockChart({ code: data.top.code, name: data.top.name, market: data.top.market })}
        >
          가장 많이 오른
          <b>
            {data.top.name} <span className={`mono ${tone(data.top.change)}`}>{pct(data.top.change)}</span>
          </b>
        </button>
      )}
    </div>
  );
}

// ── B. 테마 지도 ────────────────────────────────────────────────
// 네모 크기는 순위로 정합니다(1등 가장 크게). 6칸 바둑판에 8개가 빈틈없이 들어가는 모양:
//   1등 3칸×2줄, 2등 3칸, 3등 2칸, 4등 1칸, 5·6등 2칸, 7·8등 1칸
const SPANS = [
  [3, 2],
  [3, 1],
  [2, 1],
  [1, 1],
  [2, 1],
  [2, 1],
  [1, 1],
  [1, 1],
];
function heatClass(avg) {
  if (!isNum(avg)) return "h0";
  if (avg >= 3) return "hu3";
  if (avg >= 1) return "hu2";
  if (avg > 0.2) return "hu1";
  if (avg <= -3) return "hd3";
  if (avg <= -1) return "hd2";
  if (avg < -0.2) return "hd1";
  return "h0";
}
export function ThemeMap({ items, activeTheme, onPick }) {
  const stats = useMemo(() => themeStats(todaysOf(items)).slice(0, MAP_COUNT), [items]);
  if (stats.length < 3) return null;
  return (
    <section className="mf-map m-only" aria-label="오늘 속보가 몰린 테마">
      <div className="mf-sec-head">
        <h2>지금 뉴스가 몰리는 테마</h2>
        <span>누르면 그 테마 속보만</span>
      </div>
      <div className={`mf-heat ${activeTheme ? "has-pick" : ""}`}>
        {stats.map((t, i) => {
          const [c, r] = SPANS[i] || [1, 1];
          const on = activeTheme === t.theme;
          return (
            <button
              type="button"
              key={t.theme}
              className={`mf-ht ${heatClass(t.avg)} ${c === 1 ? "sm" : ""} ${i === 0 ? "big" : ""} ${on ? "on" : ""}`}
              style={{ gridColumn: `span ${c}`, gridRow: `span ${r}` }}
              aria-pressed={on}
              onClick={() => onPick(t.theme)}
            >
              <b>{t.theme}</b>
              <span className="mono">
                {t.count}건{c > 1 && isNum(t.avg) ? ` · ${pct(t.avg)}` : ""}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mf-map-note">네모가 클수록 속보가 많이 나온 테마, 빨갈수록 관련 종목이 많이 올랐어요(파랑은 내림).</p>
    </section>
  );
}

// ── C. 시간대별 묶음 목록 ───────────────────────────────────────
function groupSummary(list) {
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

// ad: 첫 시간대 묶음 바로 아래에 끼울 광고 칸(app/HomeClient.js가 <AdSlot />을 넘김)
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
          {gi === 1 && ad}
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
