// lib/patternDetection.js
//
// Chart-pattern recognition over the daily OHLC history built by
// lib/priceHistory.js. Given one stock's ascending {date,o,h,l,c}[]
// series, scores it against 24 pattern types and returns a similarity %
// (0-100) for each one it plausibly matches — modeled on the "패턴 검색"
// screener 재성 showed as a reference. This is a v1 heuristic
// implementation: shape-based patterns use template-correlation matching
// (바닥형 and its 천정형 상단 반전 패턴 모두), trend patterns use
// linear-regression fits on highs/lows, and several (적삼병/흑삼병,
// 전고점돌파, 골든크로스/데드크로스 등) use direct rule checks instead of a
// curve template.
// It has NOT been visually calibrated against real KOSPI/KOSDAQ charts yet
// (no price history existed to test against when this was written) — once
// real data is flowing through lib/priceHistory.js, expect to come back
// and retune the thresholds/weights below against what the results
// actually look like on a chart.
//
// Pipeline: app/api/patterns/route.js calls scanAllStocksForPatterns()
// with the Map lib/priceHistory.js's buildPriceSeriesForAllStocks()
// returns.

// ---------------------------------------------------------------------------
// Shared math utilities
// ---------------------------------------------------------------------------

// Pearson correlation — scale/shift invariant, which is exactly what shape
// matching wants (a stock at ₩3,000,000 and one at ₩3,000 can have
// identically-shaped curves; correlation doesn't care about the price
// level or the specific unit, only the shape).
function correlation(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 3) return 0;
  let sumA = 0;
  let sumB = 0;
  for (let i = 0; i < n; i++) {
    sumA += a[i];
    sumB += b[i];
  }
  const meanA = sumA / n;
  const meanB = sumB / n;
  let num = 0;
  let denA = 0;
  let denB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  if (denA === 0 || denB === 0) return 0;
  return num / Math.sqrt(denA * denB);
}

// [-1,1] -> [0,100]. Negative correlation (the actual curve moves opposite
// the template) floors at 0 — "doesn't look like this pattern at all",
// not "looks like the pattern upside-down".
function correlationToSimilarity(corr) {
  const clamped = Math.max(-1, Math.min(1, corr));
  return Math.round(Math.max(0, clamped) * 100);
}

// Ordinary least-squares fit of y = slope*x + intercept over x = 0..n-1,
// plus the residual standard deviation (how tightly points hug the line —
// used to tell a real "channel" from just any old bumpy climb).
function linreg(ys) {
  const n = ys.length;
  const meanX = (n - 1) / 2;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = i - meanX;
    num += dx * (ys[i] - meanY);
    den += dx * dx;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const pred = slope * i + intercept;
    ssRes += (ys[i] - pred) ** 2;
  }
  return { slope, intercept, residualStd: Math.sqrt(ssRes / n) };
}

// ---------------------------------------------------------------------------
// Shape templates (바닥형 patterns) — idealized normalized curves, generated
// as a sum of Gaussian "troughs" plus a gentle breakout lift at the very
// end. Compared against a stock's actual close-price window via
// correlation (see above) rather than hand-drawn point arrays, so the
// window length and trough positions/depths stay easy to tune.
// ---------------------------------------------------------------------------

function nTroughTemplate(n, troughs, { endLift = 0.12 } = {}) {
  const y = new Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    let v = 1;
    for (const tr of troughs) {
      const w = tr.width ?? 0.1;
      v -= tr.depth * Math.exp(-((t - tr.pos) ** 2) / (2 * w * w));
    }
    if (t > 0.85) v += endLift * ((t - 0.85) / 0.15);
    y[i] = v;
  }
  return y;
}

const SHAPE_TEMPLATES = [
  {
    id: "double_bottom",
    label: "쌍바닥",
    window: 40,
    template: (n) =>
      nTroughTemplate(n, [
        { pos: 0.28, depth: 0.8, width: 0.09 },
        { pos: 0.72, depth: 0.8, width: 0.09 },
      ]),
  },
  {
    id: "triple_bottom",
    label: "삼중바닥",
    window: 55,
    template: (n) =>
      nTroughTemplate(n, [
        { pos: 0.18, depth: 0.65, width: 0.08 },
        { pos: 0.5, depth: 0.7, width: 0.08 },
        { pos: 0.82, depth: 0.65, width: 0.08 },
      ]),
  },
  {
    id: "cup_and_handle",
    label: "컵앤핸들",
    window: 80,
    template: (n) =>
      nTroughTemplate(
        n,
        [
          { pos: 0.4, depth: 0.85, width: 0.22 }, // the cup — wide, smooth trough
          { pos: 0.87, depth: 0.25, width: 0.04 }, // the handle — brief shallow dip near the end
        ],
        { endLift: 0.1 }
      ),
  },
  {
    id: "u_bottom",
    label: "U자바닥",
    window: 35,
    template: (n) => nTroughTemplate(n, [{ pos: 0.5, depth: 0.85, width: 0.28 }]),
  },
  {
    id: "inverse_head_shoulders",
    label: "역헤드앤숄더",
    window: 55,
    template: (n) =>
      nTroughTemplate(n, [
        { pos: 0.2, depth: 0.5, width: 0.08 }, // left shoulder
        { pos: 0.5, depth: 0.85, width: 0.09 }, // head — deepest
        { pos: 0.8, depth: 0.5, width: 0.08 }, // right shoulder
      ]),
  },
];

// nTroughTemplate을 위아래로 뒤집은 버전 — 바닥(trough) 대신 봉우리(peak)를
// 쌓고, 끝에서 위로 살짝 올라가는 대신 아래로 꺾이게 함(천정을 찍고
// 무너지는 하락반전). correlation()은 절대값(기준선 0 vs 1)이 아니라
// 오르내리는 "모양"만 비교하므로 nTroughTemplate과 똑같은 방식으로 실제
// 종가 구간과 대조해서 쓸 수 있음.
function nPeakTemplate(n, peaks, { endDrop = 0.12 } = {}) {
  const y = new Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    let v = 0;
    for (const pk of peaks) {
      const w = pk.width ?? 0.1;
      v += pk.height * Math.exp(-((t - pk.pos) ** 2) / (2 * w * w));
    }
    if (t > 0.85) v -= endDrop * ((t - 0.85) / 0.15);
    y[i] = v;
  }
  return y;
}

// 천정형(top reversal) — 바닥형 5개 중 3개(쌍바닥/삼중바닥/역헤드앤숄더)의
// 정반대 모양. 컵앤핸들·U자바닥은 상단 반전 쪽에 자연스럽게 대응되는
// 유명 패턴이 없어서(이론상 "역컵앤핸들" 같은 게 있긴 하지만 잘 안 씀)
// 제외함.
SHAPE_TEMPLATES.push(
  {
    id: "double_top",
    label: "쌍봉",
    window: 40,
    template: (n) =>
      nPeakTemplate(n, [
        { pos: 0.28, height: 0.8, width: 0.09 },
        { pos: 0.72, height: 0.8, width: 0.09 },
      ]),
  },
  {
    id: "triple_top",
    label: "삼중천정",
    window: 55,
    template: (n) =>
      nPeakTemplate(n, [
        { pos: 0.18, height: 0.65, width: 0.08 },
        { pos: 0.5, height: 0.7, width: 0.08 },
        { pos: 0.82, height: 0.65, width: 0.08 },
      ]),
  },
  {
    id: "head_shoulders_top",
    label: "헤드앤숄더",
    window: 55,
    template: (n) =>
      nPeakTemplate(n, [
        { pos: 0.2, height: 0.5, width: 0.08 }, // left shoulder
        { pos: 0.5, height: 0.85, width: 0.09 }, // head — highest
        { pos: 0.8, height: 0.5, width: 0.08 }, // right shoulder
      ]),
  }
);

// ---------------------------------------------------------------------------
// Trend/channel patterns (추세형) — not a fixed shape, so these fit lines to
// the window's highs/lows/closes and score based on slope + how tightly
// price hugs those lines, instead of correlating against a template.
// ---------------------------------------------------------------------------

const TREND_WINDOW = 40;

function detectTrendPatterns(series, minSimilarity) {
  const n = series.length;
  if (n < TREND_WINDOW) return [];
  const win = series.slice(n - TREND_WINDOW);
  const closes = win.map((p) => p.c);
  const highs = win.map((p) => p.h);
  const lows = win.map((p) => p.l);
  const avgPrice = closes.reduce((a, b) => a + b, 0) / closes.length;
  const asOfDate = win[win.length - 1].date;
  const results = [];

  const closeReg = linreg(closes);
  const highReg = linreg(highs);
  const lowReg = linreg(lows);
  const totalRisePct = ((closeReg.slope * (TREND_WINDOW - 1)) / avgPrice) * 100;
  const residualPct = (closeReg.residualStd / avgPrice) * 100;
  const highSlopePct = ((highReg.slope * (TREND_WINDOW - 1)) / avgPrice) * 100;
  const lowSlopePct = ((lowReg.slope * (TREND_WINDOW - 1)) / avgPrice) * 100;
  const startRange = highs[0] - lows[0];
  const endRange = highs[highs.length - 1] - lows[lows.length - 1];
  const narrowed = startRange > 0 ? (startRange - endRange) / startRange : 0;

  // 상승채널: meaningful uptrend + price staying in a tight band around it
  if (totalRisePct > 12 && residualPct < 8) {
    const trendScore = Math.min(1, totalRisePct / 30);
    const tightnessScore = Math.min(1, Math.max(0, (8 - residualPct) / 8));
    const similarity = Math.round(((trendScore + tightnessScore) / 2) * 100);
    if (similarity >= minSimilarity) {
      results.push({ patternId: "rising_channel", label: "상승채널", similarity, window: TREND_WINDOW, asOfDate });
    }
  }

  // 상승삼각형: flat resistance (highs), rising support (lows), range narrowing
  if (Math.abs(highSlopePct) < 5 && lowSlopePct > 8 && narrowed > 0.25) {
    const flatScore = Math.min(1, Math.max(0, (5 - Math.abs(highSlopePct)) / 5));
    const riseScore = Math.min(1, lowSlopePct / 20);
    const narrowScore = Math.min(1, narrowed);
    const similarity = Math.round(((flatScore + riseScore + narrowScore) / 3) * 100);
    if (similarity >= minSimilarity) {
      results.push({ patternId: "ascending_triangle", label: "상승삼각형", similarity, window: TREND_WINDOW, asOfDate });
    }
  }

  // 하락쐐기: both bounds declining, but converging (range narrowing as it falls)
  if (highSlopePct < -5 && lowSlopePct < 0 && highSlopePct < lowSlopePct && narrowed > 0.2) {
    const declineScore = Math.min(1, Math.abs(highSlopePct) / 20);
    const convergeScore = Math.min(1, narrowed);
    const similarity = Math.round(((declineScore + convergeScore) / 2) * 100);
    if (similarity >= minSimilarity) {
      results.push({ patternId: "falling_wedge", label: "하락쐐기", similarity, window: TREND_WINDOW, asOfDate });
    }
  }

  // 박스권: near-flat overall drift, but real oscillation within a band
  // (rules out a simply dead-flat, barely-traded stock scoring high)
  const rangePct = ((Math.max(...highs) - Math.min(...lows)) / avgPrice) * 100;
  if (Math.abs(totalRisePct) < 6 && rangePct > 8 && rangePct < 35) {
    const flatScore = Math.min(1, Math.max(0, (6 - Math.abs(totalRisePct)) / 6));
    const rangeScore = Math.min(1, rangePct / 20);
    const similarity = Math.round(((flatScore + rangeScore) / 2) * 100);
    if (similarity >= minSimilarity) {
      results.push({ patternId: "box_range", label: "박스권", similarity, window: TREND_WINDOW, asOfDate });
    }
  }

  // 하락채널: 상승채널을 뒤집은 것 — 뚜렷한 하락 추세 + 그 추세선 주변으로
  // 좁게 움직임.
  if (totalRisePct < -12 && residualPct < 8) {
    const trendScore = Math.min(1, Math.abs(totalRisePct) / 30);
    const tightnessScore = Math.min(1, Math.max(0, (8 - residualPct) / 8));
    const similarity = Math.round(((trendScore + tightnessScore) / 2) * 100);
    if (similarity >= minSimilarity) {
      results.push({ patternId: "falling_channel", label: "하락채널", similarity, window: TREND_WINDOW, asOfDate });
    }
  }

  // 하락삼각형: 상승삼각형을 뒤집은 것 — 지지선(저가)은 평평한데 저항선(고가)은
  // 계속 낮아지면서 범위가 좁아짐. 지지선마저 뚫리면 하락 돌파로 이어지는
  // 대표적인 하락 지속형 패턴.
  if (Math.abs(lowSlopePct) < 5 && highSlopePct < -8 && narrowed > 0.25) {
    const flatScore = Math.min(1, Math.max(0, (5 - Math.abs(lowSlopePct)) / 5));
    const declineScore = Math.min(1, Math.abs(highSlopePct) / 20);
    const narrowScore = Math.min(1, narrowed);
    const similarity = Math.round(((flatScore + declineScore + narrowScore) / 3) * 100);
    if (similarity >= minSimilarity) {
      results.push({ patternId: "descending_triangle", label: "하락삼각형", similarity, window: TREND_WINDOW, asOfDate });
    }
  }

  // 상승쐐기: 하락쐐기를 뒤집은 것 — 겉보기엔 고가/저가 둘 다 오르고 있지만
  // 저가가 고가보다 더 가파르게 올라오면서(=지지선이 저항선을 따라잡으며)
  // 범위가 좁아짐. 이름과 달리 대표적인 하락 반전 신호로 꼽히는 패턴.
  if (lowSlopePct > 5 && highSlopePct > 0 && lowSlopePct > highSlopePct && narrowed > 0.2) {
    const riseScore = Math.min(1, lowSlopePct / 20);
    const convergeScore = Math.min(1, narrowed);
    const similarity = Math.round(((riseScore + convergeScore) / 2) * 100);
    if (similarity >= minSimilarity) {
      results.push({ patternId: "rising_wedge", label: "상승쐐기", similarity, window: TREND_WINDOW, asOfDate });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Momentum/consolidation patterns (조정형)
// ---------------------------------------------------------------------------

function detectPullback(series, minSimilarity) {
  const WINDOW = 30;
  const n = series.length;
  if (n < WINDOW) return null;
  const win = series.slice(n - WINDOW);
  const upPhaseLen = Math.round(WINDOW * 0.65);
  const upPhase = win.slice(0, upPhaseLen);
  const startPrice = upPhase[0].c;
  const peakPrice = Math.max(...win.map((p) => p.c));
  const endPrice = win[win.length - 1].c;
  const risePct = ((peakPrice - startPrice) / startPrice) * 100;
  if (risePct < 12) return null;

  // 0 = never pulled back, 1 = fully round-tripped back to the start
  const retracement = (peakPrice - endPrice) / (peakPrice - startPrice);
  if (retracement < 0.15 || retracement > 0.65) return null;

  const ideal = 0.4; // classic ~38~50% retracement zone
  const closeness = 1 - Math.min(1, Math.abs(retracement - ideal) / 0.4);
  const strengthScore = Math.min(1, risePct / 25);
  const similarity = Math.round(((closeness + strengthScore) / 2) * 100);
  if (similarity < minSimilarity) return null;

  return {
    patternId: "pullback",
    label: "눌림목",
    similarity,
    window: WINDOW,
    asOfDate: win[win.length - 1].date,
    detail: { risePct: Math.round(risePct), retracementPct: Math.round(retracement * 100) },
  };
}

function detectFlag(series, minSimilarity) {
  const WINDOW = 15;
  const n = series.length;
  if (n < WINDOW) return null;
  const win = series.slice(n - WINDOW);
  const poleLen = Math.max(3, Math.round(WINDOW * 0.35));
  const pole = win.slice(0, poleLen);
  const flagPart = win.slice(poleLen);

  const poleRisePct = ((pole[pole.length - 1].c - pole[0].c) / pole[0].c) * 100;
  if (poleRisePct < 8) return null;

  const flagCloses = flagPart.map((p) => p.c);
  const flagRangePct = ((Math.max(...flagCloses) - Math.min(...flagCloses)) / pole[pole.length - 1].c) * 100;
  if (flagRangePct > 8) return null; // too wide to read as a tight flag

  const flagDriftPct = ((flagCloses[flagCloses.length - 1] - flagCloses[0]) / flagCloses[0]) * 100;
  if (flagDriftPct > 3) return null; // should drift sideways/down, not already resume the rally

  const poleScore = Math.min(1, poleRisePct / 20);
  const tightScore = Math.min(1, Math.max(0, (8 - flagRangePct) / 8));
  const similarity = Math.round(((poleScore + tightScore) / 2) * 100);
  if (similarity < minSimilarity) return null;

  return {
    patternId: "flag",
    label: "깃발",
    similarity,
    window: WINDOW,
    asOfDate: win[win.length - 1].date,
    detail: { poleRisePct: Math.round(poleRisePct), flagRangePct: Math.round(flagRangePct) },
  };
}

// ---------------------------------------------------------------------------
// Candlestick pattern (캔들형) — the only detector that looks at raw
// open/high/low/close shape of individual days rather than a multi-day
// curve.
// ---------------------------------------------------------------------------

function detectThreeWhiteSoldiers(series, minSimilarity) {
  const n = series.length;
  if (n < 3) return null;
  const [d1, d2, d3] = series.slice(n - 3);
  if (!(d2.c > d1.c && d3.c > d2.c)) return null; // hard gate: 3 consecutive higher closes

  const bodyStrength = (day) => {
    const range = day.h - day.l;
    if (range <= 0) return 0;
    return (day.c - day.l) / range; // close near the day's high = strong body, small upper wick
  };
  const avgStrength = (bodyStrength(d1) + bodyStrength(d2) + bodyStrength(d3)) / 3;

  const opensInPriorRange = (prev, cur) => {
    const lo = Math.min(prev.o, prev.c);
    const hi = Math.max(prev.o, prev.c) * 1.02; // small tolerance for a modest gap-up open
    return cur.o >= lo && cur.o <= hi;
  };
  const opensLookReasonable = opensInPriorRange(d1, d2) && opensInPriorRange(d2, d3);

  const bodyScore = Math.min(1, avgStrength);
  const opensScore = opensLookReasonable ? 1 : 0.4;
  const similarity = Math.round(bodyScore * 70 + opensScore * 30);
  if (similarity < minSimilarity) return null;

  return { patternId: "three_white_soldiers", label: "적삼병", similarity, window: 3, asOfDate: d3.date };
}

// 흑삼병 — 적삼병의 정반대: 3거래일 연속 종가가 낮아지고, 몸통이 그날의
// 저가 쪽에 가깝게 강한 음봉으로 이어짐.
function detectThreeBlackCrows(series, minSimilarity) {
  const n = series.length;
  if (n < 3) return null;
  const [d1, d2, d3] = series.slice(n - 3);
  if (!(d2.c < d1.c && d3.c < d2.c)) return null; // hard gate: 3 consecutive lower closes

  const bodyStrength = (day) => {
    const range = day.h - day.l;
    if (range <= 0) return 0;
    return (day.h - day.c) / range; // close near the day's low = strong bearish body, small lower wick
  };
  const avgStrength = (bodyStrength(d1) + bodyStrength(d2) + bodyStrength(d3)) / 3;

  const opensInPriorRange = (prev, cur) => {
    const hi = Math.max(prev.o, prev.c);
    const lo = Math.min(prev.o, prev.c) * 0.98; // small tolerance for a modest gap-down open
    return cur.o <= hi && cur.o >= lo;
  };
  const opensLookReasonable = opensInPriorRange(d1, d2) && opensInPriorRange(d2, d3);

  const bodyScore = Math.min(1, avgStrength);
  const opensScore = opensLookReasonable ? 1 : 0.4;
  const similarity = Math.round(bodyScore * 70 + opensScore * 30);
  if (similarity < minSimilarity) return null;

  return { patternId: "three_black_crows", label: "흑삼병", similarity, window: 3, asOfDate: d3.date };
}

// ---------------------------------------------------------------------------
// Breakout pattern (돌파형) — 전고점돌파: today's close clears the highest
// high seen anywhere earlier in the stored history (up to
// HISTORY_LOOKBACK_DAYS back — a "52-week-high"-style proxy, not a true
// all-time high). Not a shape template at all — the closest thing to a
// pure yes/no signal in this file, scored by how far above the prior high
// and how long that prior high had stood.
// ---------------------------------------------------------------------------

function detectBreakout(series, minSimilarity) {
  const n = series.length;
  if (n < 20) return null; // want at least some real history before calling anything a "breakout"
  const today = series[n - 1];
  const prior = series.slice(0, n - 1);
  const priorHigh = Math.max(...prior.map((p) => p.h));
  if (today.c <= priorHigh) return null;

  const abovePct = ((today.c - priorHigh) / priorHigh) * 100;

  let daysSincePriorHigh = prior.length;
  for (let i = prior.length - 1; i >= 0; i--) {
    if (prior[i].h >= priorHigh * 0.999) {
      daysSincePriorHigh = prior.length - i;
      break;
    }
  }

  const magnitudeScore = Math.min(1, abovePct / 5); // 5%+ above the prior high = full marks
  const durationScore = Math.min(1, daysSincePriorHigh / 120); // a high that stood 120+ trading days = full marks
  const similarity = Math.min(100, Math.round(50 + magnitudeScore * 30 + durationScore * 20));
  if (similarity < minSimilarity) return null;

  return {
    patternId: "breakout_prior_high",
    label: "전고점돌파",
    similarity,
    window: prior.length,
    asOfDate: today.date,
    detail: { abovePriorHighPct: Math.round(abovePct * 10) / 10, daysSincePriorHigh },
  };
}

// ---------------------------------------------------------------------------
// 52-week-high state pattern (돌파형) — 52주 신고가: 전고점돌파와 다른 점은,
// 전고점돌파는 "오늘 처음 이전 고점을 뚫은 그 순간"에만 잡히는 1회성
// 이벤트인 반면, 이건 "최근 52주(약 252거래일) 안에서 지금 고점권에 머물러
// 있는가"를 매일 다시 판정하는 상태값이라, 뚫은 당일이 지나도 그 근처에서
// 계속 움직이는 동안은 계속 리스트에 남아있음. 윈도우도 전고점돌파처럼
// "쌓인 히스토리 전체"가 아니라 딱 252거래일로 고정해서, 흔히 말하는
// "52주 신고가" 스크리너 정의에 더 가깝게 맞춤.
// ---------------------------------------------------------------------------

const FIFTY_TWO_WEEK_WINDOW = 252; // 52주 ≈ 252거래일
const FIFTY_TWO_WEEK_MIN_DAYS = 60; // "52주" 판정이 의미 있으려면 최소 이 정도는 쌓여있어야 함
const FIFTY_TWO_WEEK_TOLERANCE = 0.02; // 신고가 대비 2% 이내면 "신고가권"으로 인정

function detect52WeekHigh(series, minSimilarity) {
  const n = series.length;
  if (n < FIFTY_TWO_WEEK_MIN_DAYS) return null;
  const win = series.slice(Math.max(0, n - FIFTY_TWO_WEEK_WINDOW));
  const today = win[win.length - 1];
  const windowHigh = Math.max(...win.map((p) => p.c));
  if (windowHigh <= 0 || today.c < windowHigh * (1 - FIFTY_TWO_WEEK_TOLERANCE)) return null;

  const belowPct = ((windowHigh - today.c) / windowHigh) * 100;
  const closeness = 1 - Math.min(1, belowPct / (FIFTY_TWO_WEEK_TOLERANCE * 100)); // 1 = 정확히 신고가
  const coverageScore = Math.min(1, win.length / FIFTY_TWO_WEEK_WINDOW); // 실제 데이터가 52주에 가까울수록 신뢰도↑
  const similarity = Math.min(100, Math.round(55 + closeness * 30 + coverageScore * 15));
  if (similarity < minSimilarity) return null;

  return {
    patternId: "fifty_two_week_high",
    label: "52주 신고가",
    similarity,
    window: win.length,
    asOfDate: today.date,
    detail: { windowHigh: Math.round(windowHigh), belowHighPct: Math.round(belowPct * 10) / 10 },
  };
}

// 52주 신고가를 뒤집은 것 — 52주 신저가. 로직·톨러런스 전부 동일하고
// 최고가 대신 최저가 기준으로 비교함.
function detect52WeekLow(series, minSimilarity) {
  const n = series.length;
  if (n < FIFTY_TWO_WEEK_MIN_DAYS) return null;
  const win = series.slice(Math.max(0, n - FIFTY_TWO_WEEK_WINDOW));
  const today = win[win.length - 1];
  const windowLow = Math.min(...win.map((p) => p.c));
  if (windowLow <= 0 || today.c > windowLow * (1 + FIFTY_TWO_WEEK_TOLERANCE)) return null;

  const abovePct = ((today.c - windowLow) / windowLow) * 100;
  const closeness = 1 - Math.min(1, abovePct / (FIFTY_TWO_WEEK_TOLERANCE * 100)); // 1 = 정확히 신저가
  const coverageScore = Math.min(1, win.length / FIFTY_TWO_WEEK_WINDOW);
  const similarity = Math.min(100, Math.round(55 + closeness * 30 + coverageScore * 15));
  if (similarity < minSimilarity) return null;

  return {
    patternId: "fifty_two_week_low",
    label: "52주 신저가",
    similarity,
    window: win.length,
    asOfDate: today.date,
    detail: { windowLow: Math.round(windowLow), abovePriorLowPct: Math.round(abovePct * 10) / 10 },
  };
}

// ---------------------------------------------------------------------------
// 이동평균 교차(이평선형) — 골든크로스/데드크로스: 단기(20일) 이동평균이
// 장기(60일) 이동평균을 뚫고 올라가면(골든크로스)/내려가면(데드크로스)
// 잡히는, 국내 개인투자자들에게 가장 익숙한 추세전환 시그널 중 하나.
// 다른 패턴들과 달리 "어제는 아니었는데 오늘 막 교차했다"는 시점 자체를
// 잡는 이벤트형 판정이라, 매일 다시 평가함(전고점돌파와 비슷한 성격).
// ---------------------------------------------------------------------------

const MA_SHORT_PERIOD = 20;
const MA_LONG_PERIOD = 60;

// closes[endIndexExclusive - period .. endIndexExclusive - 1]의 단순 평균.
function sma(closes, period, endIndexExclusive) {
  const start = endIndexExclusive - period;
  if (start < 0) return null;
  let sum = 0;
  for (let i = start; i < endIndexExclusive; i++) sum += closes[i];
  return sum / period;
}

function detectMovingAverageCross(series, minSimilarity) {
  const n = series.length;
  if (n < MA_LONG_PERIOD + 1) return null; // 오늘·어제 둘 다 60일선을 계산할 수 있어야 함
  const closes = series.map((p) => p.c);

  const shortToday = sma(closes, MA_SHORT_PERIOD, n);
  const longToday = sma(closes, MA_LONG_PERIOD, n);
  const shortYesterday = sma(closes, MA_SHORT_PERIOD, n - 1);
  const longYesterday = sma(closes, MA_LONG_PERIOD, n - 1);
  if ([shortToday, longToday, shortYesterday, longYesterday].some((v) => v === null)) return null;

  const crossedUp = shortYesterday <= longYesterday && shortToday > longToday;
  const crossedDown = shortYesterday >= longYesterday && shortToday < longToday;
  if (!crossedUp && !crossedDown) return null;

  const gapPct = longToday > 0 ? Math.abs((shortToday - longToday) / longToday) * 100 : 0;
  const magnitudeScore = Math.min(1, gapPct / 2); // 2%+ 괴리면 만점

  // 장기이평 자체의 기울기로 "진짜 추세 전환"에 가까운지 가중치를 살짝 더 줌
  // (막 교차했는데 장기선이 여전히 반대 방향이면 다소 억지스러운 교차일 수 있음)
  const longWindow = closes.slice(n - MA_LONG_PERIOD);
  const longReg = linreg(longWindow);
  const longTrendPct = longToday > 0 ? ((longReg.slope * (MA_LONG_PERIOD - 1)) / longToday) * 100 : 0;
  const trendScore = crossedUp
    ? Math.min(1, Math.max(0, longTrendPct) / 10)
    : Math.min(1, Math.max(0, -longTrendPct) / 10);

  const similarity = Math.min(100, Math.round(55 + magnitudeScore * 25 + trendScore * 20));
  if (similarity < minSimilarity) return null;

  const asOfDate = series[n - 1].date;
  const detail = { gapPct: Math.round(gapPct * 10) / 10, shortPeriod: MA_SHORT_PERIOD, longPeriod: MA_LONG_PERIOD };
  return crossedUp
    ? { patternId: "golden_cross", label: "골든크로스", similarity, window: MA_LONG_PERIOD, asOfDate, detail }
    : { patternId: "dead_cross", label: "데드크로스", similarity, window: MA_LONG_PERIOD, asOfDate, detail };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

// Static metadata for every pattern this module can detect — useful for a
// frontend filter dropdown / legend even before any results come back.
export const PATTERN_DEFS = [
  { id: "breakout_prior_high", label: "전고점돌파", category: "돌파형", window: null },
  { id: "fifty_two_week_high", label: "52주 신고가", category: "돌파형", window: FIFTY_TWO_WEEK_WINDOW },
  { id: "golden_cross", label: "골든크로스", category: "돌파형", window: MA_LONG_PERIOD },
  { id: "double_bottom", label: "쌍바닥", category: "바닥형", window: 40 },
  { id: "triple_bottom", label: "삼중바닥", category: "바닥형", window: 55 },
  { id: "cup_and_handle", label: "컵앤핸들", category: "바닥형", window: 80 },
  { id: "u_bottom", label: "U자바닥", category: "바닥형", window: 35 },
  { id: "inverse_head_shoulders", label: "역헤드앤숄더", category: "바닥형", window: 55 },
  { id: "double_top", label: "쌍봉", category: "천정형", window: 40 },
  { id: "triple_top", label: "삼중천정", category: "천정형", window: 55 },
  { id: "head_shoulders_top", label: "헤드앤숄더", category: "천정형", window: 55 },
  { id: "rising_channel", label: "상승채널", category: "추세형", window: TREND_WINDOW },
  { id: "ascending_triangle", label: "상승삼각형", category: "추세형", window: TREND_WINDOW },
  { id: "falling_wedge", label: "하락쐐기", category: "추세형", window: TREND_WINDOW },
  { id: "box_range", label: "박스권", category: "추세형", window: TREND_WINDOW },
  { id: "falling_channel", label: "하락채널", category: "하락형", window: TREND_WINDOW },
  { id: "descending_triangle", label: "하락삼각형", category: "하락형", window: TREND_WINDOW },
  { id: "rising_wedge", label: "상승쐐기", category: "하락형", window: TREND_WINDOW },
  { id: "dead_cross", label: "데드크로스", category: "하락형", window: MA_LONG_PERIOD },
  { id: "fifty_two_week_low", label: "52주 신저가", category: "하락형", window: FIFTY_TWO_WEEK_WINDOW },
  { id: "pullback", label: "눌림목", category: "조정형", window: 30 },
  { id: "flag", label: "깃발", category: "조정형", window: 15 },
  { id: "three_white_soldiers", label: "적삼병", category: "캔들형", window: 3 },
  { id: "three_black_crows", label: "흑삼병", category: "캔들형", window: 3 },
];

// series: ascending [{date,o,h,l,c}, ...] for one stock. Returns matches
// sorted by similarity desc — empty array if nothing cleared minSimilarity.
export function detectPatternsForStock(series, { minSimilarity = 55 } = {}) {
  const results = [];
  const n = series.length;
  const closes = series.map((p) => p.c);

  for (const def of SHAPE_TEMPLATES) {
    if (n < def.window) continue;
    const windowCloses = closes.slice(n - def.window);
    const template = def.template(def.window);
    const similarity = correlationToSimilarity(correlation(template, windowCloses));
    if (similarity >= minSimilarity) {
      results.push({
        patternId: def.id,
        label: def.label,
        similarity,
        window: def.window,
        asOfDate: series[n - 1].date,
      });
    }
  }

  results.push(...detectTrendPatterns(series, minSimilarity));

  const extras = [
    detectPullback(series, minSimilarity),
    detectFlag(series, minSimilarity),
    detectThreeWhiteSoldiers(series, minSimilarity),
    detectThreeBlackCrows(series, minSimilarity),
    detectBreakout(series, minSimilarity),
    detect52WeekHigh(series, minSimilarity),
    detect52WeekLow(series, minSimilarity),
    detectMovingAverageCross(series, minSimilarity),
  ];
  for (const e of extras) if (e) results.push(e);

  return results.sort((a, b) => b.similarity - a.similarity);
}

// priceSeriesMap: the Map lib/priceHistory.js's buildPriceSeriesForAllStocks
// returns (code -> {name, market, series}). Returns { [patternId]: [{code,
// name, market, patternId, label, similarity, ...}, ...] }, each pattern's
// list sorted by similarity desc and capped at maxPerPattern.
export function scanAllStocksForPatterns(priceSeriesMap, { minSimilarity = 55, maxPerPattern = 20 } = {}) {
  const byPattern = new Map();

  // [2026-09-07 발견된 버그] 거래정지·관리종목처럼 최근에 거래가 안 되는
  // 종목은 series의 마지막 날짜가 다른 종목들보다 오래됨(정지되기 직전
  // 날짜에서 그대로 멈춰 있음). 그런데 모든 패턴 판정은 "series의 제일
  // 마지막 항목 = 오늘"이라고 가정하고 동작해서, 정지 직전에 우연히
  // 급등해있던 상태가 "오늘 막 전고점을 돌파했다/52주 신고가다"로 영원히
  // 고정되어 계속 잡히는 문제가 있었음(재성님이 캡처로 확인). 그래서 이
  // 스캔에 실제로 참여한 종목들 중 가장 최신 날짜를 구해서, 그보다 데이터가
  // 뒤처진(=최근 며칠 새 거래가 없었던) 종목은 아예 스캔에서 제외함.
  let latestDate = null;
  for (const stock of priceSeriesMap.values()) {
    const series = stock?.series;
    if (!Array.isArray(series) || series.length === 0) continue;
    const d = series[series.length - 1]?.date;
    if (d && (latestDate === null || d > latestDate)) latestDate = d;
  }

  for (const [code, stock] of priceSeriesMap.entries()) {
    const series = stock?.series;
    if (!Array.isArray(series) || series.length < 10) continue;
    // 최신 거래일 데이터가 없는(=거래정지 등으로 뒤처진) 종목은 제외.
    if (latestDate !== null && series[series.length - 1]?.date !== latestDate) continue;
    const matches = detectPatternsForStock(series, { minSimilarity });
    for (const m of matches) {
      if (!byPattern.has(m.patternId)) byPattern.set(m.patternId, []);
      byPattern.get(m.patternId).push({ code, name: stock.name, market: stock.market, ...m });
    }
  }

  const result = {};
  for (const [patternId, list] of byPattern.entries()) {
    list.sort((a, b) => b.similarity - a.similarity);
    result[patternId] = list.slice(0, maxPerPattern);
  }
  return result;
}
