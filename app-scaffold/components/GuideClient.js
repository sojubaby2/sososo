"use client";

// components/GuideClient.js
//
// [2026-10-29 전면 개편] 차트 가이드 — 재성님: "차트가이드 너무 허접해, 혁신적, 혁명적으로 이쁘게 다시 만들어봐"
//   예전: 탭 4개 + 접었다 펴는 글자 목록(그림은 펼쳐야만 보임)
//   지금: "차트 도감"
//     1. 맨 위 — 큰 제목 + 오른쪽에서 지표 그림이 몇 초마다 바뀌며 저절로 그려지는 진열장
//     2. "처음이라면 이 순서로" — 캔들 → 거래량 → 이동평균선 → RSI → MACD 5단계 길잡이
//     3. 검색창 + 분야 단추(개수 표시) + 난이도(입문·기본·심화)
//     4. 카드 격자 — 카드마다 그 지표의 움직이는 작은 그림이 바로 보임(화면에 보일 때만 그려서 가벼움)
//     5. 카드를 누르면 큰 그림 + 설명 + 읽는 법 + 같이 보면 좋은 지표 + 이전/다음 창(주소 끝 #지표 로 바로 열기·공유 가능)
//   지표 내용(설명·그림)은 그대로 lib/indicatorCatalog.js, components/IndicatorDemo.js를 씁니다. 비용 0.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Search, X, ChevronLeft, ChevronRight, RotateCcw, Sparkles, Layers, LineChart, Activity, Gauge } from "lucide-react";
import IndicatorDemo from "./IndicatorDemo";
import { CATEGORIES, INDICATORS } from "../lib/indicatorCatalog";

const PANE_TYPES = new Set(["pane-bars", "pane-bars-avg", "pane-oscillator", "pane-oscillator-center", "pane-line", "pane-macd"]);
const CAT_ICON = { chartform: LineChart, overlay: Layers, oscillator: Activity, other: Gauge };
const CAT_DESC = {
  chartform: "가격을 어떤 모양으로 그리나",
  overlay: "가격 차트 위에 겹쳐 그리는 선",
  oscillator: "차트 아래 따로 그리는 보조 그래프",
  other: "수급·심리 같은 시장 지표",
};

// 난이도 — 처음 보는 사람이 어디서부터 볼지 고르기 쉽게
const BASIC = new Set(["timeframe", "candle", "line", "volume", "sma"]);
const MID = new Set(["area", "bar", "bollinger", "rsi", "stochastic", "macd", "disparity", "envelope", "volumeSma", "pivot", "investorType", "personalNet", "demand-zone", "obv"]);
const levelOf = (id) => (BASIC.has(id) ? "입문" : MID.has(id) ? "기본" : "심화");
const LEVEL_CLS = { 입문: "lv1", 기본: "lv2", 심화: "lv3" };

const PATH = ["candle", "volume", "sma", "rsi", "macd"];
const SHOWCASE = ["candle", "bollinger", "macd", "ichimoku", "rsi", "sar"];

const byId = new Map(INDICATORS.map((it) => [it.id, it]));

// 그림 틀 — 보조지표(아래 칸 있는 것)는 세로가 조금 더 김
function Demo({ it, replay = 0 }) {
  if (it.visual.type === "timeframe-compare") return <IndicatorDemo key={replay} visual={it.visual} />;
  return (
    <div className="demo-frame" style={{ paddingTop: `${PANE_TYPES.has(it.visual.type) ? 130 : 100}%` }}>
      <IndicatorDemo key={replay} visual={it.visual} />
    </div>
  );
}

// 카드 작은 그림 — 화면에 보일 때만 그림(47개를 한꺼번에 그리지 않게)
function Thumb({ it }) {
  const ref = useRef(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || show) return;
    if (typeof IntersectionObserver === "undefined") {
      setShow(true);
      return;
    }
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          setShow(true);
          io.disconnect();
        }
      },
      { rootMargin: "120px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [show]);
  return (
    <div ref={ref} className={`gd-thumb ${it.visual.type === "timeframe-compare" ? "tf" : PANE_TYPES.has(it.visual.type) ? "pane" : ""}`}>
      {show ? <Demo it={it} /> : <span className="gd-thumb-ph" />}
    </div>
  );
}

export default function GuideClient() {
  const [cat, setCat] = useState("all");
  const [level, setLevel] = useState("all");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState(null);
  const [replay, setReplay] = useState(0);
  const [show, setShow] = useState(0);

  // 진열장: 6초마다 다음 지표
  useEffect(() => {
    const t = setInterval(() => setShow((s) => (s + 1) % SHOWCASE.length), 6000);
    return () => clearInterval(t);
  }, []);

  // 주소 끝 #rsi 처럼 들어오면 바로 열기
  useEffect(() => {
    const fromHash = () => {
      const id = decodeURIComponent(window.location.hash.replace(/^#/, ""));
      setOpenId(byId.has(id) ? id : null);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  const open = (id) => {
    setReplay((r) => r + 1);
    if (window.location.hash !== `#${id}`) history.replaceState(null, "", `#${id}`);
    setOpenId(id);
  };
  const close = () => {
    history.replaceState(null, "", window.location.pathname);
    setOpenId(null);
  };

  const counts = useMemo(() => {
    const c = { all: INDICATORS.length };
    for (const it of INDICATORS) c[it.category] = (c[it.category] || 0) + 1;
    return c;
  }, []);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return INDICATORS.filter(
      (it) =>
        (cat === "all" || it.category === cat) &&
        (level === "all" || levelOf(it.id) === level) &&
        (!s || `${it.name} ${it.eng} ${it.summary}`.toLowerCase().includes(s))
    );
  }, [cat, level, q]);

  const cur = openId ? byId.get(openId) : null;
  const curIdx = cur ? list.findIndex((x) => x.id === cur.id) : -1;
  const nav = curIdx >= 0 ? list : INDICATORS;
  const navIdx = nav.findIndex((x) => x.id === openId);
  const prev = navIdx > 0 ? nav[navIdx - 1] : null;
  const next = navIdx >= 0 && navIdx < nav.length - 1 ? nav[navIdx + 1] : null;
  const related = cur ? INDICATORS.filter((x) => x.category === cur.category && x.id !== cur.id).slice(0, 6) : [];

  // 창이 열려 있을 때: Esc 닫기, ←/→ 이전·다음, 뒤 화면 스크롤 잠금
  useEffect(() => {
    if (!cur) return;
    const onKey = (e) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft" && prev) open(prev.id);
      if (e.key === "ArrowRight" && next) open(next.id);
    };
    window.addEventListener("keydown", onKey);
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = old;
    };
  });

  const sc = byId.get(SHOWCASE[show]);

  return (
    <main className="gd">
      {/* ── 1. 맨 위 ── */}
      <section className="gd-hero">
        <div className="gd-hero-text">
          <span className="gd-kicker">
            <Sparkles size={14} /> 차트 가이드
          </span>
          <h1>
            차트, 움직이는 그림으로
            <br />
            <em>1분이면 읽는다</em>
          </h1>
          <p>캔들 하나부터 MACD·일목균형표까지. 같은 가격 데이터 위에 지표가 어떻게 그려지는지 눈으로 보면서 익혀 보세요.</p>
          <div className="gd-stats">
            <span>
              <b className="mono">{INDICATORS.length}</b>개 지표
            </span>
            <span>
              <b className="mono">4</b>가지 분야
            </span>
            <span>
              전부 <b>움직이는 그림</b>
            </span>
          </div>
        </div>
        <button type="button" className="gd-show" onClick={() => open(sc.id)} aria-label={`${sc.name} 자세히 보기`}>
          <div className="gd-show-top">
            <span className="gd-show-live">
              <i /> 지금 보는 지표
            </span>
            <span className="gd-show-dots">
              {SHOWCASE.map((_, i) => (
                <i key={i} className={i === show ? "on" : ""} />
              ))}
            </span>
          </div>
          <div className="gd-show-demo" key={sc.id}>
            <Demo it={sc} />
          </div>
          <div className="gd-show-name">
            <b>{sc.name}</b>
            <span className="mono">{sc.eng}</span>
          </div>
          <p>{sc.summary}</p>
        </button>
      </section>

      {/* ── 2. 처음이라면 이 순서로 ── */}
      <section className="gd-path">
        <h2>처음이라면 이 순서로</h2>
        <ol>
          {PATH.map((id, i) => {
            const it = byId.get(id);
            return (
              <li key={id}>
                <button type="button" onClick={() => open(id)}>
                  <span className="gd-step mono">{i + 1}</span>
                  <b>{it.name}</b>
                  <span>{it.summary}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      {/* ── 3. 검색·분류 ── */}
      <section className="gd-tools">
        <label className="gd-search">
          <Search size={17} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="지표 이름으로 찾기 (예: RSI, 볼린저, 이동평균)" aria-label="지표 검색" />
          {q && (
            <button type="button" onClick={() => setQ("")} aria-label="검색어 지우기">
              <X size={15} />
            </button>
          )}
        </label>
        <div className="gd-cats" role="tablist">
          <button type="button" className={cat === "all" ? "on" : ""} onClick={() => setCat("all")}>
            전체 <span className="mono">{counts.all}</span>
          </button>
          {CATEGORIES.map((c) => {
            const Icon = CAT_ICON[c.id] || Layers;
            return (
              <button key={c.id} type="button" className={cat === c.id ? "on" : ""} onClick={() => setCat(c.id)} title={CAT_DESC[c.id]}>
                <Icon size={15} /> {c.label} <span className="mono">{counts[c.id] || 0}</span>
              </button>
            );
          })}
        </div>
        <div className="gd-levels">
          {["all", "입문", "기본", "심화"].map((lv) => (
            <button key={lv} type="button" className={`${level === lv ? "on" : ""} ${LEVEL_CLS[lv] || ""}`} onClick={() => setLevel(lv)}>
              {lv === "all" ? "모든 난이도" : lv}
            </button>
          ))}
        </div>
        {cat !== "all" && <p className="gd-cat-desc">{CAT_DESC[cat]}</p>}
      </section>

      {/* ── 4. 카드 격자 ── */}
      {list.length === 0 ? (
        <p className="gd-empty">"{q}"에 맞는 지표가 없어요. 다른 이름으로 찾아보세요.</p>
      ) : (
        <section className="gd-grid">
          {list.map((it) => {
            const lv = levelOf(it.id);
            return (
              <button key={it.id} type="button" className="gd-card" onClick={() => open(it.id)}>
                <Thumb it={it} />
                <div className="gd-card-body">
                  <div className="gd-card-top">
                    <span className={`gd-lv ${LEVEL_CLS[lv]}`}>{lv}</span>
                    <span className="gd-card-cat">{CATEGORIES.find((c) => c.id === it.category)?.label}</span>
                  </div>
                  <b className="gd-card-name">{it.name}</b>
                  <span className="gd-card-eng mono">{it.eng}</span>
                  <span className="gd-card-sum">{it.summary}</span>
                  <span className="gd-card-go">그림으로 보기 →</span>
                </div>
              </button>
            );
          })}
        </section>
      )}

      <div className="gd-cta">
        <div>
          <b>배운 지표, 실제 종목에서 확인해 보세요</b>
          <span>패턴검색에서 차트 모양이 비슷한 종목을 찾고, 종목을 누르면 일봉 차트가 바로 열려요.</span>
        </div>
        <Link href="/patterns" className="mkh-cta">
          패턴검색 가기 →
        </Link>
      </div>

      <p className="guide-footnote">
        여기 나온 계산은 이해를 돕기 위해 단순화한 교육용 그림이에요. 실제 매매 판단에는 증권사 HTS의 정확한 지표를 사용해주세요.
      </p>

      {/* ── 5. 자세히 보기 창 ── */}
      {cur && (
        <div className="gd-modal" role="dialog" aria-modal="true" aria-label={`${cur.name} 설명`} onClick={(e) => e.target === e.currentTarget && close()}>
          <div className="gd-sheet">
            <div className="gd-sheet-head">
              <div>
                <span className={`gd-lv ${LEVEL_CLS[levelOf(cur.id)]}`}>{levelOf(cur.id)}</span>
                <span className="gd-card-cat">{CATEGORIES.find((c) => c.id === cur.category)?.label}</span>
                <h2>{cur.name}</h2>
                <span className="gd-card-eng mono">{cur.eng}</span>
              </div>
              <button type="button" className="gd-x" onClick={close} aria-label="닫기">
                <X size={20} />
              </button>
            </div>
            <div className="gd-sheet-main">
              <div className="gd-sheet-demo">
                <Demo it={cur} replay={replay} />
                <button type="button" className="gd-replay" onClick={() => setReplay((r) => r + 1)}>
                  <RotateCcw size={14} /> 다시 그리기
                </button>
              </div>
              <div className="gd-sheet-text">
                <p className="gd-sum">{cur.summary}</p>
                <p className="gd-detail">{cur.detail}</p>
                <div className="gd-tip">
                  <b>📖 읽는 법</b>
                  <span>{cur.tip}</span>
                </div>
                {related.length > 0 && (
                  <div className="gd-rel">
                    <b>같이 보면 좋은 지표</b>
                    <div>
                      {related.map((r) => (
                        <button key={r.id} type="button" onClick={() => open(r.id)}>
                          {r.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="gd-sheet-nav">
              {prev ? (
                <button type="button" onClick={() => open(prev.id)}>
                  <ChevronLeft size={16} /> {prev.name}
                </button>
              ) : (
                <span />
              )}
              {next ? (
                <button type="button" onClick={() => open(next.id)}>
                  {next.name} <ChevronRight size={16} />
                </button>
              ) : (
                <span />
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
