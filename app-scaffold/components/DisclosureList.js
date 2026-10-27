"use client";

// components/DisclosureList.js
//
// [2026-10-27 신설] 최근 주요 공시 목록 — 위쪽 종류 단추(실적·수주·증자 …)로 골라 볼 수 있습니다.
// 날짜별로 묶어서 보여 주고, 회사 이름을 누르면 종목 페이지, 공시 제목을 누르면 DART 원문(새 창)으로 갑니다.

import { useMemo, useState } from "react";

const DAY = ["일", "월", "화", "수", "목", "금", "토"];
const dayText = (iso) => `${Number(iso.slice(5, 7))}월 ${Number(iso.slice(8, 10))}일(${DAY[new Date(`${iso}T00:00:00Z`).getUTCDay()]})`;
const PAGE = 120;

export default function DisclosureList({ items, categories }) {
  const [cat, setCat] = useState("all");
  const [limit, setLimit] = useState(PAGE);

  const counts = useMemo(() => {
    const c = {};
    for (const it of items) c[it.cat] = (c[it.cat] || 0) + 1;
    return c;
  }, [items]);

  const filtered = useMemo(() => (cat === "all" ? items : items.filter((it) => it.cat === cat)), [items, cat]);
  const groups = useMemo(() => {
    const g = [];
    for (const it of filtered.slice(0, limit)) {
      const last = g[g.length - 1];
      if (last && last.date === it.date) last.items.push(it);
      else g.push({ date: it.date, items: [it] });
    }
    return g;
  }, [filtered, limit]);

  return (
    <div>
      <div className="dc-filters" role="group" aria-label="공시 종류 고르기">
        <button type="button" className={`dc-filter ${cat === "all" ? "on" : ""}`} aria-pressed={cat === "all"} onClick={() => setCat("all")}>
          전체 <span className="mono">{items.length}</span>
        </button>
        {categories
          .filter((c) => counts[c.key])
          .map((c) => (
            <button
              key={c.key}
              type="button"
              className={`dc-filter ${cat === c.key ? "on" : ""}`}
              aria-pressed={cat === c.key}
              onClick={() => {
                setCat(c.key);
                setLimit(PAGE);
              }}
            >
              {c.label} <span className="mono">{counts[c.key]}</span>
            </button>
          ))}
      </div>

      {groups.length === 0 && <p className="stock-text muted">해당하는 공시가 없습니다.</p>}
      {groups.map((g) => (
        <div key={g.date} className="dc-day">
          <h3 className="mk-h3">{dayText(g.date)}</h3>
          <ul className="dc-list">
            {g.items.map((it) => (
              <li key={it.rceptNo} className="dc-row">
                <span className={`dc-tag dc-tag-${it.cat}`}>{categories.find((c) => c.key === it.cat)?.label}</span>
                <a className="dc-corp" href={`/stock/${it.code}`}>
                  {it.name}
                  <span className="mk-mkt">{it.market}</span>
                </a>
                <a className="dc-title" href={`https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${it.rceptNo}`} target="_blank" rel="noopener noreferrer">
                  {it.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {filtered.length > limit && (
        <button type="button" className="sc-btn dc-more-btn" onClick={() => setLimit((l) => l + PAGE)}>
          더 보기 ({filtered.length - limit}건 남음)
        </button>
      )}
    </div>
  );
}
