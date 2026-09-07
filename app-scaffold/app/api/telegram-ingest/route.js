// POST /api/telegram-ingest
//
// Receives one Telegram channel message at a time, pushed in real time by
// the listener script (Telethon userbot) running on the Oracle Cloud VM —
// see server/listener.py in this package. Runs it through the exact same
// filter → match → publish pipeline as app/api/poll/route.js (shared code
// lives in lib/newsPipeline.js), so the site's feed treats a Telegram-
// sourced item identically to a Naver-News-sourced one.
//
// Auth: a shared secret, same pattern as CRON_SECRET on /api/poll. Set
// TELEGRAM_INGEST_SECRET as an env var (add it to
// scripts/push-secrets.mjs's NAMES list too, and to the Cloudflare
// dashboard's "Build variables and secrets"), and put the identical value
// in server/listener.py's INGEST_SECRET.
//
// Expected JSON body:
//   { "channel": "@NEWSZZANG", "messageId": 12345, "text": "...",
//     "date": "2026-09-04T10:00:00.000Z" }

import { getRedis } from "../../../lib/redis";
import {
  getCachedUniverse,
  isMarketMovingHeadline,
  matchStocks,
  finalizeMatches,
  telegramMessageKey,
  SEEN_TTL_SECONDS,
  publishFeedItem,
} from "../../../lib/newsPipeline";

// Same ceiling as /api/poll — one message means at most one filter call +
// one match call, so this is generous headroom, not an expected duration.
export const maxDuration = 60;

// Telegram channel messages don't come pre-split into "headline" +
// "summary" the way Naver News API results do — they're just one block of
// text (per 재성's channel, usually a press-article title/summary the
// channel operator already condensed, sometimes with a link). Treat the
// first line as a pseudo-headline and the whole message as the summary, so
// the same filter/match prompts built for [뉴스 제목]/[뉴스 요약] still get
// a sensible split to work with.
function splitMessageText(raw) {
  const text = (raw || "").trim();
  if (!text) return { title: "", summary: "" };
  const firstBreak = text.indexOf("\n");
  const title = (firstBreak === -1 ? text : text.slice(0, firstBreak)).trim().slice(0, 200);
  return { title: title || text.slice(0, 200), summary: text };
}

// 채널 메시지 본문에서 실제 기사 URL을 찾아냄(보통 헤드라인 뒤에
// "https://www.hankyung.com/article/..." 처럼 붙어서 옴). 찾으면 그 URL을
// "원문 기사 전체 보기" 링크로 씀.
//
// [2026-09-07 변경] 링크가 없는 메시지는 아예 게재하지 않도록 함(재성님
// 요청) — 예전엔 링크가 없으면 텔레그램 메시지 자체로 대체 연결했는데,
// 그러면 방문자가 "원문 기사 전체 보기"를 눌러도 실제 기사가 아니라
// 텔레그램으로 가게 되니까, 아예 그런 메시지는 필터링 단계에서 걸러냄.
// URL 뒤에 붙은 문장부호(마침표·괄호·따옴표 등)는 URL의 일부가 아닐
// 확률이 높아서 잘라냄.
function extractArticleUrl(rawText) {
  const match = (rawText || "").match(/https?:\/\/[^\s<>"'\)]+/);
  if (!match) return null;
  return match[0].replace(/[),.!?"'”’]+$/g, "") || null;
}

export async function POST(request) {
  const ingestSecret = process.env.TELEGRAM_INGEST_SECRET;
  if (!ingestSecret) {
    return Response.json(
      { error: "TELEGRAM_INGEST_SECRET 환경변수가 설정되지 않았습니다." },
      { status: 500 }
    );
  }
  const provided =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    new URL(request.url).searchParams.get("secret");
  if (provided !== ingestSecret) {
    return Response.json({ error: "인증되지 않은 요청입니다." }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "요청 본문이 올바른 JSON이 아닙니다." }, { status: 400 });
  }

  const channel = String(body?.channel || "").trim();
  const messageId = body?.messageId;
  const rawText = String(body?.text || "");
  const date = body?.date;

  if (!channel || !messageId || !rawText.trim()) {
    return Response.json({ error: "channel, messageId, text는 필수입니다." }, { status: 400 });
  }

  const redis = getRedis();
  if (!redis) {
    return Response.json({ error: "Redis(Upstash) 환경변수가 아직 설정되지 않았습니다." }, { status: 500 });
  }

  const key = telegramMessageKey(channel, messageId);
  const alreadySeen = await redis.get(key);
  if (alreadySeen) {
    return Response.json({ published: false, reason: "이미 처리된 메시지" });
  }

  const { title, summary } = splitMessageText(rawText);
  if (!title) {
    return Response.json({ published: false, reason: "빈 메시지" });
  }

  const articleUrl = extractArticleUrl(rawText);
  if (!articleUrl) {
    await redis.set(key, "1", { ex: SEEN_TTL_SECONDS });
    return Response.json({ published: false, reason: "뉴스 링크 없음" });
  }

  let passesFilter = false;
  try {
    passesFilter = await isMarketMovingHeadline(title, summary);
  } catch (err) {
    return Response.json({ error: "필터링 실패: " + String(err.message || err) }, { status: 500 });
  }

  if (!passesFilter) {
    await redis.set(key, "1", { ex: SEEN_TTL_SECONDS });
    return Response.json({ published: false, reason: "재료성 부족으로 필터링됨" });
  }

  const universe = await getCachedUniverse(redis);
  if (!universe) {
    return Response.json(
      { error: "시세 데이터를 가져오지 못했습니다 (네이버 시세 페이지 응답 오류)." },
      { status: 500 }
    );
  }

  let rawMatches = [];
  try {
    rawMatches = await matchStocks(title, summary, universe.companyList);
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 500 });
  }

  await redis.set(key, "1", { ex: SEEN_TTL_SECONDS });
  const matches = finalizeMatches(rawMatches, universe.priceMap);

  if (matches.length === 0) {
    return Response.json({ published: false, reason: "관련 종목/테마 없음" });
  }

  const result = await publishFeedItem(
    redis,
    {
      id: key,
      // [2026-09-07 변경] "텔레그램·<채널명>"이었던 걸 "속보"로 통일함 —
      // 채널이 사용자명을 못 가져온 경우 "텔레그램·-1001208429502"처럼
      // 숫자 ID가 그대로 노출되는 문제가 있었고, 애초에 방문자 입장에서
      // "텔레그램"이라는 내부 수집 경로가 굳이 드러날 필요도 없었음.
      keyword: "속보",
      title,
      summary,
      link: articleUrl,
      pubDate: date || new Date().toISOString(),
      matches,
      source: "telegram",
      channel,
    },
    []
  );

  return Response.json(result);
}
