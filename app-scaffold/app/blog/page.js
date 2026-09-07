import Link from "next/link";
import Header from "../../components/Header";
import BlogThumbnail from "../../components/BlogThumbnail";
import { blogPosts } from "../../lib/blogPosts";

export const metadata = {
  title: "칼럼 | 뉴스매매",
  description: "빅맥지수부터 튤립 버블까지 — 알아두면 재밌는 경제역사 이야기.",
};

export default function BlogListPage() {
  const posts = [...blogPosts].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div>
      <Header />
      <main className="container" style={{ paddingTop: 32, paddingBottom: 48 }}>
        <div className="blog-intro">
          <h1 className="blog-title">칼럼</h1>
          <p className="blog-subtitle">알아두면 재밌는 경제역사 이야기를 모았습니다.</p>
        </div>

        <div className="blog-list">
          {posts.map((post) => (
            <Link key={post.slug} href={`/blog/${post.slug}`} className="blog-card">
              <BlogThumbnail slug={post.slug} size="small" />
              <div className="blog-card-body">
                <div className="blog-card-meta">
                  <span>{post.date}</span>
                  <span>·</span>
                  <span>{post.readMinutes}분 읽기</span>
                </div>
                <h2 className="blog-card-title">{post.title}</h2>
                <p className="blog-card-excerpt">{post.excerpt}</p>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
