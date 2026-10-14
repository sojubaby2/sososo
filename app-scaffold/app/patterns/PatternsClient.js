"use client";

// app/patterns/PatternsClient.js
//
// [2026-10-14 분리] 원래 app/patterns/page.js였던 화면 코드입니다.
// 검색창·드롭다운·종목코드 복사처럼 브라우저에서만 되는 동작이 있어서
// "use client"로 남겨두고, "처음 보여줄 패턴 결과를 서버가 미리 가져오는"
// 부분만 app/patterns/page.js로 떼어냈습니다.
//
// 바뀐 점은 initialData를 받아 첫 화면에 바로 쓴다는 것 하나뿐입니다. 화면이
// 뜬 뒤에는 예전과 똑같이 /api/patterns를 한 번 불러와 전체 목록으로
// 채웁니다(서버가 넘겨주는 건 패턴당 40종목까지로 줄인 요약본이라,
// 방문자에게는 전체를 보여주기 위함입니다).

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

// [2026-10-14 추가] 패턴검색이 무엇이고 유사도가 어떻게 계산되는지를 설명하는
// 글입니다. 예전에는 이 페이지에 사람이 쓴 문장이 한 줄(부제)뿐이어서,
// 검색엔진과 광고 심사 입장에서는 "표만 있고 설명이 없는 페이지"로 보였습니다.
// 자바스크립트와 무관한 고정 글이라 서버가 보내는 첫 HTML에 그대로 담깁니다.
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

function AboutPatternsSection() {
  return (
    <section style={aboutSectionStyle}>
      <h2 style={aboutH2Style}>패턴검색은 어떻게 동작하나요</h2>
      <p style={aboutPStyle}>
        국내 상장 종목의 일별 시세를 저장해두고, 종목마다 최근 구간의 가격 흐름을 미리 정의해둔 차트 패턴의 모양과
        비교합니다. 두 곡선이 얼마나 닮았는지를 0에서 100 사이의 숫자로 환산한 값이 표에 보이는 유사도이고,
        55% 이상인 종목만 목록에 올립니다. 계산은 30분마다 자동으로 다시 돌기 때문에, 장중에 모양이 만들어진
        종목은 다음 갱신에서 목록에 나타납니다.
      </p>
      <h3 style={aboutH3Style}>패턴마다 필요한 기간이 다릅니다</h3>
      <p style={aboutPStyle}>
        쌍바닥처럼 몇 주면 판단할 수 있는 모양이 있는가 하면, 52주 신고가처럼 최소 1년치 시세가 있어야 의미가
        생기는 항목도 있습니다. 그래서 각 패턴 제목 아래에 그 판단에 쓰인 기간을 함께 적어두었습니다. 시세
        히스토리를 아직 채우는 중이라면 기간이 긴 패턴부터 결과가 비어 있을 수 있습니다.
      </p>
      <h3 style={aboutH3Style}>52주 신고가는 엄격하게 봅니다</h3>
      <p style={aboutPStyle}>
        초기에는 최근 고점에 근접한 종목까지 신고가 목록에 섞여 들어가는 문제가 있었습니다. 지금은 직전 1년치
        고가를 모두 비교해 그 값을 실제로 넘어선 종목만 신고가로 분류하고, 아직 못 넘긴 종목은
        &ldquo;52주 신고가 근접&rdquo; 항목으로 따로 모읍니다. 신저가 쪽도 같은 방식으로 나눠두었습니다.
      </p>
      <h3 style={aboutH3Style}>읽으실 때 유의할 점</h3>
      <p style={aboutPStyle}>
        차트 모양이 비슷하다는 것은 과거의 가격 흐름이 닮았다는 뜻일 뿐, 앞으로의 방향을 알려주지 않습니다.
        같은 모양에서 오르는 경우도 내리는 경우도 있습니다. 이 페이지는 종목을 추천하지 않으며, 어떤 종목이
        어떤 모양을 만들었는지를 정리해 보여주는 것까지가 역할입니다.
      </p>
    </section>
  );
}

export default function PatternsClient({ initialData = null }) {
  const [query, setQuery] = useState("");
  // [2026-10-14 변경] 서버(app/patterns/page.js)가 미리 가져다 준 결과로
  // 시작합니다. 예전에는 전부 빈 값으로 시작해서, 브라우저가 불러오기 전까지
  // 화면에 "불러오는 중..." 한 줄만 있었고 크롤러도 그 상태를 봤습니다.
  const [patternDefs, setPatternDefs] = useState(initialData?.patternDefs || []);
  const [patterns, setPatterns] = useState(initialData?.patterns || {});
  const [historyDays, setHistoryDays] = useState(initialData?.historyDays || 0);
  const [historyTarget, setHistoryTarget] = useState(initialData?.historyTarget || 750);

  // 서버가 넘겨준 값으로 첫 화면 상태를 정합니다(아래 useEffect에서 전체
  // 목록을 다시 받아 덮어씁니다).
  const initialSelected = (() => {
    const defs = initialData?.patternDefs || [];
    const results = initialData?.patterns || {};
    const firstWithResults = defs.find((d) => (results[d.id]?.length ?? 0) > 0);
    return firstWithResults?.id ?? defs[0]?.id ?? null;
  })();

  const [selected, setSelected] = useState(initialSelected);
  // [2026-09-08 추가] 재성님 요청 — 테마별 종목정리(app/themes/page.js)처럼
  // 모바일에서 패턴 이름을 터치하면 바로 아래로 드롭다운되고, 같은 걸 다시
  // 터치하면 접히게 함. selected(데스크톱 오른쪽 패널 + 강조 표시용)와는
  // 별개로 "지금 펼쳐진 게 어떤 패턴인지"만 따로 관리 — 로직은
  // app/themes/page.js의 expanded 상태와 동일한 패턴.
  const [expanded, setExpanded] = useState(initialSelected);
  const [loadState, setLoadState] = useState(() => {
    if (!initialData) return "loading";
    if (initialData.error || initialData.warming) return "empty";
    return (initialData.patternDefs || []).length > 0 ? "ready" : "loading";
  });
  const [errorMsg, setErrorMsg] = useState(
    initialData?.error ||
      (initialData?.warming
        ? "패턴 계산 결과를 아직 준비 중이에요. 최대 30분 이내에 자동으로 채워지니 잠시 후 새로고침해주세요."
        : "")
  );
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
        setErrorMsg("");
        setLoadState("ready");
        const defs = data.patternDefs || [];
        const results = data.patterns || {};
        const firstWithResults = defs.find((d) => (results[d.id]?.length ?? 0) > 0);
        const firstId = firstWithResults?.id ?? defs[0]?.id ?? null;
        // [2026-10-14 변경] 서버가 이미 골라준 패턴이 있으면 그걸 유지합니다 —
        // 화면이 뜨자마자 선택이 바뀌어 깜빡이는 걸 막기 위함입니다.
        setSelected((prev) => prev ?? firstId);
        setExpanded((prev) => prev ?? firstId);
      })
      .catch(() => {
        // 서버가 이미 내용을 채워줬다면, 브라우저 쪽 갱신이 실패해도
        // 화면을 에러로 덮어쓰지 않습니다(보던 내용이 사라지면 더 나쁨).
        if (!initialData) setLoadState("error");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            있는 것처럼 보였음. 그래서 로딩 중임을 명시적으로 보여줌.
            [2026-10-14] 이제는 서버가 미리 채워주므로 이 안내가 보이는 경우
            자체가 드뭅니다(서버 쪽에서 못 가져왔을 때만 보입니다). */}
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

        <AboutPatternsSection />
      </main>
    </div>
  );
}
