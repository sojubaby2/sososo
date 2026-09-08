// GET /api/admin/delete-feed-item?id=...&secret=...
//
// [2026-09-08 추가] 재성님 리포트 — "[김과장 네프콘]"이라는 광고성 메시지가
// 필터를 통과해서 게재된 사례. 근본 원인(광고 태그)은
// app/api/telegram-ingest/route.js에 고쳐서 앞으로는 안 들어오게 막았지만,
// 이미 게재돼버린 카드 자체를 지울 방법이 사이트에 전혀 없었음(그때 재성님이
// 컴퓨터 앞이 아니라서 나한테 대신 지워달라고 했는데, 지울 방법 자체가
// 없어서 못 지웠음). 그래서 이 관리용 엔드포인트를 새로 만듦 — 카드 하나의
// id를 지정해서 Redis "feed" 리스트에서 그것만 정확히 제거함.
//
// 사용법: 브라우저 주소창에 아래처럼 입력해서 그냥 열면 됨(별도 로그인·앱
// 필요 없음) —
//   https://newsmeme.co.kr/api/admin/delete-feed-item?id=<지울 카드의 id>&secret=<CRON_SECRET>
// id는 카드 화면 자체에는 안 보이지만, https://newsmeme.co.kr/api/feed 를
// 열어서 그 카드의 title/link로 찾은 다음 그 항목의 "id" 필드 값을 그대로
// 복사해서 쓰면 됨. 인증은 다른 관리용 엔드포인트(daily-review/source-data
// 등)와 동일하게 CRON_SECRET을 재사용함.
import { getRedis } from "../../../../lib/redis";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  const provided = searchParams.get("secret") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!cronSecret || provided !== cronSecret) {
    return Response.json({ error: "인증되지 않은 요청입니다." }, { status: 401 });
  }

  const id = searchParams.get("id");
  if (!id) {
    return Response.json({ error: "id 파라미터가 필요합니다." }, { status: 400 });
  }

  const redis = getRedis();
  if (!redis) {
    return Response.json({ error: "Redis(Upstash) 환경변수가 아직 설정되지 않았습니다." }, { status: 500 });
  }

  // "feed"는 최대 300개짜리 리스트라(lib/newsPipeline.js의 FEED_MAX_LENGTH)
  // 전체를 한 번에 읽어도 부담 없음. 각 항목을 파싱해서 id가 일치하는
  // 원본 문자열을 찾은 다음, 그 정확한 문자열 값으로 LREM(리스트에서 같은
  // 값을 가진 원소 제거) — JSON.stringify가 항상 같은 필드 순서로 저장하기
  // 때문에(lib/newsPipeline.js publishFeedItem 참고) 원본 문자열째로 비교해도
  // 안전하게 일치함.
  const raw = await redis.lrange("feed", 0, -1);
  let removed = 0;
  let removedTitle = null;

  for (const r of raw) {
    let item;
    try {
      item = typeof r === "string" ? JSON.parse(r) : r;
    } catch {
      continue;
    }
    if (item?.id === id) {
      await redis.lrem("feed", 0, r);
      removed++;
      removedTitle = item.title;
    }
  }

  if (removed === 0) {
    return Response.json({ ok: false, removed: 0, reason: "해당 id를 가진 카드를 찾지 못했습니다." });
  }
  return Response.json({ ok: true, removed, title: removedTitle });
}
