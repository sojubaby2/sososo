"use client";

import { useEffect, useState } from "react";
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
} from "../lib/chartDemoData";

const N = SAMPLE_CANDLES.length;
const UP = "#c23b3b"; // Korean convention: red = up
const DOWN = "#2e5fa3"; // blue = down

function linePath(values, toY) {
  let d = "";
  values.forEach((v, i) => {
    if (v == null) return;
    const x = xAt(i);
    const y = toY(v, i);
    d += d === "" ? `M ${x} ${y}` : ` L ${x} ${y}`;
  });
  return d;
}

// The base candlestick chart every demo is drawn on top of.
function Candles({ dim = false }) {
  return (
    <g opacity={dim ? 0.35 : 1}>
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
          <g key={i} className="candle-fade" style={{ animationDelay: `${i * 28}ms` }}>
            <line x1={x} x2={x} y1={yHigh} y2={yLow} stroke={color} strokeWidth={0.5} />
            <rect x={x - 1.3} y={bodyTop} width={2.6} height={bodyH} fill={color} />
          </g>
        );
      })}
    </g>
  );
}

function AnimatedLine({ d, color, delay = 0, dash = false }) {
  return (
    <path
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={1.1}
      className="demo-draw-line"
      strokeDasharray={dash ? "3 2" : undefined}
      style={{ animationDelay: `${delay}ms` }}
    />
  );
}

export default function IndicatorDemo({ visual }) {
  const [playKey, setPlayKey] = useState(0);
  useEffect(() => {
    setPlayKey((k) => k + 1);
  }, [visual]);

  const closes = SAMPLE_CANDLES.map((c) => c.c);

  // ---- chart-type variants (replace the candle rendering itself) ----
  if (visual.type === "chartform") {
    if (visual.form === "line") {
      return (
        <svg viewBox="0 0 100 100" className="demo-svg" key={playKey}>
          <AnimatedLine d={linePath(closes, (v) => priceToY(v))} color="var(--amber)" />
        </svg>
      );
    }
    if (visual.form === "area") {
      const d = linePath(closes, (v) => priceToY(v));
      const areaD = `${d} L ${xAt(N - 1)} 96 L ${xAt(0)} 96 Z`;
      return (
        <svg viewBox="0 0 100 100" className="demo-svg" key={playKey}>
          <path d={areaD} fill="var(--amber-tint)" className="demo-fade-in" />
          <AnimatedLine d={d} color="var(--amber)" />
        </svg>
      );
    }
    if (visual.form === "bar") {
      return (
        <svg viewBox="0 0 100 100" className="demo-svg" key={playKey}>
          {SAMPLE_CANDLES.map((c, i) => {
            const x = xAt(i);
            const up = c.c >= c.o;
            const color = up ? UP : DOWN;
            return (
              <g key={i} className="candle-fade" style={{ animationDelay: `${i * 28}ms` }}>
                <line x1={x} x2={x} y1={priceToY(c.h)} y2={priceToY(c.l)} stroke={color} strokeWidth={0.6} />
                <line x1={x - 1.2} x2={x} y1={priceToY(c.o)} y2={priceToY(c.o)} stroke={color} strokeWidth={0.6} />
                <line x1={x} x2={x + 1.2} y1={priceToY(c.c)} y2={priceToY(c.c)} stroke={color} strokeWidth={0.6} />
              </g>
            );
          })}
        </svg>
      );
    }
    if (visual.form === "heikin") {
      // Simplified Heikin-Ashi: smooths each candle toward the running average.
      const ha = [];
      SAMPLE_CANDLES.forEach((c, i) => {
        const prevHa = ha[i - 1] || c;
        const haClose = (c.o + c.h + c.l + c.c) / 4;
        const haOpen = i === 0 ? (c.o + c.c) / 2 : (prevHa.o + prevHa.c) / 2;
        ha.push({ o: haOpen, c: haClose, h: Math.max(c.h, haOpen, haClose), l: Math.min(c.l, haOpen, haClose) });
      });
      return (
        <svg viewBox="0 0 100 100" className="demo-svg" key={playKey}>
          {ha.map((c, i) => {
            const x = xAt(i);
            const up = c.c >= c.o;
            const color = up ? UP : DOWN;
            const bodyTop = Math.min(priceToY(c.o), priceToY(c.c));
            const bodyH = Math.max(Math.abs(priceToY(c.o) - priceToY(c.c)), 0.6);
            return (
              <g key={i} className="candle-fade" style={{ animationDelay: `${i * 28}ms` }}>
                <line x1={x} x2={x} y1={priceToY(c.h)} y2={priceToY(c.l)} stroke={color} strokeWidth={0.5} />
                <rect x={x - 1.3} y={bodyTop} width={2.6} height={bodyH} fill={color} rx={0.3} />
              </g>
            );
          })}
        </svg>
      );
    }
    // default: candle
    return (
      <svg viewBox="0 0 100 100" className="demo-svg" key={playKey}>
        <Candles />
      </svg>
    );
  }

  // ---- overlays drawn on top of the candles ----
  if (visual.type === "overlay-line") {
    const line = sma(closes, visual.period || 6);
    return (
      <svg viewBox="0 0 100 100" className="demo-svg" key={playKey}>
        <Candles dim />
        <AnimatedLine d={linePath(line, (v) => priceToY(v))} color="var(--amber)" delay={200} />
      </svg>
    );
  }

  if (visual.type === "overlay-band") {
    const { upper, mid, lower } = bollinger(closes, 10, 1.6);
    return (
      <svg viewBox="0 0 100 100" className="demo-svg" key={playKey}>
        <Candles dim />
        <AnimatedLine d={linePath(upper, (v) => priceToY(v))} color="var(--amber)" delay={150} dash />
        <AnimatedLine d={linePath(mid, (v) => priceToY(v))} color="var(--ink-muted)" delay={250} />
        <AnimatedLine d={linePath(lower, (v) => priceToY(v))} color="var(--amber)" delay={150} dash />
      </svg>
    );
  }

  if (visual.type === "overlay-cloud") {
    const conv = sma(closes, 4);
    const base = sma(closes, 9);
    return (
      <svg viewBox="0 0 100 100" className="demo-svg" key={playKey}>
        <Candles dim />
        <AnimatedLine d={linePath(conv, (v) => priceToY(v))} color={UP} delay={150} />
        <AnimatedLine d={linePath(base, (v) => priceToY(v))} color={DOWN} delay={250} />
      </svg>
    );
  }

  if (visual.type === "overlay-dots") {
    const sar = simpleSar(SAMPLE_CANDLES);
    return (
      <svg viewBox="0 0 100 100" className="demo-svg" key={playKey}>
        <Candles dim />
        {sar.map((s, i) => (
          <circle
            key={i}
            cx={xAt(i)}
            cy={priceToY(s.price)}
            r={0.9}
            fill={s.above ? DOWN : UP}
            className="demo-dot-pop"
            style={{ animationDelay: `${i * 45}ms` }}
          />
        ))}
      </svg>
    );
  }

  if (visual.type === "overlay-zone") {
    // 매물대: horizontal bands where price spent the most time.
    const zones = [{ p: 53, h: 6 }, { p: 66, h: 4 }];
    return (
      <svg viewBox="0 0 100 100" className="demo-svg" key={playKey}>
        <Candles dim />
        {zones.map((z, i) => (
          <rect
            key={i}
            x={2}
            y={priceToY(z.p + z.h / 2)}
            width={96}
            height={priceToY(z.p - z.h / 2) - priceToY(z.p + z.h / 2)}
            fill="var(--amber)"
            opacity={0.14}
            className="demo-fade-in"
            style={{ animationDelay: `${i * 200}ms` }}
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
        <g transform="translate(0,0)"><Candles /></g>
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
              opacity={0.75}
              className="demo-bar-grow"
              style={{ animationDelay: `${i * 25}ms`, transformOrigin: `${x}px 106px` }}
            />
          );
        })}
        <line x1={2} x2={98} y1={106} y2={106} stroke="var(--border)" strokeWidth={0.4} />
      </svg>
    );
  }

  if (visual.type === "pane-oscillator") {
    const series = visual.calc === "rsi" ? rsi(closes, 10) : stochasticK(SAMPLE_CANDLES, 9);
    const [lo, hi] = visual.bands;
    const toY = (v) => 106 + ((100 - v) / 100) * 24;
    return (
      <svg viewBox="0 0 100 130" className="demo-svg" key={playKey}>
        <Candles dim />
        <line x1={2} x2={98} y1={toY(hi)} y2={toY(hi)} stroke="var(--border)" strokeDasharray="2 2" strokeWidth={0.4} />
        <line x1={2} x2={98} y1={toY(lo)} y2={toY(lo)} stroke="var(--border)" strokeDasharray="2 2" strokeWidth={0.4} />
        <AnimatedLine d={linePath(series, toY)} color="var(--amber)" delay={200} />
        <line x1={2} x2={98} y1={106} y2={106} stroke="var(--border)" strokeWidth={0.4} />
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
        <Candles dim />
        <AnimatedLine d={linePath(series, toY)} color="var(--amber)" delay={200} />
        <line x1={2} x2={98} y1={106} y2={106} stroke="var(--border)" strokeWidth={0.4} />
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
        <Candles dim />
        <line x1={2} x2={98} y1={toY(100)} y2={toY(100)} stroke="var(--border)" strokeDasharray="2 2" strokeWidth={0.4} />
        <AnimatedLine d={linePath(series, toY)} color="var(--amber)" delay={200} />
        <line x1={2} x2={98} y1={106} y2={106} stroke="var(--border)" strokeWidth={0.4} />
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
        <Candles dim />
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
              opacity={0.5}
              className="demo-fade-in"
              style={{ animationDelay: `${i * 20}ms` }}
            />
          );
        })}
        <AnimatedLine d={linePath(line, toY)} color="var(--amber)" delay={250} />
        <AnimatedLine d={linePath(signal, toY)} color="var(--down)" delay={350} />
        <line x1={2} x2={98} y1={106} y2={106} stroke="var(--border)" strokeWidth={0.4} />
      </svg>
    );
  }

  return null;
}
