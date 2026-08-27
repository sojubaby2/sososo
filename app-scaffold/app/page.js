"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useRef, useState } from "react";
import { Newspaper, Loader2, Flame, Bell, Globe } from "lucide-react";
import Header from "../components/Header";
import NewsCard from "../components/NewsCard";
import { isPoliticalTheme } from "../lib/themeData";

const HOT_THEME_COUNT = 8;
const FEED_POLL_MS = 25000; // check for new articles every 25s
const TRENDING_STOCK_COUNT = 14;

// Turns a saved /api/poll feed item into the shape NewsCard expects.
function toCardShape(item) {
  const hasLegitimate = item.matches.some((m) => m.confidence === "confirmed" || m.confidence === "theme");
  const reason = item.matches
    .map((m) => m.reason)
    .filter(Boolean)
    .slice(0, 3)
    .join(" / ");

  return {
    id: item.id,
    time: item.pubDate || "",
    source: item.keyword,
    headline: item.title,
    summary: item.summary,
    link: item.link,
    confidence: hasLegitimate ? "confirmed" : "rumor",
    reason: reason || "관련 근거 정보 없음",
    stocks: item.matches.map((m) => ({ name: m.name, code: m.code, market: m.market })),
  };
}

// Compact sidebar panel — a smaller reference version of what used to be a
// big colored grid across the top of the page.
function HotThemePanel() {
  const [themes, setThemes] = useState([]);
  const [state, setState] = useState("loading");

  useEffect(() => {
    fetch("/api/theme-momentum")
      .then((r) => r.json())
      .then((data) => {
        if (!data.themeChanges) {
          setState("error");
          return;
        }
        const top = data.themeChanges
          .filter((t) => typeof t.change1M === "number" && !isPoliticalTheme(t.theme))
          .sort((a, b) => b.change1M - a.change1M)
          .slice(0, HOT_THEME_COUNT);
        setThemes(top);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, []);

  if (state === "error") return null;

  return (
    <aside className="trending-panel">
      <h2 className="trending-panel-title">
        <Flame size={12} style={{ color: "var(--up)" }} />
        HOT 테마 · 1개월
      </h2>
      {state === "loading" ? (
        <p className="trending-empty">불러오는 중...</p>
      ) : (
        themes.map((t) => (
          <div key={t.theme} className="trending-row">
            <span className="trending-row-name">{t.theme}</span>
            <span className="mono up" style={{ fontSize: 13, fontWeight: 700 }}>
              {t.change1M > 0 ? "+" : ""}
              {t.change1M.toFixed(1)}%
            </span>
          </div>
        ))
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

function TrendingPanel({ rawItems }) {
  const trending = useMemo(() => {
    const seen = new Map();
    for (const item of rawItems) {
      for (const m of item.matches) {
        if (seen.has(m.code)) continue;
        seen.set(m.code, { name: m.name, code: m.code, market: m.market });
        if (seen.size >= TRENDING_STOCK_COUNT) break;
      }
      if (seen.size >= TRENDING_STOCK_COUNT) break;
    }
    return Array.from(seen.values());
  }, [rawItems]);

  return (
    <aside className="trending-panel">
      <h2 className="trending-panel-title">
        <Flame size={12} style={{ color: "var(--up)" }} />
        실시간 언급 종목
      </h2>
      {trending.length === 0 ? (
        <p className="trending-empty">아직 매칭된 종목이 없어요.</p>
      ) : (
        trending.map((s) => (
          <div key={s.code} className="trending-row">
            <span className="trending-row-name">{s.name}</span>
            <span className="trending-row-code">{s.code}</span>
          </div>
        ))
      )}
    </aside>
  );
}

export default function HomePage() {
  const [rawItems, setRawItems] = useState([]);
  const [loadState, setLoadState] = useState("loading");
  const [newIds, setNewIds] = useState(new Set());
  const [toast, setToast] = useState(null); // { count, headline } | null
  const knownIdsRef = useRef(new Set());
  const toastTimerRef = useRef(null);
  const newIdsTimerRef = useRef(null);

  function applyFeed(items, isFirstLoad) {
    const incomingIds = items.map((it) => it.id);
    if (!isFirstLoad) {
      const freshIds = incomingIds.filter((id) => !knownIdsRef.current.has(id));
      if (freshIds.length > 0) {
        setNewIds(new Set(freshIds));
        const latest = items.find((it) => it.id === freshIds[0]);
        setToast({ count: freshIds.length, headline: latest?.title || "" });
        clearTimeout(newIdsTimerRef.current);
        newIdsTimerRef.current = setTimeout(() => setNewIds(new Set()), 4000);
        clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => setToast(null), 4500);
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
        <div className="home-layout">
          <div>
            <h2 className="live-heading">
              <span className="live-dot" />
              <span className="live-label">실시간 뉴스 검색 중</span>
              <span className="loading-dots"><span>.</span><span>.</span><span>.</span></span>
              <span className="live-count">· 관련주 ({items.length})</span>
            </h2>

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
            <HotThemePanel />
            <TrendingPanel rawItems={rawItems} />
          </div>
        </div>
      </main>

      <footer className="site-footer">
        <Newspaper size={14} style={{ marginTop: 2, flexShrink: 0 }} />
        <span>
          "관련주"는 사업내용상 근거가 확인된 연결이며, "시장 추정 · 검증되지 않은 연관"은 실적과 무관한 풍문·인맥 기반
          정보를 있는 그대로 전달하는 것으로 투자 추천이 아닙니다.
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
