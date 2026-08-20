"use client";

import { useMemo, useState } from "react";
import { SlidersHorizontal, Newspaper } from "lucide-react";
import Header from "../components/Header";
import NewsCard from "../components/NewsCard";
import SAMPLE_NEWS from "../lib/sampleNews";

export default function HomePage() {
  const [filter, setFilter] = useState("all");
  const items = useMemo(
    () => (filter === "confirmed" ? SAMPLE_NEWS.filter((n) => n.confidence === "confirmed") : SAMPLE_NEWS),
    [filter]
  );

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

        <div className="news-list">
          {items.map((n) => <NewsCard key={n.id} n={n} />)}
        </div>
      </main>

      <footer className="site-footer">
        <Newspaper size={14} style={{ marginTop: 2, flexShrink: 0 }} />
        <span>
          "관련주"는 사업내용상 근거가 확인된 연결이며, "시장 추정 · 검증되지 않은 연관"은 실적과 무관한 풍문·인맥 기반
          정보를 있는 그대로 전달하는 것으로 투자 추천이 아닙니다. 이 뉴스 목록은 샘플입니다 — 실제 뉴스 수집·매칭
          파이프라인은 다음 단계에서 연결합니다.
        </span>
      </footer>
    </div>
  );
}
