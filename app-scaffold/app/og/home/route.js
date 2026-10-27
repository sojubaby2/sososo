// app/og/home/route.js
//
// [2026-10-27 신설] 메인 홈(newsmeme.co.kr) 링크를 카카오톡 등에 올렸을 때 뜨는 미리보기 그림.
// 재성님 요청: "메인홈페이지 링크공유시도 좀 바꿔줘"
//
// 예전: 고정 그림(public/og-image.png)
// 지금: 방금 들어온 속보 3개(시각·제목·관련 종목)가 들어간 그림 — "지금 뭐가 터졌지?" 싶게.
//   속보는 홈과 같은 5분 저장본(lib/recentFeed.js)을 써서 비용이 늘지 않습니다. 그림은 10분 저장.
//
// 왜 app/opengraph-image.js가 아니라 이 주소인가: 그 파일 이름을 쓰면 다른 모든 페이지(용어사전 등)까지
// 이 속보 그림으로 바뀝니다. 홈에만 쓰려고 따로 주소(/og/home)를 만들고 app/page.js에서 이 그림을 지정합니다.

import { ImageResponse } from "next/og";
import { getRecentFeed, kstDateTimeText } from "../../../lib/recentFeed";
import { decodeEntities } from "../../../lib/decodeEntities";
import { OgFrame, OG_SIZE, OG_COLORS as C, ogFonts, clip } from "../../../lib/ogImage";

export const revalidate = 600;

export async function GET() {
  const feed = await getRecentFeed();
  const items = feed.filter((it) => it.title && (it.matches || []).length).slice(0, 3);

  const image = new ImageResponse(
    (
      <OgFrame tag="실시간 속보">
        <div style={{ display: "flex", fontSize: 56, letterSpacing: -2 }}>속보 뜨는 순간, 관련주까지 한 번에</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 28 }}>
          {items.length === 0 ? (
            <div style={{ display: "flex", fontSize: 32, color: C.muted }}>뉴스가 나오면 어떤 종목이 움직일지 바로 찾아 드립니다</div>
          ) : (
            items.map((it, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4, borderLeft: `6px solid ${C.amber}`, paddingLeft: 18 }}>
                <div style={{ display: "flex", fontSize: 31 }}>{clip(decodeEntities(it.title), 30)}</div>
                <div style={{ display: "flex", gap: 14, fontSize: 23, color: C.muted }}>
                  <span>{kstDateTimeText(it.pubDate).slice(5)}</span>
                  <span style={{ color: C.amber }}>
                    {(it.matches || [])
                      .slice(0, 3)
                      .map((m) => m.name)
                      .join(" · ")}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </OgFrame>
    ),
    { ...OG_SIZE, fonts: await ogFonts() }
  );
  // 카카오톡·검색엔진이 받아 갈 때 10분 동안 같은 그림을 재사용
  image.headers.set("Cache-Control", "public, max-age=600, s-maxage=600, stale-while-revalidate=600");
  return image;
}
