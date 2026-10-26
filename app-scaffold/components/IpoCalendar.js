"use client";

// components/IpoCalendar.js
//
// [2026-10-26 신설] 공모주 페이지 맨 위 "청약 달력".
// 재성님 요청: "지금 거 좋은데, 맨 위에 달력 형식으로 간소화한 표 형태로도 하나 만들어 주면 좋을 듯"
//
// 간소화한 점:
//   · 청약은 평일에만 하므로 월~금 5칸만 그립니다(주말 칸 없음 → 휴대폰에서도 이름이 들어감).
//   · 날마다 그날 청약하는 회사 이름(호박색)과 납입일(회색 "납입")만 적습니다.
//   · 이번 달 / 다음 달 두 개만 단추로 넘겨 봅니다.
//   · 회사 이름을 누르면 아래 자세한 목록의 그 회사 줄로 내려갑니다.
//
// 자료는 페이지(app/ipo/page.js)가 넘겨준 것을 그대로 씁니다 — 따로 서버를 부르지 않습니다(비용 0).

import { useMemo, useState } from "react";

const WEEK = ["월", "화", "수", "목", "금"];

function pad(n) {
  return String(n).padStart(2, "0");
}
function isoOf(y, m, d) {
  return `${y}-${pad(m)}-${pad(d)}`;
}
// 날짜만 다루므로 UTC 기준으로 계산(시간대 영향 없음)
function weekdayOf(iso) {
  return new Date(`${iso}T00:00:00Z`).getUTCDay(); // 0=일 … 6=토
}
function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// 그 달의 평일을 주 단위로 묶습니다. 달 밖의 칸은 null.
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

// 날짜 → 그날 일정 목록
function buildEvents(items) {
  const map = new Map();
  const push = (iso, ev) => {
    if (!map.has(iso)) map.set(iso, []);
    map.get(iso).push(ev);
  };
  for (const it of items) {
    if (it.subStart) {
      const end = it.subEnd || it.subStart;
      let cur = it.subStart;
      for (let guard = 0; cur <= end && guard < 10; guard++) {
        const wd = weekdayOf(cur);
        if (wd !== 0 && wd !== 6) push(cur, { kind: "sub", it, first: cur === it.subStart, last: cur === end });
        cur = addDays(cur, 1);
      }
    }
    if (it.payDate) push(it.payDate, { kind: "pay", it });
  }
  return map;
}

export default function IpoCalendar({ items, todayIso }) {
  const [y0, m0] = todayIso.split("-").map(Number);
  const months = [
    { y: y0, m: m0 },
    m0 === 12 ? { y: y0 + 1, m: 1 } : { y: y0, m: m0 + 1 },
  ];
  const [idx, setIdx] = useState(0);
  const { y, m } = months[idx];

  const events = useMemo(() => buildEvents(items || []), [items]);
  const weeks = useMemo(() => monthWeeks(y, m), [y, m]);

  return (
    <section className="ipo-cal" aria-label="청약 달력">
      <div className="ipo-cal-top">
        <h2 className="ipo-h2">청약 달력</h2>
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

      <div className="ipo-cal-grid" role="table" aria-label={`${y}년 ${m}월 청약 일정`}>
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
              const evs = events.get(iso) || [];
              const isToday = iso === todayIso;
              const isPast = iso < todayIso;
              return (
                <div key={iso} role="cell" className={`ipo-cal-cell ${isToday ? "today" : ""} ${isPast ? "past" : ""}`}>
                  <span className="ipo-cal-day mono">
                    {Number(iso.slice(8, 10))}
                    {isToday && <em>오늘</em>}
                  </span>
                  {evs.map((ev, i) =>
                    ev.kind === "sub" ? (
                      <a
                        key={`s${i}`}
                        href={`#ipo-${ev.it.corpCode}`}
                        className={`ipo-cal-ev sub ${ev.first ? "first" : ""} ${ev.last ? "last" : ""}`}
                        title={`${ev.it.corpName} 청약${ev.last && !ev.first ? " 마감일" : ev.first && !ev.last ? " 시작일" : ""}`}
                      >
                        {ev.it.corpName}
                      </a>
                    ) : (
                      <a key={`p${i}`} href={`#ipo-${ev.it.corpCode}`} className="ipo-cal-ev pay" title={`${ev.it.corpName} 납입일`}>
                        {ev.it.corpName} <b>납입</b>
                      </a>
                    )
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <p className="ipo-cal-legend">
        <span className="ipo-cal-key sub" /> 청약일 <span className="ipo-cal-key pay" /> 납입일 · 이름을 누르면 아래 자세한 정보로 이동합니다.
      </p>
    </section>
  );
}
