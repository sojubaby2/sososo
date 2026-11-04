// app/api/index-spark/route.js
//
// [2026-11-03 신설] 휴대폰 "시장" 탭 지수 칸(components/MobileInsight.js)의 작은 꺾은선(오늘 하루 흐름).
//   재성님이 보내 준 롱앤숏 화면처럼 칸마다 오늘 움직임을 선으로 보여 주려고 만든 주소입니다.
//   자료: 야후 차트(무료) — 종목 10개, 5분 간격 하루치. 시세는 15~20분 늦을 수 있습니다.
//   비용: 5분에 한 번만 실제로 받습니다(방문자가 몇 명이든 같은 저장본을 나눠 씀). 비밀값 없음.

import { unstable_cache } from "next/cache";

export const dynamic = "force-dynamic";

const YAHOO = "https://query1.finance.yahoo.com/v8/finance/chart";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

// 화면 칸 순서와 같은 목록(components/MobileInsight.js의 TILES와 맞춤)
const SYMBOLS = ["^KS11", "^KQ11", "^IXIC", "^DJI", "USDKRW=X", "^TNX", "CL=F", "GC=F", "BTC-USD", "DX-Y.NYB"];
const MAX_POINTS = 60;

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

async function one(sym) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetch(`${YAHOO}/${encodeURIComponent(sym)}?range=1d&interval=5m`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: ctl.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    const j = await res.json();
    const r = j?.chart?.result?.[0];
    if (!r) return null;
    const closes = (r.indicators?.quote?.[0]?.close || []).filter((v) => num(v) !== null);
    // 점이 너무 많으면 고르게 덜어 냄(그림만 그리면 되므로)
    let pts = closes;
    if (closes.length > MAX_POINTS) {
      const step = (closes.length - 1) / (MAX_POINTS - 1);
      pts = Array.from({ length: MAX_POINTS }, (_, i) => closes[Math.round(i * step)]);
    }
    const m = r.meta || {};
    const price = num(m.regularMarketPrice) ?? (closes.length ? closes[closes.length - 1] : null);
    // range=1d에서는 chartPreviousClose가 "어제 종가"입니다(5일 범위에서만 엉뚱한 값이 됨 — lib/quotes.js 설명 참고)
    const prev = num(m.chartPreviousClose) ?? num(m.previousClose);
    return {
      price,
      prev,
      changePct: price && prev ? ((price - prev) / prev) * 100 : null,
      at: num(m.regularMarketTime) ? new Date(m.regularMarketTime * 1000).toISOString() : null,
      pts: pts.map((v) => Math.round(v * 10000) / 10000),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

const cached = unstable_cache(
  async () => {
    const rows = await Promise.all(SYMBOLS.map((s) => one(s)));
    const items = {};
    SYMBOLS.forEach((s, i) => {
      if (rows[i]) items[s] = rows[i];
    });
    if (!Object.keys(items).length) throw new Error("야후 응답 없음"); // 실패는 저장하지 않음
    return { at: new Date().toISOString(), items };
  },
  ["index-spark-v1"],
  { revalidate: 300 }
);

export async function GET() {
  try {
    const data = await cached();
    return Response.json(data, { headers: { "Cache-Control": "public, max-age=0, s-maxage=120" } });
  } catch {
    return Response.json({ items: {} }, { headers: { "Cache-Control": "no-store" } });
  }
}
