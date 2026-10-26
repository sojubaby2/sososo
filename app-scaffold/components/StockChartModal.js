"use client";

// components/StockChartModal.js
//
// [2026-10-26 신설] 종목을 누르면 뜨는 "일봉 차트" 창입니다.
//
// 재성님 요청: "이 사이트처럼 종목을 누르면 당일을 포함한 일봉이 보이는
//              차트를 표시할 수 있을까?" (참고: jongganote.com)
//
// 보여주는 것:
//   · 맨 위: 종목명·코드·시장, 현재가와 등락률(전일 종가 대비)
//   · 그 아래 한 줄: 날짜 · 시가/고가/저가/종가 (등락률) · 거래량
//     → 차트 위에 손가락/마우스를 올리면 그 날짜의 값으로 바뀝니다.
//   · 차트: 최근 130거래일 일봉(오늘 포함) + 5일선(흰색) + 20일선(노란색) + 거래량 막대
//   · 아래 단추: 코드 복사 / 관련 속보만 보기(홈에서 열었을 때) / 네이버 증권
//
// 색: 국내 관례대로 오르면 빨강, 내리면 파랑.
//
// 차트는 외부 차트 프로그램 없이 직접 그립니다(SVG). 그래서 사이트가 무거워지지 않고,
// 사이트 색감(어두운 터미널형)에 정확히 맞출 수 있습니다.
//
// 닫는 법: 오른쪽 위 X, 바깥 어두운 곳 누르기, 키보드 Esc.
//
// 데이터: /api/candles (lib/candles.js — 야후 무료 시세, 15~20분 지연, 비용 0)

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { X, Copy, Check, ExternalLink, Filter } from "lucide-react";
import { OPEN_CHART_EVENT } from "../lib/openStockChart";

const SHOW_BARS = 130; // 화면에 보여줄 거래일 수
const CLIENT_CACHE_MS = 120000; // 같은 종목을 2분 안에 다시 열면 다시 받지 않음
const cache = new Map(); // code → { at, data }

// ── 숫자 모양 ─────────────────────────────────────────────
const won = (n) => (typeof n === "number" ? Math.round(n).toLocaleString("ko-KR") : "—");
const pctText = (n) => (typeof n === "number" ? `${n > 0 ? "+" : ""}${n.toFixed(2)}%` : "");
const toneOf = (n) => (typeof n === "number" ? (n > 0 ? "up" : n < 0 ? "down" : "flat") : "flat");
const shortDate = (d) => `${d.slice(2, 4)}.${d.slice(5, 7)}.${d.slice(8, 10)}`;
// 오늘 날짜(한국시간) "2026-10-26"
const kstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
function volText(v) {
  if (!v) return "0주";
  if (v >= 1e8) return `${(v / 1e8).toFixed(1)}억주`;
  if (v >= 1e4) return `${Math.round(v / 1e4).toLocaleString("ko-KR")}만주`;
  return `${v.toLocaleString("ko-KR")}주`;
}

// 이동평균선(n일 평균). 앞부분 n-1일은 값이 없음(null).
function movingAvg(candles, n) {
  const out = new Array(candles.length).fill(null);
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].c;
    if (i >= n) sum -= candles[i - n].c;
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

// 가격 눈금을 보기 좋은 숫자(1, 2, 2.5, 5 × 10ⁿ)로 정합니다.
function niceTicks(min, max, count = 4) {
  const span = max - min || 1;
  const raw = span / count;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) || raw;
  const ticks = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) ticks.push(v);
  return ticks;
}

// ── 차트 그림 ─────────────────────────────────────────────
function CandleChart({ all, onHover }) {
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(0);

  // 창 너비에 맞춰 다시 그리기(휴대폰·PC 모두 글씨 크기가 일정하게)
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setWidth(Math.floor(el.getBoundingClientRect().width));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const ma5All = useMemo(() => movingAvg(all, 5), [all]);
  const ma20All = useMemo(() => movingAvg(all, 20), [all]);
  const start = Math.max(0, all.length - SHOW_BARS);
  const bars = all.slice(start);
  const ma5 = ma5All.slice(start);
  const ma20 = ma20All.slice(start);

  const [hover, setHover] = useState(null);

  const H_PRICE = 230;
  const H_GAP = 10;
  const H_VOL = 52;
  const H_AXIS = 20;
  const PAD_L = 4;
  const PAD_R = 58; // 오른쪽 가격 글씨 자리
  const H = H_PRICE + H_GAP + H_VOL + H_AXIS;
  const plotW = Math.max(10, width - PAD_L - PAD_R);
  const step = plotW / Math.max(bars.length, 1);
  const bodyW = Math.max(1, Math.min(9, step * 0.68));

  let lo = Infinity;
  let hi = -Infinity;
  bars.forEach((b, i) => {
    lo = Math.min(lo, b.l, ma20[i] ?? Infinity, ma5[i] ?? Infinity);
    hi = Math.max(hi, b.h, ma20[i] ?? -Infinity, ma5[i] ?? -Infinity);
  });
  const padP = (hi - lo) * 0.06 || hi * 0.02 || 1;
  lo -= padP;
  hi += padP;
  const y = (p) => 6 + ((hi - p) / (hi - lo)) * (H_PRICE - 12);
  const x = (i) => PAD_L + step * i + step / 2;
  const vMax = Math.max(1, ...bars.map((b) => b.v));
  const volTop = H_PRICE + H_GAP;
  const vy = (v) => volTop + H_VOL - (v / vMax) * H_VOL;

  const ticks = niceTicks(lo, hi, 4);
  const linePath = (arr) => {
    let d = "";
    arr.forEach((v, i) => {
      if (v == null) return;
      d += `${d ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    });
    return d;
  };

  // 달이 바뀌는 곳에 "11월" 표시(1월이면 "27.01")
  const monthMarks = [];
  bars.forEach((b, i) => {
    if (i === 0) return;
    if (b.d.slice(5, 7) !== bars[i - 1].d.slice(5, 7)) {
      const m = b.d.slice(5, 7);
      monthMarks.push({ i, label: m === "01" ? `${b.d.slice(2, 4)}.01` : `${Number(m)}월` });
    }
  });

  const last = bars[bars.length - 1];
  const prev = bars[bars.length - 2];
  const lastTone = prev ? toneOf(last.c - prev.c) : "flat";

  const pick = useCallback(
    (clientX) => {
      const el = wrapRef.current;
      if (!el || !bars.length) return;
      const rect = el.getBoundingClientRect();
      const i = Math.min(bars.length - 1, Math.max(0, Math.floor((clientX - rect.left - PAD_L) / step)));
      setHover(i);
      onHover(start + i);
    },
    [bars.length, step, start, onHover]
  );
  const clear = () => {
    setHover(null);
    onHover(null);
  };

  return (
    <div className="sc-chart" ref={wrapRef}>
      {width > 0 && (
        <svg
          width={width}
          height={H}
          role="img"
          aria-label="최근 일봉 차트"
          onPointerMove={(e) => pick(e.clientX)}
          onPointerDown={(e) => pick(e.clientX)}
          onPointerLeave={clear}
        >
          {/* 가격 눈금선 + 오른쪽 가격 */}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD_L} x2={PAD_L + plotW} y1={y(t)} y2={y(t)} className="sc-grid" />
              {/* 현재가 꼬리표와 겹치는 눈금 글씨는 숨김 */}
              {Math.abs(y(t) - y(last.c)) > 14 && (
                <text x={PAD_L + plotW + 6} y={y(t) + 4} className="sc-axis">
                  {won(t)}
                </text>
              )}
            </g>
          ))}

          {/* 달 구분 */}
          {monthMarks.map((m) => (
            <g key={m.i}>
              <line x1={x(m.i) - step / 2} x2={x(m.i) - step / 2} y1={6} y2={volTop + H_VOL} className="sc-grid sc-grid-v" />
              <text x={x(m.i) - step / 2 + 3} y={H - 5} className="sc-axis">
                {m.label}
              </text>
            </g>
          ))}

          {/* 거래량 */}
          {bars.map((b, i) => {
            const up = i > 0 ? b.c >= bars[i - 1].c : b.c >= b.o;
            return (
              <rect
                key={`v${b.d}`}
                x={x(i) - bodyW / 2}
                y={vy(b.v)}
                width={bodyW}
                height={Math.max(0.5, volTop + H_VOL - vy(b.v))}
                className={up ? "sc-vol-up" : "sc-vol-down"}
              />
            );
          })}

          {/* 캔들: 몸통은 시가↔종가, 꼬리는 고가↔저가. 종가 ≥ 시가면 빨강(양봉) */}
          {bars.map((b, i) => {
            const up = b.c >= b.o;
            const top = y(Math.max(b.o, b.c));
            const bot = y(Math.min(b.o, b.c));
            return (
              <g key={b.d} className={up ? "sc-up" : "sc-down"}>
                <line x1={x(i)} x2={x(i)} y1={y(b.h)} y2={y(b.l)} />
                <rect x={x(i) - bodyW / 2} y={top} width={bodyW} height={Math.max(1, bot - top)} />
              </g>
            );
          })}

          {/* 이동평균선 */}
          <path d={linePath(ma20)} className="sc-ma20" />
          <path d={linePath(ma5)} className="sc-ma5" />

          {/* 현재가 점선 + 꼬리표 */}
          <line x1={PAD_L} x2={PAD_L + plotW} y1={y(last.c)} y2={y(last.c)} className={`sc-last ${lastTone}`} />
          <rect x={PAD_L + plotW + 2} y={y(last.c) - 9} width={PAD_R - 4} height={18} rx={3} className={`sc-last-tag ${lastTone}`} />
          <text x={PAD_L + plotW + 6} y={y(last.c) + 4} className="sc-last-txt">
            {won(last.c)}
          </text>

          {/* 손가락/마우스 위치 표시 */}
          {hover != null && (
            <line x1={x(hover)} x2={x(hover)} y1={6} y2={volTop + H_VOL} className="sc-cross" />
          )}
        </svg>
      )}
    </div>
  );
}

// ── 창 ─────────────────────────────────────────────────
export default function StockChartModal() {
  const [stock, setStock] = useState(null); // { code, name, market, onFilter? }
  const [state, setState] = useState("idle"); // idle | loading | ready | error
  const [data, setData] = useState(null);
  const [hoverIdx, setHoverIdx] = useState(null);
  const [copied, setCopied] = useState(false);
  const closeRef = useRef(null);
  const lastFocus = useRef(null);

  // 어디서든 openStockChart(...)를 부르면 여기서 받아서 엽니다.
  useEffect(() => {
    const onOpen = (e) => {
      const s = e.detail;
      if (!s?.code) return;
      lastFocus.current = document.activeElement;
      setStock(s);
      setHoverIdx(null);
      setCopied(false);
    };
    window.addEventListener(OPEN_CHART_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_CHART_EVENT, onOpen);
  }, []);

  // 종목이 정해지면 데이터 받기
  useEffect(() => {
    if (!stock) return;
    let alive = true;
    const hit = cache.get(stock.code);
    if (hit && Date.now() - hit.at < CLIENT_CACHE_MS) {
      setData(hit.data);
      setState("ready");
      return;
    }
    setState("loading");
    setData(null);
    const qs = new URLSearchParams({ code: stock.code, market: stock.market || "" });
    fetch(`/api/candles?${qs}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (Array.isArray(d?.candles) && d.candles.length >= 2) {
          cache.set(stock.code, { at: Date.now(), data: d });
          setData(d);
          setState("ready");
        } else setState("error");
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  }, [stock]);

  const close = useCallback(() => {
    setStock(null);
    setState("idle");
    const f = lastFocus.current;
    if (f && typeof f.focus === "function") f.focus();
  }, []);

  // 열려 있는 동안: Esc로 닫기, 뒤 화면 스크롤 막기
  useEffect(() => {
    if (!stock) return;
    const onKey = (e) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [stock, close]);

  if (!stock) return null;

  const candles = data?.candles || [];
  const lastI = candles.length - 1;
  const showI = hoverIdx ?? lastI;
  const bar = candles[showI];
  const prevBar = candles[showI - 1];
  const barChg = bar && prevBar ? ((bar.c - prevBar.c) / prevBar.c) * 100 : null;
  const last = candles[lastI];
  const lastChg = last && candles[lastI - 1] ? ((last.c - candles[lastI - 1].c) / candles[lastI - 1].c) * 100 : null;
  const marketLabel = data?.market || stock.market || "";

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(stock.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // 복사가 막힌 환경 — 조용히 넘어감
    }
  }

  return (
    <div className="sc-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="sc-modal" role="dialog" aria-modal="true" aria-labelledby="sc-title">
        <header className="sc-head">
          <div className="sc-titlebox">
            <h2 id="sc-title" className="sc-title">
              {stock.name || stock.code}
              <span className="sc-code mono">{stock.code}</span>
              {marketLabel && <span className="sc-mkt">{marketLabel}</span>}
            </h2>
            <p className="sc-price">
              <span className="mono">{last ? `${won(last.c)}원` : " "}</span>
              {lastChg !== null && <span className={`mono ${toneOf(lastChg)}`}>{pctText(lastChg)}</span>}
            </p>
          </div>
          <button ref={closeRef} type="button" className="sc-close" onClick={close} aria-label="차트 닫기">
            <X size={18} />
          </button>
        </header>

        <p className="sc-ohlc mono" aria-live="polite">
          {bar ? (
            <>
              <b>{shortDate(bar.d)}</b>
              {bar.d === kstToday() && <span className="sc-today">오늘</span>}
              {" · "}시 {won(bar.o)} 고 <span className="up">{won(bar.h)}</span> 저 <span className="down">{won(bar.l)}</span> 종{" "}
              <b>{won(bar.c)}</b>
              {barChg !== null && <span className={toneOf(barChg)}> ({pctText(barChg)})</span>}
              {" · "}거래량 {volText(bar.v)}
            </>
          ) : (
            " "
          )}
        </p>

        {state === "loading" && <div className="sc-skel" aria-label="차트 불러오는 중" />}
        {state === "error" && (
          <div className="sc-empty">
            차트 데이터를 받아오지 못했어요.
            <br />
            잠시 뒤 다시 눌러 주세요.
          </div>
        )}
        {state === "ready" && <CandleChart key={stock.code} all={candles} onHover={setHoverIdx} />}

        <div className="sc-legend">
          <span>
            <i className="sc-key ma5" /> 5일선
          </span>
          <span>
            <i className="sc-key ma20" /> 20일선
          </span>
          <span className="sc-note">최근 {Math.min(SHOW_BARS, candles.length || SHOW_BARS)}거래일 · 일봉 · 15~20분 지연</span>
        </div>

        <div className="sc-actions">
          <button type="button" className="sc-btn" onClick={copyCode}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "복사됨" : "코드 복사"}
          </button>
          {typeof stock.onFilter === "function" && (
            <button
              type="button"
              className="sc-btn"
              onClick={() => {
                stock.onFilter();
                close();
              }}
            >
              <Filter size={14} />
              관련 속보만 보기
            </button>
          )}
          <a
            className="sc-btn"
            href={`https://finance.naver.com/item/main.naver?code=${stock.code}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            네이버 증권
            <ExternalLink size={13} />
          </a>
        </div>
      </div>
    </div>
  );
}
