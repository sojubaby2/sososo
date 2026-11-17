"use client";

// app/earnings/EarningsClient.js
//
// [2026-11-15 신설] 실적 캘린더 화면 — 설명은 app/earnings/page.js, 자료는 lib/earnings.js
//   · 위: 이번 분기 요약(몇 곳 발표, 영업이익이 크게 늘었거나 흑자로 돌아선 곳)
//   · 달력: 날짜마다 발표한 회사 수. 날짜를 누르면 그날 발표만 봄(다시 누르면 전체)
//   · 목록: 발표일순 / 영업이익 증가율순 / 흑자전환 / 적자전환 — 종목 이름을 누르면 차트 창
//   ★ "예상 대비"가 아니라 "전년 같은 분기 대비"입니다(증권사 예상치는 무료 공식 자료가 없음).

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarCheck, ChevronLeft, ChevronRight, Search, ExternalLink } from "lucide-react";
import { openStockChart } from "../../lib/openStockChart";
import { compare, gradeOf, SURPRISE_PCT } from "../../lib/earningsCompare";

const WD = ["일", "월", "화", "수", "목", "금", "토"];
const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, "");

// 원 → "5,006억" / "1조 2,340억" / "38억"
export function eok(v) {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  const neg = v < 0;
  const e = Math.round(Math.abs(v) / 1e8);
  const jo = Math.floor(e / 10000);
  const rest = e % 10000;
  const body = jo ? `${jo.toLocaleString("ko-KR")}조${rest ? ` ${rest.toLocaleString("ko-KR")}억` : ""}` : `${e.toLocaleString("ko-KR")}억`;
  return (neg ? "-" : "") + body;
}
const pctText = (p) => (typeof p === "number" ? `${p > 0 ? "+" : ""}${Math.abs(p) >= 1000 ? Math.round(p).toLocaleString("ko-KR") : p.toFixed(p > -100 && p < 100 ? 1 : 0)}%` : "");

const STATE = {
  "turn-profit": { text: "흑자전환", tone: "up" },
  "turn-loss": { text: "적자전환", tone: "down" },
  "loss-less": { text: "적자 축소", tone: "flat" },
  "loss-more": { text: "적자 확대", tone: "down" },
  profit: { text: "흑자", tone: "flat" },
  loss: { text: "적자", tone: "flat" },
};

const TABS = [
  { key: "date", label: "발표일순" },
  // [2026-11-15] 재성님: "어닝서프라이즈 종목 어닝쇼크 종목 따로 구분해서" — 기준은 lib/earningsCompare.js의 gradeOf
  { key: "surprise", label: "어닝 서프라이즈" },
  { key: "shock", label: "어닝 쇼크" },
  { key: "turn", label: "흑자전환" },
];

function Badge({ c }) {
  if (c.state === "none") return <span className="ec-badge wait">보고서 제출 뒤 표시</span>;
  if (c.state === "up" || c.state === "down") return <span className={`ec-badge mono ${c.state}`}>{pctText(c.pct)}</span>;
  const s = STATE[c.state];
  return <span className={`ec-badge ${s.tone}`}>{s.text}</span>;
}

export default function EarningsClient({ initial }) {
  const [data, setData] = useState(initial);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState("date");
  const [q, setQ] = useState("");
  const [day, setDay] = useState(null); // 달력에서 고른 날짜
  const [month, setMonth] = useState(null); // "2026-10"

  // 들어온 뒤 새 자료 한 번 더(미리 만든 화면이 오래됐을 수 있어서)
  useEffect(() => {
    let alive = true;
    fetch("/api/earnings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive) return;
        if (d && Array.isArray(d.items)) setData(d);
        else if (!initial) setFailed(true);
      })
      .catch(() => alive && !initial && setFailed(true));
    return () => {
      alive = false;
    };
  }, [initial]);

  const items = useMemo(() => (data?.items || []).map((it) => {
        const cmp = compare(it.op?.cur, it.op?.prev);
        return { ...it, cmp, grade: gradeOf(cmp), n: norm(it.name) };
      }), [data]);
  const season = data?.season;
  const today = data?.today || "";

  const byDate = useMemo(() => {
    const m = new Map();
    for (const it of items) m.set(it.date, (m.get(it.date) || 0) + 1);
    return m;
  }, [items]);

  // 달력에 보여 줄 달 — 처음에는 가장 최근 발표가 있는 달
  const curMonth = month || (items[0]?.date || today || "").slice(0, 7);
  const cells = useMemo(() => {
    if (!/^\d{4}-\d{2}$/.test(curMonth)) return [];
    const [y, m] = curMonth.split("-").map(Number);
    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const out = Array.from({ length: first }, () => null);
    for (let d = 1; d <= days; d++) out.push(`${curMonth}-${String(d).padStart(2, "0")}`);
    return out;
  }, [curMonth]);
  const shiftMonth = (n) => {
    const [y, m] = curMonth.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    setMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  };

  const withNum = items.filter((it) => it.cmp.state !== "none");
  // 서프라이즈·쇼크 순서: 전환(흑자전환/적자전환)이 먼저, 그다음 변화율이 큰 순
  const surprises = useMemo(
    () => items.filter((it) => it.grade === "surprise").sort((a, b) => (b.cmp.pct ?? 1e9) - (a.cmp.pct ?? 1e9) || b.op.cur - a.op.cur),
    [items]
  );
  const shocks = useMemo(
    () => items.filter((it) => it.grade === "shock").sort((a, b) => (a.cmp.pct ?? -1e9) - (b.cmp.pct ?? -1e9) || a.op.cur - b.op.cur),
    [items]
  );

  const list = useMemo(() => {
    const nq = norm(q);
    let r = items;
    if (day) r = r.filter((it) => it.date === day);
    if (nq) r = r.filter((it) => it.n.includes(nq) || it.code.startsWith(nq));
    const keep = new Set(r.map((it) => it.code));
    if (tab === "surprise") r = surprises.filter((it) => keep.has(it.code));
    else if (tab === "shock") r = shocks.filter((it) => keep.has(it.code));
    else if (tab === "turn") r = r.filter((it) => it.cmp.state === "turn-profit").sort((a, b) => b.op.cur - a.op.cur);
    return r;
  }, [items, day, q, tab, surprises, shocks]);

  const grouped = useMemo(() => {
    if (tab !== "date") return null;
    const m = new Map();
    for (const it of list) {
      if (!m.has(it.date)) m.set(it.date, []);
      m.get(it.date).push(it);
    }
    return [...m.entries()];
  }, [list, tab]);

  const dateLabel = (iso) => {
    const d = new Date(`${iso}T00:00:00Z`);
    return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${WD[d.getUTCDay()]})`;
  };
  const cmpWord = season?.annual ? "전년 대비" : "전년 같은 분기 대비";

  const Row = ({ it }) => (
    <li className="ec-row">
      <div className="ec-row-l">
        <button type="button" className="ec-name" onClick={() => openStockChart({ code: it.code, name: it.name, market: it.market })}>
          {it.name}
        </button>
        <span className="ec-meta">
          {tab === "date" && it.grade && <b className={`ec-grade ${it.grade}`}>{it.grade === "surprise" ? "서프라이즈" : "쇼크"}</b>}
          {it.market}
          {tab !== "date" ? ` · ${dateLabel(it.date)}` : ""}
          {it.fix ? " · 정정" : ""}
        </span>
      </div>
      <div className="ec-row-r">
        {it.op ? (
          <span className="ec-op mono">
            {typeof it.op.prev === "number" && <i>{eok(it.op.prev)} → </i>}
            <b>{eok(it.op.cur)}</b>
          </span>
        ) : null}
        <Badge c={it.cmp} />
        <a className="ec-dart" href={`https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${it.rceptNo}`} target="_blank" rel="noopener noreferrer" aria-label={`${it.name} 공시 원문(DART) 새 창`}>
          <ExternalLink size={14} aria-hidden="true" />
        </a>
      </div>
    </li>
  );

  return (
    <main className="ec-page">
      <header className="ec-head">
        <p className="ec-eyebrow">
          <CalendarCheck size={14} aria-hidden="true" /> {season?.label || "이번 분기"} 실적 시즌
        </p>
        <h1 className="ec-h1">실적 캘린더</h1>
        <p className="ec-sub">누가 언제 실적을 발표했는지, 영업이익이 {cmpWord} 얼마나 달라졌는지 한 화면에 모았어요.</p>
      </header>

      {!data && !failed && <p className="ec-empty">실적 공시를 불러오는 중…</p>}
      {failed && <p className="ec-empty">지금 실적 공시를 받아오지 못했어요. 잠시 뒤 새로고침해 주세요.</p>}
      {data && items.length === 0 && <p className="ec-empty">{season?.label} 실적 발표가 아직 올라오지 않았어요. 발표가 시작되면 여기에 날짜별로 정리됩니다.</p>}

      {items.length > 0 && (
        <>
          <section className="ec-hero" aria-label="이번 분기 요약">
            <h2 className="ec-hero-t">
              {season.label} 실적, <b>{items.length.toLocaleString("ko-KR")}곳</b>이 발표했어요
            </h2>
            <p className="ec-hero-s">
              영업이익 확인 {withNum.length.toLocaleString("ko-KR")}곳 중 <b className="up">어닝 서프라이즈 {surprises.length}곳</b> ·{" "}
              <b className="down">어닝 쇼크 {shocks.length}곳</b>
            </p>
            {(surprises.length > 0 || shocks.length > 0) && (
              <div className="ec-duo">
                {[
                  ["surprise", "어닝 서프라이즈", surprises, "up"],
                  ["shock", "어닝 쇼크", shocks, "down"],
                ].map(([key, label, arr, tone]) => (
                  <div key={key} className={`ec-duo-col ${key}`}>
                    <button type="button" className="ec-duo-h" onClick={() => setTab(key)}>
                      <span>{label}</span>
                      <span className="mono">{arr.length}곳 전체 보기 →</span>
                    </button>
                    <ul>
                      {arr.slice(0, 3).map((it) => (
                        <li key={it.code}>
                          <button type="button" onClick={() => openStockChart({ code: it.code, name: it.name, market: it.market })}>
                            <span className="ec-top-n">{it.name}</span>
                            <span className={`ec-top-v mono ${tone}`}>{STATE[it.cmp.state]?.text || pctText(it.cmp.pct)}</span>
                          </button>
                        </li>
                      ))}
                      {arr.length === 0 && <li className="ec-duo-none">아직 없어요</li>}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="panel ec-cal" aria-label="발표 달력">
            <div className="ec-cal-head">
              <button type="button" className="ec-nav" onClick={() => shiftMonth(-1)} aria-label="이전 달">
                <ChevronLeft size={18} aria-hidden="true" />
              </button>
              <h2>
                {curMonth.slice(0, 4)}년 {Number(curMonth.slice(5))}월
              </h2>
              <button type="button" className="ec-nav" onClick={() => shiftMonth(1)} aria-label="다음 달">
                <ChevronRight size={18} aria-hidden="true" />
              </button>
              {day && (
                <button type="button" className="ec-clear" onClick={() => setDay(null)}>
                  전체 보기
                </button>
              )}
            </div>
            <div className="ec-grid" role="grid">
              {WD.map((w, i) => (
                <span key={w} className={`ec-wd ${i === 0 ? "sun" : i === 6 ? "sat" : ""}`}>
                  {w}
                </span>
              ))}
              {cells.map((iso, i) => {
                if (!iso) return <span key={`e${i}`} />;
                const n = byDate.get(iso) || 0;
                const wd = i % 7;
                return (
                  <button
                    key={iso}
                    type="button"
                    disabled={!n}
                    className={`ec-day ${n ? "has" : ""} ${day === iso ? "on" : ""} ${iso === today ? "today" : ""} ${wd === 0 ? "sun" : wd === 6 ? "sat" : ""}`}
                    aria-pressed={day === iso}
                    aria-label={`${dateLabel(iso)}${n ? ` 실적 발표 ${n}곳` : ""}`}
                    onClick={() => setDay(day === iso ? null : iso)}
                  >
                    <span className="ec-day-n">{Number(iso.slice(8))}</span>
                    {n > 0 && <span className="ec-day-c mono">{n}</span>}
                  </button>
                );
              })}
            </div>
          </section>

          <div className="ec-tools">
            <div className="ec-tabs" role="tablist" aria-label="정렬">
              {TABS.map((t) => (
                <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={tab === t.key ? "on" : ""} onClick={() => setTab(t.key)}>
                  {t.label}
                </button>
              ))}
            </div>
            <label className="ec-search">
              <Search size={15} aria-hidden="true" />
              <input type="search" name="q" autoComplete="off" spellCheck={false} placeholder="종목 찾기…" aria-label="종목 찾기" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
          </div>

          <section className="panel ec-list" aria-live="polite">
            {day && <p className="ec-filter">{dateLabel(day)} 발표만 보는 중</p>}
            {(tab === "surprise" || tab === "shock") && (
              <p className="ec-rule">
                {tab === "surprise"
                  ? `기준: 영업이익이 ${cmpWord} ${SURPRISE_PCT}% 이상 늘었거나 흑자로 돌아선 회사예요.`
                  : `기준: 영업이익이 ${cmpWord} ${SURPRISE_PCT}% 이상 줄었거나 적자로 돌아선 회사, 적자가 커진 회사예요.`}{" "}
                증권사 예상치와 비교한 것은 아니에요.
              </p>
            )}
            {list.length === 0 && <p className="ec-empty in">조건에 맞는 종목이 없어요.</p>}
            {grouped
              ? grouped.map(([d, rows]) => (
                  <div key={d} className="ec-group">
                    <h3 className="ec-date">
                      {dateLabel(d)} <span className="mono">{rows.length}곳</span>
                    </h3>
                    <ul>
                      {rows.map((it) => (
                        <Row key={it.code} it={it} />
                      ))}
                    </ul>
                  </div>
                ))
              : list.length > 0 && (
                  <ul>
                    {list.map((it) => (
                      <Row key={it.code} it={it} />
                    ))}
                  </ul>
                )}
          </section>
        </>
      )}

      <p className="stock-disclaimer">
        금융감독원 DART의 영업(잠정)실적 공시와 분기·사업보고서 주요계정을 자동으로 정리한 참고 자료입니다. 숫자는 영업이익(연결 우선)이며 {cmpWord} 비교입니다. 증권사 예상치와의
        비교는 아니에요. 보고서가 아직 제출되지 않은 회사는 숫자 없이 발표일만 보입니다. 정확한 내용은 각 줄의 원문 링크에서 확인해 주세요. 특정 종목의 매수·매도를 권하지 않습니다.{" "}
        <Link href="/disclosure">공시 일정 보기 →</Link>
      </p>
    </main>
  );
}
