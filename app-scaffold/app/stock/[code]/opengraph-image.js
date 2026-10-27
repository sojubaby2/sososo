// app/stock/[code]/opengraph-image.js
//
// [2026-10-27 신설] 종목 페이지 링크를 카카오톡 등에 올렸을 때 뜨는 미리보기 그림.
// 종목명·코드·시장, 그림을 만든 시점의 종가와 등락률, 속한 테마가 들어갑니다.
// (카카오톡은 한 번 받아 간 그림을 한동안 다시 쓰므로, 가격은 "그 날짜 기준"으로 표시합니다.)

import { ImageResponse } from "next/og";
import { getStock } from "../../../lib/stockDirectory";
import { fetchDailyCandles } from "../../../lib/candles";
import { OgFrame, OG_SIZE, OG_COLORS as C, ogFonts, clip } from "../../../lib/ogImage";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "뉴스매매 종목 정보";
export const revalidate = 3600;

export default async function Image({ params }) {
  const code = String(params.code || "").toUpperCase();
  const dir = getStock(code);
  const chart = /^[0-9A-Z]{6}$/.test(code) ? await fetchDailyCandles(code, dir?.market || "").catch(() => null) : null;
  const cs = chart?.candles || [];
  const last = cs[cs.length - 1];
  const prev = cs[cs.length - 2];
  const chg = last && prev ? ((last.c - prev.c) / prev.c) * 100 : null;
  const color = chg === null ? C.muted : chg > 0 ? C.up : chg < 0 ? C.down : C.muted;
  const name = clip(dir?.name || code, 14);
  const themes = (dir?.themes || []).slice(0, 4);
  const market = chart?.market || dir?.market || "";

  return new ImageResponse(
    (
      <OgFrame tag="종목 정보">
        <div style={{ display: "flex", alignItems: "baseline", gap: 24 }}>
          <div style={{ display: "flex", fontSize: 92, letterSpacing: -3 }}>{name}</div>
          <div style={{ display: "flex", fontSize: 36, color: C.muted }}>
            {code}
            {market ? ` · ${market}` : ""}
          </div>
        </div>
        {last && (
          <div style={{ display: "flex", alignItems: "baseline", gap: 26, marginTop: 18 }}>
            <div style={{ display: "flex", fontSize: 64 }}>{Math.round(last.c).toLocaleString("ko-KR")}원</div>
            {chg !== null && (
              <div style={{ display: "flex", fontSize: 52, color }}>
                {chg > 0 ? "▲ +" : chg < 0 ? "▼ " : ""}
                {chg.toFixed(2)}%
              </div>
            )}
            <div style={{ display: "flex", fontSize: 26, color: C.muted }}>{last.d} 기준</div>
          </div>
        )}
        {themes.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 30 }}>
            {themes.map((t) => (
              <div
                key={t}
                style={{ display: "flex", fontSize: 28, padding: "8px 20px", borderRadius: 999, background: C.panel, color: C.amber }}
              >
                {clip(t, 16)}
              </div>
            ))}
          </div>
        )}
      </OgFrame>
    ),
    { ...size, fonts: await ogFonts() }
  );
}
