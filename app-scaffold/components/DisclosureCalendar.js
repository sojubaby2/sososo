"use client";

// components/DisclosureCalendar.js
//
// [2026-10-27 신설] 공시 일정 달력 — 이번 달·다음 달, 평일만(월~금).
// 공모주 달력(components/IpoCalendar.js)과 같은 모양·스타일(ipo-cal-*)을 씁니다.
// 칸 안의 이름을 누르면 그 종목 페이지로 갑니다. 정기보고서 마감일은 회색 줄로 표시합니다.

import { useMemo, useState } from "react";

const WEEK = ["월", "화", "수", "목", "금"];
const pad = (n) => String(n).padStart(2, "0");
const isoOf = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const weekdayOf = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay();

function monthWeeks(y, m) {
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const weeks = [];
  let row = [null, null, null, null, null];
  let used = false;
  for (let d = 1; d <= last; d++) {
    const iso = isoOf(y, m, d);
    const wd = weekdayOf(iso);
    if (wd === 0 || wd === 6) {
      if (wd === 6 && used) {
        weeks.push(row);
        row = [null, null, null, null, null];
        used = false;
      }
      continue;
    }
    row[wd - 1] = iso;
    used = true;
  }
  if (used) weeks.push(row);
  return weeks;
}

// 달력 칸에 쓸 짧은 이름
const SHORT = {
  "free-record": "무증 기준일",
  "free-ex": "무증 권리락",
  "free-list": "무증 상장",
  "cut-halt": "감자 거래정지",
  "cut-halt-end": "감자 정지 끝",
  "cut-list": "감자 상장",
  "buyback-start": "자사주 매입",
  "buyback-end": "자사주 끝",
  deadline: "",
};

export default function DisclosureCalendar({ events, todayIso }) {
  const [y0, m0] = todayIso.split("-").map(Number);
  const months = [{ y: y0, m: m0 }, m0 === 12 ? { y: y0 + 1, m: 1 } : { y: y0, m: m0 + 1 }];
  const [idx, setIdx] = useState(0);
  const { y, m } = months[idx];

  const byDate = useMemo(() => {
    const map = new Map();
    for (const ev of events || []) {
      if (!map.has(ev.date)) map.set(ev.date, []);
      map.get(ev.date).push(ev);
    }
    return map;
  }, [events]);
  const weeks = useMemo(() => monthWeeks(y, m), [y, m]);

  return (
    <section className="ipo-cal" aria-label="공시 일정 달력">
      <div className="ipo-cal-top">
        <h2 className="ipo-h2">공시 일정 달력</h2>
        <div className="ipo-cal-tabs" role="tablist" aria-label="달 고르기">
          {months.map((mm, i) => (
            <button
              key={`${mm.y}-${mm.m}`}
              type="button"
              role="tab"
              aria-selected={i === idx}
              className={i === idx ? "active" : ""}
              onClick={() => setIdx(i)}
            >
              {mm.m}월
            </button>
          ))}
        </div>
      </div>

      <div className="ipo-cal-grid" role="table" aria-label={`${y}년 ${m}월 공시 일정`}>
        <div className="ipo-cal-row ipo-cal-head" role="row">
          {WEEK.map((w) => (
            <div key={w} role="columnheader">
              {w}
            </div>
          ))}
        </div>
        {weeks.map((row, ri) => (
          <div className="ipo-cal-row" role="row" key={ri}>
            {row.map((iso, ci) => {
              if (!iso) return <div key={ci} className="ipo-cal-cell empty" role="cell" />;
              const evs = byDate.get(iso) || [];
              const isToday = iso === todayIso;
              const isPast = iso < todayIso;
              const shown = evs.slice(0, 4);
              return (
                <div key={iso} role="cell" className={`ipo-cal-cell ${isToday ? "today" : ""} ${isPast ? "past" : ""}`}>
                  <span className="ipo-cal-day mono">
                    {Number(iso.slice(8, 10))}
                    {isToday && <em>오늘</em>}
                  </span>
                  {shown.map((ev, i) =>
                    ev.type === "deadline" ? (
                      <span key={i} className="ipo-cal-ev pay" title={ev.label}>
                        {ev.label.replace(" 제출 마감", "")} <b>마감</b>
                      </span>
                    ) : (
                      <a
                        key={i}
                        href={`/stock/${ev.code}`}
                        className={`ipo-cal-ev dc-ev dc-${ev.type.split("-")[0]}`}
                        title={`${ev.name} — ${ev.label}`}
                      >
                        {ev.name} <b>{SHORT[ev.type]}</b>
                      </a>
                    )
                  )}
                  {evs.length > shown.length && <span className="dc-more">+{evs.length - shown.length}건</span>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <p className="ipo-cal-legend">
        <span className="ipo-cal-key dc-key-free" /> 무상증자 <span className="ipo-cal-key dc-key-cut" /> 감자{" "}
        <span className="ipo-cal-key dc-key-buyback" /> 자사주 매입 <span className="ipo-cal-key pay" /> 정기보고서 마감 · 이름을 누르면 종목
        페이지로 갑니다.
      </p>
    </section>
  );
}
