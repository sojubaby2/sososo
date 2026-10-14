"use client";

// app/themes/ThemesClient.js
//
// [2026-10-14 분리] 원래 app/themes/page.js였던 화면 코드입니다. 동작은
// 예전과 완전히 동일하고, 아래 두 가지만 더해졌습니다.
//   ① 이 페이지가 무엇인지 설명하는 글(AboutThemesSection)
//   ② 전체 테마와 그 안의 종목을 한 번에 펼쳐볼 수 있는 목록(ThemeDirectory)
// 둘 다 고정 글이라 서버가 보내는 첫 HTML에 그대로 담깁니다 — 예전에는
// 종목 표가 "펼쳐진 테마" 하나만 HTML에 있어서, 검색엔진 입장에서는 테마
// 이름만 146개 나열된 페이지로 보였습니다.

import { Fragment, useEffect, useMemo, useState } from "react";
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

// [2026-10-14 추가] 이 페이지가 무엇인지, 테마를 어떻게 묶었는지 설명하는 글.
//
// 스타일은 globals.css에 새 클래스를 추가하는 대신 인라인으로 넣었습니다 —
// 기존 디자인 파일을 건드리지 않아야 다른 화면이 깨질 위험이 없기 때문입니다.
const aboutSectionStyle = {
  marginTop: 40,
  paddingTop: 28,
  borderTop: "1px solid var(--border)",
  maxWidth: 760,
  lineHeight: 1.75,
  fontSize: 14.5,
  color: "var(--ink-muted)",
};
const aboutH2Style = { fontSize: 19, fontWeight: 700, margin: "0 0 12px", color: "var(--ink)" };
const aboutH3Style = { fontSize: 15.5, fontWeight: 700, margin: "22px 0 8px", color: "var(--ink)" };
const aboutPStyle = { margin: "0 0 12px" };

function AboutThemesSection() {
  return (
    <section style={aboutSectionStyle}>
      <h2 style={aboutH2Style}>테마별 종목정리는 무엇인가요</h2>
      <p style={aboutPStyle}>
        증시에서 테마란 같은 재료에 함께 움직이는 종목들의 묶음을 말합니다. 반도체 장비, 2차전지 소재, 비만
        치료제처럼 사업 내용이 겹치는 경우가 대부분이고, 특정 사건이나 정책에 함께 노출되는 경우도 있습니다.
        이 페이지는 그 묶음을 테마 이름별로 정리해, 어떤 종목이 어디에 속하는지 한 번에 볼 수 있게 한 표입니다.
      </p>
      <h3 style={aboutH3Style}>등락률은 어떤 숫자인가요</h3>
      <p style={aboutPStyle}>
        각 종목 옆의 숫자는 선택한 기간(1주일 또는 1개월) 동안의 누적 등락률입니다. 테마 이름 옆의 숫자는 그
        테마에 속한 종목들의 등락률을 모아 계산한 값으로, 테마 전체가 그 기간에 얼마나 움직였는지를 가늠하는
        용도입니다. 목록은 등락률이 높은 테마부터 위에 보이도록 정렬됩니다.
      </p>
      <h3 style={aboutH3Style}>테마에 묶였다는 것의 의미</h3>
      <p style={aboutPStyle}>
        어떤 종목이 테마에 들어 있다는 것은 그 재료와 사업적으로 연결될 여지가 있다는 뜻이지, 실적에 실제로
        반영된다는 보장이 아닙니다. 같은 테마 안에서도 매출의 대부분이 그 사업인 회사가 있는가 하면, 비중이
        매우 작은 회사도 함께 묶여 있습니다. 종목을 보실 때는 그 회사의 사업보고서에서 해당 사업의 실제 비중을
        확인하시는 편이 안전합니다.
      </p>
      <h3 style={aboutH3Style}>투자 추천이 아닙니다</h3>
      <p style={aboutPStyle}>
        이 표는 종목을 추천하거나 매수·매도를 권유하지 않습니다. 테마 구성과 과거 등락률을 정리해 보여주는
        것까지가 역할이며, 판단과 책임은 투자자 본인에게 있습니다.
      </p>
    </section>
  );
}

// [2026-10-14 추가] 전체 테마와 그 안의 종목을 글로 나열한 목록.
// 위쪽 표는 한 번에 한 테마만 펼쳐지는 구조라, 검색엔진이 보는 HTML에는
// 종목이 몇 개밖에 담기지 않았습니다. 이 블록은 접혀 있어도 HTML에는 전부
// 들어가므로, 방문자에게는 깔끔하게 유지하면서 검색에는 모두 노출됩니다.
function ThemeDirectory() {
  return (
    <section style={aboutSectionStyle}>
      <h2 style={aboutH2Style}>전체 테마 목록 ({THEMES.length}개)</h2>
      <p style={aboutPStyle}>
        현재 분류해 둔 테마와 각 테마에 속한 종목입니다. 위쪽 검색창에 테마 이름을 넣으면 해당 테마의 등락률까지
        함께 볼 수 있습니다.
      </p>
      <div style={{ fontSize: 13.5, lineHeight: 1.7 }}>
        {THEMES.map((t) => (
          <p key={t.theme} style={{ margin: "0 0 10px" }}>
            <strong>{t.theme}</strong>{" "}
            <span>{t.stocks.map((s) => s.name).join(", ")}</span>
          </p>
        ))}
      </div>
    </section>
  );
}

export default function ThemesClient() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(THEMES[0]?.theme ?? "");
  // 모바일 드롭다운이 "펼쳐져 있는지"만 따로 관리 — selected(데스크톱 오른쪽
  // 패널/좌측 강조 표시용)는 항상 마지막으로 누른 테마를 유지하지만,
  // 모바일에서는 같은 테마를 한 번 더 누르면 드롭다운만 접히고 selected는
  // 그대로 둠(다시 열면 바로 그 테마가 보이도록).
  const [expanded, setExpanded] = useState(THEMES[0]?.theme ?? "");
  const [rawThemeChanges, setRawThemeChanges] = useState([]); // [{theme, change1W, change1M}, ...]
  const [stockChanges1W, setStockChanges1W] = useState({}); // code -> change1W
  const [stockChanges1M, setStockChanges1M] = useState({}); // code -> change1M
  const [loadState, setLoadState] = useState("loading"); // loading | ready | error
  const [range, setRange] = useState("1W"); // "1W" | "1M" — 재성님 요청으로 기본값을 1주일로 변경

  // [2026-09-08 추가] 홈페이지 "국장 예측" 배너(components/DailyOutlookBanner.js)
  // 에서 특정 테마 줄을 누르면 /themes?theme=반도체 처럼 쿼리스트링을 달고
  // 들어오는데, 그 값이 있으면 처음부터 그 테마가 선택된 채로 보여줌(useState
  // 함수를 그냥 window.location.search가 아니라 useEffect에서 나중에 읽는
  // 이유: 이 페이지가 "use client"라 Next.js의 useSearchParams()를 쓰려면
  // Suspense 경계가 필요한데, 그냥 브라우저 기본 API로 읽으면 그럴 필요가 없음).
  useEffect(() => {
    const themeParam = new URLSearchParams(window.location.search).get("theme");
    if (themeParam && THEMES.some((t) => t.theme === themeParam)) {
      setSelected(themeParam);
      setExpanded(themeParam);
    }
  }, []);

  useEffect(() => {
    fetch("/api/theme-momentum")
      .then((r) => r.json())
      .then((data) => {
        if (data.error || !data.themeChanges) {
          setLoadState("error");
          return;
        }
        setRawThemeChanges(data.themeChanges);
        setStockChanges1W(data.stockChanges1W || {});
        setStockChanges1M(data.stockChanges1M || {});
        setLoadState("ready");
      })
      .catch(() => setLoadState("error"));
  }, []);

  const themeField = range === "1W" ? "change1W" : "change1M";
  const rangeLabel = range === "1W" ? "1주일" : "1개월";

  const themeChangeMap = useMemo(() => {
    const map = {};
    for (const t of rawThemeChanges) map[t.theme] = t[themeField];
    return map;
  }, [rawThemeChanges, themeField]);

  const stockChangeMap = range === "1W" ? stockChanges1W : stockChanges1M;

  const filteredThemes = useMemo(
    () => THEMES.filter((t) => t.theme.toLowerCase().includes(query.toLowerCase())),
    [query]
  );

  const selectedGroup = THEMES.find((t) => t.theme === selected) ?? THEMES[0];

  // 종목 테이블 하나를 데스크톱 오른쪽 패널과 모바일 인라인 드롭다운
  // 양쪽에서 그대로 재사용하기 위한 렌더 함수.
  function renderThemeDetail(group, stocks) {
    return (
      <>
        <div className="theme-heading">
          <h2>{group.theme}</h2>
          <span className="text-xs" style={{ color: "var(--ink-muted)", fontSize: 12 }}>{rangeLabel} 누적 등락률 기준</span>
          {isPoliticalTheme(group.theme) && (
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
              <th>{rangeLabel} 등락률</th>
            </tr>
          </thead>
          <tbody>
            {stocks.map((s) => (
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
    );
  }

  function sortStocksFor(group) {
    return [...group.stocks].sort((a, b) => {
      const ca = stockChangeMap[a.code];
      const cb = stockChangeMap[b.code];
      const na = typeof ca === "number", nb = typeof cb === "number";
      if (!na && !nb) return 0;
      if (!na) return 1;
      if (!nb) return -1;
      return cb - ca;
    });
  }

  // Hottest themes (highest change in the selected range) float to the top.
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

  // Within the selected theme, sort stocks by the same range's change — this
  // is what stands in for a "대장주" leaderboard now that we don't show a
  // same-day price/change (which looked live but wasn't). sortStocksFor is
  // the same sort, reused for whichever theme's accordion is open on mobile.
  const sortedStocks = useMemo(() => (selectedGroup ? sortStocksFor(selectedGroup) : []), [selectedGroup, stockChangeMap]);

  return (
    <div>
      <Header />
      <main className="container-wide" style={{ paddingTop: 32, paddingBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
          <div className="search-box" style={{ marginBottom: 0 }}>
            <Search size={16} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="테마 검색 (예: 반도체, 위고비, 호르무즈)" />
          </div>
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

        {loadState === "error" && (
          <p style={{ fontSize: 13, color: "var(--amber-tint-ink)", background: "var(--amber-tint)", padding: "8px 12px", borderRadius: 8, marginBottom: 16 }}>
            시세 데이터를 잠시 불러오지 못했습니다. 잠시 후 새로고침해주세요. (테마·종목 목록은 정상 표시됩니다)
          </p>
        )}

        <div className="theme-layout">
          <aside>
            <h2 className="section-title">전체 테마 ({sortedThemes.length}) · 🔥 {rangeLabel} 등락률 높은 순</h2>
            <div className="theme-list">
              {sortedThemes.map((t) => {
                const isActive = selected === t.theme;
                const isOpen = expanded === t.theme;
                return (
                  <Fragment key={t.theme}>
                    <button
                      onClick={() => {
                        setSelected(t.theme);
                        setExpanded((prev) => (prev === t.theme ? "" : t.theme));
                      }}
                      className={`theme-item ${isActive ? "active" : ""}`}
                    >
                      <span className="theme-item-name">
                        {isPoliticalTheme(t.theme) && <ShieldAlert size={14} style={{ color: "var(--amber)" }} />}
                        {t.theme}
                      </span>
                      <ChangeTag value={themeChangeMap[t.theme]} />
                    </button>
                    {/* 모바일 전용 인라인 드롭다운 — 데스크톱(768px 이상)에서는 CSS로 숨기고
                        오른쪽 <section> 패널을 대신 씀. 화면 폭과 상관없이 항상 렌더는 되지만
                        .open 클래스가 있어도 768px 이상에서는 globals.css가 display:none 처리함.
                        같은 테마를 다시 누르면 isOpen만 꺼지고(접힘) selected는 유지됨. */}
                    {isOpen && (
                      <div className="theme-item-accordion open">
                        {renderThemeDetail(t, sortStocksFor(t))}
                      </div>
                    )}
                  </Fragment>
                );
              })}
            </div>
          </aside>

          <section className="theme-detail-desktop">
            {selectedGroup && renderThemeDetail(selectedGroup, sortedStocks)}
          </section>
        </div>

        <AboutThemesSection />
        <ThemeDirectory />
      </main>
    </div>
  );
}
