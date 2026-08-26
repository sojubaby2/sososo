"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { SlidersHorizontal, Newspaper, Loader2, Flame } from "lucide-react";
import Header from "../components/Header";
import NewsCard from "../components/NewsCard";
import { isPoliticalTheme } from "../lib/themeData";

const HOT_THEME_COUNT = 10;

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

// 5-step intensity scale so the strongest movers read visually "hotter" —
// same idea as the reference screenshot's darker-vs-lighter red cards.
function intensityClass(rank) {
  if (rank === 0) return "hot-1";
  if (rank <= 2) return "hot-2";
  if (rank <= 4) return "hot-3";
  if (rank <= 6) return "hot-4";
  return "hot-5";
}

function HotThemeGrid() {
  const [themes, setThemes] = useState([]);
  const [state, setState] = useState("loading"); // loading | ready | error

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

  if (state === "error") return null; // fail quietly — the news feed below is the main content

  return (
    <section style={{ marginBottom: 32 }}>
      <h2 className="section-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Flame size={13} style={{ color: "var(--up)" }} />
        HOT 테마 · 1개월 등락률
      </h2>
      {state === "loading" ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--ink-muted)", fontSize: 14, padding: "12px 0" }}>
          <Loader2 size={16} />
          불러오는 중...
        </div>
      ) : (
        <div className="hot-theme-grid">
          {themes.map((t, i) => (
            <div key={t.theme} className={`hot-theme-card ${intensityClass(i)}`}>
              <span className="hot-theme-name">{t.theme}</span>
              <span className="hot-theme-change">
                {t.change1M > 0 ? "+" : ""}
                {t.change1M.toFixed(2)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function HomePage() {
  const [rawItems, setRawItems] = useState([]);
  const [loadState, setLoadState] = useState("loading"); // loading | ready | error
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    fetch("/api/feed")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setLoadState("error");
          return;
        }
        setRawItems(data.items || []);
        setLoadState("ready");
      })
      .catch(() => setLoadState("error"));
  }, []);

  const items = useMemo(() => {
    const mapped = rawItems.map(toCardShape);
    return filter === "confirmed" ? mapped.filter((n) => n.confidence === "confirmed") : mapped;
  }, [rawItems, filter]);

  return (
    <div>
      <Header />
      <main className="container" style={{ paddingTop: 32, paddingBottom: 32 }}>
        <HotThemeGrid />

        <div className="filter-row">
          <h2 className="section-title" style={{ margin: 0 }}>실시간 뉴스 · 관련주 ({items.length})</h2>
          <div className="filter-btns">
            <SlidersHorizontal size={13} style={{ color: "var(--ink-muted)", marginRight: 4 }} />
            <button className={`filter-btn ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>전체</button>
            <button className={`filter-btn ${filter === "confirmed" ? "active" : ""}`} onClick={() => setFilter("confirmed")}>관련주 확정만</button>
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
            아직 자동 수집된 뉴스가 없어요. /api/poll 을 한 번 호출해보시거나, 1분 스케줄러가 연결되면 여기 자동으로 쌓이기 시작해요.
          </p>
        )}

        <div className="news-list">
          {items.map((n) => <NewsCard key={n.id} n={n} />)}
        </div>
      </main>

      <footer className="site-footer">
        <Newspaper size={14} style={{ marginTop: 2, flexShrink: 0 }} />
        <span>
          "관련주"는 사업내용상 근거가 확인된 연결이며, "시장 추정 · 검증되지 않은 연관"은 실적과 무관한 풍문·인맥 기반
          정보를 있는 그대로 전달하는 것으로 투자 추천이 아닙니다.
        </span>
      </footer>
    </div>
  );
}
