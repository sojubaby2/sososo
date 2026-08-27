// Shared synthetic price series for every chart-guide animation. Same data
// everywhere so a person can compare how different indicators react to the
// exact same price action (uptrend → pullback → breakout). These are
// simplified teaching calculations, not trading-grade implementations.

export const SAMPLE_CANDLES = [
  { o: 45, h: 48, l: 44, c: 47 },
  { o: 47, h: 50, l: 46, c: 49 },
  { o: 49, h: 52, l: 48, c: 51 },
  { o: 51, h: 53, l: 49, c: 50 },
  { o: 50, h: 54, l: 49, c: 53 },
  { o: 53, h: 56, l: 52, c: 55 },
  { o: 55, h: 58, l: 54, c: 57 },
  { o: 57, h: 60, l: 55, c: 58 },
  { o: 58, h: 59, l: 54, c: 55 },
  { o: 55, h: 57, l: 52, c: 53 },
  { o: 53, h: 55, l: 50, c: 51 },
  { o: 51, h: 54, l: 49, c: 52 },
  { o: 52, h: 55, l: 50, c: 54 },
  { o: 54, h: 56, l: 52, c: 55 },
  { o: 55, h: 60, l: 54, c: 59 },
  { o: 59, h: 64, l: 58, c: 63 },
  { o: 63, h: 68, l: 62, c: 66 },
  { o: 66, h: 70, l: 64, c: 68 },
  { o: 68, h: 72, l: 66, c: 70 },
  { o: 70, h: 75, l: 69, c: 74 },
  { o: 74, h: 78, l: 72, c: 76 },
  { o: 76, h: 80, l: 74, c: 78 },
  { o: 78, h: 82, l: 76, c: 80 },
  { o: 80, h: 85, l: 79, c: 83 },
];

export const SAMPLE_VOLUME = [
  22, 26, 24, 18, 30, 34, 32, 38, 44, 40, 30, 24, 26, 22, 36, 48, 52, 44, 40, 50, 46, 42, 44, 54,
];

export const PRICE_MIN = 42;
export const PRICE_MAX = 87;

// Maps a price to an SVG y-coordinate within a viewBox of the given height
// (SVG y grows downward, so higher price = smaller y).
export function priceToY(price, height = 100, pad = 6) {
  const usable = height - pad * 2;
  const ratio = (price - PRICE_MIN) / (PRICE_MAX - PRICE_MIN);
  return height - pad - ratio * usable;
}

export function xAt(i, count = SAMPLE_CANDLES.length, width = 100, pad = 4) {
  const usable = width - pad * 2;
  return pad + (i / (count - 1)) * usable;
}

// --- indicator math (simplified for teaching clarity) ---

export function sma(values, period) {
  return values.map((_, i) => {
    if (i < period - 1) return null;
    const slice = values.slice(i - period + 1, i + 1);
    return slice.reduce((a, b) => a + b, 0) / period;
  });
}

export function ema(values, period) {
  const k = 2 / (period + 1);
  const out = [];
  let prev = null;
  values.forEach((v, i) => {
    if (v == null) {
      out.push(null);
      return;
    }
    if (prev == null) {
      prev = v;
    } else {
      prev = v * k + prev * (1 - k);
    }
    out.push(prev);
  });
  return out;
}

export function stdev(values, period) {
  return values.map((_, i) => {
    if (i < period - 1) return null;
    const slice = values.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
    return Math.sqrt(variance);
  });
}

export function bollinger(closes, period = 10, mult = 2) {
  const mid = sma(closes, period);
  const dev = stdev(closes, period);
  const upper = mid.map((m, i) => (m == null ? null : m + dev[i] * mult));
  const lower = mid.map((m, i) => (m == null ? null : m - dev[i] * mult));
  return { upper, mid, lower };
}

export function rsi(closes, period = 10) {
  const out = new Array(closes.length).fill(null);
  let gainSum = 0, lossSum = 0;
  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = Math.max(diff, 0);
    const loss = Math.max(-diff, 0);
    if (i <= period) {
      gainSum += gain;
      lossSum += loss;
      if (i === period) {
        const avgGain = gainSum / period, avgLoss = lossSum / period;
        out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
      }
    } else {
      gainSum = (gainSum * (period - 1) + gain) / period;
      lossSum = (lossSum * (period - 1) + loss) / period;
      out[i] = lossSum === 0 ? 100 : 100 - 100 / (1 + gainSum / lossSum);
    }
  }
  return out;
}

export function stochasticK(candles, period = 9) {
  return candles.map((_, i) => {
    if (i < period - 1) return null;
    const slice = candles.slice(i - period + 1, i + 1);
    const hh = Math.max(...slice.map((c) => c.h));
    const ll = Math.min(...slice.map((c) => c.l));
    return hh === ll ? 50 : ((candles[i].c - ll) / (hh - ll)) * 100;
  });
}

export function macd(closes, fast = 6, slow = 13, signalPeriod = 5) {
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const line = closes.map((_, i) => (emaFast[i] != null && emaSlow[i] != null ? emaFast[i] - emaSlow[i] : null));
  const signal = ema(line.map((v) => v ?? 0), signalPeriod);
  const histogram = line.map((v, i) => (v != null && signal[i] != null ? v - signal[i] : null));
  return { line, signal, histogram };
}

export function obv(candles, volumes) {
  const out = [0];
  for (let i = 1; i < candles.length; i++) {
    const prev = out[i - 1];
    if (candles[i].c > candles[i - 1].c) out.push(prev + volumes[i]);
    else if (candles[i].c < candles[i - 1].c) out.push(prev - volumes[i]);
    else out.push(prev);
  }
  return out;
}

export function disparity(closes, period = 10) {
  const base = sma(closes, period);
  return closes.map((c, i) => (base[i] == null ? null : (c / base[i]) * 100));
}

// Simplified Parabolic SAR — just enough to show the "dots flip sides when
// the trend reverses" idea, not a precise acceleration-factor replication.
export function simpleSar(candles) {
  const out = [];
  let uptrend = true;
  let extreme = candles[0].l;
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      out.push({ price: candles[i].l - 1.5, above: false });
      continue;
    }
    const prevClose = candles[i - 1].c;
    const wasUptrend = uptrend;
    uptrend = candles[i].c >= prevClose - 1 ? uptrend : i > 8 && i < 15 ? false : uptrend;
    if (i >= 9 && i <= 13) uptrend = false;
    else uptrend = true;
    out.push({ price: uptrend ? candles[i].l - 1.5 : candles[i].h + 1.5, above: !uptrend });
  }
  return out;
}

// Envelope: like Bollinger but with a fixed % band instead of a
// statistical one — simpler, older technique.
export function envelope(closes, period = 10, pct = 0.06) {
  const mid = sma(closes, period);
  const upper = mid.map((m) => (m == null ? null : m * (1 + pct)));
  const lower = mid.map((m) => (m == null ? null : m * (1 - pct)));
  return { upper, mid, lower };
}

// Price Channel / Donchian Channel: simply the highest high and lowest
// low over the lookback window.
export function donchianChannel(candles, period = 10) {
  const upper = candles.map((_, i) => {
    if (i < period - 1) return null;
    return Math.max(...candles.slice(i - period + 1, i + 1).map((c) => c.h));
  });
  const lower = candles.map((_, i) => {
    if (i < period - 1) return null;
    return Math.min(...candles.slice(i - period + 1, i + 1).map((c) => c.l));
  });
  const mid = upper.map((u, i) => (u == null || lower[i] == null ? null : (u + lower[i]) / 2));
  return { upper, mid, lower };
}

// Classic floor-trader pivot points, computed once from the first 5 candles
// and drawn as flat support/resistance lines across the rest of the chart.
export function pivotLevels(candles) {
  const window = candles.slice(0, 5);
  const h = Math.max(...window.map((c) => c.h));
  const l = Math.min(...window.map((c) => c.l));
  const c = window[window.length - 1].c;
  const p = (h + l + c) / 3;
  return { r1: 2 * p - l, p, s1: 2 * p - h };
}

// Simplified SuperTrend — an ATR-scaled trailing line that flips sides
// when price closes through it, same spirit as the real indicator without
// a full ATR-recalculation loop.
export function superTrend(candles, mult = 1.6) {
  const trs = candles.map((c, i) => {
    if (i === 0) return c.h - c.l;
    return Math.max(c.h - c.l, Math.abs(c.h - candles[i - 1].c), Math.abs(c.l - candles[i - 1].c));
  });
  const atr = sma(trs, 5);
  const out = [];
  let uptrend = true;
  for (let i = 0; i < candles.length; i++) {
    const band = (atr[i] ?? trs[i]) * mult;
    const basis = (candles[i].h + candles[i].l) / 2;
    if (i > 8 && i < 15) uptrend = false;
    else uptrend = true;
    out.push({ price: uptrend ? basis - band : basis + band, up: uptrend });
  }
  return out;
}

// 심리도 (Psychological Line): % of up-closes over the lookback window.
export function psychLine(candles, period = 10) {
  return candles.map((_, i) => {
    if (i < period - 1) return null;
    const window = candles.slice(i - period + 1, i + 1);
    let ups = 0;
    for (let j = 1; j < window.length; j++) if (window[j].c >= window[j - 1].c) ups++;
    return (ups / (period - 1)) * 100;
  });
}

// Simplified ADX — trend STRENGTH (not direction), 0–100. Uses an
// "efficiency ratio" (net move over the window ÷ total path traveled):
// a clean, one-directional run stays close to 100; a choppy back-and-forth
// stretch cancels itself out and drops toward 0.
export function adx(candles, period = 8) {
  const closes = candles.map((c) => c.c);
  return closes.map((c, i) => {
    if (i < period) return null;
    const netMove = Math.abs(c - closes[i - period]);
    let path = 0;
    for (let j = i - period + 1; j <= i; j++) path += Math.abs(closes[j] - closes[j - 1]);
    return path === 0 ? 0 : Math.min(100, (netMove / path) * 100);
  });
}

// CCI: how far price is from its own moving average, in units of typical
// deviation — oscillates around 0 with ±100 as the common reference bands.
export function cci(candles, period = 10) {
  const typical = candles.map((c) => (c.h + c.l + c.c) / 3);
  const basis = sma(typical, period);
  return typical.map((tp, i) => {
    if (basis[i] == null) return null;
    const window = typical.slice(Math.max(0, i - period + 1), i + 1);
    const meanDev = window.reduce((s, v) => s + Math.abs(v - basis[i]), 0) / window.length;
    return meanDev === 0 ? 0 : (tp - basis[i]) / (0.015 * meanDev);
  });
}

// Williams %R: same idea as Stochastic, just plotted on a −100..0 scale.
export function williamsR(candles, period = 9) {
  return candles.map((_, i) => {
    if (i < period - 1) return null;
    const window = candles.slice(i - period + 1, i + 1);
    const hh = Math.max(...window.map((c) => c.h));
    const ll = Math.min(...window.map((c) => c.l));
    return hh === ll ? -50 : ((hh - candles[i].c) / (hh - ll)) * -100;
  });
}

export function momentum(closes, period = 8) {
  return closes.map((c, i) => (i < period ? null : c - closes[i - period]));
}

export function roc(closes, period = 8) {
  return closes.map((c, i) => (i < period ? null : ((c - closes[i - period]) / closes[i - period]) * 100));
}

export function pvt(candles, volumes) {
  const out = [0];
  for (let i = 1; i < candles.length; i++) {
    const pctChange = (candles[i].c - candles[i - 1].c) / candles[i - 1].c;
    out.push(out[i - 1] + pctChange * volumes[i]);
  }
  return out;
}

export function adLine(candles, volumes) {
  const out = [];
  let cum = 0;
  candles.forEach((c, i) => {
    const range = c.h - c.l || 1;
    const mfm = ((c.c - c.l) - (c.h - c.c)) / range;
    cum += mfm * volumes[i];
    out.push(cum);
  });
  return out;
}

export function volumeSma(volumes, period = 5) {
  return sma(volumes, period);
}

// Demark pivot points — a different (and real) weighting formula from the
// classic floor-trader pivot, based on whether the reference candle closed
// above or below its own open.
export function demarkPivot(candles) {
  const c = candles[4]; // same 5-candle reference window as pivotLevels
  let x;
  if (c.c < c.o) x = c.h + 2 * c.l + c.c;
  else if (c.c > c.o) x = 2 * c.h + c.l + c.c;
  else x = c.h + c.l + 2 * c.c;
  return { r1: x / 2 - c.l, p: x / 4, s1: x / 2 - c.h };
}

// A handful of the "기타지표" category (개인 순매수, 신용잔고, 고객예탁금 등)
// come from separate market-flow data feeds we don't have wired up — there's
// no formula that derives them from OHLC candles. For the demo, this
// generates a smooth, deterministic, price-correlated series (varied by
// `seed`) purely so the animation has something illustrative to draw; it is
// NOT a real reconstruction of that data.
export function syntheticFlow(seed = 1, bias = 0.6) {
  const out = [];
  let v = 0;
  for (let i = 0; i < SAMPLE_CANDLES.length; i++) {
    const priceChange = i > 0 ? SAMPLE_CANDLES[i].c - SAMPLE_CANDLES[i - 1].c : 0;
    const noise = Math.sin(i * seed * 1.37 + seed) * 2.5;
    v += priceChange * bias + noise;
    out.push(v);
  }
  return out;
}
// senkou A/B are projected `shift` periods AHEAD of price — that forward
// projection, and the shaded area between A and B, is literally what makes
// it "the cloud". Periods are scaled down from the textbook 9/26/52 to fit
// our short 24-candle demo while keeping the same structure.
export function ichimoku(candles, { tenkanP = 4, kijunP = 9, senkouBP = 16, shift = 5 } = {}) {
  const n = candles.length;
  function highLowAvg(endIdx, period) {
    const start = Math.max(0, endIdx - period + 1);
    const slice = candles.slice(start, endIdx + 1);
    const hh = Math.max(...slice.map((c) => c.h));
    const ll = Math.min(...slice.map((c) => c.l));
    return (hh + ll) / 2;
  }
  const tenkan = candles.map((_, i) => highLowAvg(i, tenkanP));
  const kijun = candles.map((_, i) => highLowAvg(i, kijunP));
  const senkouARaw = candles.map((_, i) => (tenkan[i] + kijun[i]) / 2);
  const senkouBRaw = candles.map((_, i) => highLowAvg(i, senkouBP));

  const total = n + shift;
  const senkouA = new Array(total).fill(null);
  const senkouB = new Array(total).fill(null);
  for (let i = 0; i < n; i++) {
    senkouA[i + shift] = senkouARaw[i];
    senkouB[i + shift] = senkouBRaw[i];
  }
  return { tenkan, kijun, senkouA, senkouB, shift, total };
}

// Groups N daily candles into fewer, wider candles (e.g. 4 days → 1
// "weekly" candle) — open of the first, close of the last, high/low of
// the whole group. Used to show why a weekly chart looks smoother.
export function groupCandles(candles, size) {
  const out = [];
  for (let i = 0; i < candles.length; i += size) {
    const chunk = candles.slice(i, i + size);
    if (!chunk.length) continue;
    out.push({
      o: chunk[0].o,
      c: chunk[chunk.length - 1].c,
      h: Math.max(...chunk.map((c) => c.h)),
      l: Math.min(...chunk.map((c) => c.l)),
    });
  }
  return out;
}

// Finds indices where series A crosses series B (sign of the difference
// flips) — used to mark the MACD golden/dead cross moment.
export function findCrossovers(a, b) {
  const out = [];
  for (let i = 1; i < a.length; i++) {
    if (a[i] == null || a[i - 1] == null || b[i] == null || b[i - 1] == null) continue;
    const prevDiff = a[i - 1] - b[i - 1];
    const diff = a[i] - b[i];
    if (prevDiff === 0) continue;
    if ((prevDiff > 0 && diff <= 0) || (prevDiff < 0 && diff >= 0)) {
      out.push({ index: i, goldenCross: diff > prevDiff });
    }
  }
  return out;
}

// Renko: fixed-size bricks. A new brick only appears once price has moved
// a full `box` away from the last brick's close — this is what filters
// out all the small noise and leaves only clean, uniform steps.
export function renkoBricks(closes, box = 3) {
  const bricks = [];
  let base = closes[0];
  for (let i = 1; i < closes.length; i++) {
    let diff = closes[i] - base;
    while (Math.abs(diff) >= box) {
      const up = diff > 0;
      bricks.push({ o: base, c: base + (up ? box : -box), up });
      base = base + (up ? box : -box);
      diff = closes[i] - base;
    }
  }
  return bricks;
}

// Three Line Break: like Renko, but a reversal only counts once price
// breaks beyond the extreme of the last 3 lines — much slower to flip
// direction than a plain Renko chart.
export function threeLineBreak(closes) {
  const lines = [{ o: closes[0], c: closes[1], up: closes[1] >= closes[0] }];
  for (let i = 2; i < closes.length; i++) {
    const price = closes[i];
    const last = lines[lines.length - 1];
    const recent = lines.slice(-3);
    if (last.up) {
      if (price > last.c) {
        lines.push({ o: last.c, c: price, up: true });
      } else if (price < Math.min(...recent.map((l) => Math.min(l.o, l.c)))) {
        lines.push({ o: last.c, c: price, up: false });
      }
    } else {
      if (price < last.c) {
        lines.push({ o: last.c, c: price, up: false });
      } else if (price > Math.max(...recent.map((l) => Math.max(l.o, l.c)))) {
        lines.push({ o: last.c, c: price, up: true });
      }
    }
  }
  return lines;
}

// Kagi: one continuous zigzag that only turns when price reverses by
// `reversal` — the line switches from thin to thick when it breaks the
// previous swing high (bullish) or swing low (bearish).
export function kagiLine(closes, reversal = 3) {
  const points = [{ i: 0, price: closes[0] }];
  let direction = null;
  let lastSwing = closes[0];
  for (let i = 1; i < closes.length; i++) {
    const price = closes[i];
    if (direction === null) {
      if (Math.abs(price - lastSwing) >= reversal) {
        direction = price > lastSwing ? "up" : "down";
        points.push({ i, price });
        lastSwing = price;
      }
      continue;
    }
    const last = points[points.length - 1];
    if (direction === "up") {
      if (price > last.price) {
        points[points.length - 1] = { i, price };
      } else if (last.price - price >= reversal) {
        direction = "down";
        points.push({ i, price });
      }
    } else {
      if (price < last.price) {
        points[points.length - 1] = { i, price };
      } else if (price - last.price >= reversal) {
        direction = "up";
        points.push({ i, price });
      }
    }
  }
  return points;
}

// Swing/zigzag: keeps only local extrema that represent a genuine swing
// (filters out anything smaller than `minMove`), connecting them directly.
export function swingPoints(candles, minMove = 4) {
  const points = [{ i: 0, price: candles[0].c, isHigh: null }];
  let lastExtreme = candles[0].c;
  let direction = null;
  for (let i = 1; i < candles.length; i++) {
    const price = candles[i].c;
    if (direction === null) {
      if (Math.abs(price - lastExtreme) >= minMove) {
        direction = price > lastExtreme ? "up" : "down";
        points.push({ i, price, isHigh: direction === "up" });
        lastExtreme = price;
      }
      continue;
    }
    if (direction === "up") {
      if (price >= lastExtreme) {
        points[points.length - 1] = { i, price, isHigh: true };
        lastExtreme = price;
      } else if (lastExtreme - price >= minMove) {
        direction = "down";
        points.push({ i, price, isHigh: false });
        lastExtreme = price;
      }
    } else {
      if (price <= lastExtreme) {
        points[points.length - 1] = { i, price, isHigh: false };
        lastExtreme = price;
      } else if (price - lastExtreme >= minMove) {
        direction = "up";
        points.push({ i, price, isHigh: true });
        lastExtreme = price;
      }
    }
  }
  return points;
}
