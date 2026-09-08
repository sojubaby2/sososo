// lib/dailyReview.js
//
// [2026-09-08 추가] "마감시황" — 매 거래일 저녁 9시(평일)에 예약 작업이
// 그날 장을 정리해서 자동으로 쓰는 글의 저장소. lib/priceHistory.js의
// "day-key" 패턴을 그대로 따라감: 날짜(YYYY-MM-DD)당 글 하나, 정렬된 날짜
// 인덱스(sorted set)로 최신순 목록을 빠르게 뽑음.
//
// 재성님 요청 사항: (1) 글을 쓰는 주체는 예약 작업으로 도는 Claude 본인
// (별도 AI API 호출 없음), (2) 확인 없이 바로 자동 게시, (3) 기존 "칼럼"
// (lib/blogPosts.js)과는 분리된 새 섹션. 그래서 이 파일은 blogPosts.js처럼
// 코드에 박아넣는 고정 배열이 아니라, 매일 새로 채워지는 Redis 저장소로
// 설계함 — app/api/daily-review/route.js가 이 헬퍼를 통해 읽고 씀.

const DATES_INDEX_KEY = "dailyreview:dates";
const POST_KEY_PREFIX = "dailyreview:post:";

// 평일 기준 대략 1.5~2년치 — 넉넉히 잡아둠(나중에 필요하면 더 늘리면 됨).
// 오래된 글을 지우는 건 아직 안 함 — 글 하나당 용량이 몇 KB 수준이라 이
// 정도 개수는 Redis 용량에 크게 부담되지 않음.
const MAX_POSTS = 500;

function postKey(date) {
  return POST_KEY_PREFIX + date;
}

function toDateScore(date) {
  // "2026-09-08" -> 20260908 (정렬용 숫자 점수)
  return Number(date.replace(/-/g, ""));
}

// date: "YYYY-MM-DD". post: { title, summary, body: [{type:"p"|"h2", text}] }
// 같은 날짜로 다시 호출하면 덮어씀(하루 한 번만 예약 작업이 도니 평소엔
// 그럴 일이 없지만, 수동으로 다시 써야 할 때를 위해 멱등성 있게 둠).
export async function saveDailyReview(redis, date, post) {
  const record = { date, savedAt: new Date().toISOString(), ...post };
  await redis.set(postKey(date), record);
  await redis.zadd(DATES_INDEX_KEY, { score: toDateScore(date), member: date });

  const total = await redis.zcard(DATES_INDEX_KEY);
  if (total > MAX_POSTS) {
    const excess = total - MAX_POSTS;
    const oldest = (await redis.zrange(DATES_INDEX_KEY, 0, excess - 1)).map(String);
    if (oldest.length > 0) {
      await Promise.all(oldest.map((d) => redis.del(postKey(d))));
      await redis.zrem(DATES_INDEX_KEY, ...oldest);
    }
  }

  return record;
}

export async function getDailyReview(redis, date) {
  const raw = await redis.get(postKey(date));
  if (!raw) return null;
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

// 최신순(내림차순) 날짜 목록.
export async function listDailyReviewDates(redis, limit = 30) {
  const total = await redis.zcard(DATES_INDEX_KEY);
  if (!total) return [];
  const start = Math.max(0, total - limit);
  const dates = await redis.zrange(DATES_INDEX_KEY, start, total - 1);
  return dates.map(String).reverse();
}

// 최신순 글 목록(본문 전체 포함) — 목록 페이지가 요약(summary)만 보여줘도
// 어차피 글 하나하나가 가볍기 때문에 그냥 전체를 다 읽어옴.
export async function listDailyReviews(redis, limit = 30) {
  const dates = await listDailyReviewDates(redis, limit);
  const posts = await Promise.all(dates.map((d) => getDailyReview(redis, d)));
  return posts.filter(Boolean);
}
