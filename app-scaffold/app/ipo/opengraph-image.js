// app/ipo/opengraph-image.js
//
// [2026-10-27 신설] "공모주 정보" 링크를 카카오톡 등에 올렸을 때 뜨는 미리보기 그림.
// 재성님 요청: "공모주도!" (공시 일정·메인처럼 누르고 싶게)
//
// 그림에 들어가는 것: 지금 청약 중이거나 곧 청약하는 공모주 최대 4개 —
//   회사 이름 · 청약일 · 공모가(확정가 또는 희망가 위쪽) · 대표 주관사
// 자료는 공모주 페이지와 같은 DART 저장본(lib/ipo.js, 3시간)을 씁니다. 비용 0.

import { ImageResponse } from "next/og";
import { fetchIpoSchedule, statusOf, kstTodayIso } from "../../lib/ipo";
import { OgFrame, OG_SIZE, OG_COLORS as C, ogFonts, clip } from "../../lib/ogImage";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "뉴스매매 공모주 청약 일정";
export const revalidate = 3600;

const DAY = ["일", "월", "화", "수", "목", "금", "토"];
const md = (iso) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;
const wd = (iso) => DAY[new Date(`${iso}T00:00:00Z`).getUTCDay()];

export default async function Image() {
  const today = kstTodayIso();
  const data = await fetchIpoSchedule().catch(() => ({ items: [] }));
  const rows = (data.items || [])
    .map((it) => ({ it, st: statusOf(it, today) }))
    .filter((r) => r.st === "진행" || r.st === "예정")
    .sort((a, b) => (a.st === b.st ? (a.it.subStart < b.it.subStart ? -1 : 1) : a.st === "진행" ? -1 : 1));
  const live = rows.filter((r) => r.st === "진행").length;
  const next = rows.filter((r) => r.st === "예정").length;
  const show = rows.slice(0, 4);
  const headline = live > 0 ? `지금 청약 중 ${live}개 · 다가오는 청약 ${next}개` : next > 0 ? `다가오는 공모주 청약 ${next}개` : "공모주 청약 일정 한눈에";

  return new ImageResponse(
    (
      <OgFrame tag="공모주 청약">
        <div style={{ display: "flex", fontSize: 58, letterSpacing: -2 }}>{headline}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 28 }}>
          {show.length === 0 ? (
            <div style={{ display: "flex", fontSize: 32, color: C.muted }}>청약일 · 공모가 · 주관사를 DART 신고서로 자동 정리</div>
          ) : (
            show.map(({ it, st }) => (
              <div key={it.corpCode} style={{ display: "flex", alignItems: "baseline", gap: 18, fontSize: 32 }}>
                <span
                  style={{
                    display: "flex",
                    fontSize: 22,
                    padding: "4px 12px",
                    borderRadius: 999,
                    background: st === "진행" ? C.amber : C.panel,
                    color: st === "진행" ? "#1a1306" : C.muted,
                  }}
                >
                  {st === "진행" ? "청약 중" : "예정"}
                </span>
                <span style={{ color: C.amber, minWidth: 210 }}>
                  {md(it.subStart)}({wd(it.subStart)}){it.subEnd && it.subEnd !== it.subStart ? `~${md(it.subEnd)}` : ""}
                </span>
                <span>{clip(it.corpName, 11)}</span>
                {typeof it.price === "number" && (
                  <span style={{ color: C.muted, fontSize: 26 }}>{Math.round(it.price).toLocaleString("ko-KR")}원</span>
                )}
                {it.leadManagers?.[0] && <span style={{ color: C.muted, fontSize: 24 }}>{clip(it.leadManagers[0], 8)}</span>}
              </div>
            ))
          )}
        </div>
      </OgFrame>
    ),
    { ...size, fonts: await ogFonts() }
  );
}
