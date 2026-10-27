// app/blog/[slug]/opengraph-image.js
//
// [2026-10-27 신설] 칼럼 링크를 카카오톡 등에 올렸을 때 뜨는 미리보기 그림.
// 칼럼 제목과 요약이 들어갑니다. 공용 틀은 lib/ogImage.js.

import { ImageResponse } from "next/og";
import { blogPosts } from "../../../lib/allBlogPosts";
import { OgFrame, OG_SIZE, OG_COLORS as C, ogFonts, clip } from "../../../lib/ogImage";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "뉴스매매 경제사 칼럼";

export function generateStaticParams() {
  return blogPosts.map((p) => ({ slug: p.slug }));
}

export default async function Image({ params }) {
  const post = blogPosts.find((p) => p.slug === params.slug);
  const title = post ? clip(post.title, 40) : "뉴스매매 칼럼";
  const excerpt = post ? clip(post.excerpt, 90) : "";
  return new ImageResponse(
    (
      <OgFrame tag="경제사 칼럼">
        <div style={{ display: "flex", fontSize: title.length > 22 ? 64 : 76, lineHeight: 1.25, letterSpacing: -2 }}>{title}</div>
        {excerpt && (
          <div style={{ display: "flex", marginTop: 28, fontSize: 32, lineHeight: 1.45, color: C.muted }}>{excerpt}</div>
        )}
      </OgFrame>
    ),
    { ...size, fonts: await ogFonts() }
  );
}
