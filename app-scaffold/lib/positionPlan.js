// lib/positionPlan.js
//
// [2026-11-14 신설] "내 종목 분석기"(app/analyzer)의 계산 — 종목 일봉 + 내 평단가 → 손절·익절·물타기 기준 가격
//   재성님: (다른 사이트의 종목분석기 광고 영상을 보여 주며) "저런 기능을 만들어 줘"
//
//   ★ 이 계산은 AI 판단이나 추천이 아니라, 아래에 적힌 "정해진 규칙"을 그대로 적용한 값입니다.
//     화면의 "계산 방법" 칸에도 같은 규칙을 그대로 적어 둡니다(app/analyzer/AnalyzerClient.js).
//     규칙을 바꾸려면 아래 HORIZONS 숫자만 고치면 됩니다.
//
//   규칙(기간별 숫자는 HORIZONS):
//     · 지지선 = 최근 N거래일 중 가장 낮았던 가격(저가), 저항선 = 최근 N거래일 중 가장 높았던 가격(고가)
//     · 변동폭(ATR) = 최근 14거래일의 하루 평균 움직임 폭
//     · 손절 기준 = 지지선 − 변동폭의 절반. 단, 현재가와 너무 가까우면(3% 이내) 현재가 − 변동폭×k,
//                   너무 멀면 현재가의 −maxLoss%에서 자름
//     · 익절 기준 = 저항선. 단, 손절까지 거리의 1.5배보다 가까우면 그만큼으로 늘리고, 너무 멀면 자름
//     · 물타기 구간(손실 중일 때만) = 현재가와 손절 기준 사이의 40% 지점(1차), 75% 지점(2차)
//     · 수익 중이면 물타기 대신 "수익 지킴선" = 내 평단가와 20일 평균선 중 높은 쪽(현재가보다 낮을 때만)
//   모든 가격은 한국거래소 호가 단위로 맞춥니다.
//   비용 0원(브라우저에서 계산 — 서버·AI 사용 없음).

export const HORIZONS = {
  short: { label: "단기", sub: "1~2주", n: 10, k: 1.5, maxLoss: 0.1 },
  swing: { label: "스윙", sub: "1~3개월", n: 60, k: 2, maxLoss: 0.2 },
  mid: { label: "중기", sub: "3~6개월", n: 120, k: 3, maxLoss: 0.3 },
};

// 한국거래소 호가 단위(2023년 개편 기준)
export function tickSize(p) {
  if (p < 2000) return 1;
  if (p < 5000) return 5;
  if (p < 20000) return 10;
  if (p < 50000) return 50;
  if (p < 200000) return 100;
  if (p < 500000) return 500;
  return 1000;
}
export function roundTick(p) {
  const t = tickSize(p);
  return Math.max(t, Math.round(p / t) * t);
}

// "1,037,500" → "103만 7,500원"
export function wonKo(v) {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  const n = Math.round(v);
  if (n < 10000) return `${n.toLocaleString("ko-KR")}원`;
  const man = Math.floor(n / 10000);
  const rest = n % 10000;
  return rest ? `${man.toLocaleString("ko-KR")}만 ${rest.toLocaleString("ko-KR")}원` : `${man.toLocaleString("ko-KR")}만원`;
}

const pct = (a, b) => (b > 0 ? ((a - b) / b) * 100 : null);

function atr14(cs) {
  const m = Math.min(14, cs.length - 1);
  if (m < 1) return 0;
  let sum = 0;
  for (let i = cs.length - m; i < cs.length; i++) {
    const c = cs[i];
    const pc = cs[i - 1].c;
    sum += Math.max(c.h - c.l, Math.abs(c.h - pc), Math.abs(c.l - pc));
  }
  return sum / m;
}
function sma(cs, n) {
  if (cs.length < n) return null;
  let s = 0;
  for (let i = cs.length - n; i < cs.length; i++) s += cs[i].c;
  return s / n;
}

// candles: [{d,o,h,l,c,v}] (오래된 날 → 최근), avg: 내 평단가, horizon: "short" | "swing" | "mid"
export function buildPlan(candles, avg, horizon = "swing") {
  const H = HORIZONS[horizon] || HORIZONS.swing;
  const cs = Array.isArray(candles) ? candles.filter((c) => c && c.c > 0 && c.h > 0 && c.l > 0) : [];
  if (cs.length < 15 || !(avg > 0)) return null;

  const last = cs[cs.length - 1];
  const cur = last.c;
  const win = cs.slice(-H.n);
  const support = Math.min(...win.map((c) => c.l));
  const resistance = Math.max(...win.map((c) => c.h));
  const atr = atr14(cs) || cur * 0.02;
  const ma20 = sma(cs, 20);

  // 손절 기준
  let stop = support - atr * 0.5;
  let stopRule = "support";
  if (stop > cur * 0.97) {
    stop = cur - atr * H.k;
    stopRule = "atr";
  }
  if (stop < cur * (1 - H.maxLoss)) {
    stop = cur * (1 - H.maxLoss);
    stopRule = "cap";
  }
  stop = roundTick(stop);
  const risk = cur - stop;

  // 익절 기준
  let target = resistance;
  let targetRule = "resistance";
  if (target < cur + risk * 1.5) {
    target = cur + risk * 1.5;
    targetRule = "ratio";
  }
  if (target > cur * (1 + H.maxLoss * 2)) {
    target = cur * (1 + H.maxLoss * 2);
    targetRule = "cap";
  }
  target = roundTick(target);

  const losing = avg > cur;
  const plan = {
    horizon,
    horizonInfo: H,
    asOfDate: last.d,
    cur,
    avg,
    pnlPct: pct(cur, avg),
    atr,
    atrPct: (atr / cur) * 100,
    support,
    resistance,
    ma20,
    stop,
    stopRule,
    stopFromCurPct: pct(stop, cur),
    stopFromAvgPct: pct(stop, avg),
    target,
    targetRule,
    targetFromCurPct: pct(target, cur),
    targetFromAvgPct: pct(target, avg),
    rewardRisk: risk > 0 ? (target - cur) / risk : null,
    losing,
    belowStop: cur <= stop,
    breakevenNeedPct: losing ? pct(avg, cur) : null, // 본전까지 올라야 하는 폭
    adds: [],
    guard: null,
  };

  if (losing) {
    // 물타기 구간 — 같은 수량을 한 번씩 더 산다고 가정했을 때 바뀌는 평단
    const a1 = roundTick(cur - risk * 0.4);
    const a2 = roundTick(cur - risk * 0.75);
    plan.adds = [
      { step: 1, price: a1, fromCurPct: pct(a1, cur), newAvg: roundTick((avg + a1) / 2) },
      { step: 2, price: a2, fromCurPct: pct(a2, cur), newAvg: roundTick((avg + a1 + a2) / 3) },
    ].filter((a) => a.price > stop && a.price < cur);
  } else {
    // 수익 지킴선 — 평단가와 20일 평균선 중 높은 쪽(현재가 아래일 때만)
    const g = Math.max(avg, ma20 && ma20 < cur ? ma20 : 0);
    if (g > stop && g < cur) plan.guard = { price: roundTick(g), fromCurPct: pct(g, cur), rule: g === avg ? "avg" : "ma20" };
  }
  return plan;
}
