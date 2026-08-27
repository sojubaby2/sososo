"use client";

import { useEffect, useId, useState } from "react";
import {
  SAMPLE_CANDLES,
  SAMPLE_VOLUME,
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
    const line = sma(closes, visual.period || 6);
    return (
      <svg viewBox="0 0 100 100" className="demo-svg" key={playKey}>
        <Reveal id={clipId}>
          <Candles />
        </Reveal>
        <AnimatedLine d={linePath(line, (v) => priceToY(v))} color="var(--amber)" width={1.3} />
      </svg>
    );
  }

  if (visual.type === "overlay-band") {
    const { upper, mid, lower } = bollinger(closes, 10, 1.6);
    return (
      <svg viewBox="0 0 100 100" className="demo-svg" key={playKey}>
        <Reveal id={clipId}>
          <Candles />
        </Reveal>
        <AnimatedLine d={linePath(upper, (v) => priceToY(v))} color="var(--amber)" delay={IND_DELAY} dash />
        <AnimatedLine d={linePath(mid, (v) => priceToY(v))} color="var(--ink-muted)" delay={IND_DELAY + 120} />
        <AnimatedLine d={linePath(lower, (v) => priceToY(v))} color="var(--amber)" delay={IND_DELAY} dash />
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
    const series = visual.calc === "rsi" ? rsi(closes, 10) : stochasticK(SAMPLE_CANDLES, 9);
    const [lo, hi] = visual.bands;
    const toY = (v) => 106 + ((100 - v) / 100) * 24;
    return (
      <svg viewBox="0 0 100 130" className="demo-svg" key={playKey}>
        <Reveal id={clipId} height={130}>
          <Candles />
          <line x1={2} x2={98} y1={106} y2={106} stroke="var(--border)" strokeWidth={0.4} />
        </Reveal>
        <line x1={2} x2={98} y1={toY(hi)} y2={toY(hi)} stroke="var(--border)" strokeDasharray="2 2" strokeWidth={0.4} />
        <line x1={2} x2={98} y1={toY(lo)} y2={toY(lo)} stroke="var(--border)" strokeDasharray="2 2" strokeWidth={0.4} />
        <AnimatedLine d={linePath(series, toY)} color="var(--amber)" width={1.2} />
      </svg>
    );
  }

  if (visual.type === "pane-line") {
    const series = visual.calc === "obv" ? obv(SAMPLE_CANDLES, SAMPLE_VOLUME) : disparity(closes, 10);
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

  if (visual.type === "pane-oscillator-center") {
    const series = disparity(closes, 10);
    const vals = series.filter((v) => v != null);
    const min = Math.min(...vals), max = Math.max(...vals);
    const toY = (v) => 130 - ((v - min) / (max - min || 1)) * 22 - 4;
    return (
      <svg viewBox="0 0 100 130" className="demo-svg" key={playKey}>
        <Reveal id={clipId} height={130}>
          <Candles />
          <line x1={2} x2={98} y1={106} y2={106} stroke="var(--border)" strokeWidth={0.4} />
        </Reveal>
        <line x1={2} x2={98} y1={toY(100)} y2={toY(100)} stroke="var(--border)" strokeDasharray="2 2" strokeWidth={0.4} />
        <AnimatedLine d={linePath(series, toY)} color="var(--amber)" width={1.2} />
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
      </svg>
    );
  }

  return null;
}
