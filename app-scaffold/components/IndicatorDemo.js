"use client";

// [2026-10-29 고침] 옅게 칠해야 하는 띠·구름·막대가 진하게(불투명하게) 보이던 문제 —
//   opacity 값을 줘도 나타나기 애니메이션(demo-fade-in 등)이 끝나면 불투명도를 1로 덮어써서 생긴 일.
//   그래서 애니메이션이 건드리지 않는 fillOpacity(채우기 투명도)로 바꿨습니다.

import { useEffect, useId, useState } from "react";
import {
  SAMPLE_CANDLES,
  SAMPLE_VOLUME,
  PRICE_MIN,
  PRICE_MAX,
  priceToY,
  xAt,
  sma,
  bollinger,
  rsi,
  stochasticK,
  macd,
  obv,
  disparity,
  simpleSar,
  ichimoku,
  groupCandles,
  findCrossovers,
  renkoBricks,
  threeLineBreak,
  kagiLine,
  swingPoints,
  envelope,
  donchianChannel,
  pivotLevels,
  superTrend,
  psychLine,
  adx,
  cci,
  williamsR,
  momentum,
  roc,
  pvt,
  adLine,
  volumeSma,
  demarkPivot,
  syntheticFlow,
} from "../lib/chartDemoData";

const N = SAMPLE_CANDLES.length;
// [2026-10-29 개편] 재성님: "차트 애니메이션도 너무 허접하지않아?? 좀 예술적으로 못만드나?"
//   → 모든 그림을 어두운 "트레이딩 화면" 무대(Stage) 위에 그립니다: 남색 그라데이션 바탕 + 은은한 빛 + 가는 격자.
//     캔들은 하나씩 솟아오르고, 선은 빛나며 그려진 뒤 끝점에서 맥박이 뜁니다. 색은 어두운 바탕에 맞춘 밝은 빨강·파랑·금색.
//   무대 안에서는 사이트 색 이름(--amber 등)을 무대 전용 색으로 바꿔 끼워서(globals.css .demo-stage),
//   기존 그림 코드는 그대로 두고 전부 새 색으로 그려집니다.
const UP = "#ff4d63"; // Korean convention: red = up (어두운 무대용 밝은 빨강)
const DOWN = "#3b8cff"; // blue = down (어두운 무대용 밝은 파랑)

// 무대 — 모든 그림의 바탕(어두운 그라데이션 + 오른쪽 위 은은한 금빛 + 가는 가로 격자)
function Stage({ h = 100, children }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const grid = [];
  for (let y = 12.5; y < Math.min(h, 100); y += 12.5) grid.push(y);
  return (
    <svg viewBox={`0 0 100 ${h}`} className="demo-svg demo-stage" style={{ aspectRatio: `100 / ${h}` }}>
      <defs>
        <linearGradient id={`${uid}bg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#151b31" />
          <stop offset="1" stopColor="#090c17" />
        </linearGradient>
        <radialGradient id={`${uid}glow`} cx="0.85" cy="0.1" r="0.75">
          <stop offset="0" stopColor="#ffc24b" stopOpacity="0.16" />
          <stop offset="1" stopColor="#ffc24b" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${uid}glow2`} cx="0.05" cy="0.95" r="0.6">
          <stop offset="0" stopColor="#3b8cff" stopOpacity="0.14" />
          <stop offset="1" stopColor="#3b8cff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="100" height={h} fill={`url(#${uid}bg)`} />
      <rect width="100" height={h} fill={`url(#${uid}glow)`} />
      <rect width="100" height={h} fill={`url(#${uid}glow2)`} />
      {grid.map((y) => (
        <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="#ffffff" strokeOpacity="0.05" strokeWidth="0.25" />
      ))}
      {children}
    </svg>
  );
}
const REVEAL_MS = 850; // how long the base chart takes to sweep in
const IND_DELAY = REVEAL_MS + 80; // indicators wait for the base chart to finish first

function linePath(values, toY, xFor = (i) => xAt(i)) {
  let d = "";
  values.forEach((v, i) => {
    if (v == null) return;
    const x = xFor(i);
    const y = toY(v, i);
    d += d === "" ? `M ${x} ${y}` : ` L ${x} ${y}`;
  });
  return d;
}

// Every demo is wrapped in this. Previously used an animated clip-path
// "sweep" reveal, but animating an SVG rect's width INSIDE a <clipPath>
// isn't reliably supported across browsers — some engines just never fire
// that animation, which permanently clips the content to zero width
// (invisible). A plain opacity fade is far more basic and universally
// supported, so this trades a bit of visual flourish for actually working.
function Reveal({ id, children }) {
  return <g className="demo-reveal-fade">{children}</g>;
}

function Candles() {
  return (
    <g>
      {SAMPLE_CANDLES.map((c, i) => {
        const x = xAt(i);
        const up = c.c >= c.o;
        const color = up ? UP : DOWN;
        const yHigh = priceToY(c.h);
        const yLow = priceToY(c.l);
        const yOpen = priceToY(c.o);
        const yClose = priceToY(c.c);
        const bodyTop = Math.min(yOpen, yClose);
        const bodyH = Math.max(Math.abs(yOpen - yClose), 0.6);
        // [2026-10-29] 캔들이 왼쪽부터 하나씩 솟아오름(demo-candle) + 둥근 몸통 + 은은한 빛(demo-glow)
        return (
          <g key={i} className="demo-candle" style={{ animationDelay: `${i * 32}ms`, color }}>
            <line x1={x} x2={x} y1={yHigh} y2={yLow} stroke={color} strokeWidth={0.45} strokeLinecap="round" />
            <rect x={x - 1.3} y={bodyTop} width={2.6} height={bodyH} rx={0.45} fill={color} className="demo-glow" />
          </g>
        );
      })}
    </g>
  );
}

// [2026-10-29] 선: 둥근 끝 + 빛나는 효과로 그려지고, 다 그려지면 끝점에서 맥박 뛰는 점
function AnimatedLine({ d, color, delay = IND_DELAY, dash = false, width = 1.1 }) {
  const m = String(d || "").match(/([\d.]+)\s+([\d.]+)\s*$/);
  return (
    <g>
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`demo-draw-line demo-glow ${dash ? "demo-dash" : ""}`}
        style={{ animationDelay: `${delay}ms`, color }}
      />
      {m && !dash && (
        <g className="demo-end" style={{ animationDelay: `${delay + 700}ms` }}>
          <circle cx={m[1]} cy={m[2]} r={2.4} fill={color} className="demo-end-ring" style={{ animationDelay: `${delay + 700}ms` }} />
          <circle cx={m[1]} cy={m[2]} r={0.95} fill={color} stroke="#0b0f1d" strokeWidth={0.35} />
        </g>
      )}
    </g>
  );
}

export default function IndicatorDemo({ visual }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [playKey, setPlayKey] = useState(0);
  useEffect(() => {
    setPlayKey((k) => k + 1);
  }, [visual]);

  const closes = SAMPLE_CANDLES.map((c) => c.c);
  const clipId = `${uid}-reveal`;

  if (visual.type === "timeframe-compare") {
    const weekly = groupCandles(SAMPLE_CANDLES, 4);
    const dailyXAt = (i) => xAt(i, N, 100, 4);
    const weeklyXAt = (i) => xAt(i, weekly.length, 100, 6);
    return (
      <div>
        <p className="guide-mini-label">일봉 — 하루에 캔들 1개 (24개)</p>
        <div className="demo-frame" style={{ paddingTop: "60%" }}>
          <Stage h={60}>
            <Reveal id={`${clipId}-a`} height={60}>
              {SAMPLE_CANDLES.map((c, i) => {
                const x = dailyXAt(i);
                const up = c.c >= c.o;
                const color = up ? UP : DOWN;
                const yHigh = 60 - ((c.h - 42) / 45) * 56 - 2;
                const yLow = 60 - ((c.l - 42) / 45) * 56 - 2;
                const yOpen = 60 - ((c.o - 42) / 45) * 56 - 2;
                const yClose = 60 - ((c.c - 42) / 45) * 56 - 2;
                return (
                  <g key={i}>
                    <line x1={x} x2={x} y1={yHigh} y2={yLow} stroke={color} strokeWidth={0.5} />
                    <rect x={x - 1.2} y={Math.min(yOpen, yClose)} width={2.4} height={Math.max(Math.abs(yOpen - yClose), 0.6)} fill={color} />
                  </g>
                );
              })}
            </Reveal>
          </Stage>
        </div>
        <p className="guide-mini-label" style={{ marginTop: 10 }}>주봉 느낌 — 4일씩 묶어서 캔들 1개 (6개)</p>
        <div className="demo-frame" style={{ paddingTop: "60%" }}>
          <Stage h={60}>
            <Reveal id={`${clipId}-b`} height={60}>
              {weekly.map((c, i) => {
                const x = weeklyXAt(i);
                const up = c.c >= c.o;
                const color = up ? UP : DOWN;
                const yHigh = 60 - ((c.h - 42) / 45) * 56 - 2;
                const yLow = 60 - ((c.l - 42) / 45) * 56 - 2;
                const yOpen = 60 - ((c.o - 42) / 45) * 56 - 2;
                const yClose = 60 - ((c.c - 42) / 45) * 56 - 2;
                return (
                  <g key={i}>
                    <line x1={x} x2={x} y1={yHigh} y2={yLow} stroke={color} strokeWidth={0.9} />
                    <rect x={x - 3.2} y={Math.min(yOpen, yClose)} width={6.4} height={Math.max(Math.abs(yOpen - yClose), 0.6)} fill={color} />
                  </g>
                );
              })}
            </Reveal>
          </Stage>
        </div>
      </div>
    );
  }

  // ---- chart-type variants (replace the candle rendering itself) ----
  if (visual.type === "chartform") {
    if (visual.form === "line") {
      return (
        <Stage key={playKey}>
          <Reveal id={clipId}>
            <AnimatedLine d={linePath(closes, (v) => priceToY(v))} color="var(--amber)" delay={0} width={1.4} />
          </Reveal>
        </Stage>
      );
    }
    if (visual.form === "area") {
      const d = linePath(closes, (v) => priceToY(v));
      const areaD = `${d} L ${xAt(N - 1)} 96 L ${xAt(0)} 96 Z`;
      return (
        <Stage key={playKey}>
          <Reveal id={clipId}>
            <path d={areaD} fill="var(--amber-tint)" />
            <AnimatedLine d={d} color="var(--amber)" delay={0} width={1.4} />
          </Reveal>
        </Stage>
      );
    }
    if (visual.form === "bar") {
      return (
        <Stage key={playKey}>
          <Reveal id={clipId}>
            {SAMPLE_CANDLES.map((c, i) => {
              const x = xAt(i);
              const up = c.c >= c.o;
              const color = up ? UP : DOWN;
              return (
                <g key={i}>
                  <line x1={x} x2={x} y1={priceToY(c.h)} y2={priceToY(c.l)} stroke={color} strokeWidth={0.6} />
                  <line x1={x - 1.2} x2={x} y1={priceToY(c.o)} y2={priceToY(c.o)} stroke={color} strokeWidth={0.6} />
                  <line x1={x} x2={x + 1.2} y1={priceToY(c.c)} y2={priceToY(c.c)} stroke={color} strokeWidth={0.6} />
                </g>
              );
            })}
          </Reveal>
        </Stage>
      );
    }
    if (visual.form === "heikin") {
      const ha = [];
      SAMPLE_CANDLES.forEach((c, i) => {
        const prevHa = ha[i - 1] || c;
        const haClose = (c.o + c.h + c.l + c.c) / 4;
        const haOpen = i === 0 ? (c.o + c.c) / 2 : (prevHa.o + prevHa.c) / 2;
        ha.push({ o: haOpen, c: haClose, h: Math.max(c.h, haOpen, haClose), l: Math.min(c.l, haOpen, haClose) });
      });
      return (
        <Stage key={playKey}>
          <Reveal id={clipId}>
            {ha.map((c, i) => {
              const x = xAt(i);
              const up = c.c >= c.o;
              const color = up ? UP : DOWN;
              const bodyTop = Math.min(priceToY(c.o), priceToY(c.c));
              const bodyH = Math.max(Math.abs(priceToY(c.o) - priceToY(c.c)), 0.6);
              return (
                <g key={i}>
                  <line x1={x} x2={x} y1={priceToY(c.h)} y2={priceToY(c.l)} stroke={color} strokeWidth={0.5} />
                  <rect x={x - 1.3} y={bodyTop} width={2.6} height={bodyH} fill={color} rx={0.3} />
                </g>
              );
            })}
          </Reveal>
        </Stage>
      );
    }

    if (visual.form === "renko") {
      const bricks = renkoBricks(closes, 3);
      const bw = 90 / bricks.length;
      return (
        <Stage key={playKey}>
          <Reveal id={clipId}>
            {bricks.map((b, i) => {
              const color = b.up ? UP : DOWN;
              const top = priceToY(Math.max(b.o, b.c));
              const h = Math.abs(priceToY(b.o) - priceToY(b.c));
              return <rect key={i} x={5 + i * bw} y={top} width={bw * 0.85} height={h} fill={color} stroke="var(--bg)" strokeWidth={0.3} />;
            })}
          </Reveal>
        </Stage>
      );
    }

    if (visual.form === "pnf") {
      const bricks = renkoBricks(closes, 3);
      const cols = [];
      for (const b of bricks) {
        const last = cols[cols.length - 1];
        if (last && last.up === b.up) last.boxes.push(b.c);
        else cols.push({ up: b.up, boxes: [b.c] });
      }
      const colW = 88 / cols.length;
      return (
        <Stage key={playKey}>
          <Reveal id={clipId}>
            {cols.map((col, ci) => {
              const color = col.up ? UP : DOWN;
              const cx = 6 + ci * colW + colW / 2;
              return col.boxes.map((price, bi) => (
                <text key={bi} x={cx} y={priceToY(price) + 1.4} fontSize={colW * 0.75} textAnchor="middle" fill={color} fontWeight="700">
                  {col.up ? "X" : "O"}
                </text>
              ));
            })}
          </Reveal>
        </Stage>
      );
    }

    if (visual.form === "threeline") {
      const lines = threeLineBreak(closes);
      const bw = 90 / lines.length;
      return (
        <Stage key={playKey}>
          <Reveal id={clipId}>
            {lines.map((b, i) => {
              const color = b.up ? UP : DOWN;
              const top = priceToY(Math.max(b.o, b.c));
              const h = Math.max(Math.abs(priceToY(b.o) - priceToY(b.c)), 0.5);
              return <rect key={i} x={5 + i * bw} y={top} width={bw * 0.85} height={h} fill={color} stroke="var(--bg)" strokeWidth={0.3} />;
            })}
          </Reveal>
        </Stage>
      );
    }

    if (visual.form === "kagi") {
      const pts = kagiLine(closes, 3);
      let d = "";
      pts.forEach((p, i) => {
        const x = xAt(p.i);
        const y = priceToY(p.price);
        d += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
      });
      return (
        <Stage key={playKey}>
          <Reveal id={clipId}>
            <path d={d} fill="none" stroke={UP} strokeWidth={1.6} strokeLinejoin="round" />
          </Reveal>
        </Stage>
      );
    }

    if (visual.form === "swing") {
      const pts = swingPoints(SAMPLE_CANDLES, 4);
      let d = "";
      pts.forEach((p, i) => {
        const x = xAt(p.i);
        const y = priceToY(p.price);
        d += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
      });
      return (
        <Stage key={playKey}>
          <Reveal id={clipId}>
            <Candles />
          </Reveal>
          <AnimatedLine d={d} color={UP} delay={IND_DELAY} width={1.4} />
          {pts.map((p, i) => (
            <circle key={i} cx={xAt(p.i)} cy={priceToY(p.price)} r={1.2} fill={UP} className="demo-dot-pop" style={{ animationDelay: `${IND_DELAY + i * 100}ms` }} />
          ))}
        </Stage>
      );
    }

    return (
      <Stage key={playKey}>
        <Reveal id={clipId}>
          <Candles />
        </Reveal>
      </Stage>
    );
  }

  // ---- overlays drawn on top of the candles ----
  if (visual.type === "overlay-line") {
    const period = visual.period || 6;
    const line = sma(closes, period);
    const step = (xAt(N - 1) - xAt(0)) / (N - 1);
    const windowW = step * (period - 1) + 2.6;
    const startX = xAt(0) - 1.3;
    const endX = xAt(N - period) - 1.3;
    return (
      <Stage key={playKey}>
        <Reveal id={clipId}>
          <Candles />
        </Reveal>
        <rect y={priceToY(PRICE_MAX)} width={windowW} height={priceToY(PRICE_MIN) - priceToY(PRICE_MAX)} fill="var(--amber)" fillOpacity={0.24}>
          <animate attributeName="x" from={startX} to={endX} begin={`${IND_DELAY / 1000}s`} dur="0.75s" fill="freeze" />
        </rect>
        <AnimatedLine d={linePath(line, (v) => priceToY(v))} color="var(--amber)" width={1.3} />
      </Stage>
    );
  }

  if (visual.type === "overlay-band") {
    const calc = visual.calc || "bollinger";
    let upper, mid, lower;
    if (calc === "envelope") ({ upper, mid, lower } = envelope(closes, 10, 0.06));
    else if (calc === "donchian") ({ upper, mid, lower } = donchianChannel(SAMPLE_CANDLES, 10));
    else ({ upper, mid, lower } = bollinger(closes, 10, 1.6));

    let squeezeIdx = -1, squeezeMin = Infinity;
    if (calc === "bollinger") {
      upper.forEach((u, i) => {
        if (u == null || lower[i] == null) return;
        const w = u - lower[i];
        if (w < squeezeMin) { squeezeMin = w; squeezeIdx = i; }
      });
    }
    return (
      <Stage key={playKey}>
        <Reveal id={clipId}>
          <Candles />
        </Reveal>
        <AnimatedLine d={linePath(upper, (v) => priceToY(v))} color="var(--amber)" delay={IND_DELAY} dash />
        {mid && <AnimatedLine d={linePath(mid, (v) => priceToY(v))} color="var(--ink-muted)" delay={IND_DELAY + 120} />}
        <AnimatedLine d={linePath(lower, (v) => priceToY(v))} color="var(--amber)" delay={IND_DELAY} dash />
        {squeezeIdx > -1 && (
          <g className="demo-fade-in" style={{ animationDelay: `${IND_DELAY + 500}ms` }}>
            <rect
              x={xAt(squeezeIdx) - 3}
              y={priceToY(upper[squeezeIdx]) - 2}
              width={6}
              height={priceToY(lower[squeezeIdx]) - priceToY(upper[squeezeIdx]) + 4}
              fill="none"
              stroke="var(--up)"
              strokeWidth={0.6}
              rx={2}
            />
            <text x={xAt(squeezeIdx)} y={priceToY(upper[squeezeIdx]) - 4} fontSize={3.6} textAnchor="middle" fill="var(--up)" fontWeight="700">
              스퀴즈
            </text>
          </g>
        )}
      </Stage>
    );
  }

  if (visual.type === "overlay-cloud") {
    const { tenkan, kijun, senkouA, senkouB, total } = ichimoku(SAMPLE_CANDLES);
    const xProj = (i) => xAt(i, total);
    const toY = (v) => priceToY(v);

    // Build the filled cloud polygon: senkouA forward, then senkouB backward.
    const aPts = [];
    const bPts = [];
    for (let i = 0; i < total; i++) {
      if (senkouA[i] != null) aPts.push([xProj(i), toY(senkouA[i])]);
      if (senkouB[i] != null) bPts.push([xProj(i), toY(senkouB[i])]);
    }
    const cloudUp = senkouA[total - 1] >= senkouB[total - 1];
    const cloudPath =
      aPts.length && bPts.length
        ? `M ${aPts.map((p) => p.join(",")).join(" L ")} L ${bPts
            .slice()
            .reverse()
            .map((p) => p.join(","))
            .join(" L ")} Z`
        : "";

    return (
      <Stage key={playKey}>
        <Reveal id={clipId}>
          <Candles />
        </Reveal>
        {cloudPath && (
          <path
            d={cloudPath}
            fill={cloudUp ? UP : DOWN}
            fillOpacity={0.3}
            className="demo-fade-in"
            style={{ animationDelay: `${IND_DELAY}ms` }}
          />
        )}
        <AnimatedLine
          d={linePath(senkouA, toY, xProj)}
          color={cloudUp ? UP : DOWN}
          delay={IND_DELAY}
          width={0.6}
          dash
        />
        <AnimatedLine
          d={linePath(senkouB, toY, xProj)}
          color={cloudUp ? UP : DOWN}
          delay={IND_DELAY}
          width={0.6}
          dash
        />
        <AnimatedLine d={linePath(tenkan, toY)} color={UP} delay={IND_DELAY + 150} width={1} />
        <AnimatedLine d={linePath(kijun, toY)} color={DOWN} delay={IND_DELAY + 220} width={1} />
      </Stage>
    );
  }

  if (visual.type === "overlay-dots") {
    const sar = simpleSar(SAMPLE_CANDLES);
    return (
      <Stage key={playKey}>
        <Reveal id={clipId}>
          <Candles />
        </Reveal>
        {sar.map((s, i) => {
          const flipped = i > 0 && sar[i - 1].above !== s.above;
          return (
            <g key={i}>
              {flipped && (
                <line
                  x1={xAt(i)}
                  x2={xAt(i)}
                  y1={priceToY(sar[i - 1].price)}
                  y2={priceToY(s.price)}
                  stroke="var(--ink-muted)"
                  strokeWidth={0.3}
                  strokeDasharray="1 1"
                  className="demo-fade-in"
                  style={{ animationDelay: `${IND_DELAY + i * 55}ms` }}
                />
              )}
              <circle
                cx={xAt(i)}
                cy={priceToY(s.price)}
                r={flipped ? 1.3 : 0.85}
                fill={s.above ? DOWN : UP}
                className={flipped ? "demo-dot-pop demo-dot-flip" : "demo-dot-pop"}
                style={{ animationDelay: `${IND_DELAY + i * 55}ms` }}
              />
            </g>
          );
        })}
      </Stage>
    );
  }

  if (visual.type === "overlay-zone") {
    const zones = [{ p: 53, h: 6 }, { p: 66, h: 4 }];
    return (
      <Stage key={playKey}>
        <Reveal id={clipId}>
          <Candles />
        </Reveal>
        {zones.map((z, i) => (
          <rect
            key={i}
            x={2}
            y={priceToY(z.p + z.h / 2)}
            width={96}
            height={priceToY(z.p - z.h / 2) - priceToY(z.p + z.h / 2)}
            fill="var(--amber)"
            fillOpacity={0.24}
            className="demo-fade-in"
            style={{ animationDelay: `${IND_DELAY + i * 250}ms` }}
          />
        ))}
      </Stage>
    );
  }

  if (visual.type === "overlay-hlines") {
    const { r1, p, s1 } = visual.calc === "demark" ? demarkPivot(SAMPLE_CANDLES) : pivotLevels(SAMPLE_CANDLES);
    const lines = [
      { v: r1, label: "R1 저항", color: UP },
      { v: p, label: "P 기준", color: "var(--ink-muted)" },
      { v: s1, label: "S1 지지", color: DOWN },
    ];
    return (
      <Stage key={playKey}>
        <Reveal id={clipId}>
          <Candles />
        </Reveal>
        {lines.map((l, i) => (
          <g key={i} className="demo-fade-in" style={{ animationDelay: `${IND_DELAY + i * 150}ms` }}>
            <line x1={2} x2={98} y1={priceToY(l.v)} y2={priceToY(l.v)} stroke={l.color} strokeDasharray="2 2" strokeWidth={0.6} />
            <text x={4} y={priceToY(l.v) - 1.5} fontSize={3.4} fill={l.color} fontWeight="700">{l.label}</text>
          </g>
        ))}
      </Stage>
    );
  }

  if (visual.type === "overlay-trail") {
    const trail = superTrend(SAMPLE_CANDLES);
    let segments = [];
    let current = [trail[0]];
    for (let i = 1; i < trail.length; i++) {
      if (trail[i].up === trail[i - 1].up) {
        current.push(trail[i]);
      } else {
        segments.push({ up: current[0].up, points: current, startIdx: i - current.length });
        current = [trail[i]];
      }
    }
    segments.push({ up: current[0].up, points: current, startIdx: trail.length - current.length });

    return (
      <Stage key={playKey}>
        <Reveal id={clipId}>
          <Candles />
        </Reveal>
        {segments.map((seg, si) => {
          let d = "";
          seg.points.forEach((pt, j) => {
            const x = xAt(seg.startIdx + j);
            const y = priceToY(pt.price);
            d += j === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
          });
          return <AnimatedLine key={si} d={d} color={seg.up ? UP : DOWN} width={1.6} delay={IND_DELAY + si * 120} />;
        })}
      </Stage>
    );
  }

  // ---- separate lower pane (oscillators, volume, MACD) ----
  if (visual.type === "pane-bars") {
    const max = Math.max(...SAMPLE_VOLUME);
    return (
      <Stage h={130} key={playKey}>
        <Reveal id={clipId} height={130}>
          <Candles />
          <line x1={2} x2={98} y1={106} y2={106} stroke="var(--border)" strokeWidth={0.4} />
        </Reveal>
        {SAMPLE_VOLUME.map((v, i) => {
          const x = xAt(i);
          const h = (v / max) * 24;
          const up = SAMPLE_CANDLES[i].c >= SAMPLE_CANDLES[i].o;
          return (
            <rect
              key={i}
              x={x - 1.2}
              y={106 - h}
              width={2.4}
              height={h}
              fill={up ? UP : DOWN}
              fillOpacity={0.8}
              className="demo-bar-grow"
              style={{ animationDelay: `${IND_DELAY + i * 22}ms`, transformOrigin: `${x}px 106px` }}
            />
          );
        })}
      </Stage>
    );
  }

  if (visual.type === "pane-oscillator") {
    const calc = visual.calc;
    let series, scaleMin = 0, scaleMax = 100;
    if (calc === "rsi") series = rsi(closes, 10);
    else if (calc === "stochastic") series = stochasticK(SAMPLE_CANDLES, 9);
    else if (calc === "psych") series = psychLine(SAMPLE_CANDLES, 10);
    else if (calc === "adx") series = adx(SAMPLE_CANDLES, 6);
    else if (calc === "williams") { series = williamsR(SAMPLE_CANDLES, 9); scaleMin = -100; scaleMax = 0; }
    else series = rsi(closes, 10);

    const [lo, hi] = visual.bands;
    const toY = (v) => 106 + ((scaleMax - v) / (scaleMax - scaleMin)) * 24;
    return (
      <Stage h={130} key={playKey}>
        <Reveal id={clipId} height={130}>
          <Candles />
          <line x1={2} x2={98} y1={106} y2={106} stroke="var(--border)" strokeWidth={0.4} />
        </Reveal>
        {hi != null && <rect x={2} y={106} width={96} height={toY(hi) - 106} fill={UP} fillOpacity={0.14} className="demo-fade-in" style={{ animationDelay: `${IND_DELAY}ms` }} />}
        {lo != null && <rect x={2} y={toY(lo)} width={96} height={130 - toY(lo)} fill={DOWN} fillOpacity={0.14} className="demo-fade-in" style={{ animationDelay: `${IND_DELAY}ms` }} />}
        {hi != null && <line x1={2} x2={98} y1={toY(hi)} y2={toY(hi)} stroke="var(--border)" strokeDasharray="2 2" strokeWidth={0.4} />}
        {lo != null && <line x1={2} x2={98} y1={toY(lo)} y2={toY(lo)} stroke="var(--border)" strokeDasharray="2 2" strokeWidth={0.4} />}
        <AnimatedLine d={linePath(series, toY)} color="var(--amber)" width={1.2} />
      </Stage>
    );
  }

  if (visual.type === "pane-oscillator-center") {
    const calc = visual.calc || "disparity";
    let series, centerVal = 0;
    if (calc === "disparity") { series = disparity(closes, 10); centerVal = 100; }
    else if (calc === "cci") series = cci(SAMPLE_CANDLES, 10);
    else if (calc === "momentum") series = momentum(closes, 8);
    else if (calc === "roc") series = roc(closes, 8);
    else series = disparity(closes, 10);

    const vals = series.filter((v) => v != null);
    const min = Math.min(...vals, centerVal), max = Math.max(...vals, centerVal);
    const toY = (v) => 130 - ((v - min) / (max - min || 1)) * 22 - 4;
    const zeroY = toY(centerVal);
    return (
      <Stage h={130} key={playKey}>
        <Reveal id={clipId} height={130}>
          <Candles />
          <line x1={2} x2={98} y1={106} y2={106} stroke="var(--border)" strokeWidth={0.4} />
        </Reveal>
        <rect x={2} y={106} width={96} height={Math.max(zeroY - 106, 0)} fill={UP} fillOpacity={0.14} className="demo-fade-in" style={{ animationDelay: `${IND_DELAY}ms` }} />
        <rect x={2} y={zeroY} width={96} height={Math.max(130 - zeroY, 0)} fill={DOWN} fillOpacity={0.14} className="demo-fade-in" style={{ animationDelay: `${IND_DELAY}ms` }} />
        <line x1={2} x2={98} y1={zeroY} y2={zeroY} stroke="var(--border)" strokeDasharray="2 2" strokeWidth={0.4} />
        <AnimatedLine d={linePath(series, toY)} color="var(--amber)" width={1.2} />
      </Stage>
    );
  }

  if (visual.type === "pane-line") {
    const calc = visual.calc;
    let series;
    if (calc === "obv") series = obv(SAMPLE_CANDLES, SAMPLE_VOLUME);
    else if (calc === "pvt") series = pvt(SAMPLE_CANDLES, SAMPLE_VOLUME);
    else if (calc === "adline") series = adLine(SAMPLE_CANDLES, SAMPLE_VOLUME);
    else if (calc === "synthetic") series = syntheticFlow(visual.seed || 1, visual.bias ?? 0.6);
    else series = disparity(closes, 10);

    const vals = series.filter((v) => v != null);
    const min = Math.min(...vals), max = Math.max(...vals);
    const toY = (v) => 130 - ((v - min) / (max - min || 1)) * 22 - 4;
    return (
      <Stage h={130} key={playKey}>
        <Reveal id={clipId} height={130}>
          <Candles />
          <line x1={2} x2={98} y1={106} y2={106} stroke="var(--border)" strokeWidth={0.4} />
        </Reveal>
        <AnimatedLine d={linePath(series, toY)} color="var(--amber)" width={1.2} />
      </Stage>
    );
  }

  if (visual.type === "pane-bars-avg") {
    const max = Math.max(...SAMPLE_VOLUME);
    const avg = volumeSma(SAMPLE_VOLUME, 5);
    const toY = (v) => 130 - (v / max) * 24;
    return (
      <Stage h={130} key={playKey}>
        <Reveal id={clipId} height={130}>
          <Candles />
          <line x1={2} x2={98} y1={106} y2={106} stroke="var(--border)" strokeWidth={0.4} />
        </Reveal>
        {SAMPLE_VOLUME.map((v, i) => {
          const x = xAt(i);
          const h = (v / max) * 24;
          const up = SAMPLE_CANDLES[i].c >= SAMPLE_CANDLES[i].o;
          return (
            <rect
              key={i}
              x={x - 1.2}
              y={106 - h}
              width={2.4}
              height={h}
              fill={up ? UP : DOWN}
              fillOpacity={0.5}
              className="demo-bar-grow"
              style={{ animationDelay: `${IND_DELAY + i * 22}ms`, transformOrigin: `${x}px 106px` }}
            />
          );
        })}
        <AnimatedLine d={linePath(avg, toY)} color="var(--amber)" delay={IND_DELAY + 300} width={1.3} />
      </Stage>
    );
  }

  if (visual.type === "pane-macd") {
    const { line, signal, histogram } = macd(closes);
    const vals = [...line, ...signal].filter((v) => v != null);
    const min = Math.min(...vals), max = Math.max(...vals);
    const toY = (v) => 130 - ((v - min) / (max - min || 1)) * 22 - 4;
    return (
      <Stage h={130} key={playKey}>
        <Reveal id={clipId} height={130}>
          <Candles />
          <line x1={2} x2={98} y1={106} y2={106} stroke="var(--border)" strokeWidth={0.4} />
        </Reveal>
        {histogram.map((v, i) => {
          if (v == null) return null;
          const x = xAt(i);
          const zero = toY(0);
          const y = toY(v);
          const h = Math.max(Math.abs(zero - y), 0.5);
          return (
            <rect
              key={i}
              x={x - 1}
              y={Math.min(zero, y)}
              width={2}
              height={h}
              fill={v >= 0 ? UP : DOWN}
              fillOpacity={0.55}
              className="demo-fade-in"
              style={{ animationDelay: `${IND_DELAY + i * 18}ms` }}
            />
          );
        })}
        <AnimatedLine d={linePath(line, toY)} color="var(--amber)" delay={IND_DELAY + 200} width={1.2} />
        <AnimatedLine d={linePath(signal, toY)} color="var(--down)" delay={IND_DELAY + 320} width={1.2} />
        {findCrossovers(line, signal).map((cr, i) => (
          <g key={i} className="demo-dot-pop demo-dot-flip" style={{ animationDelay: `${IND_DELAY + 650 + i * 100}ms` }}>
            <circle cx={xAt(cr.index)} cy={toY(line[cr.index])} r={1.4} fill={cr.goldenCross ? UP : DOWN} />
            <text
              x={xAt(cr.index)}
              y={toY(line[cr.index]) + (cr.goldenCross ? 5.5 : -3)}
              fontSize={3.4}
              textAnchor="middle"
              fill={cr.goldenCross ? UP : DOWN}
              fontWeight="700"
            >
              {cr.goldenCross ? "골든크로스" : "데드크로스"}
            </text>
          </g>
        ))}
      </Stage>
    );
  }

  return null;
}
