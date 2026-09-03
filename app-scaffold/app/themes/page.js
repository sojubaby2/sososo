"use client";

// This page fetches live data client-side, so it can't be meaningfully
// prerendered at build time — see the matching note in app/page.js.
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { Search, ShieldAlert, TrendingUp, TrendingDown, Minus } from "lucide-react";
import Header from "../../components/Header";
import { getThemesGrouped, isPoliticalTheme } from "../../lib/themeData";

const THEMES = getThemesGrouped(); // [{ theme, stocks: [{theme,name,code,market}] }, ...]

function ChangeTag({ value }) {
  if (typeof value !== "number") return <span className="flat mono">—</span>;
  const isUp = value > 0, isDown = value < 0;
  const cls = isUp ? "up" : isDown ? "down" : "flat";
  const Icon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;
  return (
    <span className={`mono ${cls}`} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 600 }}>
      <Icon size={14} strokeWidth={2.5} />
      {isUp ? "+" : ""}
      {value.toFixed(1)}%
    </span>
  );
}

export default function ThemesPage() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(THEMES[0]?.theme ?? "");
  const [themeChangeMap, setThemeChangeMap] = useState({}); // theme -> change1M
  const [stockChangeMap, setStockChangeMap] = useState({}); // code -> change1M
  const [loadState, setLoadState] = useState("loading"); // loading | ready | error

  useEffect(() => {
    fetch("/api/theme-momentum")
      .then((r) => r.json())
      .then((data) => {
        if (data.error || !data.themeChanges) {
          setLoadState("error");
          return;
        }
        const tMap = {};
        for (const t of data.themeChanges) tMap[t.theme] = t.change1M;
        setThemeChangeMap(tMap);
                setStockChangeMap(data.stockChanges1M || {});
        setLoadState("ready");
      })
      .catch(() => setLoadState("error"));
  }, []);

  const filteredThemes = useMemo(
    () => THEMES.filter((t) => t.theme.toLowerCase().includes(query.toLowerCase())),
    [query]
  );

  const selectedGroup = THEMES.find((t) => t.theme === selected) ?? THEMES[0];

  // Hottest themes (highest 1-month average change) float to the top.
  const sortedThemes = useMemo(() => {
    return [...filteredThemes].sort((a, b) => {
      const ca = themeChangeMap[a.theme];
      const cb = themeChangeMap[b.theme];
      const na = typeof ca === "number", nb = typeof cb === "number";
      if (!na && !nb) return 0;
      if (!na) return 1;
      if (!nb) return -1;
      return cb - ca;
    });
  }, [filteredThemes, themeChangeMap]);

  // Within the selected theme, sort stocks by 1-month change too — this is
  // what stands in for a "대장주" leaderboard now that we don't show a
  // same-day price/change (which looked live but wasn't).
  const sortedStocks = useMemo(() => {
    if (!selectedGroup) return [];
    return [...selectedGroup.stocks].sort((a, b) => {
      const ca = stockChangeMap[a.code];
      const cb = stockChangeMap[b.code];
      const na = typeof ca === "number", nb = typeof cb === "number";
      if (!na && !nb) return 0;
      if (!na) return 1;
      if (!nb) return -1;
      return cb - ca;
    });
  }, [selectedGroup, stockChangeMap]);

  return (
    <div>
      <Header />
      <main className="container-wide" style={{ paddingTop: 32, paddingBottom: 32 }}>
        <div className="search-box">
          <Search size={16} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="테마 검색 (예: 반도체, 위고비, 호르무즈)" />
        </div>

        {loadState === "error" && (
          <p style={{ fontSize: 13, color: "var(--amber-tint-ink)", background: "var(--amber-tint)", padding: "8px 12px", borderRadius: 8, marginBottom: 16 }}>
            시세 데이터를 불러오지 못했습니다. KRX_SERVICE_KEY 환경변수 설정을 확인해주세요. (테마·종목 목록은 정상 표시됩니다)
          </p>
        )}

        <div className="theme-layout">
          <aside>
            <h2 className="section-title">전체 테마 ({sortedThemes.length}) · 🔥 1개월 등락률 높은 순</h2>
            <div className="theme-list">
              {sortedThemes.map((t) => (
                <button
                  key={t.theme}
                  onClick={() => setSelected(t.theme)}
                  className={`theme-item ${selected === t.theme ? "active" : ""}`}
                >
                  <span className="theme-item-name">
                    {isPoliticalTheme(t.theme) && <ShieldAlert size={14} style={{ color: "var(--amber)" }} />}
                    {t.theme}
                  </span>
                  <ChangeTag value={themeChangeMap[t.theme]} />
                </button>
              ))}
            </div>
          </aside>

          <section>
            {selectedGroup && (
              <>
                <div className="theme-heading">
                  <h2>{selectedGroup.theme}</h2>
                  <span className="text-xs" style={{ color: "var(--ink-muted)", fontSize: 12 }}>1개월 누적 등락률 기준</span>
                  {isPoliticalTheme(selectedGroup.theme) && (
                    <span className="political-tag">
                      <ShieldAlert size={12} />정치테마주 — 사업 실적과 무관한 인맥 기반 편입, 투자 주의
                    </span>
                  )}
                </div>

                <table className="stock-table">
                  <thead>
                    <tr>
                      <th>종목명</th>
                      <th>코드</th>
                      <th>시장</th>
                      <th>1개월 등락률</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedStocks.map((s) => (
                      <tr key={s.code}>
                        <td style={{ fontWeight: 500 }}>{s.name}</td>
                        <td className="mono" style={{ color: "var(--ink-muted)" }}>{s.code}</td>
                        <td><span className="market-tag">{s.market}</span></td>
                        <td><ChangeTag value={stockChangeMap[s.code]} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
