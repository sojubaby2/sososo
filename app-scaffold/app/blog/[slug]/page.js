import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "../../../components/Header";
import BlogThumbnail from "../../../components/BlogThumbnail";
import { blogPosts } from "../../../lib/blogPosts";

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

        {post.body.map((block, i) =>
          block.type === "h2" ? <h2 key={i}>{block.text}</h2> : <p key={i}>{block.text}</p>
        )}
      </main>
    </div>
  );
}
