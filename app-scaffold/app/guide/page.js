"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { ChevronDown, BookOpen } from "lucide-react";
import Header from "../../components/Header";
import IndicatorDemo from "../../components/IndicatorDemo";
import { CATEGORIES, INDICATORS } from "../../lib/indicatorCatalog";

// Most demos use viewBox "0 0 100 100" (square); the pane-* types (RSI,
// MACD, volume, etc.) add a lower oscillator pane and use "0 0 100 130".
// timeframe-compare is a special case that lays out its own two mini
// charts internally, so it's excluded here.
const PANE_TYPES = new Set(["pane-bars", "pane-bars-avg", "pane-oscillator", "pane-oscillator-center", "pane-line", "pane-macd"]);
function aspectPaddingPct(visual) {
  return PANE_TYPES.has(visual.type) ? 130 : 100;
}

export default function GuidePage() {
  const [activeCategory, setActiveCategory] = useState("chartform");
  const [openId, setOpenId] = useState(null);

  const items = INDICATORS.filter((it) => it.category === activeCategory);

  return (
    <div>
      <Header />
      <main className="container" style={{ paddingTop: 32, paddingBottom: 48 }}>
        <div className="guide-intro">
          <BookOpen size={16} style={{ color: "var(--amber)" }} />
          <div>
            <h1 className="guide-title">차트 가이드</h1>
            <p className="guide-subtitle">지표를 눌러보면 같은 가격 데이터 위에서 어떻게 작동하는지 애니메이션으로 보여드려요.</p>
          </div>
        </div>

        <div className="guide-tabs">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              className={`guide-tab ${activeCategory === c.id ? "active" : ""}`}
              onClick={() => {
                setActiveCategory(c.id);
                setOpenId(null);
              }}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="guide-list">
          {items.map((it) => {
            const isOpen = openId === it.id;
            return (
              <div key={it.id} className={`guide-card ${isOpen ? "open" : ""}`}>
                <button className="guide-card-head" onClick={() => setOpenId(isOpen ? null : it.id)}>
                  <div>
                    <span className="guide-card-name">{it.name}</span>
                    <span className="guide-card-eng">{it.eng}</span>
                  </div>
                  <ChevronDown size={16} className="guide-chevron" />
                </button>
                <p className="guide-card-summary">{it.summary}</p>

                {isOpen && (
                  <div className="guide-card-body">
                    <div className="guide-demo-wrap">
                      {it.visual.type === "timeframe-compare" ? (
                        <IndicatorDemo visual={it.visual} />
                      ) : (
                        <div className="demo-frame" style={{ paddingTop: `${aspectPaddingPct(it.visual)}%` }}>
                          <IndicatorDemo visual={it.visual} />
                        </div>
                      )}
                    </div>
                    <p className="guide-detail">{it.detail}</p>
                    <div className="guide-tip">
                      <strong>읽는 법</strong> · {it.tip}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <p className="guide-footnote">
          여기 나온 계산은 이해를 돕기 위해 단순화한 교육용 애니메이션이에요. 실제 매매 판단에는 증권사 HTS의 정확한
          지표를 사용해주세요. 지표는 계속 추가될 예정이에요.
        </p>
      </main>
    </div>
  );
}
