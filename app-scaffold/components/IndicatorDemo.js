"use client";

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
const UP = "#c23b3b"; // Korean convention: red = up
const DOWN = "#2e5fa3"; // blue = down
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

// Every demo is wrapped in this — a rectangular clip that sweeps open
// left-to-right, so the base chart reads as "being drawn" as one continuous
// motion instead of a scattered per-element fade.
function Reveal({ id, children, height = 100 }) {
  return (
    <>
      <defs>
        <clipPath id={id}>
          <rect x={0} y={0} width={0} height={height} className="demo-reveal-rect" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>{children}</g>
    </>
  );
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
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={yHigh} y2={yLow} stroke={color} strokeWidth={0.5} />
            <rect x={x - 1.3} y={bodyTop} width={2.6} height={bodyH} fill={color} />
          </g>
        );
      })}
    </g>
  );
}

function AnimatedLine({ d, color, delay = IND_DELAY, dash = false, width = 1.1 }) {
  return (
    <path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={width}
      className="demo-draw-line"
      strokeDasharray={dash ? "3 2" : undefined}
      style={{ animationDelay: `${delay}ms` }}
    />
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
        <svg viewBox="0 0 100 60" className="demo-svg">
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
        </svg>
        <p className="guide-mini-label" style={{ marginTop: 10 }}>주봉 느낌 — 4일씩 묶어서 캔들 1개 (6개)</p>
        <svg viewBox="0 0 100 60" className="demo-svg">
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
        </svg>
      </div>
    );
  }

  // ---- chart-type variants (replace the candle rendering itself) ----
  if (visual.type === "chartform") {
    if (visual.form === "line") {
      return (
        <svg viewBox="0 0 100 100" className="demo-svg" key={playKey}>
          <Reveal id={clipId}>
            <AnimatedLine d={linePath(closes, (v) => priceToY(v))} color="var(--amber)" delay={0} width={1.4} />
          </Reveal>
        </svg>
      );
    }
    if (visual.form === "area") {
      const d = linePath(closes, (v) => priceToY(v));
      const areaD = `${d} L ${xAt(N - 1)} 96 L ${xAt(0)} 96 Z`;
      return (
        <svg viewBox="0 0 100 100" className="demo-svg" key={playKey}>
          <Reveal id={clipId}>
            <path d={areaD} fill="var(--amber-tint)" />
            <AnimatedLine d={d} color="var(--amber)" delay={0} width={1.4} />
          </Reveal>
        </svg>
      );
    }
    if (visual.form === "bar") {
      return (
        <svg viewBox="0 0 100 100" className="demo-svg" key={playKey}>
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
        </svg>
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
        <svg viewBox="0 0 100 100" className="demo-svg" key={playKey}>
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
        </svg>
      );
    }

    if (visual.form === "renko") {
      const bricks = renkoBricks(closes, 3);
      const bw = 90 / bricks.length;
      return (
        <svg viewBox="0 0 100 100" className="demo-svg" key={playKey}>
          <Reveal id={clipId}>
            {bricks.map((b, i) => {
              const color = b.up ? UP : DOWN;
              const top = priceToY(Math.max(b.o, b.c));
              const h = Math.abs(priceToY(b.o) - priceToY(b.c));
              return <rect key={i} x={5 + i * bw} y={top} width={bw * 0.85} height={h} fill={color} stroke="var(--bg)" strokeWidth={0.3} />;
            })}
          </Reveal>
        </svg>
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
        <svg viewBox="0 0 100 100" className="demo-svg" key={playKey}>
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
        </svg>
      );
    }

    if (visual.form === "threeline") {
      const lines = threeLineBreak(closes);
      const bw = 90 / lines.length;
      return (
        <svg viewBox="0 0 100 100" className="demo-svg" key={playKey}>
          <Reveal id={clipId}>
            {lines.map((b, i) => {
              const color = b.up ? UP : DOWN;
              const top = priceToY(Math.max(b.o, b.c));
              const h = Math.max(Math.abs(priceToY(b.o) - priceToY(b.c)), 0.5);
              return <rect key={i} x={5 + i * bw} y={top} width={bw * 0.85} height={h} fill={color} stroke="var(--bg)" strokeWidth={0.3} />;
            })}
          </Reveal>
        </svg>
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
        <svg viewBox="0 0 100 100" className="demo-svg" key={playKey}>
          <Reveal id={clipId}>
            <path d={d} fill="none" stroke={UP} strokeWidth={1.6} strokeLinejoin="round" />
          </Reveal>
        </svg>
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
        <svg viewBox="0 0 100 100" className="demo-svg" key={playKey}>
          <Reveal id={clipId}>
            <Candles />
          </Reveal>
          <AnimatedLine d={d} color={UP} delay={IND_DELAY} width={1.4} />
          {pts.map((p, i) => (
            <circle key={i} cx={xAt(p.i)} cy={priceToY(p.price)} r={1.2} fill={UP} className="demo-dot-pop" style={{ animationDelay: `${IND_DELAY + i * 100}ms` }} />
          ))}
        </svg>
      );
    }

    return (
      <svg viewBox="0 0 100 100" className="demo-svg" key={playKey}>
        <Reveal id={clipId}>
          <Candles />
        </Reveal>
      </svg>
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
      <svg viewBox="0 0 100 100" className="demo-svg" key={playKey}>
        <Reveal id={clipId}>
          <Candles />
        </Reveal>
        <rect y={priceToY(PRICE_MAX)} width={windowW} height={priceToY(PRICE_MIN) - priceToY(PRICE_MAX)} fill="var(--amber)" opacity={0.16}>
          <animate attributeName="x" from={startX} to={endX} begin={`${IND_DELAY / 1000}s`} dur="0.75s" fill="freeze" />
        </rect>
        <AnimatedLine d={linePath(line, (v) => priceToY(v))} color="var(--amber)" width={1.3} />
      </svg>
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
      <svg viewBox="0 0 100 100" className="demo-svg" key={playKey}>
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
      </svg>
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
      <svg viewBox="0 0 100 100" className="demo-svg" key={playKey}>
        <Reveal id={clipId}>
          <Candles />
        </Reveal>
        {cloudPath && (
          <path
            d={cloudPath}
            fill={cloudUp ? UP : DOWN}
            opacity={0.14}
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
      </svg>
    );
  }

  if (visual.type === "overlay-dots") {
    const sar = simpleSar(SAMPLE_CANDLES);
    return (
      <svg viewBox="0 0 100 100" className="demo-svg" key={playKey}>
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
      </svg>
    );
  }

  if (visual.type === "overlay-zone") {
    const zones = [{ p: 53, h: 6 }, { p: 66, h: 4 }];
    return (
      <svg viewBox="0 0 100 100" className="demo-svg" key={playKey}>
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
            opacity={0.16}
            className="demo-fade-in"
            style={{ animationDelay: `${IND_DELAY + i * 250}ms` }}
          />
        ))}
      </svg>
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
      <svg viewBox="0 0 100 100" className="demo-svg" key={playKey}>
        <Reveal id={clipId}>
          <Candles />
        </Reveal>
        {lines.map((l, i) => (
          <g key={i} className="demo-fade-in" style={{ animationDelay: `${IND_DELAY + i * 150}ms` }}>
            <line x1={2} x2={98} y1={priceToY(l.v)} y2={priceToY(l.v)} stroke={l.color} strokeDasharray="2 2" strokeWidth={0.6} />
            <text x={4} y={priceToY(l.v) - 1.5} fontSize={3.4} fill={l.color} fontWeight="700">{l.label}</text>
          </g>
        ))}
      </svg>
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
      <svg viewBox="0 0 100 100" className="demo-svg" key={playKey}>
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
      </svg>
    );
  }

  // ---- separate lower pane (oscillators, volume, MACD) ----
  if (visual.type === "pane-bars") {
    const max = Math.max(...SAMPLE_VOLUME);
    return (
      <svg viewBox="0 0 100 130" className="demo-svg" key={playKey}>
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
              opacity={0.8}
              className="demo-bar-grow"
              style={{ animationDelay: `${IND_DELAY + i * 22}ms`, transformOrigin: `${x}px 106px` }}
            />
          );
        })}
      </svg>
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
      <svg viewBox="0 0 100 130" className="demo-svg" key={playKey}>
        <Reveal id={clipId} height={130}>
          <Candles />
          <line x1={2} x2={98} y1={106} y2={106} stroke="var(--border)" strokeWidth={0.4} />
        </Reveal>
        {hi != null && <rect x={2} y={106} width={96} height={toY(hi) - 106} fill={UP} opacity={0.08} className="demo-fade-in" style={{ animationDelay: `${IND_DELAY}ms` }} />}
        {lo != null && <rect x={2} y={toY(lo)} width={96} height={130 - toY(lo)} fill={DOWN} opacity={0.08} className="demo-fade-in" style={{ animationDelay: `${IND_DELAY}ms` }} />}
        {hi != null && <line x1={2} x2={98} y1={toY(hi)} y2={toY(hi)} stroke="var(--border)" strokeDasharray="2 2" strokeWidth={0.4} />}
        {lo != null && <line x1={2} x2={98} y1={toY(lo)} y2={toY(lo)} stroke="var(--border)" strokeDasharray="2 2" strokeWidth={0.4} />}
        <AnimatedLine d={linePath(series, toY)} color="var(--amber)" width={1.2} />
      </svg>
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
      <svg viewBox="0 0 100 130" className="demo-svg" key={playKey}>
        <Reveal id={clipId} height={130}>
          <Candles />
          <line x1={2} x2={98} y1={106} y2={106} stroke="var(--border)" strokeWidth={0.4} />
        </Reveal>
        <rect x={2} y={106} width={96} height={Math.max(zeroY - 106, 0)} fill={UP} opacity={0.08} className="demo-fade-in" style={{ animationDelay: `${IND_DELAY}ms` }} />
        <rect x={2} y={zeroY} width={96} height={Math.max(130 - zeroY, 0)} fill={DOWN} opacity={0.08} className="demo-fade-in" style={{ animationDelay: `${IND_DELAY}ms` }} />
        <line x1={2} x2={98} y1={zeroY} y2={zeroY} stroke="var(--border)" strokeDasharray="2 2" strokeWidth={0.4} />
        <AnimatedLine d={linePath(series, toY)} color="var(--amber)" width={1.2} />
      </svg>
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
      <svg viewBox="0 0 100 130" className="demo-svg" key={playKey}>
        <Reveal id={clipId} height={130}>
          <Candles />
          <line x1={2} x2={98} y1={106} y2={106} stroke="var(--border)" strokeWidth={0.4} />
        </Reveal>
        <AnimatedLine d={linePath(series, toY)} color="var(--amber)" width={1.2} />
      </svg>
    );
  }

  if (visual.type === "pane-bars-avg") {
    const max = Math.max(...SAMPLE_VOLUME);
    const avg = volumeSma(SAMPLE_VOLUME, 5);
    const toY = (v) => 130 - (v / max) * 24;
    return (
      <svg viewBox="0 0 100 130" className="demo-svg" key={playKey}>
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
              opacity={0.5}
              className="demo-bar-grow"
              style={{ animationDelay: `${IND_DELAY + i * 22}ms`, transformOrigin: `${x}px 106px` }}
            />
          );
        })}
        <AnimatedLine d={linePath(avg, toY)} color="var(--amber)" delay={IND_DELAY + 300} width={1.3} />
      </svg>
    );
  }

  if (visual.type === "pane-macd") {
    const { line, signal, histogram } = macd(closes);
    const vals = [...line, ...signal].filter((v) => v != null);
    const min = Math.min(...vals), max = Math.max(...vals);
    const toY = (v) => 130 - ((v - min) / (max - min || 1)) * 22 - 4;
    return (
      <svg viewBox="0 0 100 130" className="demo-svg" key={playKey}>
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
              opacity={0.55}
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
      </svg>
    );
  }

  return null;
}
