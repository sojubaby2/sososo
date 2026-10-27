// app/market/[date]/opengraph-image.js
//
// [2026-10-27 신설] 장 마감 정리 링크를 카카오톡 등에 올렸을 때 뜨는 미리보기 그림.
// 날짜, 강했던 테마 3개, 상승률 상위 3종목이 들어갑니다.

import { ImageResponse } from "next/og";
import { getMarketDay, koreanDate } from "../../../lib/marketDay";
import { OgFrame, OG_SIZE, OG_COLORS as C, ogFonts, clip } from "../../../lib/ogImage";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "뉴스매매 장 마감 정리";
export const revalidate = 3600;

const pct = (v) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;

export default async function Image({ params }) {
  const d = await getMarketDay(params.date).catch(() => null);
  const title = d ? `${koreanDate(d.date)} 장 마감 정리` : "장 마감 정리";
  return new ImageResponse(
    (
      <OgFrame tag="장 마감 정리">
        <div style={{ display: "flex", fontSize: 64, letterSpacing: -2 }}>{title}</div>
        {d && (
          <div style={{ display: "flex", gap: 48, marginTop: 34 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", fontSize: 26, color: C.muted }}>강했던 테마</div>
              {d.themesUp.slice(0, 3).map((t) => (
                <div key={t.theme} style={{ display: "flex", fontSize: 34, gap: 14 }}>
                  <span>{clip(t.theme, 12)}</span>
                  <span style={{ color: t.avg >= 0 ? C.up : C.down }}>{pct(t.avg)}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", fontSize: 26, color: C.muted }}>상승률 상위</div>
              {d.gainers.slice(0, 3).map((s) => (
                <div key={s.code} style={{ display: "flex", fontSize: 34, gap: 14 }}>
                  <span>{clip(s.name, 10)}</span>
                  <span style={{ color: C.up }}>{pct(s.chg)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </OgFrame>
    ),
    { ...size, fonts: await ogFonts() }
  );
}
