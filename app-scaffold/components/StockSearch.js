"use client";

// components/StockSearch.js
//
// [2026-10-29 신설] 종목 검색 창 — 재성님: "홈에서 종목 검색도 할수있는걸 하나 만들어줘.
//   검색하면 관련종목 뉴스라던가 여러가지들을 확인할수 있도록"
//
// 여는 법: 위 메뉴줄의 돋보기 단추, 홈 맨 위 검색창, 키보드 "/" 또는 Ctrl+K(맥 ⌘K)
//   (다른 곳에서 열려면 lib/openStockSearch.js의 openStockSearch())
//
// 찾을 수 있는 것
//   · 종목: 이름("삼성"), 초성("ㅅㅅㅈㅈ"), 종목코드("005930") — 코스피·코스닥 전 종목(약 2,800개)
//   · 테마: 테마 이름("2차전지", "의료 로봇") → 테마별 종목정리로 이동
//
// 종목을 고르면 오른쪽(휴대폰은 아래 화면)에 바로 보여 주는 것
//   · 최근 종가·등락률, 소속 테마
//   · 이 종목이 걸린 최근 속보(이 사이트가 자동으로 붙인 관련주 이유와 함께)
//   · 같은 테마에서 많이 움직인 종목
//   · 단추: 종목 페이지(차트·한눈에 보기·공시·같은 테마), 차트 바로 보기, 관심종목 담기
//
// 자료: /api/stock-index(전 종목 목록, 1시간 저장) + /api/feed(홈과 같은 속보 목록) — 창을 처음 열 때 한 번만 받음. 비용 0.
// 최근 검색한 종목은 이 브라우저에만 기억(다른 사람과 공유 안 됨).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Search, X, ArrowLeft, LineChart, ExternalLink, Layers, Clock } from "lucide-react";
import WatchStar from "./WatchStar";
import { openStockChart } from "../lib/openStockChart";
import { OPEN_SEARCH_EVENT } from "../lib/openStockSearch";

const RECENT_KEY = "nm-recent-search";
const CHO = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
function chosung(s) {
  let out = "";
  for (const ch of s) {
    const c = ch.charCodeAt(0) - 0xac00;
    out += c >= 0 && c < 11172 ? CHO[Math.floor(c / 588)] : ch;
  }
  return out;
}
const isChoOnly = (q) => /^[ㄱ-ㅎ]+$/.test(q);
const norm = (s) => String(s || "").replace(/\s+/g, "").toLowerCase();
const pct = (v) => (typeof v === "number" ? `${v > 0 ? "+" : ""}${v.toFixed(2)}%` : "");
const tone = (v) => (v > 0 ? "up" : v < 0 ? "down" : "");
const won = (v) => (typeof v === "number" ? `${Math.round(v).toLocaleString("ko-KR")}원` : "");
const mkName = (m) => (m === "Q" ? "코스닥" : "코스피");
function kstTime(v) {
  const t = new Date(v).getTime();
  if (!Number.isFinite(t)) return "";
  return new Date(t + 9 * 3600 * 1000).toISOString().slice(5, 16).replace("T", " ").replace("-", "/");
}
function readRecent() {
  try {
    const a = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(a) ? a.slice(0, 8) : [];
  } catch {
    return [];
  }
}
function saveRecent(code) {
  try {
    const a = [code, ...readRecent().filter((c) => c !== code)].slice(0, 8);
    localStorage.setItem(RECENT_KEY, JSON.stringify(a));
  } catch {
    // 저장 못 해도 검색은 됨
  }
}

export default function StockSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState(null); // [{code,name,m,close,chg,themes[], n, cho}]
  const [asOf, setAsOf] = useState(null);
  const [feed, setFeed] = useState(null);
  const [active, setActive] = useState(0);
  const [picked, setPicked] = useState(null); // 휴대폰: 고른 종목 상세 화면
  const [recent, setRecent] = useState([]);
  const inputRef = useRef(null);
  const loading = useRef(false);

  const load = useCallback(() => {
    if (loading.current) return;
    loading.current = true;
    fetch("/api/stock-index")
      .then((r) => r.json())
      .then((d) => {
        setAsOf(d.asOf || null);
        setRows(
          (d.rows || []).map(([code, name, m, close, chg, th]) => ({
            code,
            name,
            m,
            close,
            chg,
            themes: th ? th.split("|") : [],
            n: norm(name),
            cho: chosung(name.replace(/\s+/g, "")),
          }))
        );
      })
      .catch(() => setRows([]));
    fetch("/api/feed?limit=250")
      .then((r) => r.json())
      .then((d) => setFeed(Array.isArray(d?.items) ? d.items : []))
      .catch(() => setFeed([]));
  }, []);

  // 여는 신호·단축키
  useEffect(() => {
    const onOpen = (e) => {
      setQ(e.detail?.query || "");
      setPicked(null);
      setOpen(true);
    };
    const onKey = (e) => {
      const tag = (e.target?.tagName || "").toLowerCase();
      const typing = tag === "input" || tag === "textarea" || e.target?.isContentEditable;
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === "/" && !typing) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(OPEN_SEARCH_EVENT, onOpen);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    setRecent(readRecent());
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.body.style.overflow = old;
    };
  }, [open, load]);

  const byCode = useMemo(() => new Map((rows || []).map((r) => [r.code, r])), [rows]);
  const themeNames = useMemo(() => {
    const s = new Set();
    for (const r of rows || []) for (const t of r.themes) s.add(t);
    return [...s];
  }, [rows]);

  // 검색
  const { stocks, themes } = useMemo(() => {
    const raw = q.trim();
    if (!rows || !raw) return { stocks: [], themes: [] };
    const nq = norm(raw);
    const cho = isChoOnly(nq);
    const scored = [];
    for (const r of rows) {
      let s = 0;
      if (/^\d{2,6}$/.test(nq) && r.code.startsWith(nq)) s = 90;
      else if (r.n === nq) s = 100;
      else if (r.n.startsWith(nq)) s = 80;
      else if (r.n.includes(nq)) s = 60;
      else if (cho && r.cho.startsWith(nq)) s = 70;
      else if (cho && r.cho.includes(nq)) s = 50;
      // 테마 이름을 그대로 쳤으면(예: "반도체") 그 테마 종목도 — 오늘 많이 움직인 순
      else if (!cho && nq.length >= 2 && r.themes.some((t) => norm(t) === nq)) s = 30 + Math.min(Math.abs(r.chg || 0), 30);
      if (s) scored.push([s - r.name.length * 0.1 + (r.themes.length ? 0.5 : 0), r]);
    }
    scored.sort((a, b) => b[0] - a[0]);
    const th = themeNames
      .filter((t) => norm(t).includes(nq) || (cho && chosung(norm(t)).includes(nq)))
      .sort((a, b) => (norm(b) === nq) - (norm(a) === nq) || a.length - b.length)
      .slice(0, 6);
    return { stocks: scored.slice(0, 15).map((x) => x[1]), themes: th };
  }, [q, rows, themeNames]);

  const recentRows = useMemo(() => recent.map((c) => byCode.get(c)).filter(Boolean), [recent, byCode]);
  const list = q.trim() ? stocks : recentRows;
  useEffect(() => setActive(0), [q]);
  const cur = picked || list[Math.min(active, list.length - 1)] || null;

  const close = () => {
    setOpen(false);
    setPicked(null);
  };
  const choose = (r, { mobileDetail = false } = {}) => {
    saveRecent(r.code);
    setRecent(readRecent());
    if (mobileDetail) setPicked(r);
  };
  const go = (r) => {
    saveRecent(r.code);
    window.location.href = `/stock/${r.code}`;
  };

  const onInputKey = (e) => {
    if (e.key === "Escape") return close();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, Math.max(list.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && list[active]) {
      e.preventDefault();
      go(list[active]);
    }
  };

  // 고른 종목의 속보·같은 테마 종목
  const detail = useMemo(() => {
    if (!cur) return null;
    const news = [];
    for (const it of feed || []) {
      const m = (it.matches || []).find((x) => x.code === cur.code);
      if (m || (cur.name.length >= 2 && String(it.title || "").includes(cur.name))) {
        news.push({ title: it.title, link: it.link, at: it.pubDate, reason: m?.reason || "" });
      }
      if (news.length >= 5) break;
    }
    const t0 = cur.themes[0];
    const peers = t0
      ? (rows || [])
          .filter((r) => r.code !== cur.code && r.themes.includes(t0))
          .sort((a, b) => Math.abs(b.chg || 0) - Math.abs(a.chg || 0))
          .slice(0, 6)
      : [];
    return { news, peers, t0 };
  }, [cur, feed, rows]);

  if (!open) return null;

  // 테마 결과 칸 — 검색어가 테마 이름과 딱 맞으면(예: "반도체") 종목보다 위에
  const themeFirst = themes.length > 0 && norm(themes[0]) === norm(q.trim());
  const themeBlock =
    themes.length > 0 ? (
      <>
        <p className="ss-sec">테마</p>
        {(themeFirst ? themes.slice(0, 3) : themes).map((t) => (
          <Link key={t} href={`/themes?theme=${encodeURIComponent(t)}`} className="ss-item ss-theme" onClick={close}>
            <Layers size={15} /> <b>{t}</b>
            <span className="ss-item-th">테마별 종목정리로 →</span>
          </Link>
        ))}
      </>
    ) : null;

  const watchStock = cur ? { code: cur.code, name: cur.name, market: mkName(cur.m) } : null;

  return (
    <div className="ss" role="dialog" aria-modal="true" aria-label="종목 검색" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className={`ss-box ${picked ? "ss-picked" : ""}`}>
        <div className="ss-bar">
          <Search size={19} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPicked(null);
            }}
            onKeyDown={onInputKey}
            placeholder="종목명 · 초성 · 종목코드 · 테마 (예: 삼성전자, ㅅㅅㅈㅈ, 005930, 2차전지)"
            aria-label="검색어"
            autoComplete="off"
            spellCheck={false}
          />
          {q && (
            <button type="button" className="ss-clear" onClick={() => setQ("")} aria-label="검색어 지우기">
              <X size={15} />
            </button>
          )}
          <button type="button" className="ss-close" onClick={close} aria-label="닫기">
            <span className="ss-esc">ESC</span>
            <X size={20} className="ss-close-x" />
          </button>
        </div>

        <div className="ss-body">
          {/* ── 왼쪽: 결과 목록 ── */}
          <div className="ss-list">
            {!rows ? (
              <p className="ss-hint">종목 목록을 불러오는 중…</p>
            ) : q.trim() && stocks.length === 0 && themes.length === 0 ? (
              <p className="ss-hint">"{q}"에 맞는 종목·테마가 없어요.</p>
            ) : (
              <>
                {!q.trim() && (
                  <p className="ss-sec">
                    <Clock size={13} /> {recentRows.length ? "최근 본 종목" : "종목 이름을 입력해 보세요"}
                  </p>
                )}
                {themeFirst && themeBlock}
                {q.trim() && stocks.length > 0 && <p className="ss-sec">종목</p>}
                {list.map((r, i) => (
                  <button
                    key={r.code}
                    type="button"
                    className={`ss-item ${cur?.code === r.code && !picked ? "on" : ""}`}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => {
                      setActive(i);
                      // 넓은 화면은 오른쪽에 이미 보이므로 바로 종목 페이지로, 휴대폰은 상세 화면으로
                      if (window.matchMedia("(max-width: 760px)").matches) choose(r, { mobileDetail: true });
                      else go(r);
                    }}
                  >
                    <span className="ss-item-name">
                      <b>{r.name}</b>
                      <span className="mono">{r.code}</span>
                      <span className="ss-mk">{mkName(r.m)}</span>
                    </span>
                    <span className="ss-item-px">
                      <span className="mono">{won(r.close)}</span>
                      <span className={`mono ${tone(r.chg)}`}>{pct(r.chg)}</span>
                    </span>
                    {r.themes.length > 0 && <span className="ss-item-th">{r.themes.slice(0, 2).join(" · ")}</span>}
                  </button>
                ))}
                {!themeFirst && themeBlock}
              </>
            )}
          </div>

          {/* ── 오른쪽(휴대폰은 고른 뒤 화면): 미리보기 ── */}
          <div className="ss-preview">
            {cur && detail ? (
              <>
                {picked && (
                  <button type="button" className="ss-back" onClick={() => setPicked(null)}>
                    <ArrowLeft size={16} /> 검색 결과로
                  </button>
                )}
                <div className="ss-pv-head">
                  <div>
                    <h3>{cur.name}</h3>
                    <span className="mono">
                      {cur.code} · {mkName(cur.m)}
                    </span>
                  </div>
                  <div className="ss-pv-px">
                    <b className="mono">{won(cur.close)}</b>
                    <span className={`mono ${tone(cur.chg)}`}>{pct(cur.chg)}</span>
                    {asOf && <small>{asOf} 종가 기준</small>}
                  </div>
                </div>
                <div className="ss-actions">
                  <Link href={`/stock/${cur.code}`} className="ss-primary" onClick={() => saveRecent(cur.code)}>
                    종목 페이지 보기 →<small>차트 · 한눈에 보기 · 공시 · 같은 테마</small>
                  </Link>
                  <button
                    type="button"
                    className="sc-btn"
                    onClick={() => {
                      saveRecent(cur.code);
                      close();
                      openStockChart({ code: cur.code, name: cur.name, market: mkName(cur.m) });
                    }}
                  >
                    <LineChart size={14} /> 차트 바로 보기
                  </button>
                  <WatchStar stock={watchStock} />
                </div>
                {cur.themes.length > 0 && (
                  <div className="ss-pv-sec">
                    <h4>소속 테마</h4>
                    <div className="ss-chips">
                      {cur.themes.map((t) => (
                        <Link key={t} href={`/themes?theme=${encodeURIComponent(t)}`} onClick={close}>
                          {t}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
                <div className="ss-pv-sec">
                  <h4>이 종목이 걸린 최근 속보</h4>
                  {feed === null ? (
                    <p className="ss-hint">속보를 불러오는 중…</p>
                  ) : detail.news.length === 0 ? (
                    <p className="ss-hint">최근 며칠 안에 이 종목이 걸린 속보가 없어요.</p>
                  ) : (
                    <ul className="ss-news">
                      {detail.news.map((n, i) => (
                        <li key={i}>
                          <a href={n.link} target="_blank" rel="noopener noreferrer">
                            {n.title} <ExternalLink size={12} />
                          </a>
                          <span>
                            <span className="mono">{kstTime(n.at)}</span>
                            {n.reason && ` · ${n.reason}`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {detail.peers.length > 0 && (
                  <div className="ss-pv-sec">
                    <h4>같은 테마({detail.t0})에서 많이 움직인 종목</h4>
                    <div className="ss-peers">
                      {detail.peers.map((p) => (
                        <button key={p.code} type="button" onClick={() => (picked ? setPicked(p) : go(p))}>
                          <b>{p.name}</b>
                          <span className={`mono ${tone(p.chg)}`}>{pct(p.chg)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="ss-empty">
                <Search size={28} />
                <p>
                  종목을 찾으면 여기에 <b>최근 속보 · 소속 테마 · 같은 테마 종목</b>이 바로 보여요.
                </p>
                <p className="ss-keys">
                  <span className="mono">↑</span>
                  <span className="mono">↓</span> 고르기 · <span className="mono">Enter</span> 종목 페이지 · <span className="mono">Esc</span> 닫기
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
