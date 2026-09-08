// GET /daily-review/[date] — 마감시황 상세 페이지 (date: "YYYY-MM-DD").
//
// [2026-09-08 추가] app/blog/[slug]/page.js와 거의 같은 구조(같은 본문
// 블록 형식 { type: "p"|"h2", text })를 쓰지만, blog는 코드에 박힌 고정
// 배열이고 이건 매일 Redis에 새로 쌓이는 콘텐츠라 force-dynamic 서버
// 컴포넌트로 만듦(generateStaticParams 없음 — 빌드 시점엔 그날 글이 아직
// 존재하지 않으므로 정적 생성이 불가능함).

import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "../../../components/Header";
import { getRedis } from "../../../lib/redis";
import { getDailyReview } from "../../../lib/dailyReview";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const redis = getRedis();
  const post = redis ? await getDailyReview(redis, params.date) : null;
  if (!post) return {};
  return {
    title: `${post.title} | 뉴스매매 마감시황`,
    description: post.summary || post.title,
    openGraph: {
      title: post.title,
      description: post.summary || post.title,
      type: "article",
      publishedTime: post.date,
    },
  };
}

export default async function DailyReviewDetailPage({ params }) {
  const redis = getRedis();
  const post = redis ? await getDailyReview(redis, params.date) : null;
  if (!post) notFound();

  return (
    <div>
      <Header />
      <main className="legal-page blog-post">
        <Link href="/daily-review" className="blog-back-link">
          ← 마감시황 목록으로
        </Link>
        <div className="blog-post-head">
          <div>
            <h1>{post.title}</h1>
            <p className="legal-updated" style={{ margin: 0 }}>
              {post.date}
            </p>
          </div>
        </div>

        {(post.body || []).map((block, i) =>
          block.type === "h2" ? <h2 key={i}>{block.text}</h2> : <p key={i}>{block.text}</p>
        )}

        {/* [2026-09-08 추가] 확인 없이 바로 자동 게시되는 글이라, 투자
            판단 참고용일 뿐 매수·매도 권유가 아니라는 점을 매 글 하단에
            명시함. */}
        <p style={{ fontSize: 12, color: "var(--ink-muted)", marginTop: 32, lineHeight: 1.7 }}>
          이 글은 매 거래일 저녁 시세·뉴스 데이터를 바탕으로 자동 생성됩니다. 특정 종목의 매수·매도를 권유하는
          것이 아니라 투자 판단을 돕기 위한 참고 자료이며, 투자 결과에 대한 책임은 투자자 본인에게 있습니다.
        </p>
      </main>
    </div>
  );
}
