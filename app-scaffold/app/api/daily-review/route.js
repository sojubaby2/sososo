// GET /api/daily-review              -> 최근 마감시황 글 목록(최신순)
// GET /api/daily-review?date=YYYY-MM-DD -> 특정 날짜 글 1건
// POST /api/daily-review             -> (CRON_SECRET 인증 필요) 새 글 저장
//
// [2026-09-08 추가] "마감시황" — 매 거래일 저녁 9시(평일) 예약 작업이 이
// POST를 호출해서 그날 정리 글을 올림(확인 없이 바로 게시 — 재성님 요청).
// 예약 작업이 "오늘의 재료"를 모을 때는 app/api/daily-review/source-data가
// 따로 있음 — 이 라우트는 순수하게 글 저장/조회만 담당.

import { getRedis } from "../../../lib/redis";
import { saveDailyReview, getDailyReview, listDailyReviews } from "../../../lib/dailyReview";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// [2026-09-18 추가 — 비용 안전장치] 목록 조회는 글 본문까지 전부 읽어오기
// 때문에 글이 쌓일수록 무거워집니다. 마감시황은 하루 한 번만 바뀌므로,
// 방문자가 아무리 많아도 Redis 읽기가 5분에 한 번으로 고정되도록 엣지
// 캐시를 붙입니다(app/api/patterns/route.js와 같은 이유).
const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600",
};

export async function GET(request) {
  const redis = getRedis();
  if (!redis) {
    return Response.json({ error: "Redis(Upstash) 환경변수가 아직 설정되지 않았습니다." }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");

  if (date) {
    const post = await getDailyReview(redis, date);
    if (!post) return Response.json({ error: "해당 날짜의 마감시황이 없습니다." }, { status: 404 });
    return Response.json({ post }, { headers: CACHE_HEADERS });
  }

  const limitParam = Number(searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 30;
  const posts = await listDailyReviews(redis, limit);
  return Response.json({ posts }, { headers: CACHE_HEADERS });
}

// 인증: 다른 자동화 엔드포인트(app/api/poll 등)와 동일하게 CRON_SECRET을
// 재사용함 — 새 환경변수를 안 만들어도 되게. 헤더(Authorization: Bearer
// ...)로만 받음(GET 쪽 진단용 엔드포인트들과 달리, 글 내용이 쿼리스트링에
// 실리는 걸 피하려고 여기선 ?secret= 방식은 안 둠).
export async function POST(request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (provided !== cronSecret) {
      return Response.json({ error: "인증되지 않은 요청입니다." }, { status: 401 });
    }
  }

  const redis = getRedis();
  if (!redis) {
    return Response.json({ error: "Redis(Upstash) 환경변수가 아직 설정되지 않았습니다." }, { status: 500 });
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "요청 본문이 올바른 JSON이 아닙니다." }, { status: 400 });
  }

  const { date, title, summary, body } = payload || {};
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: "date는 YYYY-MM-DD 형식이어야 합니다." }, { status: 400 });
  }
  if (!title || typeof title !== "string") {
    return Response.json({ error: "title이 필요합니다." }, { status: 400 });
  }
  if (!Array.isArray(body) || body.length === 0) {
    return Response.json(
      { error: "body는 { type: 'p'|'h2', text: string } 형태의 배열이어야 하며 최소 1개 이상이어야 합니다." },
      { status: 400 }
    );
  }
  for (const block of body) {
    if (!block || (block.type !== "p" && block.type !== "h2") || typeof block.text !== "string") {
      return Response.json(
        { error: "body의 각 항목은 { type: 'p'|'h2', text: string } 형태여야 합니다." },
        { status: 400 }
      );
    }
  }

  const record = await saveDailyReview(redis, date, { title, summary: summary || "", body });
  return Response.json({ ok: true, post: record });
}
