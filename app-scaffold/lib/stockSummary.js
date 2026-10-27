// lib/stockSummary.js
//
// [2026-10-27 신설] 종목 페이지 "한눈에 보기" — 일봉(lib/candles.js, 야후 무료 시세)으로
// 최근 흐름을 숫자와 문장으로 정리합니다. 투자 권유가 아니라 지난 기록의 요약입니다.

function pct(a, b) {
  return typeof a === "number" && typeof b === "number" && b ? ((a - b) / b) * 100 : null;
}

function avg(arr) {
  const xs = arr.filter((v) => typeof v === "number" && Number.isFinite(v));
  return xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null;
}

// candles: [{ d, o, h, l, c, v }] 오래된 → 최신
export function summarizeCandles(candles) {
  if (!Array.isArray(candles) || candles.length < 2) return null;
  const n = candles.length;
  const last = candles[n - 1];
  const prev = candles[n - 2];
  const back = (k) => candles[Math.max(0, n - 1 - k)];
  const closes = candles.map((x) => x.c);

  const ma = (k) => (n >= k ? avg(closes.slice(n - k)) : null);
  const ma20 = ma(20);
  const ma60 = ma(60);

  let hi = candles[0];
  let lo = candles[0];
  for (const x of candles) {
    if (x.h > hi.h) hi = x;
    if (x.l < lo.l) lo = x;
  }

  const vol20 = avg(candles.slice(-21, -1).map((x) => x.v));

  return {
    date: last.d,
    close: last.c,
    change: pct(last.c, prev.c),
    week: pct(last.c, back(5).c),
    month: pct(last.c, back(20).c),
    quarter: pct(last.c, back(60).c),
    periodDays: n,
    periodLabel: n >= 150 ? `${Math.round(n / 21)}개월` : `${n}거래일`,
    periodHigh: { price: hi.h, date: hi.d },
    periodLow: { price: lo.l, date: lo.d },
    fromHigh: pct(last.c, hi.h),
    fromLow: pct(last.c, lo.l),
    ma20,
    ma60,
    aboveMa20: typeof ma20 === "number" ? last.c >= ma20 : null,
    aboveMa60: typeof ma60 === "number" ? last.c >= ma60 : null,
    volume: last.v,
    volumeRatio: vol20 ? last.v / vol20 : null,
  };
}

const sign = (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
const won = (v) => `${Math.round(v).toLocaleString("ko-KR")}원`;
// 날짜 글자. 기준일(ref)과 해가 다르면 연도도 붙임 — 예) "2026년 1월 30일"
const md = (d, ref) =>
  `${ref && d.slice(0, 4) !== ref.slice(0, 4) ? `${d.slice(0, 4)}년 ` : ""}${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`;

// 사람이 읽는 문장 몇 개
export function describeSummary(name, s) {
  if (!s) return [];
  const lines = [];
  const moves = [];
  if (typeof s.week === "number") moves.push(`최근 1주 ${sign(s.week)}`);
  if (typeof s.month === "number") moves.push(`1개월 ${sign(s.month)}`);
  if (typeof s.quarter === "number") moves.push(`3개월 ${sign(s.quarter)}`);
  lines.push(
    `${name}의 최근 종가는 ${won(s.close)}${typeof s.change === "number" ? `(전일 대비 ${sign(s.change)})` : ""}이고, ${moves.join(", ")} 움직였습니다.`
  );
  lines.push(
    `최근 약 ${s.periodDays}거래일 동안 가장 높았던 가격은 ${md(s.periodHigh.date, s.date)}의 ${won(s.periodHigh.price)}, 가장 낮았던 가격은 ${md(s.periodLow.date, s.date)}의 ${won(s.periodLow.price)}입니다. ${
      s.fromHigh > -0.5
        ? "지금 가격은 이 기간 최고점 부근입니다."
        : s.fromLow < 0.5
        ? "지금 가격은 이 기간 최저점 부근입니다."
        : `지금 가격은 고점보다 ${Math.abs(s.fromHigh).toFixed(1)}% 낮고 저점보다 ${s.fromLow.toFixed(1)}% 높은 자리입니다.`
    }`
  );
  if (s.aboveMa20 !== null) {
    const a = s.aboveMa20 ? "위" : "아래";
    const b = s.aboveMa60 === null ? "" : `, 60일 평균선 ${s.aboveMa60 ? "위" : "아래"}`;
    lines.push(`주가는 20일 평균선 ${a}${b}에 있습니다.`);
  }
  if (typeof s.volumeRatio === "number" && s.volumeRatio >= 2) {
    lines.push(`최근 거래일 거래량은 20일 평균의 약 ${s.volumeRatio.toFixed(1)}배로, 평소보다 거래가 크게 늘었습니다.`);
  }
  return lines;
}
