"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { SlidersHorizontal, Newspaper, Loader2 } from "lucide-react";
import Header from "../components/Header";
import NewsCard from "../components/NewsCard";

// Turns a saved /api/poll feed item into the shape NewsCard expects.
// Matches can now be tiered three ways: "confirmed" (directly named),
// "theme" (pulled in via a matched investment theme), or "rumor". Both
// confirmed and theme-tier are legitimate, non-fabricated connections, so
// either one is enough to earn the card's green "관련주" styling — only
// pure rumor-only cards get the dashed/amber treatment.
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
    source: `자동 수집 · ${item.keyword}`,
    headline: item.title,
    summary: item.summary,
    link: item.link,
    confidence: hasLegitimate ? "confirmed" : "rumor",
    reason: reason || "관련 근거 정보 없음",
    stocks: item.matches.map((m) => ({ name: m.name, code: m.code, market: m.market })),
  };
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
