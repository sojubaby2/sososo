import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "../../../components/Header";
import BlogThumbnail from "../../../components/BlogThumbnail";
// [2026-09-14 변경] app/blog/page.js와 같은 이유로 합쳐진 목록을 읽음
// (lib/allBlogPosts.js 주석 참고).
import { blogPosts } from "../../../lib/allBlogPosts";
// [2026-10-26 추가] 본문 사이 사진(위키미디어 공용, 칼럼당 최대 3장) — lib/blogImages.js 참고
import { blogImages } from "../../../lib/blogImages";
import BlogFigure from "../../../components/BlogFigure";
// [2026-10-27 추가] 애드센스 광고 칸(번호는 lib/ads.js)
import AdSlot from "../../../components/AdSlot";

// 사진을 본문 어디에 넣을지 정합니다. 사진에 after(몇 번째 덩어리 뒤)가 적혀 있으면 그대로,
// 없으면 글 길이를 사진 수+1로 나눈 지점들에 고르게 — 단, 소제목(h2) 바로 뒤가 아니라
// 그 다음 문단 뒤에 오도록 한 칸씩 밀어 줍니다(소제목과 첫 문단이 떨어지지 않게).
function placeImages(body, imgs) {
  const at = new Map();
  if (!imgs?.length) return at;
  const n = body.length;
  imgs.forEach((img, k) => {
    let i = Number.isInteger(img.after) ? img.after : Math.round((n * (k + 1)) / (imgs.length + 1)) - 1;
    i = Math.max(0, Math.min(n - 1, i));
    while (i < n - 1 && body[i]?.type === "h2") i += 1;
    while (at.has(i) && i < n - 1) i += 1;
    at.set(i, img);
  });
  return at;
}

// [2026-10-27 추가] 본문 사이 광고 자리 — 글의 1/3, 2/3 지점 문단 뒤(소제목 바로 뒤·사진과 같은 자리는 피함).
// 문단이 12개 미만인 짧은 글은 사이 광고 1개(가운데)만.
function placeAds(body, taken) {
  const n = body.length;
  const marks = n >= 12 ? [1 / 3, 2 / 3] : n >= 6 ? [1 / 2] : [];
  const out = new Set();
  for (const f of marks) {
    let i = Math.round(n * f) - 1;
    while (i < n - 2 && (body[i]?.type === "h2" || taken.has(i) || out.has(i))) i += 1;
    if (i < n - 2) out.add(i);
  }
  return out;
}

// 빌드 시점에 이 페이지들을 미리 정적으로 만들어둠(force-dynamic 아님) —
// 매번 새로 계산할 게 없는 고정 콘텐츠라, 검색엔진이 더 잘 읽어가고
// 로딩도 빠름.
export function generateStaticParams() {
  return blogPosts.map((post) => ({ slug: post.slug }));
}

export function generateMetadata({ params }) {
  const post = blogPosts.find((p) => p.slug === params.slug);
  if (!post) return {};
  return {
    title: `${post.title} | 뉴스매매 칼럼`,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: "article",
      publishedTime: post.date,
    },
  };
}

export default function BlogPostPage({ params }) {
  const post = blogPosts.find((p) => p.slug === params.slug);
  if (!post) notFound();

  return (
    <div>
      <Header />
      <main className="legal-page blog-post">
        <Link href="/blog" className="blog-back-link">
          ← 칼럼 목록으로
        </Link>
        <div className="blog-post-head">
          <BlogThumbnail slug={post.slug} size="large" />
          <div>
            <h1>{post.title}</h1>
            <p className="legal-updated" style={{ margin: 0 }}>
              {post.date} · {post.readMinutes}분 읽기
            </p>
          </div>
        </div>

        {(() => {
          const at = placeImages(post.body, blogImages[post.slug]);
          const ads = placeAds(post.body, at);
          return post.body.map((block, i) => (
            <Fragment key={i}>
              {block.type === "h2" ? <h2>{block.text}</h2> : <p>{block.text}</p>}
              {at.has(i) && <BlogFigure img={at.get(i)} />}
              {ads.has(i) && <AdSlot kind="inArticle" />}
            </Fragment>
          ));
        })()}

        {/* [2026-10-27] 광고 — 글 끝 / [2026-10-28] "추천 글" 모양(멀티플렉스) — 번호가 없으면 일반 광고로 */}
        <AdSlot kind="multiplex" />
      </main>
    </div>
  );
}
