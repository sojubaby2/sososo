// lib/overnight.js
//
// [2026-11-15 신설] "내일 장 미리 보기"(app/overnight) 자료 — 밤사이 미국장과 해외에 상장된 한국 주식을 한 화면에
//   재성님: (앤트위키의 야간선물 페이지를 참고로) "해봐 1번부터"
//   · 코스피 야간선물 숫자는 무료 공식 자료가 없어 넣지 않았습니다. 대신 미국에 상장된 한국 주식 ETF(EWY),
//     삼성전자 런던 GDR, SK하이닉스 미국 ADR, 나스닥 선물로 "밤사이 방향"을 봅니다.
//   · 자료: 야후(무료, 15~20분 지연) — 종목별 1분 저장(lib/quotes.js), 대표 종목 환산은 lib/flagships.js 그대로.
//   · 비용 0원. 비밀값 없음.

import { fetchEtfQuotes } from "./quotes";
import { fetchFlagships } from "./flagships";
import { memo } from "./memoCache";

// 화면에 보여 줄 묶음. kr = 같이 볼 국내 종목(차트 창으로 연결)
export const GROUPS = [
  {
    key: "index",
    title: "미국 지수와 선물",
    items: [
      { sym: "^IXIC", name: "나스닥" },
      { sym: "^GSPC", name: "S&P 500" },
      { sym: "^SOX", name: "필라델피아 반도체" },
      { sym: "NQ=F", name: "나스닥100 선물", note: "거의 24시간 거래" },
      { sym: "USDKRW=X", name: "원/달러 환율", fx: true },
      { sym: "^VIX", name: "변동성 지수(VIX)", inverse: true },
    ],
  },
  {
    key: "semi",
    title: "미국 반도체",
    items: [
      { sym: "NVDA", name: "엔비디아", kr: [["000660", "SK하이닉스", "코스피"], ["042700", "한미반도체", "코스피"]] },
      { sym: "MU", name: "마이크론", kr: [["005930", "삼성전자", "코스피"], ["000660", "SK하이닉스", "코스피"]] },
      { sym: "TSM", name: "TSMC", kr: [["000990", "DB하이텍", "코스피"]] },
      { sym: "AMD", name: "AMD", kr: [["007660", "이수페타시스", "코스피"]] },
      { sym: "AVGO", name: "브로드컴", kr: [["009150", "삼성전기", "코스피"]] },
    ],
  },
  {
    key: "big",
    title: "빅테크·전기차",
    items: [
      { sym: "TSLA", name: "테슬라", kr: [["373220", "LG에너지솔루션", "코스피"], ["247540", "에코프로비엠", "코스닥"]] },
      { sym: "AAPL", name: "애플", kr: [["011070", "LG이노텍", "코스피"]] },
      { sym: "MSFT", name: "마이크로소프트" },
      { sym: "GOOGL", name: "알파벳(구글)" },
    ],
  },
];
const KOREA_PROXY = { sym: "EWY", name: "미국 상장 한국 ETF(EWY)" };

const ALL = [...GROUPS.flatMap((g) => g.items.map((i) => i.sym)), KOREA_PROXY.sym];
const round = (v, d = 2) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : null);

// "밤사이 방향" 한 줄 — 아래 네 가지의 등락률 평균(있는 것만). 규칙을 화면에도 그대로 적습니다.
//   EWY(한국 ETF) · 필라델피아 반도체 · 삼성전자 GDR 환산 차이 · SK하이닉스 ADR 등락
export function moodOf(parts) {
  const vals = parts.map((p) => p.pct).filter((v) => typeof v === "number" && Number.isFinite(v));
  if (vals.length < 2) return null;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const label = avg >= 1 ? "강한 편" : avg >= 0.3 ? "조금 좋은 편" : avg > -0.3 ? "비슷한 편" : avg > -1 ? "조금 약한 편" : "약한 편";
  const tone = avg >= 0.3 ? "up" : avg <= -0.3 ? "down" : "flat";
  return { avg: round(avg), label, tone, used: vals.length };
}

async function compute() {
  const [quotes, flag] = await Promise.all([fetchEtfQuotes(ALL), fetchFlagships().catch(() => null)]);
  const q = (sym) => {
    const v = quotes.get(sym);
    return v ? { price: round(v.price, 2), changePct: round(v.changePct), asOf: v.asOf } : null;
  };
  const groups = GROUPS.map((g) => ({
    key: g.key,
    title: g.title,
    items: g.items.map((i) => ({ ...i, kr: (i.kr || []).map(([code, name, market]) => ({ code, name, market })), quote: q(i.sym) })),
  }));

  const korea = (flag?.items || []).map((f) => ({
    code: f.code,
    name: f.name,
    domestic: f.domestic ? { price: f.domestic.price ?? f.domestic.prevClose ?? null, asOf: f.domestic.asOf } : null,
    abroad: f.abroad
      ? { venue: f.abroad.venue, ticker: f.abroad.ticker, changePct: round(f.abroad.changePct), krwPerShare: f.abroad.krwPerShare, gapPct: round(f.abroad.gapPct), asOf: f.abroad.asOf }
      : null,
  }));
  const ewy = q(KOREA_PROXY.sym);
  const sox = q("^SOX");
  const sam = korea.find((k) => k.code === "005930");
  const hyn = korea.find((k) => k.code === "000660");
  const parts = [
    { label: "한국 ETF(EWY)", pct: ewy?.changePct ?? null },
    { label: "필라델피아 반도체", pct: sox?.changePct ?? null },
    { label: "삼성전자 GDR 환산 차이", pct: sam?.abroad?.gapPct ?? null },
    { label: "SK하이닉스 ADR", pct: hyn?.abroad?.changePct ?? null },
  ];
  return { fetchedAt: new Date().toISOString(), ewy: { ...KOREA_PROXY, quote: ewy }, korea, groups, parts, mood: moodOf(parts) };
}

export async function getOvernight() {
  return memo("overnight", 60 * 1000, compute);
}
