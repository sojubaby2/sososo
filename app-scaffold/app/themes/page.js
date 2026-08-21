"use client";

// This page fetches live price data client-side (see the useEffect below),
// so it can't be meaningfully prerendered at build time. Without this,
// Next.js tries to statically render it during `next build` and fails with
// "Unsupported Server Component type: Module" — this line fixes that.
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
  const [priceMap, setPriceMap] = useState({}); // code -> { price, change }
  const [loadState, setLoadState] = useState("loading"); // loading | ready | error

  useEffect(() => {
    fetch("/api/stocks?numOfRows=3000&pageNo=1")
      .then((r) => r.json())
      .then((data) => {
        const items = data?.response?.body?.items?.item ?? [];
        const map = {};
        for (const it of items) {
          map[it.srtnCd] = {
            price: Number(it.clpr),
            change: Number(it.fltRt),
          };
        }
        setPriceMap(map);
        setLoadState(items.length ? "ready" : "error");
      })
      .catch(() => setLoadState("error"));
  }, []);

  const filteredThemes = useMemo(
    () => THEMES.filter((t) => t.theme.toLowerCase().includes(query.toLowerCase())),
    [query]
  );

  const selectedGroup = THEMES.find((t) => t.theme === selected) ?? THEMES[0];

  const themeAvgChange = (stocks) => {
    const vals = stocks.map((s) => priceMap[s.code]?.change).filter((v) => typeof v === "number");
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };

  // Hottest themes (highest average change%) float to the top. Themes with
  // no price data yet (still loading, or no matched codes) sink to the
  // bottom instead of breaking the sort.
  const sortedThemes = useMemo(() => {
    return [...filteredThemes].sort((a, b) => {
      const ca = themeAvgChange(a.stocks);
      const cb = themeAvgChange(b.stocks);
      if (ca === null && cb === null) return 0;
      if (ca === null) return 1;
      if (cb === null) return -1;
      return cb - ca;
    });
  }, [filteredThemes, priceMap]);

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
            실시간 시세를 불러오지 못했습니다. KRX_SERVICE_KEY 환경변수 설정을 확인해주세요. (테마·종목 목록은 정상 표시됩니다)
          </p>
        )}

        <div className="theme-layout">
          <aside>
            <h2 className="section-title">전체 테마 ({sortedThemes.length}) · 🔥 등락률 높은 순</h2>
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
                  <ChangeTag value={themeAvgChange(t.stocks)} />
                </button>
              ))}
            </div>
          </aside>

          <section>
            {selectedGroup && (
              <>
                <div className="theme-heading">
                  <h2>{selectedGroup.theme}</h2>
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
                      <th>현재가</th>
                      <th>등락률</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedGroup.stocks.map((s) => {
                      const p = priceMap[s.code];
                      return (
                        <tr key={s.code}>
                          <td style={{ fontWeight: 500 }}>{s.name}</td>
                          <td className="mono" style={{ color: "var(--ink-muted)" }}>{s.code}</td>
                          <td><span className="market-tag">{s.market}</span></td>
                          <td className="mono">{p ? `${p.price.toLocaleString("ko-KR")}원` : loadState === "loading" ? "불러오는 중..." : "—"}</td>
                          <td><ChangeTag value={p?.change} /></td>
                        </tr>
                      );
                    })}
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
