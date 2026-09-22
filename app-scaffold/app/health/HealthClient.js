"use client";

// /health 화면의 실제 내용 (app/health/page.js가 이 컴포넌트를 감싸서 보여줌).
//
// [2026-09-11 추가] 자동 작업들이 지금 돌고 있는지를 신호등으로 보여주는
// 관리용 화면. 디자인 시스템(globals.css)에 의존하지 않고 인라인 스타일만
// 써서, 나중에 사이트 테마가 바뀌어도 이 화면은 그대로 동작하게 함.

import { useCallback, useEffect, useState } from "react";

const COLORS = {
  ok: { dot: "#1a9c5b", bg: "#eaf7f0", border: "#bfe6d1", text: "#0f5c36", label: "정상" },
  warn: { dot: "#d18a00", bg: "#fdf5e3", border: "#f0dcae", text: "#8a5a00", label: "주의" },
  red: { dot: "#cf3a3a", bg: "#fdeeee", border: "#f2c7c7", text: "#8f1f1f", label: "문제" },
};

function styleFor(level) {
  return COLORS[level] || COLORS.warn;
}

// 2026-09-11T12:34:56.000Z -> "9월 11일 21:34" (한국 시각)
function formatKst(iso) {
  if (!iso) return "기록 없음";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "기록 없음";
  const d = new Date(t + 9 * 60 * 60 * 1000);
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${m}월 ${day}일 ${hh}:${mm}`;
}

function formatAgo(mins) {
  if (mins === null || mins === undefined) return "";
  if (mins < 1) return "방금 전";
  if (mins < 60) return `${mins}분 전`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}시간 ${mins % 60}분 전`;
  const d = Math.floor(h / 24);
  return `${d}일 ${h % 24}시간 전`;
}

// 각 항목에서 사람이 읽기 좋은 "요약 한 줄"을 만들어 줌.
function summarize(check) {
  switch (check.key) {
    case "feed":
      return `저장된 글 ${check.count ?? "?"}건 · 가장 최근 글: ${formatKst(check.latestAt)} (${formatAgo(check.minutesAgo)})`;
    case "telegram":
      return `마지막 수신: ${formatKst(check.latestAt)} ${formatAgo(check.minutesAgo)}`;
    case "poll":
      return `마지막 실행: ${formatKst(check.latestAt)} ${formatAgo(check.minutesAgo)}`;
    // [2026-09-18 수정] 화면에 "계산 시각: 기록 없음 · 패턴 0종"이라고 잘못
    // 뜨던 문제. 서버 쪽에서 이 항목을 가볍게 바꾸면서(수백 KB짜리 캐시를
    // 통째로 읽지 않고 남은 유효시간만 물어보도록) latestAt·patternCount를
    // 더 이상 안 내려주는데, 화면은 그 두 값을 계속 쓰고 있었음.
    case "patterns":
      return check.minutesAgo === null || check.minutesAgo === undefined
        ? "저장된 결과가 없습니다 — 다음 30분 자동작업에서 새로 계산됩니다"
        : `${formatAgo(check.minutesAgo)} 계산됨`;
    case "history":
      return `${check.storedDays ?? 0}일 / 목표 ${check.targetDays ?? "?"}일 · 최신 데이터: ${check.newestBasDt || "없음"}`;
    case "dailyOutlook":
      return `${check.dateLabel || "-"} · 생성 시각: ${formatKst(check.latestAt)} (${formatAgo(check.minutesAgo)})`;
    default:
      return "";
  }
}

export default function HealthClient() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [openKey, setOpenKey] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // 주소창에 ?secret=... 을 붙여서 들어오면 그대로 API에 넘겨줌
      // (환경변수 설정 여부까지 보고 싶을 때).
      const secret = typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("secret")
        : null;
      const url = secret ? `/api/health?secret=${encodeURIComponent(secret)}` : "/api/health";
      const res = await fetch(url, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok && json?.fatal) {
        setError(json.fatal);
        setData(null);
      } else {
        setData(json);
      }
    } catch (err) {
      setError("상태를 불러오지 못했습니다: " + String(err?.message || err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const overall = data?.overall ? styleFor(data.overall) : null;

  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "24px 16px 64px",
        fontFamily:
          "'Noto Sans KR', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        color: "#222",
      }}
    >
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 4px" }}>사이트 상태 점검</h1>
      <p style={{ fontSize: 13, color: "#666", margin: "0 0 20px" }}>
        자동으로 돌아야 하는 것들이 지금 실제로 돌고 있는지 보여줍니다.
      </p>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 20 }}>
        <button
          onClick={load}
          disabled={loading}
          style={{
            padding: "8px 14px",
            fontSize: 14,
            borderRadius: 8,
            border: "1px solid #ccc",
            background: loading ? "#eee" : "#fff",
            cursor: loading ? "default" : "pointer",
          }}
        >
          {loading ? "확인 중…" : "다시 확인"}
        </button>
        {data?.generatedAt && (
          <span style={{ fontSize: 12, color: "#888" }}>확인 시각 {formatKst(data.generatedAt)}</span>
        )}
      </div>

      {error && (
        <div
          style={{
            padding: 14,
            borderRadius: 10,
            background: COLORS.red.bg,
            border: `1px solid ${COLORS.red.border}`,
            color: COLORS.red.text,
            fontSize: 14,
            marginBottom: 20,
          }}
        >
          {error}
        </div>
      )}

      {overall && (
        <div
          style={{
            padding: "14px 16px",
            borderRadius: 12,
            background: overall.bg,
            border: `1px solid ${overall.border}`,
            color: overall.text,
            fontSize: 15,
            fontWeight: 600,
            marginBottom: 20,
          }}
        >
          전체 상태: {overall.label}
          {data.overall !== "ok" && (
            <span style={{ fontWeight: 400, fontSize: 13, display: "block", marginTop: 4 }}>
              아래에서 빨간색·노란색 항목을 확인하세요.
            </span>
          )}
        </div>
      )}

      {(data?.checks || []).map((check) => {
        const s = styleFor(check.level);
        const isOpen = openKey === check.key;
        return (
          <div
            key={check.key}
            style={{
              border: `1px solid ${s.border}`,
              background: s.bg,
              borderRadius: 12,
              padding: "14px 16px",
              marginBottom: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  background: s.dot,
                  flexShrink: 0,
                }}
              />
              <strong style={{ fontSize: 15, color: s.text }}>{check.label}</strong>
              <span style={{ fontSize: 12, color: s.text, opacity: 0.8, marginLeft: "auto" }}>{s.label}</span>
            </div>

            <div style={{ fontSize: 13, color: "#444", marginTop: 8, lineHeight: 1.6 }}>
              {check.error ? `오류: ${check.error}` : summarize(check)}
            </div>

            {check.level !== "ok" && check.hint && (
              <div style={{ fontSize: 12.5, color: s.text, marginTop: 8, lineHeight: 1.6 }}>💡 {check.hint}</div>
            )}

            <button
              onClick={() => setOpenKey(isOpen ? null : check.key)}
              style={{
                marginTop: 10,
                fontSize: 12,
                color: "#666",
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              {isOpen ? "자세한 값 접기" : "자세한 값 보기"}
            </button>

            {isOpen && (
              <pre
                style={{
                  marginTop: 8,
                  padding: 10,
                  background: "#fff",
                  border: "1px solid #e5e5e5",
                  borderRadius: 8,
                  fontSize: 11.5,
                  lineHeight: 1.5,
                  overflowX: "auto",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                }}
              >
                {JSON.stringify(check, null, 2)}
              </pre>
            )}
          </div>
        );
      })}

      {data?.env && (
        <div
          style={{
            marginTop: 24,
            padding: "14px 16px",
            border: "1px solid #e5e5e5",
            borderRadius: 12,
            background: "#fafafa",
          }}
        >
          <strong style={{ fontSize: 15 }}>환경변수</strong>
          <div style={{ fontSize: 13, marginTop: 10, lineHeight: 1.9 }}>
            {Object.entries(data.env).map(([name, state]) => (
              <div key={name} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <code style={{ fontSize: 12 }}>{name}</code>
                <span style={{ color: state === "설정됨" ? COLORS.ok.text : COLORS.red.text }}>{state}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data?.envNote && (
        <p style={{ fontSize: 12, color: "#999", marginTop: 20 }}>{data.envNote}</p>
      )}
    </main>
  );
}
