"use client";

// components/MobileInsight.js
//
// [2026-11-03 신설] 휴대폰 홈 "시장" 탭 새 디자인 (PC에서는 보이지 않음 — .m-only)
//   재성님이 롱앤숏(longnshort.kr) 화면 녹화를 보내며 "참고해봐" → "알아서해봐".
//   따라 한 점:
//     · 위쪽에 글자 탭 줄(지수 · 예측 · 히트맵 · 수급 · 신고가 · 급등락 · 대표주) — 누르면 그 칸으로 내려가고,
//       스크롤하면 지금 보고 있는 칸에 밑줄이 따라옴
//     · 둥근 카드가 한 줄씩 쌓이는 구성, 카드 제목 오른쪽에 "몇 시 기준" 작은 글씨
//     · 지수 칸은 2칸 격자 + 칸마다 오늘 흐름 꺾은선(/api/index-spark)
//     · 테마 히트맵(크기 = 종목 수, 색 = 등락률. 빨강 상승 · 파랑 하락) + "N 상승 ━━ M 하락" 막대
//     · 수급 표(개인·외국인·기관 × 코스피·코스닥)
//   자료는 전부 사이트가 이미 받던 무료 자료를 다시 씁니다(새로 늘어나는 비용 없음).
//   예전 시장 탭(카드가 아무렇게나 섞여 있던 모양)은 lib/mobileLayout.js를 "shorts"로 바꾸면 돌아옵니다.

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, CalendarClock, Layers, Activity, Ticket, FileText, BarChart3 } from "lucide-react";
import AthBreakoutPanel from "./AthBreakoutPanel";
import { openStockChart } from "../lib/openStockChart";
import { isPoliticalTheme } from "../lib/themeData";

const SECTIONS = [
  { id: "mi-index", label: "지수" },
  { id: "mi-outlook", label: "예측" },
  { id: "mi-heat", label: "히트맵" },
  { id: "mi-flow", label: "수급" },
  { id: "mi-ath", label: "신고가" },
  { id: "mi-movers", label: "급등락" },
  { id: "mi-flag", label: "대표주" },
];

// 지수 칸 10개 — wi: 홈이 1분마다 받는 세계 지수(lib/worldIndices.js)의 key, sym: 야후 기호(꺾은선·예비 숫자)
const TILES = [
  { wi: "kr", sym: "^KS11", label: "코스피" },
  { wi: "kq", sym: "^KQ11", label: "코스닥" },
  { wi: "us-nasdaq", sym: "^IXIC", label: "나스닥" },
  { wi: "us-dow", sym: "^DJI", label: "다우" },
  { sym: "USDKRW=X", label: "달러/원" },
  { sym: "^TNX", label: "미 국채 10년", suffix: "%" },
  { sym: "CL=F", label: "WTI 유가", prefix: "$" },
  { sym: "GC=F", label: "금", prefix: "$" },
  { sym: "BTC-USD", label: "비트코인", prefix: "$" },
  { sym: "DX-Y.NYB", label: "달러지수" },
];

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const toneOf = (v) => (!isNum(v) || Math.abs(v) < 0.005 ? "flat" : v > 0 ? "up" : "down");
const pctText = (v) => (isNum(v) ? `${v > 0 ? "+" : ""}${v.toFixed(2)}%` : "—");
const mdOf = (d) => {
  const s = String(d || "").replace(/-/g, "");
  return /^\d{8}$/.test(s) ? `${Number(s.slice(4, 6))}/${Number(s.slice(6, 8))}` : "";
};
function kstNow() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return { iso: d.toISOString().slice(0, 10), dow: d.getUTCDay(), min: d.getUTCHours() * 60 + d.getUTCMinutes() };
}
function hhmm(iso) {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return "";
  const d = new Date(t + 9 * 3600 * 1000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}
function fmtValue(v, t) {
  if (!isNum(v)) return "—";
  const digits = Math.abs(v) >= 10000 ? 0 : Math.abs(v) >= 100 ? 2 : 3;
  return `${t.prefix || ""}${v.toLocaleString("ko-KR", { minimumFractionDigits: digits === 3 ? 2 : digits, maximumFractionDigits: digits })}${t.suffix || ""}`;
}

// 여러 칸이 같은 자료를 쓰므로 한 번만 받기(테마 히트맵·급등락)
let tmPromise = null;
function loadThemeMomentum() {
  if (!tmPromise) {
    tmPromise = fetch("/api/theme-momentum")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((d) => {
        if (!d) tmPromise = null; // 실패하면 다음에 다시 시도
        return d;
      });
  }
  return tmPromise;
}
function useThemeMomentum() {
  const [data, setData] = useState(null);
  const [state, setState] = useState("loading");
  useEffect(() => {
    let alive = true;
    loadThemeMomentum().then((d) => {
      if (!alive) return;
      setData(d);
      setState(d && Array.isArray(d.themeChanges) ? "ready" : "error");
    });
    return () => {
      alive = false;
    };
  }, []);
  return { data, state };
}

// ── 카드 겉모양 ──────────────────────────────────────────────
function Card({ id, title, sub, right, children, more }) {
  return (
    <section id={id} className="mi-card" aria-label={title}>
      <div className="mi-card-head">
        <h2>{title}</h2>
        {sub && <span className="mi-sub">{sub}</span>}
        {right && <div className="mi-head-right">{right}</div>}
      </div>
      {children}
      {more && (
        <Link href={more.href} className="mi-more">
          {more.label} <ChevronRight size={14} />
        </Link>
      )}
    </section>
  );
}
function Seg({ value, options, onChange }) {
  return (
    <div className="mi-seg" role="tablist">
      {options.map(([v, label]) => (
        <button key={v} type="button" role="tab" aria-selected={value === v} className={value === v ? "on" : ""} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

// ── 위쪽 글자 탭 줄 ──────────────────────────────────────────
function JumpTabs() {
  const [active, setActive] = useState(SECTIONS[0].id);
  const barRef = useRef(null);
  const lockRef = useRef(0);

  // 머리띠(메뉴 줄 포함) 높이만큼 아래에 붙도록 — 높이를 재서 CSS 변수로 넘김
  useEffect(() => {
    const measure = () => {
      const h = document.querySelector(".site-header")?.getBoundingClientRect().height || 0;
      document.documentElement.style.setProperty("--mi-top", `${Math.round(h)}px`);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // 스크롤하면 지금 보이는 칸에 밑줄
  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter(Boolean);
    if (!els.length || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (Date.now() < lockRef.current) return;
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { rootMargin: "-160px 0px -55% 0px", threshold: 0 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  // 밑줄 친 탭이 탭 줄 안에서 보이게
  useEffect(() => {
    const btn = barRef.current?.querySelector(`[data-id="${active}"]`);
    if (btn && barRef.current) {
      const bar = barRef.current;
      const left = btn.offsetLeft - bar.clientWidth / 2 + btn.clientWidth / 2;
      bar.scrollTo({ left, behavior: "smooth" });
    }
  }, [active]);

  const go = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    setActive(id);
    lockRef.current = Date.now() + 900; // 내려가는 동안 밑줄이 왔다 갔다 하지 않게
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <nav className="mi-tabs" ref={barRef} aria-label="시장 칸 바로가기">
      {SECTIONS.map((s) => (
        <button key={s.id} type="button" data-id={s.id} className={active === s.id ? "on" : ""} onClick={() => go(s.id)}>
          {s.label}
        </button>
      ))}
    </nav>
  );
}

// ── ① 지수 ──────────────────────────────────────────────────
function Spark({ pts, prev, tone }) {
  if (!Array.isArray(pts) || pts.length < 2) return <div className="mi-spark empty" />;
  const W = 120;
  const H = 34;
  const vals = isNum(prev) ? [...pts, prev] : pts;
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || 1;
  const y = (v) => H - 2 - ((v - lo) / span) * (H - 4);
  const d = pts.map((v, i) => `${i ? "L" : "M"}${((i / (pts.length - 1)) * W).toFixed(1)},${y(v).toFixed(1)}`).join("");
  return (
    <svg className={`mi-spark ${tone}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      {isNum(prev) && <line x1="0" x2={W} y1={y(prev)} y2={y(prev)} className="base" />}
      <path d={d} />
    </svg>
  );
}

function IndexCard({ worldIndices, strip }) {
  const [spark, setSpark] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = () => {
      if (document.visibilityState === "hidden") return;
      fetch("/api/index-spark")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (alive && d?.items) setSpark(d);
        })
        .catch(() => {});
    };
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const wiMap = useMemo(() => {
    const m = {};
    for (const it of worldIndices?.items || []) m[it.key] = it;
    return m;
  }, [worldIndices]);
  const stripMap = useMemo(() => {
    const m = {};
    for (const r of [...(strip?.fx || []), ...(strip?.commodity || [])]) m[r.key] = r;
    return m;
  }, [strip]);

  const tiles = TILES.map((t) => {
    const sp = spark?.items?.[t.sym];
    // 한국·미국 지수는 홈 위쪽 지수 띠와 같은 숫자(lib/worldIndices.js)를 먼저, 나머지는 5분마다 받는 숫자를 먼저
    const base = t.wi ? wiMap[t.wi] : null;
    const st = stripMap[t.sym];
    const value = isNum(base?.close) ? base.close : isNum(sp?.price) ? sp.price : st?.close;
    const chg = isNum(base?.changePct) ? base.changePct : isNum(sp?.changePct) ? sp.changePct : st?.changePct;
    return { ...t, value, chg, pts: sp?.pts, prev: sp?.prev };
  }).filter((t) => isNum(t.value));

  if (!tiles.length) return null;
  const at = hhmm(spark?.at || worldIndices?.generatedAt);
  return (
    <Card id="mi-index" title="주요 지수" sub={at ? `${at} 기준 · 일부 15~20분 지연` : ""}>
      <div className="mi-idx-grid">
        {tiles.map((t) => {
          const tone = toneOf(t.chg);
          return (
            <div key={t.sym} className="mi-idx">
              <div className="mi-idx-label">
                <i className={`dot ${tone}`} />
                {t.label}
              </div>
              <div className="mi-idx-val mono">{fmtValue(t.value, t)}</div>
              <div className={`mi-idx-chg mono ${tone}`}>{pctText(t.chg)}</div>
              <Spark pts={t.pts} prev={t.prev} tone={tone} />
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ── ③ 테마 히트맵 ────────────────────────────────────────────
// 사각형 나누기(squarify) — 큰 값부터 정사각형에 가깝게 배치. 결과는 0~100(가로)·0~H(세로) 좌표
function squarify(items, W, H) {
  const total = items.reduce((s, i) => s + i.weight, 0);
  if (!total) return [];
  const scale = (W * H) / total;
  let rest = items.map((i) => ({ ...i, area: i.weight * scale }));
  const out = [];
  let x = 0;
  let y = 0;
  let w = W;
  let h = H;
  const worst = (row, side) => {
    const s = row.reduce((a, b) => a + b.area, 0);
    const mx = Math.max(...row.map((r) => r.area));
    const mn = Math.min(...row.map((r) => r.area));
    return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
  };
  while (rest.length) {
    const side = Math.min(w, h);
    let row = [rest[0]];
    let i = 1;
    while (i < rest.length && worst([...row, rest[i]], side) <= worst(row, side)) {
      row.push(rest[i]);
      i += 1;
    }
    const s = row.reduce((a, b) => a + b.area, 0);
    if (w >= h) {
      const cw = s / h;
      let cy = y;
      for (const r of row) {
        const rh = r.area / cw;
        out.push({ ...r, x, y: cy, w: cw, h: rh });
        cy += rh;
      }
      x += cw;
      w -= cw;
    } else {
      const ch = s / w;
      let cx = x;
      for (const r of row) {
        const rw = r.area / ch;
        out.push({ ...r, x: cx, y, w: rw, h: ch });
        cx += rw;
      }
      y += ch;
      h -= ch;
    }
    rest = rest.slice(i);
  }
  return out;
}

const HEAT_RANGE = { "1D": ["change1D", "sampleSize1D", 4], "1W": ["change1W", "sampleSize1W", 10], "1M": ["change1M", "sampleSize1M", 20] };
const HEAT_COUNT = 22;
const HEAT_W = 100;
const HEAT_H = 66;

function heatColor(v, cap) {
  if (!isNum(v)) return "var(--surface-2)";
  const p = Math.round(Math.min(1, Math.abs(v) / cap) * 78 + 14);
  return `color-mix(in oklab, ${v >= 0 ? "var(--up)" : "var(--down)"} ${p}%, var(--surface-2))`;
}

function HeatCard() {
  const { data, state } = useThemeMomentum();
  const [range, setRange] = useState("1D");
  const [field, sizeField, cap] = HEAT_RANGE[range];

  const rects = useMemo(() => {
    const list = (data?.themeChanges || [])
      .filter((t) => isNum(t[field]) && t[sizeField] >= 3 && !isPoliticalTheme(t.theme))
      .sort((a, b) => b[sizeField] - a[sizeField])
      .slice(0, HEAT_COUNT)
      .map((t) => ({ theme: t.theme, v: t[field], weight: t[sizeField] }))
      .sort((a, b) => b.weight - a.weight);
    return squarify(list, HEAT_W, HEAT_H);
  }, [data, field, sizeField]);

  // 전 종목 오른 수·내린 수(가장 최근 거래일)
  const breadth = useMemo(() => {
    const m = data?.stockChanges1D;
    if (!m) return null;
    let up = 0;
    let down = 0;
    let flat = 0;
    for (const v of Object.values(m)) {
      if (!isNum(v)) continue;
      if (v > 0) up += 1;
      else if (v < 0) down += 1;
      else flat += 1;
    }
    return up + down ? { up, down, flat } : null;
  }, [data]);

  if (state === "error") return null;
  const day = mdOf(data?.recentBasDt);
  return (
    <Card
      id="mi-heat"
      title="테마 히트맵"
      sub={day ? `${day} 종가 기준` : ""}
      more={{ href: "/themes", label: "테마별 종목 전체 보기" }}
    >
      <Seg value={range} onChange={setRange} options={[["1D", "하루"], ["1W", "1주일"], ["1M", "1개월"]]} />
      <div className="mi-heat" style={{ aspectRatio: `${HEAT_W} / ${HEAT_H}` }}>
        {state === "loading" && <p className="mi-empty">불러오는 중…</p>}
        {rects.map((r) => {
          const big = r.w * r.h > 150 && r.w > 16;
          const mid = r.w * r.h > 45 && r.w > 10 && r.h > 7;
          return (
            <Link
              key={r.theme}
              href={`/themes?theme=${encodeURIComponent(r.theme)}`}
              className="mi-heat-cell"
              style={{
                left: `${(r.x / HEAT_W) * 100}%`,
                top: `${(r.y / HEAT_H) * 100}%`,
                width: `${(r.w / HEAT_W) * 100}%`,
                height: `${(r.h / HEAT_H) * 100}%`,
                background: heatColor(r.v, cap),
              }}
              title={`${r.theme} ${pctText(r.v)}`}
            >
              {(big || mid) && (
                <span className={big ? "big" : ""}>
                  <b>{r.theme}</b>
                  <em className="mono">{pctText(r.v)}</em>
                </span>
              )}
            </Link>
          );
        })}
      </div>
      {breadth && (
        <div className="mi-breadth" aria-label={`전 종목 ${breadth.up}개 상승, ${breadth.down}개 하락`}>
          <span className="up mono">{breadth.up.toLocaleString("ko-KR")} 상승</span>
          <span className="mi-breadth-bar">
            <i className="up" style={{ flexGrow: breadth.up }} />
            <i className="down" style={{ flexGrow: breadth.down }} />
          </span>
          <span className="down mono">{breadth.down.toLocaleString("ko-KR")} 하락</span>
        </div>
      )}
      <p className="mi-note">칸 크기는 테마에 속한 종목 수, 색이 진할수록 많이 움직인 테마예요. 누르면 관련주가 나와요.</p>
    </Card>
  );
}

// ── ④ 투자자 수급 ────────────────────────────────────────────
function eokText(v) {
  if (!isNum(v)) return "—";
  const s = v > 0 ? "+" : v < 0 ? "−" : "";
  const a = Math.abs(v);
  // 1,000억 이상은 조 단위(소수 첫째 자리)로 — 칸이 좁아 "4,120억"처럼 길면 줄이 넘어감
  return a >= 1000 ? `${s}${(a / 10000).toFixed(1)}조` : `${s}${Math.round(a).toLocaleString("ko-KR")}억`;
}
function recentWeekdays(n) {
  const out = [];
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  while (out.length < n) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return out;
}

function FlowCard() {
  const [flow, setFlow] = useState(null);
  const [state, setState] = useState("loading");
  useEffect(() => {
    let alive = true;
    (async () => {
      // 오늘 자료가 아직 없으면(장 시작 전·휴일) 가장 가까운 지난 거래일로
      for (const date of recentWeekdays(5)) {
        try {
          const r = await fetch(`/api/market-flow?date=${date}`);
          const d = r.ok ? await r.json() : null;
          if (d && (d["코스피"]?.flow || d["코스닥"]?.flow)) {
            if (alive) {
              setFlow(d);
              setState("ready");
            }
            return;
          }
        } catch {
          // 다음 날짜
        }
      }
      if (alive) setState("error");
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (state === "error") return null;
  const now = kstNow();
  const live = flow?.date === now.iso && now.min < 15 * 60 + 40;
  const sub = flow ? `${mdOf(flow.date)} ${live ? "장중 잠정" : "장 마감 기준"}` : "";
  const cols = [
    ["individual", "개인"],
    ["foreign", "외국인"],
    ["institution", "기관"],
  ];
  return (
    <Card id="mi-flow" title="투자자 수급" sub={sub} more={{ href: "/market", label: "장 마감 정리에서 자세히" }}>
      {state === "loading" ? (
        <p className="mi-empty">불러오는 중…</p>
      ) : (
        <div className="mi-flow">
          <div className="mi-flow-row head">
            <span />
            {cols.map(([, l]) => (
              <span key={l}>{l}</span>
            ))}
          </div>
          {["코스피", "코스닥"].map((mk) => {
            const f = flow?.[mk]?.flow;
            const idx = flow?.[mk]?.index;
            return (
              <div key={mk} className="mi-flow-row">
                <span className="mi-flow-mk">
                  {mk}
                  {isNum(idx?.chgPct) && <small className={`mono ${toneOf(idx.chgPct)}`}>{pctText(idx.chgPct)}</small>}
                </span>
                {cols.map(([k]) => (
                  <span key={k} className={`mono ${toneOf(f?.[k])}`}>
                    {eokText(f?.[k])}
                  </span>
                ))}
              </div>
            );
          })}
          <p className="mi-note">순매수 금액(산 금액 − 판 금액). 빨강은 더 많이 산 것, 파랑은 더 많이 판 것이에요.</p>
        </div>
      )}
    </Card>
  );
}

// ── ⑥ 급등락 ────────────────────────────────────────────────
const MARKET_KO = { KOSPI: "코스피", KOSDAQ: "코스닥", KONEX: "코넥스" };
function MoversCard() {
  const { data, state } = useThemeMomentum();
  const [side, setSide] = useState("up");
  if (state === "error") return null;
  const list = (side === "up" ? data?.dailyMovers : data?.dailyLosers) || [];
  const day = mdOf(data?.recentBasDt);
  return (
    <Card id="mi-movers" title="급등 · 급락 종목" sub={day ? `${day} 종가 기준` : ""} more={{ href: "/market", label: "장 마감 정리 전체 보기" }}>
      <Seg value={side} onChange={setSide} options={[["up", "급등"], ["down", "급락"]]} />
      {state === "loading" ? (
        <p className="mi-empty">불러오는 중…</p>
      ) : (
        <ol className="mi-rank">
          {list.slice(0, 8).map((s, i) => (
            <li key={s.code}>
              <button type="button" onClick={() => openStockChart({ code: s.code, name: s.name, market: s.market })}>
                <span className="mi-rank-no mono">{i + 1}</span>
                <span className="mi-rank-name">
                  {s.name}
                  <small>{MARKET_KO[s.market] || s.market || ""}</small>
                </span>
                <span className={`mono ${toneOf(s.change)}`}>{pctText(s.change)}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

// ── ⑧ 바로가기 ──────────────────────────────────────────────
const LINKS = [
  { href: "/market", label: "장 마감 정리", Icon: BarChart3 },
  { href: "/themes", label: "테마별 종목", Icon: Layers },
  { href: "/patterns", label: "패턴 검색", Icon: Activity },
  { href: "/ipo", label: "공모주 일정", Icon: Ticket },
  { href: "/disclosure", label: "공시 일정", Icon: FileText },
  { href: "/briefing", label: "장전 브리핑", Icon: CalendarClock },
];

export default function MobileInsight({ worldIndices, strip, flagship, outlook, ad }) {
  return (
    <div className="mi m-only">
      <JumpTabs />
      <IndexCard worldIndices={worldIndices} strip={strip} />
      {outlook && (
        <section id="mi-outlook" className="mi-card mi-card-outlook" aria-label="오늘의 예측">
          {outlook}
        </section>
      )}
      <HeatCard />
      <FlowCard />
      <section id="mi-ath" className="mi-card mi-card-bare" aria-label="역사적 신고가 돌파">
        <AthBreakoutPanel />
      </section>
      {ad && <div className="mi-ad">{ad}</div>}
      <MoversCard />
      {flagship && (
        <section id="mi-flag" className="mi-card mi-card-bare" aria-label="대표 종목">
          {flagship}
        </section>
      )}
      <nav className="mi-links" aria-label="다른 메뉴">
        {LINKS.map(({ href, label, Icon }) => (
          <Link key={href} href={href} className="mi-link">
            <Icon size={17} />
            <span>{label}</span>
            <ChevronRight size={14} className="go" />
          </Link>
        ))}
      </nav>
    </div>
  );
}
