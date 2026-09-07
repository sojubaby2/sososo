"use client";

// This page fetches live data client-side, so it can't be meaningfully
// prerendered at build time — see the matching note in app/themes/page.js.
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
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
        setLoadState("ready");
        const defs = data.patternDefs || [];
        const results = data.patterns || {};
        const firstWithResults = defs.find((d) => (results[d.id]?.length ?? 0) > 0);
        setSelected(firstWithResults?.id ?? defs[0]?.id ?? null);
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
  const selectedResults = patterns[selected] || [];
  const progressPct = historyTarget > 0 ? Math.min(100, Math.round((historyDays / historyTarget) * 100)) : 0;

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

        <div className="search-box">
          <Search size={16} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="패턴 이름 검색 (예: 쌍바닥, 전고점돌파)" />
        </div>

        <div className="theme-layout">
          <aside>
            {grouped.map((g) => (
              <div key={g.category} style={{ marginBottom: 16 }}>
                <h2 className="section-title">{g.category}</h2>
                <div className="theme-list">
                  {g.defs.map((d) => {
                    const count = patterns[d.id]?.length ?? 0;
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setSelected(d.id)}
                        className={`theme-item ${selected === d.id ? "active" : ""}`}
                        title={d.description || undefined}
                      >
                        <span className="theme-item-name">{d.label}</span>
                        <span className="mono" style={{ fontSize: 12, color: count > 0 ? "var(--up)" : "var(--ink-muted)" }}>
                          {count}종목
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </aside>

          <section>
            {selectedDef && (
              <>
                <div className="theme-heading" style={{ flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
                  <h2>{selectedDef.label}</h2>
                  <span className="text-xs" style={{ color: "var(--ink-muted)", fontSize: 12 }}>
                    {selectedDef.window ? `최근 ${selectedDef.window}거래일 기준` : "전체 보유 기간 기준"} · 유사도 55%
                    이상만 표시
                  </span>
                  {selectedDef.description && (
                    <span style={{ fontSize: 13, color: "var(--ink-muted)" }}>{selectedDef.description}</span>
                  )}
                </div>

                {selectedResults.length === 0 ? (
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
                        {selectedResults.map((r) => (
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
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
