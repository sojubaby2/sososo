// lib/marketStrip.js
//
// [2026-10-20 신설] 브리핑 밴드 아래 지수 띠에 들어가는 "환율·금리"와
// "원자재" 목록입니다.
//
// 왜 만들었나:
// 지금까지 띠에는 세계 주가지수만 있었습니다. 재성님이 보신 다른 사이트처럼
// 탭을 나눠서 환율·금리·원자재까지 한자리에서 보게 합니다.
//
// 비용: 전부 야후에서 가져오고(lib/quotes.js), 5분 저장이 걸려 있습니다.
// 종목 수가 늘어도 방문자 수와는 무관하게 5분에 한 번씩만 나갑니다.
//
// 기호를 더하거나 빼고 싶으면 이 배열만 고치면 됩니다.
// 어떤 줄이 계속 "—"로 비면 그 기호를 야후가 안 주는 것이니, 주소창에
// query1.finance.yahoo.com/v8/finance/chart/<기호> 를 직접 열어보면
// 바로 확인됩니다.

export const FX_RATES = [
  { symbol: "USDKRW=X", label: "달러/원" },
  { symbol: "JPYKRW=X", label: "엔/원", scale: 100, note: "100엔" },
  { symbol: "EURKRW=X", label: "유로/원" },
  { symbol: "CNYKRW=X", label: "위안/원" },
  { symbol: "DX-Y.NYB", label: "달러지수" },
  // ^TNX는 미국 10년물 국채 금리입니다. 값 자체가 퍼센트(예: 4.21)입니다.
  { symbol: "^TNX", label: "미 국채 10년", suffix: "%" },
  { symbol: "^FVX", label: "미 국채 5년", suffix: "%" },
];

export const COMMODITIES = [
  { symbol: "CL=F", label: "WTI 유가" },
  { symbol: "BZ=F", label: "브렌트유" },
  { symbol: "GC=F", label: "금" },
  { symbol: "SI=F", label: "은" },
  { symbol: "HG=F", label: "구리" },
  { symbol: "NG=F", label: "천연가스" },
  { symbol: "BTC-USD", label: "비트코인" },
];

export const STRIP_SYMBOLS = [...FX_RATES, ...COMMODITIES].map((r) => r.symbol);

// 야후에서 받아온 값(Map)을 화면이 바로 쓸 수 있는 줄 목록으로 바꿉니다.
// 못 받아온 기호는 아예 빼버립니다 — "—"만 잔뜩 뜨는 것보다 낫습니다.
export function toStripRows(defs, quotes) {
  const rows = [];
  for (const d of defs) {
    const q = quotes?.get?.(d.symbol) || quotes?.[d.symbol];
    if (!q || typeof q.price !== "number") continue;
    rows.push({
      key: d.symbol,
      label: d.note ? `${d.label}(${d.note})` : d.label,
      close: d.scale ? q.price * d.scale : q.price,
      changePct: typeof q.changePct === "number" ? q.changePct : null,
      suffix: d.suffix || "",
    });
  }
  return rows;
}
