// POST /api/telegram-ingest
//
// [임시 진단 모드] TELEGRAM_INGEST_SECRET이 계속 "설정되지 않음"으로 나오는
// 문제를 확인하기 위해, 에러 응답에 현재 서버가 실제로 갖고 있는 환경변수
// "이름" 목록을 잠깐 같이 내려주도록 했습니다 (값은 절대 노출 안 함).
// 원인 확인되면 이 부분은 다시 원래대로 되돌릴 거예요.
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

// Public-channel deep link, e.g. https://t.me/NEWSZZANG/12345 — Telethon
// gives us the channel username and the message id, which is all a public
// channel link needs (no invite hash required).
function telegramLink(channel, messageId) {
  if (!channel || !messageId) return null;
  const handle = channel.replace(/^@/, "");
  return `https://t.me/${handle}/${messageId}`;
}

export async function POST(request) {
  const ingestSecret = process.env.TELEGRAM_INGEST_SECRET;
  if (!ingestSecret) {
    return Response.json(
      {
        error: "TELEGRAM_INGEST_SECRET 환경변수가 설정되지 않았습니다.",
        // 임시 진단용 — 값은 절대 안 보여주고 "이름"만 나열합니다.
        debugEnvKeys: Object.keys(process.env).sort(),
      },
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
      { error: "KRX_SERVICE_KEY 환경변수가 없거나 시세 데이터를 가져오지 못했습니다." },
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
      keyword: `텔레그램·${channel.replace(/^@/, "")}`,
      title,
      summary,
      link: telegramLink(channel, messageId),
      pubDate: date || new Date().toISOString(),
      matches,
      source: "telegram",
      channel,
    },
    []
  );

  return Response.json(result);
}
