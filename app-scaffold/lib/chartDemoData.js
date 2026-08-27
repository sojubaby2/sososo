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

// Ichimoku: tenkan(전환선)/kijun(기준선) are short/medium high-low midpoints;
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
