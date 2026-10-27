// lib/ogImage.js
//
// [2026-10-27 신설] 카카오톡·문자·SNS에 링크를 올렸을 때 뜨는 "미리보기 그림"(1200×630) 공용 틀.
//
// 재성님 요청: 방문자를 늘릴 아이디어 중 "카카오톡 공유를 예쁘게".
// 칼럼(app/blog/[slug]/opengraph-image.js), 종목 페이지(app/stock/[code]/opengraph-image.js),
// 장 마감 정리(app/market/[date]/opengraph-image.js)가 이 틀을 씁니다.
//
// 그림은 처음 공유될 때 한 번 만들어 저장해 두고 재사용합니다(비용 0 — 바깥 서비스 안 씀).
// 한글 글꼴: lib/fonts/og-font-subset.ttf (Pretendard Bold를 한글 2,350자·영문만 남겨 줄인 것,
// SIL OFL 라이선스 — 같은 폴더의 og-font-LICENSE.txt)

export const OG_SIZE = { width: 1200, height: 630 };

import { readFile } from "node:fs/promises";
import { join } from "node:path";

// 글꼴 파일은 서버에서 직접 읽습니다(Next.js 공식 안내 방식 — 배포 때 파일이 같이 실려 갑니다).
let fontPromise = null;
export function loadOgFont() {
  if (!fontPromise) {
    fontPromise = readFile(join(process.cwd(), "lib/fonts/og-font-subset.ttf")).catch((e) => {
      fontPromise = null;
      throw e;
    });
  }
  return fontPromise;
}

export async function ogFonts() {
  return [{ name: "NewsmemeOG", data: await loadOgFont(), weight: 700, style: "normal" }];
}

const C = {
  bg: "#101216",
  panel: "#1a1d23",
  ink: "#f3f1ec",
  muted: "#a3a6ad",
  amber: "#f0a33a",
  up: "#ff5a64",
  down: "#5c9dff",
  line: "#2a2e36",
};
export const OG_COLORS = C;

// 글자가 너무 길면 줄임표
export function clip(text, max) {
  const s = String(text || "");
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// 공통 틀: 위쪽 브랜드 줄 + 가운데 내용(children) + 아래 주소 줄
export function OgFrame({ tag, children }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: C.bg,
        color: C.ink,
        fontFamily: "NewsmemeOG",
        padding: "56px 72px",
        position: "relative",
        wordBreak: "keep-all", // 한글 낱말 중간에서 줄이 바뀌지 않게
      }}
    >
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 14, background: C.amber, display: "flex" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <div style={{ display: "flex", fontSize: 34, color: C.amber, letterSpacing: -1 }}>뉴스매매</div>
        {tag && (
          <div
            style={{
              display: "flex",
              fontSize: 24,
              color: C.muted,
              border: `2px solid ${C.line}`,
              borderRadius: 999,
              padding: "6px 18px",
            }}
          >
            {tag}
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1, justifyContent: "center" }}>{children}</div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24, color: C.muted }}>
        <span>실시간 속보 · 관련주 자동 매칭</span>
        <span>newsmeme.co.kr</span>
      </div>
    </div>
  );
}
