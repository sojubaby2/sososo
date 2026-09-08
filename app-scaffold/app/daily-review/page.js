// GET /daily-review — 마감시황 목록 페이지.
//
// [2026-09-08 추가] 매 거래일 저녁 9시 예약 작업이 자동으로 쓰는 글을
// 보여주는 새 섹션(재성님 요청 — 기존 "칼럼"과는 분리). 서버 컴포넌트로
// 만들어서 Redis에서 직접 읽음 — app/blog/page.js처럼 빌드 시 고정되는
// 콘텐츠가 아니라 매일 새로 채워지므로 force-dynamic으로 매 요청마다
// 새로 읽음.

import Link from "next/link";
import Header from "../../components/Header";
import { getRedis } from "../../lib/redis";
import { listDailyReviews } from "../../lib/dailyReview";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "마감시황 | 뉴스매매",
  description: "매 거래일 저녁, 그날 장을 주도했던 테마와 종목을 자동으로 정리해 드립니다.",
};

export default async function DailyReviewListPage() {
  const redis = getRedis();
  const posts = redis ? await listDailyReviews(redis, 30) : [];

  return (
    <div>
      <Header />
      <main className="container" style={{ paddingTop: 32, paddingBottom: 48 }}>
        <div className="blog-intro">
          <h1 className="blog-title">마감시황</h1>
          <p className="blog-subtitle">
            매 거래일 저녁 9시, 그날 장을 주도했던 테마와 종목을 자동으로 정리해 드립니다.
          </p>
        </div>

        {posts.length === 0 ? (
          <p style={{ fontSize: 14, color: "var(--ink-muted)", padding: "24px 0" }}>
            아직 작성된 마감시황이 없습니다. 다음 거래일 저녁 9시에 자동으로 올라와요.
          </p>
        ) : (
          <div className="blog-list">
            {posts.map((post) => (
              <Link key={post.date} href={`/daily-review/${post.date}`} className="blog-card">
                <div className="blog-card-body">
                  <div className="blog-card-meta">
                    <span>{post.date}</span>
                  </div>
                  <h2 className="blog-card-title">{post.title}</h2>
                  {post.summary && <p className="blog-card-excerpt">{post.summary}</p>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
