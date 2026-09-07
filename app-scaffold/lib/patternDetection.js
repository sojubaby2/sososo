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
// intraday high (h) seen anywhere earlier in the stored history (up to
// HISTORY_LOOKBACK_DAYS back, now ~3년/750거래일 — see lib/priceHistory.js).
// Deliberately a *longer* lookback than 52주 신고가(FIFTY_TWO_WEEK_WINDOW=252,
// 아래 참고) — 52주보다 더 예전에 세워진 고점까지 넘어서야 진짜 "전고점돌파"라는
// 재성님 지적(2026-09-07)에 따라 둘을 서로 다른 의미의 지표로 분리함. Not a
// shape template at all — the closest thing to a pure yes/no signal in this
// file, scored by how far above the prior high and how long that prior high
// had stood.
// ---------------------------------------------------------------------------

// [2026-09-07 8차 수정] 재성님 요청 — 전고점돌파가 보던 "이전 최고가" 범위가
// (당시 저장 기간이 1년/260거래일이었어서) 사실상 52주 신고가랑 거의 같은
// 기간을 보고 있었음. 52주보다 더 예전 기록까지 봐야 의미가 있다는 지적에
// 따라, lib/priceHistory.js의 HISTORY_LOOKBACK_DAYS를 260 -> 750(약 3년)으로
// 늘림. 이 함수 자체는 그대로 "전달받은 series 전체"를 prior 구간으로 쓰므로
// (아래 참고) 코드 변경 없이 저장 기간이 늘어난 만큼 자동으로 더 먼 과거까지
// "전고점" 후보에 포함됨. 여전히 종가가 아니라 장중 고가(h) 기준으로 비교함
// (재성님 확인 완료 — 52주 신고가/신저가도 이미 고가/저가 기준으로 맞춰져
// 있음, 위 v10 변경 참고).
//
// [2026-09-07 6차 수정, 이후 재성님 확인 후 되돌림] 한때 "전고점"이 너무
// 최근에 세워진 경우(예: 며칠 전)는 안 잡히게 최소 보유일수 게이트를
// 넣었었는데, 재성님이 직접 예시로 설명해주신 정의는 그게 아니었음 —
// "직전까지의 모든 값 중 최고치를 새로 넘어서는 매 순간"이 다 전고점돌파고,
// 그 전고점이 바로 며칠 전에 세워진 것이었어도 상관없음(예: 20일째 26,000원
// 돌파, 25일째 27,000원 돌파, 30일째 28,000원 돌파 — 20↔25는 5일,
// 25↔30은 2일 간격이지만 전부 각각의 돌파로 인정). 그래서 그 게이트는
// 빼고 원래대로(직전 전체 기간 중 최고가를 오늘 종가가 넘으면 돌파)
// 되돌림 — daysSincePriorHigh는 점수(오래 버틴 고점일수록 더 의미
// 있다는 가중치)에만 계속 반영하고, 통과 여부 자체는 안 막음.
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

// [2026-09-07 7차 수정] 코리안리로 확인됨 — "52주 신고가"를 종가(c) 기준
// 최고가와 비교하고 있었는데, 실제 MTS/증권사 화면에서 말하는 "52주
// 신고가"는 그 기간 중 하루라도 찍은 최고가(고가, h) 기준임. 코리안리는
// 6월에 장중 17,560원까지 찍은 적이 있어서(그날 종가는 그보다 훨씬
// 낮았을 것) 진짜 52주 최고가는 17,560원인데, 종가만 비교하다 보니 그
// 스파이크가 잡히지 않고 최근 종가 상승분(15,470원)이 "역대 최고 종가"로
// 오인되어 52주 신고가로 잘못 잡혔음. 전고점돌파(detectBreakout)는 원래도
// 고가(h) 기준으로 이미 맞게 짜여 있었어서, 여기도 똑같이 고가 기준으로
// 맞춤 — "현재가(종가)가 지난 52주 동안의 장중 최고가에 얼마나 가까운가"로
// 봐야 진짜 스크리너 정의에 맞음.
function detect52WeekHigh(series, minSimilarity) {
  const n = series.length;
  if (n < FIFTY_TWO_WEEK_MIN_DAYS) return null;
  const win = series.slice(Math.max(0, n - FIFTY_TWO_WEEK_WINDOW));
  const today = win[win.length - 1];
  const windowHigh = Math.max(...win.map((p) => p.h));
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
// 최고가 대신 최저가 기준으로 비교함. (마찬가지로 종가가 아니라 저가(l)
// 기준으로 맞춤 — 위 detect52WeekHigh 주석 참고.)
function detect52WeekLow(series, minSimilarity) {
  const n = series.length;
  if (n < FIFTY_TWO_WEEK_MIN_DAYS) return null;
  const win = series.slice(Math.max(0, n - FIFTY_TWO_WEEK_WINDOW));
  const today = win[win.length - 1];
  const windowLow = Math.min(...win.map((p) => p.l));
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
// [2026-09-07 추가] description: 재성님 요청으로 패턴마다 한 줄짜리 쉬운
// 설명을 붙임(패턴검색 페이지에 그대로 노출).
export const PATTERN_DEFS = [
  {
    id: "breakout_prior_high",
    label: "전고점돌파",
    category: "돌파형",
    window: null,
    description:
      "최근 3년(최대 약 750거래일) 안에서 이제껏 없었던 최고가(장중 고가 기준)를 오늘 종가가 처음 넘어서는 순간을 찾습니다.",
  },
  {
    id: "fifty_two_week_high",
    label: "52주 신고가",
    category: "돌파형",
    window: FIFTY_TWO_WEEK_WINDOW,
    description: "최근 52주(약 252거래일) 동안의 장중 최고가에 근접했거나 이를 넘어선 상태를 매일 확인합니다.",
  },
  {
    id: "golden_cross",
    label: "골든크로스",
    category: "돌파형",
    window: MA_LONG_PERIOD,
    description: "20일 이동평균선이 60일 이동평균선을 아래에서 위로 뚫고 올라가는 상승 전환 신호입니다.",
  },
  {
    id: "double_bottom",
    label: "쌍바닥",
    category: "바닥형",
    window: 40,
    description: "비슷한 저점을 두 번 찍고 반등하는 'W자' 모양의 바닥 패턴입니다.",
  },
  {
    id: "triple_bottom",
    label: "삼중바닥",
    category: "바닥형",
    window: 55,
    description: "비슷한 저점을 세 번 찍고 올라오는, 쌍바닥보다 더 견고한 바닥 패턴입니다.",
  },
  {
    id: "cup_and_handle",
    label: "컵앤핸들",
    category: "바닥형",
    window: 80,
    description: "완만한 U자형 바닥(컵)을 만든 뒤 짧게 눌렸다가(핸들) 다시 상승하는 패턴입니다.",
  },
  {
    id: "u_bottom",
    label: "U자바닥",
    category: "바닥형",
    window: 35,
    description: "급락 없이 완만하게 내려갔다가 다시 완만하게 올라오는 U자 모양의 바닥권입니다.",
  },
  {
    id: "inverse_head_shoulders",
    label: "역헤드앤숄더",
    category: "바닥형",
    window: 55,
    description: "가운데 저점(머리)이 양옆 저점(어깨)보다 더 깊은 3중 바닥으로, 대표적인 상승 반전 신호입니다.",
  },
  {
    id: "double_top",
    label: "쌍봉",
    category: "천정형",
    window: 40,
    description: "비슷한 고점을 두 번 찍고 꺾이는 'M자' 모양의 천정 패턴으로, 하락 반전 가능성을 나타냅니다.",
  },
  {
    id: "triple_top",
    label: "삼중천정",
    category: "천정형",
    window: 55,
    description: "비슷한 고점을 세 번 찍고 무너지는, 쌍봉보다 더 뚜렷한 천정 패턴입니다.",
  },
  {
    id: "head_shoulders_top",
    label: "헤드앤숄더",
    category: "천정형",
    window: 55,
    description: "가운데 고점(머리)이 양옆 고점(어깨)보다 더 높은 3중 천정으로, 대표적인 하락 반전 신호입니다.",
  },
  {
    id: "rising_channel",
    label: "상승채널",
    category: "추세형",
    window: TREND_WINDOW,
    description: "일정한 기울기로 상승하며 그 흐름 주변을 좁게 오가는 우상향 추세입니다.",
  },
  {
    id: "ascending_triangle",
    label: "상승삼각형",
    category: "추세형",
    window: TREND_WINDOW,
    description: "저항선(고가)은 평평한데 지지선(저가)은 계속 올라와 범위가 좁아지는, 상승 돌파를 앞둔 패턴입니다.",
  },
  {
    id: "falling_wedge",
    label: "하락쐐기",
    category: "추세형",
    window: TREND_WINDOW,
    description: "고가와 저가가 둘 다 내려가지만 저가가 더 완만하게 내려와 범위가 좁아지는, 상승 반전 가능성이 있는 패턴입니다.",
  },
  {
    id: "box_range",
    label: "박스권",
    category: "추세형",
    window: TREND_WINDOW,
    description: "뚜렷한 방향 없이 일정한 가격대 안에서 오르내리는 횡보 구간입니다.",
  },
  {
    id: "falling_channel",
    label: "하락채널",
    category: "하락형",
    window: TREND_WINDOW,
    description: "일정한 기울기로 하락하며 그 흐름 주변을 좁게 오가는 우하향 추세입니다.",
  },
  {
    id: "descending_triangle",
    label: "하락삼각형",
    category: "하락형",
    window: TREND_WINDOW,
    description: "지지선(저가)은 평평한데 저항선(고가)은 계속 낮아져 범위가 좁아지는, 하락 돌파를 앞둔 패턴입니다.",
  },
  {
    id: "rising_wedge",
    label: "상승쐐기",
    category: "하락형",
    window: TREND_WINDOW,
    description: "고가와 저가가 둘 다 올라가지만 저가가 더 가파르게 따라붙어 범위가 좁아지는, 대표적인 하락 반전 신호입니다.",
  },
  {
    id: "dead_cross",
    label: "데드크로스",
    category: "하락형",
    window: MA_LONG_PERIOD,
    description: "20일 이동평균선이 60일 이동평균선을 위에서 아래로 뚫고 내려가는 하락 전환 신호입니다.",
  },
  {
    id: "fifty_two_week_low",
    label: "52주 신저가",
    category: "하락형",
    window: FIFTY_TWO_WEEK_WINDOW,
    description: "최근 52주(약 252거래일) 동안의 장중 최저가에 근접했거나 이를 밑돈 상태를 매일 확인합니다.",
  },
  {
    id: "pullback",
    label: "눌림목",
    category: "조정형",
    window: 30,
    description: "많이 오른 뒤 상승폭의 일부(약 15~65%)를 되돌리며 잠시 쉬어가는 조정 구간입니다.",
  },
  {
    id: "flag",
    label: "깃발",
    category: "조정형",
    window: 15,
    description: "급등(깃대) 이후 좁은 범위에서 짧게 횡보하는(깃발) 구간으로, 상승이 재개될 가능성이 있는 패턴입니다.",
  },
  {
    id: "three_white_soldiers",
    label: "적삼병",
    category: "캔들형",
    window: 3,
    description: "3거래일 연속으로 몸통이 큰 양봉이 이어지며 종가가 계속 높아지는 강한 상승 신호입니다.",
  },
  {
    id: "three_black_crows",
    label: "흑삼병",
    category: "캔들형",
    window: 3,
    description: "3거래일 연속으로 몸통이 큰 음봉이 이어지며 종가가 계속 낮아지는 강한 하락 신호입니다.",
  },
];

// [2026-09-07 4차 수정] 재성님이 보내주신 미스터블루/아이큐어/지엘팜텍/
// 사조동아원/온타이드 사례를 진단해보니, 이번엔 "여전히 거래정지 상태"가
// 아니라 다른 종류의 데이터 불연속 문제였음 — 관리종목 회피를 위한
// 액면병합(주식병합)·감자 등을 겪은 종목은, 그 시점을 기준으로 이전 종가는
// 옛 주식 수 기준, 이후 종가는 새 주식 수 기준으로 찍혀서, 같은 시리즈
// 안에 "서로 다른 잣대로 잰" 숫자가 섞이게 됨(재성님이 스크린샷으로 보여준
// MTS 차트는 이걸 "수정주가"로 보정해서 보여주지만, 우리가 KRX에서 받는
// 원본 데이터는 그런 보정이 없음).
//
// 그런데 한국 증시는 하루 가격제한폭이 ±30%로 정해져 있어서, 정상적인
// 거래로는 하루 만에 종가가 그보다 더 벌어질 수가 없음 — 그래서 하루
// 만에 30%를 훌쩍 넘게 움직인 지점이 있다면, 그건 거의 확실히 액면병합·
// 감자·거래재개 같은 "기준이 바뀐 지점"이라고 봐도 됨. 그 지점 이전
// 데이터는 지금 기준과 비교가 안 되는 다른 잣대의 숫자이므로, 패턴
// 분석에서는 아예 잘라내고 그 이후 데이터만 씀 — 전고점돌파·52주 신고가처럼
// "과거 대비 지금이 높은가"를 보는 패턴일수록 이 불연속에 특히 취약해서
// 효과가 큼. 기준이 바뀐 직후라 남은 데이터가 적으면, 그만큼 필요한
// 기간이 안 채워진 패턴은 자연스럽게 안 잡힘 — 이게 맞는 동작임(비교할
// "과거"가 아직 없으니까 안 잡히는 게 정상).
const DISCONTINUITY_JUMP_RATIO = 0.32; // 국내 가격제한폭(±30%)보다 살짝 여유를 둠

export function trimAtLastDiscontinuity(series) {
  let startIndex = 0;
  for (let i = 1; i < series.length; i++) {
    const prevClose = series[i - 1].c;
    const curClose = series[i].c;
    if (!prevClose || !curClose) continue;
    if (Math.abs(curClose - prevClose) / prevClose > DISCONTINUITY_JUMP_RATIO) {
      startIndex = i; // 이 지점부터 다시 시작 — 이전 구간은 버림
    }
  }
  return startIndex > 0 ? series.slice(startIndex) : series;
}

// [2026-09-07 5차 수정 — 진짜진짜 원인] 아이큐어로 다시 확인해보니, 위
// 4차 수정(하루 ±32% 불연속 트림)으로도 안 잡히는 경우가 있었음: 아이큐어는
// 저장된 260일 전체가 시가=고가=저가=0(거래정지 placeholder)이다가, 딱
// 오늘(재개일) 하루만 진짜 데이터가 있었음. 그런데 정지 중 "종가"로 찍힌
// 기준가(2170)가 재개일 종가(2110)랑 겨우 2.7%밖에 차이 안 나서, ±32%
// 불연속 기준을 안 넘어 트림이 아예 발동을 안 했음. 문제는 전고점돌파가
// "고가"(h)로 이전 최고가를 계산하는데, 정지 기간 내내 h=0으로 찍혀있으니
// prior 구간의 최고가가 그냥 0이 되어버려서 — 재개일에 어떤 가격이든
// "0원보다는 높으니" 무조건 "전고점돌파"로 잡혀버렸던 것(52주 신저가도
// 같은 이유로 됨: 저장된 종가들이 전부 2170으로 똑같다가 재개일 종가
// 2110이 그보다 낮으니 "52주 신저가"로 잡힘 — 역시 가짜).
// 근본 원인은 "거래정지 동안 찍힌 placeholder 행(hasNoRealTrade)을 마치
// 진짜 시세인 것처럼 계산에 넣고 있었다"는 것 — 그래서 아예 그런 행들을
// series에서 통째로 제거하고 시작하도록 함. 이러면 아이큐어처럼 진짜
// 거래일이 딱 하루뿐인 종목은 n=1이 되어, 모든 패턴이 요구하는 최소 기간
// (전고점돌파 20일, 52주 신고/신저가 60일 등)을 못 채워서 자연스럽게
// 아무 패턴도 안 잡힘 — "판단할 진짜 데이터가 부족하다"가 맞는 결론.
export function filterRealTradingDays(series) {
  return series.filter((p) => !hasNoRealTrade(p));
}

// series: ascending [{date,o,h,l,c}, ...] for one stock. Returns matches
// sorted by similarity desc — empty array if nothing cleared minSimilarity.
export function detectPatternsForStock(series, { minSimilarity = 55 } = {}) {
  series = filterRealTradingDays(series);
  series = trimAtLastDiscontinuity(series);
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

// [2026-09-07 발견된 버그 — 1차 수정] 거래정지·관리종목처럼 최근에 거래가
// 안 되는 종목은 series의 마지막 날짜가 다른 종목들보다 오래될 거라고
// 가정하고, 그런 종목을 최신 날짜 기준으로 걸러내는 코드를 아래
// scanAllStocksForPatterns()에 추가했었음.
//
// [2026-09-07 발견된 버그 — 2차 수정, 진짜 원인] 그런데도 재성님이 계속
// 캡처로 확인해줘서 다시 살펴보니, 그 가정 자체가 틀렸음 — KRX 정식 API는
// 거래정지 종목도 "오늘" 날짜로 매일 데이터를 내려줌. 다만 실제로 거래가
// 없었으니 시가·고가·저가·종가를 정지 직전 마지막 값 그대로("얼어붙은
// 채") 반복해서 줌. 그래서 날짜만 보는 1차 수정으로는 전혀 안 걸러졌던
// 것. 이게 두 가지 방식으로 오탐을 만들어냄:
//   ① 52주 신고가처럼 "지금 고점권에 머물러 있는가"를 매일 재판정하는
//      패턴 — 가격이 그 자리에 영원히 멈춰있으니 "그 가격이 곧 최고가"인
//      상태가 끝없이 이어져서 계속 100%로 잡힘.
//   ② 하락쐐기·상승채널 같은 추세형 패턴 — 구간 끝부분의 가격 변동폭이
//      정확히 0(고가-저가=0, 어제-오늘 변동=0)이 되니, "변동성이 완벽히
//      수렴/수축했다"고 수학적으로 만점에 가깝게 오판함. 유사도가 유독
//      90% 이상으로 몰려 있던 것도 상당 부분 이 현상 때문으로 보임 —
//      변동이 0인 구간은 어떤 추세/채널 패턴에도 "완벽하게" 들어맞아
//      버리기 때문.
// 그래서 날짜 체크는 (다른 이유로 아예 그날 데이터 자체가 안 들어온
// 경우를 위해) 그대로 두고, 그 위에 "최근 며칠간 실질적인 가격 변동이
// 전혀 없었는가"를 직접 검사하는 필터를 추가함 — 이게 진짜 수정.
// ---------------------------------------------------------------------------

// 재성님 요청: "최근 일주일" 기준. 국내 거래일 기준 5거래일 ≈ 1주일.
const INACTIVITY_LOOKBACK_DAYS = 5;

// [2026-09-07 3차 수정 — 진짜 원인 확인됨] 재성님이 알려주신 삼부토건
// (001470)·에스아이리소스(065420)로 임시 진단 엔드포인트(app/api/
// debug-stock)를 만들어 원본 데이터를 직접 까봤더니, 2차 수정 때 세웠던
// "정지되면 시가=고가=저가=종가로 얼어붙는다"는 가정이 틀렸었음. 실제로는:
//   - 거래정지일에는 시가·고가·저가가 전부 0으로 내려옴(그날 실제 체결이
//     단 한 건도 없었다는 뜻 — 정상적으로 거래된 종목의 가격은 절대 0이
//     될 수 없음).
//   - 종가만 KRX가 매기는 기준가(정리매매기준가 등으로 추정)로 채워지는데,
//     이 기준가는 실제 거래 없이도 하루 만에 크게 뛸 수 있음(예:
//     에스아이리소스는 94원 -> 940원으로 정확히 10배 점프, 실거래 없이).
// 그래서 "최근 며칠간 종가가 똑같은가"로 판단하던 2차 수정은, 하필 그
// 점프 시점이 최근 5일 안에 껴 있으면 통과시켜버렸던 것 — 이게 계속
// 안 잡히던 진짜 이유. 시가=고가=저가=0인 날은 훨씬 직접적이고 확실한
// "오늘 실거래 없음" 신호라, 이걸 최우선으로 검사함(단 하루만 그래도
// 즉시 제외 — 며칠 쌓일 때까지 기다릴 필요 없음).
function hasNoRealTrade(day) {
  return day.o === 0 && day.h === 0 && day.l === 0;
}

// 거래정지/관리종목 등 "실질적으로 거래가 없는" 종목을 판별함. 여러 신호를
// 같이 씀(가장 신뢰도 높은 것부터):
//  1) 오늘 시가·고가·저가가 전부 0 — 위 hasNoRealTrade 참고. 가장 직접적인
//     신호라 이거 하나만으로도 바로 제외.
//  2) 거래량(v) 데이터가 있는 경우 — 최근 INACTIVITY_LOOKBACK_DAYS일 연속
//     거래량이 0이면 거래정지로 판단. (v는 2026-09-07 이후 새로 쌓이는
//     데이터부터 저장되므로 예전 히스토리에는 없을 수 있음 — 지금은 KRX
//     응답의 정확한 거래량 필드명을 못 찾아서 항상 비어있을 수도 있음.
//     그래도 있으면 쓰고, 없으면 그냥 통과시키는 구조라 해는 없음.)
//  3) 위 두 신호가 다 없어도 안전하게 걸러지도록, 최근 며칠간 종가가
//     "완전히 동일"하면(정지 중 기준가가 안 바뀐 채로 오래 이어진 경우)
//     이것도 거래정지로 간주. (1)과 달리 여러 날이 필요해서 반응은 더
//     느리지만, (1)이 놓치는 경우의 보조 안전망.
export function isLikelyInactive(series) {
  const n = series.length;
  if (n < 1) return false;

  const today = series[n - 1];
  if (hasNoRealTrade(today)) return true;

  if (n < 3) return false;

  if (n >= INACTIVITY_LOOKBACK_DAYS) {
    const recent = series.slice(n - INACTIVITY_LOOKBACK_DAYS);
    if (recent.every((p) => typeof p.v === "number" && p.v === 0)) return true;
    if (recent.every((p) => p.c === recent[0].c)) return true;
  }

  const recent3 = series.slice(n - 3);
  const isFlatDay = (p) => p.o === p.c && p.h === p.c && p.l === p.c;
  if (recent3.every(isFlatDay) && recent3.every((p) => p.c === recent3[0].c)) return true;

  return false;
}

// priceSeriesMap: the Map lib/priceHistory.js's buildPriceSeriesForAllStocks
// returns (code -> {name, market, series}). Returns { [patternId]: [{code,
// name, market, patternId, label, similarity, ...}, ...] }, each pattern's
// list sorted by similarity desc and capped at maxPerPattern.
export function scanAllStocksForPatterns(priceSeriesMap, { minSimilarity = 55, maxPerPattern = 20 } = {}) {
  const byPattern = new Map();

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
    // 그날 데이터 자체가 없는(뒤처진) 종목 제외 — 1차 방어선.
    if (latestDate !== null && series[series.length - 1]?.date !== latestDate) continue;
    // 데이터는 매일 들어오지만 실질적으로 안 움직이는(거래정지 등) 종목
    // 제외 — 진짜 원인에 대한 2차(핵심) 방어선.
    if (isLikelyInactive(series)) continue;
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
