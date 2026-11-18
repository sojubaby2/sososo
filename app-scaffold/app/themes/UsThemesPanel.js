"use client";

// app/themes/UsThemesPanel.js
//
// [2026-11-18 신설] 테마 화면의 "미국" 쪽 — 재성님: "지금 화면에 자연스럽게 미국주식도 녹이는 방법 … 조잡해지지 않고 깔끔하게"
//   새 메뉴·새 화면을 만들지 않고, 테마 화면 위의 [한국 | 미국] 단추로 같은 자리에서 바꿔 봅니다.
//   화면 틀(왼쪽 테마 목록 + 오른쪽 종목 표, 휴대폰은 눌러서 펼치기)과 꾸밈은 한국 쪽과 똑같이 써서 낯설지 않게 했습니다.
//   · 등락률은 "전일 미국 종가" 하루치입니다(한국 쪽의 1주일·1개월 단추는 미국에서는 숨김).
//   · 테마를 열면 종목 표 위에 "이어지는 한국 테마" 단추가 나옵니다.
//   자료: /api/us-themes (lib/usThemeQuotes.js) — 이 파일은 테마 화면에서 "미국"을 눌렀을 때만 내려받습니다.

import { Fragment, useEffect, useMemo, useState } from "react";
import { loadUsThemes } from "../../lib/usThemesClient";

function Pct({ v }) {
  if (typeof v !== "number") return <span className="flat mono">—</span>;
  const cls = v > 0 ? "up" : v < 0 ? "down" : "flat";
  return (
    <span className={`mono ${cls}`} style={{ fontWeight: 600 }}>
      {v > 0 ? "+" : ""}
      {v.toFixed(2)}%
    </span>
  );
}
const usd = (v) => (typeof v === "number" ? `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—");

export default function UsThemesPanel({ query, onPickKorean }) {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [group, setGroup] = useState("전체");
  const [selected, setSelected] = useState("");
  const [expanded, setExpanded] = useState("");

  useEffect(() => {
    let alive = true;
    loadUsThemes().then((d) => {
      if (!alive) return;
      if (!d) return setFailed(true);
      setData(d);
      const want = new URLSearchParams(window.location.search).get("ut");
      const hit = want && d.themes.find((t) => t.theme === want);
      if (hit) {
        setSelected(hit.theme);
        setExpanded(hit.theme);
        setGroup(hit.group);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const themes = data?.themes || [];
  const groups = useMemo(() => {
    const m = new Map();
    for (const t of themes) m.set(t.group, (m.get(t.group) || 0) + 1);
    return [...m.entries()];
  }, [themes]);

  const list = useMemo(() => {
    const q = (query || "").trim().toLowerCase();
    let arr = themes;
    if (q) arr = themes.filter((t) => t.theme.toLowerCase().includes(q) || t.stocks.some((s) => s.n.toLowerCase().includes(q) || s.t.toLowerCase() === q));
    else if (group !== "전체") arr = themes.filter((t) => t.group === group);
    return [...arr].sort((a, b) => (b.change ?? -999) - (a.change ?? -999));
  }, [themes, query, group]);

  const current = themes.find((t) => t.theme === selected) || list[0];

  function detail(t) {
    return (
      <>
        <div className="theme-heading">
          <h2>{t.theme}</h2>
          <span style={{ color: "var(--ink-muted)", fontSize: 12 }}>전일 미국 종가 기준 등락률</span>
        </div>
        <p className="ust-desc">{t.desc}</p>
        {t.kr.length > 0 && (
          <p className="ust-kr in-detail">
            <i>이어지는 한국 테마</i>
            {t.kr.map((k) => (
              <button key={k} type="button" className="ust-chip" onClick={() => onPickKorean(k)}>
                {k}
              </button>
            ))}
          </p>
        )}
        <table className="stock-table">
          <thead>
            <tr>
              <th>종목명</th>
              <th>티커</th>
              <th>종가</th>
              <th>등락률</th>
            </tr>
          </thead>
          <tbody>
            {t.stocks.map((s) => (
              <tr key={s.t}>
                <td style={{ fontWeight: 500 }}>{s.n}</td>
                <td className="mono" style={{ color: "var(--ink-muted)" }}>{s.t}</td>
                <td className="mono">{t.etf && s.p === null ? "—" : usd(s.p)}</td>
                <td><Pct v={s.c} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    );
  }

  if (!data && !failed) return <p className="ec-empty">미국 테마를 불러오는 중…</p>;
  if (!data) return <p className="ec-empty">지금 미국 테마를 받아오지 못했어요. 잠시 뒤 새로고침해 주세요.</p>;

  return (
    <>
      <div className="theme-groups" role="tablist" aria-label="미국 테마 분야">
        {[["전체", themes.length], ...groups].map(([g, n]) => (
          <button key={g} type="button" role="tab" aria-selected={group === g && !(query || "").trim()} className={`theme-group-btn ${group === g && !(query || "").trim() ? "active" : ""}`} onClick={() => setGroup(g)}>
            {g}
            <span className="theme-group-n">{n}</span>
          </button>
        ))}
      </div>

      {data.bare && (
        <p style={{ fontSize: 13, color: "var(--amber-tint-ink)", background: "var(--amber-tint)", padding: "8px 12px", borderRadius: 8, marginBottom: 16 }}>
          미국 시세를 잠시 불러오지 못했습니다. (테마·종목 목록은 정상 표시됩니다)
        </p>
      )}

      <div className="theme-layout">
        <aside>
          <h2 className="section-title">미국 테마 ({list.length}) · 🔥 밤사이 등락률 높은 순</h2>
          <div className="theme-list">
            {list.map((t) => (
              <Fragment key={t.theme}>
                <button
                  className={`theme-item ${current?.theme === t.theme ? "active" : ""}`}
                  onClick={() => {
                    setSelected(t.theme);
                    setExpanded((prev) => (prev === t.theme ? "" : t.theme));
                  }}
                >
                  <span className="theme-item-name">{t.theme}</span>
                  <Pct v={t.change} />
                </button>
                {expanded === t.theme && <div className="theme-item-accordion open">{detail(t)}</div>}
              </Fragment>
            ))}
          </div>
        </aside>
        <section className="theme-detail-desktop">{current && detail(current)}</section>
      </div>
    </>
  );
}
