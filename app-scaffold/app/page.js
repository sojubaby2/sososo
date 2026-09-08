"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Newspaper, Loader2, Flame, Bell, BellOff, Globe, Volume2, VolumeX, Smartphone, X } from "lucide-react";
import Header from "../components/Header";
import NewsCard from "../components/NewsCard";
import DailyOutlookBanner from "../components/DailyOutlookBanner";
import { isPoliticalTheme } from "../lib/themeData";

const HOT_THEME_COUNT = 8;
const FEED_POLL_MS = 10000; // check for new articles every 10s
const ALERT_KEYWORDS = ["공급계약", "특허", "FDA", "무상증자", "단독", "세계 최초", "국내 최초", "인수", "합병", "수주", "유상증자"];

// Short beep via Web Audio — no audio file to host/fetch. Browsers block
// audio autoplay until the user has interacted with the page at least
// once, which is exactly what clicking the toggle button provides.
function playAlertBeep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1046, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.42);
  } catch {
    // Web Audio unavailable — fail quietly, the visual toast still shows
  }
}

// Turns a saved /api/poll feed item into the shape NewsCard expects.
function toCardShape(item) {
  const hasLegitimate = item.matches.some((m) => m.confidence === "confirmed" || m.confidence === "theme");
  const reason = item.matches
    .map((m) => m.reason)
    .filter(Boolean)
    .slice(0, 3)
    .join(" / ");
  // Any match Claude tagged with a confirmed negative-catalyst type (유상증자
  // 등) — surfaced once at the card level for the "악재" badge, and again
  // per-chip so it's clear exactly which stock it's about.
  const badMatch = item.matches.find((m) => m.catalyst);

  return {
    id: item.id,
    time: item.pubDate || "",
    source: item.keyword,
    headline: item.title,
    summary: item.summary,
    link: item.link,
    confidence: hasLegitimate ? "confirmed" : "rumor",
    reason: reason || "관련 근거 정보 없음",
    badCatalyst: badMatch?.catalyst || null,
    stocks: item.matches.map((m) => ({ name: m.name, code: m.code, market: m.market, catalyst: m.catalyst || null })),
  };
}

// Compact sidebar panel — a smaller reference version of what used to be a
// big colored grid across the top of the page. Toggle switches between the
// 1-week and 1-month change field from /api/theme-momentum.
function HotThemePanel() {
  const [rawThemes, setRawThemes] = useState([]);
  const [state, setState] = useState("loading");
  const [range, setRange] = useState("1W"); // "1W" | "1M" — 재성님 요청으로 기본값을 1주일로 변경

  useEffect(() => {
    fetch("/api/theme-momentum")
      .then((r) => r.json())
      .then((data) => {
        if (!data.themeChanges) {
          setState("error");
          return;
        }
        setRawThemes(data.themeChanges);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, []);

  const field = range === "1W" ? "change1W" : "change1M";

  const themes = useMemo(() => {
    return rawThemes
      .filter((t) => typeof t[field] === "number" && !isPoliticalTheme(t.theme))
      .sort((a, b) => b[field] - a[field])
      .slice(0, HOT_THEME_COUNT);
  }, [rawThemes, field]);

  if (state === "error") return null;

  return (
    <aside className="trending-panel">
      <div className="trending-panel-header">
        <h2 className="trending-panel-title">
          <Flame size={12} style={{ color: "var(--up)" }} />
          HOT 테마
        </h2>
        <div className="range-toggle">
          <button
            type="button"
            className={`range-toggle-btn ${range === "1W" ? "active" : ""}`}
            onClick={() => setRange("1W")}
          >
            1주일
          </button>
          <button
            type="button"
            className={`range-toggle-btn ${range === "1M" ? "active" : ""}`}
            onClick={() => setRange("1M")}
          >
            1개월
          </button>
        </div>
      </div>
      {state === "loading" ? (
        <p className="trending-empty">불러오는 중...</p>
      ) : (
        themes.map((t) => {
          const val = t[field];
          return (
            // [2026-09-08 추가] 재성님 요청 — HOT 테마를 누르면 "테마별
            // 종목정리"(/themes) 페이지의 그 테마로 바로 이동해서 관련
            // 종목이 보이게 함(DailyOutlookBanner의 테마 링크와 동일한 방식).
            <Link key={t.theme} href={`/themes?theme=${encodeURIComponent(t.theme)}`} className="trending-row trending-row-link">
              <span className="trending-row-name">{t.theme}</span>
              <span className="mono up" style={{ fontSize: 13, fontWeight: 700 }}>
                {val > 0 ? "+" : ""}
                {val.toFixed(1)}%
              </span>
            </Link>
          );
        })
      )}
    </aside>
  );
}

const DAILY_MOVER_COUNT = 6;
const DAILY_THEME_COUNT = 6;

// 전일(가장 최근 거래일) 하루짜리 등락률 랭킹 — HOT 테마 패널의 1주일/1개월
// 수치와는 성격이 달라서(당일 변동성이라 노이즈가 큼) 별도 패널로 분리함.
// 개별 종목 랭킹은 테마 등록 여부와 무관하게 시장 전체 대상.
function DailyMoversPanel() {
  const [movers, setMovers] = useState([]);
  const [themes, setThemes] = useState([]);
  const [state, setState] = useState("loading");

  useEffect(() => {
    fetch("/api/theme-momentum")
      .then((r) => r.json())
      .then((data) => {
        if (!data.dailyMovers || !data.themeChanges) {
          setState("error");
          return;
        }
        setMovers(data.dailyMovers.slice(0, DAILY_MOVER_COUNT));
        const topThemes = data.themeChanges
          .filter((t) => typeof t.change1D === "number" && !isPoliticalTheme(t.theme))
          .sort((a, b) => b.change1D - a.change1D)
          .slice(0, DAILY_THEME_COUNT);
        setThemes(topThemes);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, []);

  if (state === "error") return null;

  return (
    <aside className="trending-panel">
      <h2 className="trending-panel-title">
        <Flame size={12} style={{ color: "var(--up)" }} />
        전일 급등주 · 급등테마
      </h2>
      {state === "loading" ? (
        <p className="trending-empty">불러오는 중...</p>
      ) : (
        <>
          <p className="mover-section-label">종목</p>
          {movers.map((s) => (
            <div key={s.code} className="trending-row">
              <span className="trending-row-name">
                {s.name}
                <span className="trending-row-code">{s.code}</span>
              </span>
              <span className="mono up" style={{ fontSize: 13, fontWeight: 700 }}>
                {s.change > 0 ? "+" : ""}
                {s.change.toFixed(1)}%
              </span>
            </div>
          ))}
          <p className="mover-section-label">테마</p>
          {themes.map((t) => (
            <div key={t.theme} className="trending-row">
              <span className="trending-row-name">{t.theme}</span>
              <span className="mono up" style={{ fontSize: 13, fontWeight: 700 }}>
                {t.change1D > 0 ? "+" : ""}
                {t.change1D.toFixed(1)}%
              </span>
            </div>
          ))}
        </>
      )}
    </aside>
  );
}

// Replaces the old scrolling top ticker — everything visible at once
// instead of waiting for text to scroll by.
function GlobalMarketPanel() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch("/api/market-ticker")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, []);

  const rows = [];
  if (data?.usd) rows.push(["원/달러", `${data.usd.toLocaleString("ko-KR")}원`]);
  if (data?.jpy) rows.push(["원/엔(100엔)", `${data.jpy.toLocaleString("ko-KR")}원`]);
  if (data?.gold) rows.push(["국제 금값(1oz)", `$${Number(data.gold).toLocaleString("ko-KR")}`]);
  if (data?.wti) rows.push(["WTI", `$${Number(data.wti).toLocaleString("ko-KR")}`]);
  if (data?.brent) rows.push(["브렌트유", `$${Number(data.brent).toLocaleString("ko-KR")}`]);

  return (
    <aside className="trending-panel">
      <h2 className="trending-panel-title">
        <Globe size={12} style={{ color: "var(--amber)" }} />
        글로벌 시황
      </h2>
      {rows.length === 0 ? (
        <p className="trending-empty">불러오는 중...</p>
      ) : (
        rows.map(([label, value]) => (
          <div key={label} className="trending-row">
            <span className="trending-row-name">{label}</span>
            <span className="mono" style={{ fontSize: 13, fontWeight: 700 }}>{value}</span>
          </div>
        ))
      )}
    </aside>
  );
}

function InstallHintBanner() {
  const [dismissed, setDismissed] = useState(true); // hidden until localStorage check to avoid a flash
  useEffect(() => {
    setDismissed(localStorage.getItem("installHintDismissed") === "1");
  }, []);

  function dismiss() {
    localStorage.setItem("installHintDismissed", "1");
    setDismissed(true);
  }

  if (dismissed) return null;
  return (
    <div className="install-hint">
      <Smartphone size={15} style={{ flexShrink: 0 }} />
      <span>모바일에서는 "홈 화면에 추가"를 하면 앱처럼 빠르게 열어볼 수 있어요. PC에서는 Ctrl+D로 즐겨찾기 해두세요.</span>
      <button type="button" className="install-hint-close" onClick={dismiss}><X size={14} /></button>
    </div>
  );
}

export default function HomePage() {
  const [rawItems, setRawItems] = useState([]);
  const [loadState, setLoadState] = useState("loading");
  const [newIds, setNewIds] = useState(new Set());
  const [toast, setToast] = useState(null); // { count, headline } | null
  const [soundEnabled, setSoundEnabled] = useState(false);
  // [2026-09-08 추가] 재성님 요청 — 사이트 안에서 뜨는 우측 하단 토스트(위
  // .new-toast, 이건 그대로 둠)와는 별개로, 윈도우 화면 자체의 우측 하단에
  // 뜨는 OS 알림(브라우저 Notification API)도 추가함. 이 사이트 탭이 다른
  // 창에 가려져 있거나 최소화돼 있어도 뜨는 게 핵심 차이 — 브라우저가 열려있기만
  // 하면 됨(브라우저 자체가 꺼져 있을 때도 뜨게 하려면 서비스워커 + 웹푸시
  // 구독/서버 발송까지 만들어야 하는 훨씬 큰 작업이라, 일단은 "탭이
  // 열려있는 동안" 범위로 구현함). 브라우저 정책상 사용자가 버튼을 눌러
  // 명시적으로 허용해야만 알림을 띄울 수 있어서 토글 버튼으로 만듦.
  const [notifyEnabled, setNotifyEnabled] = useState(false);
  const knownIdsRef = useRef(new Set());
  const toastTimerRef = useRef(null);
  const newIdsTimerRef = useRef(null);
  const soundEnabledRef = useRef(false);
  const notifyEnabledRef = useRef(false);

  function toggleSound() {
    const next = !soundEnabled;
    setSoundEnabled(next);
    soundEnabledRef.current = next;
    if (next) playAlertBeep(); // confirms it's on AND unlocks autoplay for later
  }

  // 이전에 켜둔 적이 있으면(로컬 저장소) 자동으로 다시 켜줌 — 단, 그 사이에
  // 사용자가 브라우저 설정에서 알림 권한을 직접 껐다면(Notification.permission
  // 이 더 이상 "granted"가 아니면) 존중해서 꺼진 채로 둠.
  useEffect(() => {
    if (typeof window === "undefined" || typeof Notification === "undefined") return;
    const wantedOn = localStorage.getItem("browserNotifyEnabled") === "1";
    if (wantedOn && Notification.permission === "granted") {
      setNotifyEnabled(true);
      notifyEnabledRef.current = true;
    }
  }, []);

  function toggleNotify() {
    if (typeof Notification === "undefined") {
      alert("이 브라우저는 데스크톱 알림 기능을 지원하지 않아요.");
      return;
    }
    if (notifyEnabled) {
      setNotifyEnabled(false);
      notifyEnabledRef.current = false;
      localStorage.setItem("browserNotifyEnabled", "0");
      return;
    }
    Notification.requestPermission().then((perm) => {
      if (perm !== "granted") return; // 사용자가 거부했거나 닫음 — 꺼진 채로 둠
      setNotifyEnabled(true);
      notifyEnabledRef.current = true;
      localStorage.setItem("browserNotifyEnabled", "1");
      // 켜지자마자 확인용 알림 한 번 — "정말 뜨는구나"를 바로 확인시켜줌.
      new Notification("데스크톱 알림이 켜졌어요", {
        body: "새 소식이 올라오면 이렇게 화면 알림으로 알려드릴게요.",
        icon: "/icon-192.png",
      });
    });
  }

  function applyFeed(items, isFirstLoad) {
    const incomingIds = items.map((it) => it.id);
    if (!isFirstLoad) {
      const freshIds = incomingIds.filter((id) => !knownIdsRef.current.has(id));
      if (freshIds.length > 0) {
        setNewIds(new Set(freshIds));
        const freshItems = items.filter((it) => freshIds.includes(it.id));
        const latest = freshItems[0];
        setToast({ count: freshIds.length, headline: latest?.title || "" });
        clearTimeout(newIdsTimerRef.current);
        newIdsTimerRef.current = setTimeout(() => setNewIds(new Set()), 4000);
        clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => setToast(null), 4500);

        if (soundEnabledRef.current) {
          const hasKeywordHit = freshItems.some((it) => ALERT_KEYWORDS.some((k) => it.title?.includes(k)));
          if (hasKeywordHit) playAlertBeep();
        }

        // [2026-09-08 추가] 기존 우측 하단 인앱 토스트(위 setToast)는 그대로
        // 두고, 그 옆에 윈도우 자체의 데스크톱 알림도 띄움 — tag를 고정값으로
        // 줘서 폴링이 연달아 새 글을 여러 번 감지해도 알림이 계속 쌓이지
        // 않고 마지막 것으로 교체되게 함.
        if (notifyEnabledRef.current && typeof Notification !== "undefined" && Notification.permission === "granted") {
          const notifTitle = freshIds.length > 1 ? `새 소식 ${freshIds.length}건 도착` : latest?.title || "새 소식 도착";
          const notifBody = freshIds.length > 1 ? latest?.title || "" : latest?.summary || "";
          const n = new Notification(notifTitle, {
            body: notifBody,
            icon: "/icon-192.png",
            tag: "newsmeme-feed",
          });
          n.onclick = () => {
            window.focus();
            n.close();
          };
        }
      }
    }
    knownIdsRef.current = new Set(incomingIds);
    setRawItems(items);
  }

  useEffect(() => {
    let cancelled = false;

    function load(isFirstLoad) {
      fetch("/api/feed")
        .then((r) => r.json())
        .then((data) => {
          if (cancelled) return;
          if (data.error) {
            setLoadState("error");
            return;
          }
          applyFeed(data.items || [], isFirstLoad);
          setLoadState("ready");
        })
        .catch(() => {
          if (!cancelled) setLoadState("error");
        });
    }

    load(true);
    const interval = setInterval(() => load(false), FEED_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
      clearTimeout(toastTimerRef.current);
      clearTimeout(newIdsTimerRef.current);
    };
  }, []);

  const items = useMemo(() => rawItems.map(toCardShape), [rawItems]);

  return (
    <div>
      <Header />
      <main className="container-wide" style={{ paddingTop: 32, paddingBottom: 32 }}>
        <DailyOutlookBanner />
        <InstallHintBanner />
        <div className="home-layout">
          <div>
            <div className="filter-row">
              <h2 className="live-heading" style={{ margin: 0 }}>
                <span className="live-dot" />
                <span className="live-label">실시간 뉴스 검색 중</span>
                <span className="loading-dots"><span>.</span><span>.</span><span>.</span></span>
              </h2>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" className={`sound-toggle ${soundEnabled ? "on" : ""}`} onClick={toggleSound}>
                  {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
                  주요 키워드 알림음 {soundEnabled ? "켜짐" : "꺼짐"}
                </button>
                <button type="button" className={`sound-toggle ${notifyEnabled ? "on" : ""}`} onClick={toggleNotify}>
                  {notifyEnabled ? <Bell size={14} /> : <BellOff size={14} />}
                  데스크톱 알림 {notifyEnabled ? "켜짐" : "꺼짐"}
                </button>
              </div>
            </div>

            {loadState === "loading" && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--ink-muted)", fontSize: 14, padding: "24px 0" }}>
                <Loader2 size={16} />
                불러오는 중...
              </div>
            )}

            {loadState === "error" && (
              <p style={{ fontSize: 13, color: "var(--amber-tint-ink)", background: "var(--amber-tint)", padding: "8px 12px", borderRadius: 8 }}>
                피드를 불러오지 못했습니다. Redis(Upstash) 환경변수 설정을 확인해주세요.
              </p>
            )}

            {loadState === "ready" && items.length === 0 && (
              <p style={{ fontSize: 14, color: "var(--ink-muted)", padding: "24px 0" }}>
                아직 자동 수집된 뉴스가 없어요. /api/poll 을 한 번 호출해보시거나, 스케줄러가 연결되면 여기 자동으로 쌓이기 시작해요.
              </p>
            )}

            <div className="news-list">
              {items.map((n) => <NewsCard key={n.id} n={n} isNew={newIds.has(n.id)} />)}
            </div>
          </div>

          <div className="sidebar-stack">
            <GlobalMarketPanel />
            <DailyMoversPanel />
            <HotThemePanel />
          </div>
        </div>
      </main>

      <footer className="site-footer">
        <Newspaper size={14} style={{ marginTop: 2, flexShrink: 0 }} />
        <span>
          "관련주"는 사업내용상 근거가 확인된 연결이며, "시장 추정 · 검증되지 않은 연관"은 실적과 무관한 풍문·인맥 기반
          정보를 있는 그대로 전달하는 것으로 투자 추천이 아닙니다. "악재" 표시는 유상증자·감자·거래정지 등 공시로 확인되는
          객관적 이벤트에만 표시되며, 그 자체로 매도·매수를 권유하는 것이 아닙니다.
        </span>
      </footer>

      {toast && (
        <div className="toast-container">
          <div key={toast.headline + toast.count} className="new-toast">
            <Bell size={16} className="new-toast-icon" />
            <div>
              <p className="new-toast-title">새 소식 {toast.count}건 도착</p>
              {toast.headline && <p className="new-toast-headline">{toast.headline}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
