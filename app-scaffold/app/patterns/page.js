"use client";

// This page fetches live data client-side, so it can't be meaningfully
// prerendered at build time — see the matching note in app/themes/page.js.
export const dynamic = "force-dynamic";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Search, Info } from "lucide-react";
import Header from "../../components/Header";

// lib/patternDetection.js의 PATTERN_DEFS와 category 값이 일치해야 함.
// 돌파형(전고점돌파/52주 신고가/골든크로스)을 재성님 요청으로 맨 위에 배치.
// 천정형·하락형은 각각 바닥형·상승 계열 패턴들의 반대(하락 반전/지속) 버전.
const CATEGORY_ORDER = ["돌파형", "바닥형", "천정형", "추세형", "하락형", "조정형", "캔들형"];

function SimilarityBar({ value }) {
  return (
    <span className="mono" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span
        style={{
          width: 60,
          height: 6,
          borderRadius: 999,
          background: "var(--border)",
          overflow: "hidden",
          display: "inline-block",
        }}
      >
        <span style={{ display: "block", height: "100%", width: `${value}%`, background: "var(--amber)" }} />
      </span>
      {value}%
    </span>
  );
}

export default function PatternsPage() {
  const [query, setQuery] = useState("");
  const [patternDefs, setPatternDefs] = useState([]);
  const [patterns, setPatterns] = useState({});
  const [selected, setSelected] = useState(null);
  // [2026-09-08 추가] 재성님 요청 — 테마별 종목정리(app/themes/page.js)처럼
  // 모바일에서 패턴 이름을 터치하면 바로 아래로 드롭다운되고, 같은 걸 다시
  // 터치하면 접히게 함. selected(데스크톱 오른쪽 패널 + 강조 표시용)와는
  // 별개로 "지금 펼쳐진 게 어떤 패턴인지"만 따로 관리 — 로직은
  // app/themes/page.js의 expanded 상태와 동일한 패턴.
  const [expanded, setExpanded] = useState(null);
  const [loadState, setLoadState] = useState("loading"); // loading | ready | empty | error
  const [historyDays, setHistoryDays] = useState(0);
  const [historyTarget, setHistoryTarget] = useState(750);
  const [errorMsg, setErrorMsg] = useState("");
  // [2026-09-07 추가] 재성님 요청 — 종목 행 클릭 시 종목코드를 클립보드에
  // 복사하고, 방금 복사된 코드 옆에 짧게 "복사됨" 표시를 보여줌.
  const [copiedCode, setCopiedCode] = useState(null);

  async function handleCopyCode(code) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode((c) => (c === code ? null : c)), 1500);
    } catch {
      // 클립보드 권한이 없거나 지원 안 되는 환경 — 조용히 무시(다른 기능엔 영향 없음)
    }
  }

  useEffect(() => {
    fetch("/api/patterns")
      .then((r) => r.json())
      .then((data) => {
        setPatternDefs(data.patternDefs || []);
        setPatterns(data.patterns || {});
        setHistoryDays(data.historyDays || 0);
        setHistoryTarget(data.historyTarget || 750);
        if (data.error) {
          setErrorMsg(data.error);
          setLoadState("empty");
          return;
        }
        // [2026-09-07 추가] app/api/patterns/route.js가 캐시가 아직 한 번도
        // 안 채워졌을 때(배포 직후 등) warming 플래그를 내려줌 — 이땐 아직
        // 백그라운드(app/api/poll/route.js)가 한 번도 스캔을 못 돈 것뿐이라
        // "에러"라기보단 "곧 채워짐" 안내가 더 정확함.
        if (data.warming) {
          setErrorMsg("패턴 계산 결과를 아직 준비 중이에요. 최대 30분 이내에 자동으로 채워지니 잠시 후 새로고침해주세요.");
          setLoadState("empty");
          return;
        }
        setLoadState("ready");
        const defs = data.patternDefs || [];
        const results = data.patterns || {};
        const firstWithResults = defs.find((d) => (results[d.id]?.length ?? 0) > 0);
        const firstId = firstWithResults?.id ?? defs[0]?.id ?? null;
        setSelected(firstId);
        // 모바일 드롭다운도 처음엔 같은 패턴이 펼쳐진 채로 시작(테마별
        // 종목정리 페이지와 동일한 초기 동작).
        setExpanded(firstId);
      })
      .catch(() => setLoadState("error"));
  }, []);

  const filteredDefs = useMemo(
    () => patternDefs.filter((d) => d.label.toLowerCase().includes(query.toLowerCase())),
    [patternDefs, query]
  );

  const grouped = useMemo(() => {
    const byCategory = new Map();
    for (const d of filteredDefs) {
      if (!byCategory.has(d.category)) byCategory.set(d.category, []);
      byCategory.get(d.category).push(d);
    }
    return CATEGORY_ORDER.filter((c) => byCategory.has(c)).map((c) => ({ category: c, defs: byCategory.get(c) }));
  }, [filteredDefs]);

  const selectedDef = patternDefs.find((d) => d.id === selected);
  const progressPct = historyTarget > 0 ? Math.min(100, Math.round((historyDays / historyTarget) * 100)) : 0;

  // [2026-09-08 추가] 패턴 하나(제목+설명+종목 테이블)를 렌더하는 부분을
  // 함수로 빼서, 모바일 인라인 드롭다운과 데스크톱 오른쪽 패널 양쪽에서
  // 그대로 재사용함 — app/themes/page.js의 renderThemeDetail과 동일한 구조.
  function renderPatternDetail(def) {
    const results = patterns[def.id] || [];
    return (
      <>
        <div className="theme-heading" style={{ flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
          <h2>{def.label}</h2>
          <span className="text-xs" style={{ color: "var(--ink-muted)", fontSize: 12 }}>
            {def.window ? `최근 ${def.window}거래일 기준` : "전체 보유 기간 기준"} · 유사도 55% 이상만 표시
          </span>
          {def.description && (
            <span style={{ fontSize: 13, color: "var(--ink-muted)" }}>{def.description}</span>
          )}
        </div>

        {results.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--ink-muted)", padding: "24px 0" }}>
            현재 이 패턴에 해당하는 종목이 없습니다.
          </p>
        ) : (
          <>
            <p style={{ fontSize: 12, color: "var(--ink-muted)", margin: "0 0 8px" }}>
              종목을 클릭하면 종목코드가 복사됩니다.
            </p>
            <table className="stock-table">
              <thead>
                <tr>
                  <th>종목명</th>
                  <th>코드</th>
                  <th>시장</th>
                  <th>유사도</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr
                    key={r.code}
                    onClick={() => handleCopyCode(r.code)}
                    style={{ cursor: "pointer" }}
                    title="클릭하면 종목코드가 복사됩니다"
                  >
                    <td style={{ fontWeight: 500 }}>{r.name}</td>
                    <td className="mono" style={{ color: "var(--ink-muted)" }}>
                      {r.code}
                      {copiedCode === r.code && (
                        <span style={{ marginLeft: 6, fontSize: 11, color: "var(--up)" }}>복사됨</span>
                      )}
                    </td>
                    <td>
                      <span className="market-tag">{r.market}</span>
                    </td>
                    <td>
                      <SimilarityBar value={r.similarity} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </>
    );
  }

  return (
    <div>
      <Header />
      <main className="container-wide" style={{ paddingTop: 32, paddingBottom: 32 }}>
        <div className="theme-heading" style={{ marginBottom: 8 }}>
          <h2>패턴검색</h2>
          <span className="text-xs" style={{ color: "var(--ink-muted)", fontSize: 12 }}>
            최근 시세 흐름을 24가지 차트 패턴과 비교해 유사도가 높은 종목을 찾아드립니다
          </span>
        </div>

        {historyDays > 0 && historyDays < historyTarget && (
          <div
            style={{
              fontSize: 13,
              color: "var(--amber-tint-ink)",
              background: "var(--amber-tint)",
              padding: "10px 14px",
              borderRadius: 8,
              marginBottom: 20,
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <Info size={15} />
            <span>
              시세 히스토리를 쌓는 중이에요 ({historyDays}/{historyTarget}일 · {progressPct}%) — 30분마다 자동으로
              채워지고, 패턴마다 필요한 기간이 다 채워지는 대로 하나씩 결과가 나타나요.
            </span>
          </div>
        )}

        {loadState === "empty" && (
          <p
            style={{
              fontSize: 13,
              color: "var(--amber-tint-ink)",
              background: "var(--amber-tint)",
              padding: "10px 14px",
              borderRadius: 8,
              marginBottom: 20,
            }}
          >
            {errorMsg || "아직 표시할 데이터가 없습니다."}
          </p>
        )}

        {loadState === "error" && (
          <p
            style={{
              fontSize: 13,
              color: "var(--amber-tint-ink)",
              background: "var(--amber-tint)",
              padding: "10px 14px",
              borderRadius: 8,
              marginBottom: 20,
            }}
          >
            데이터를 잠시 불러오지 못했습니다. 잠시 후 새로고침해주세요.
          </p>
        )}

        {/* [2026-09-07 추가] 재성님 리포트 — 예전엔 데이터가 오는 동안
            "불러오는 중" 표시가 전혀 없어서 검색창만 뜨고 화면이 텅 비어
            있는 것처럼 보였음. 그래서 로딩 중임을 명시적으로 보여줌. */}
        {loadState === "loading" && (
          <div
            style={{
              fontSize: 13,
              color: "var(--ink-muted)",
              background: "var(--border)",
              padding: "10px 14px",
              borderRadius: 8,
              marginBottom: 20,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <Info size={15} />
            <span>패턴 결과를 불러오는 중이에요...</span>
          </div>
        )}

        <div className="search-box">
          <Search size={16} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="패턴 이름 검색 (예: 쌍바닥, 전고점돌파)" />
        </div>

        {loadState === "loading" ? (
          <p style={{ fontSize: 13, color: "var(--ink-muted)", padding: "40px 0", textAlign: "center" }}>
            불러오는 중...
          </p>
        ) : (
        <div className="theme-layout">
          <aside>
            {grouped.map((g) => (
              <div key={g.category} style={{ marginBottom: 16 }}>
                <h2 className="section-title">{g.category}</h2>
                <div className="theme-list">
                  {g.defs.map((d) => {
                    const count = patterns[d.id]?.length ?? 0;
                    const isActive = selected === d.id;
                    const isOpen = expanded === d.id;
                    return (
                      <Fragment key={d.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelected(d.id);
                            setExpanded((prev) => (prev === d.id ? null : d.id));
                          }}
                          className={`theme-item ${isActive ? "active" : ""}`}
                          title={d.description || undefined}
                        >
                          <span className="theme-item-name">{d.label}</span>
                          <span className="mono" style={{ fontSize: 12, color: count > 0 ? "var(--up)" : "var(--ink-muted)" }}>
                            {count}종목
                          </span>
                        </button>
                        {/* [2026-09-08 추가] 모바일 전용 인라인 드롭다운 —
                            app/themes/page.js와 동일한 .theme-item-accordion
                            클래스를 재사용함(768px 미만에서만 보이고,
                            그 이상에서는 globals.css가 숨긴 뒤 아래
                            .theme-detail-desktop 패널을 대신 보여줌). */}
                        {isOpen && (
                          <div className="theme-item-accordion open">{renderPatternDetail(d)}</div>
                        )}
                      </Fragment>
                    );
                  })}
                </div>
              </div>
            ))}
          </aside>

          <section className="theme-detail-desktop">{selectedDef && renderPatternDetail(selectedDef)}</section>
        </div>
        )}
      </main>
    </div>
  );
}
