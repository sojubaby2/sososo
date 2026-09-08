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
// 채널 운영자가 헤드라인 맨 앞에 이모지(✅, 🚨 등)를 붙이는 경우가 많은데,
// 그게 그대로 제목·본문에 노출되는 게 지저분해 보인다는 재성님 피드백을
// 반영 — 문장 맨 앞에 붙은 이모지(+ 그 뒤 공백)만 제거함. 문장 중간에
// 있는 이모지는 안 건드림(요청받은 범위가 "제목/본문 앞"이라서).
// ️(variation selector: 이모지를 "그림체"로 표시하라는 보이지 않는
// 표시)와 ‍(zero-width joiner: 여러 이모지를 하나로 합칠 때 씀)도
// 이모지 뒤에 안 보이게 자주 붙어있어서 같이 제거해야 완전히 지워짐.
function stripLeadingEmoji(text) {
  return (text || "").replace(/^[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D\s]+/u, "");
}

// [2026-09-08 \uCD94\uAC00] \uC7AC\uC131\uB2D8 \uC694\uCCAD \u2014 "[\uC57D\uC5C5]", "[\uC7AC\uC5C5]"\uCC98\uB7FC \uCC44\uB110 \uC6B4\uC601\uC790\uAC00 \uC790\uAE30
// \uCC44\uB110/\uCD9C\uCC98 \uD45C\uC2DC\uC6A9\uC73C\uB85C \uADF8\uB0E5 \uBD99\uC774\uB294 \uD0DC\uADF8\uB294 \uAE30\uC0AC \uB0B4\uC6A9\uACFC \uBB34\uAD00\uD558\uB2C8 \uC9C0\uC6CC\uC57C \uD558\uACE0,
// \uBC18\uB300\uB85C "[\uD2B9\uC9D5\uC8FC]", "[\uC18D\uBCF4]"\uCC98\uB7FC \uAE30\uC0AC \uC131\uACA9 \uC790\uCCB4\uB97C \uB098\uD0C0\uB0B4\uB294 \uC9C4\uC9DC \uD0DC\uADF8\uB294 \uADF8\uB300\uB85C
// \uC0B4\uB824\uC57C \uD568(\uC7AC\uC131\uB2D8 \uD655\uC778: "\uD2B9\uC9D5\uC8FC, \uC18D\uBCF4 \uC774\uB7F0 \uAE00\uC528\uB294 \uADF8\uB300\uB85C \uAC00\uC838\uC640\uB3C4 \uB3FC"). \uADF8\uB798\uC11C
// "\uC9C0\uC6B8 \uD0DC\uADF8"\uB9CC \uD654\uC774\uD2B8\uB9AC\uC2A4\uD2B8\uB85C \uAD00\uB9AC\uD568(\uBE14\uB799\uB9AC\uC2A4\uD2B8\uB85C \uD558\uBA74 \uC0C8\uB85C \uB098\uD0C0\uB098\uB294 \uC9C4\uC9DC
// \uD0DC\uADF8\uAE4C\uC9C0 \uC2E4\uC218\uB85C \uC9C0\uC6B8 \uC704\uD5D8\uC774 \uC788\uC74C) \u2014 \uB098\uC911\uC5D0 \uC7AC\uC131\uB2D8\uC774 \uB2E4\uB978 "OO"\uB3C4 \uC9C0\uC6CC\uB2EC\uB77C\uACE0
// \uD558\uBA74 \uC774 \uBC30\uC5F4\uC5D0 \uADF8 \uB2E8\uC5B4\uB9CC \uD55C \uC904 \uCD94\uAC00\uD558\uBA74 \uB428.
const NOISE_LEADING_TAGS = ["\uC57D\uC5C5", "\uC7AC\uC5C5"];

function stripNoiseLeadingTag(text) {
  const t = text || "";
  const match = t.match(/^\[([^[\]]{1,10})\]\s*/);
  if (match && NOISE_LEADING_TAGS.includes(match[1].trim())) {
    return t.slice(match[0].length);
  }
  return t;
}

// \uC774\uBAA8\uC9C0\uC640 \uC7A1\uC74C \uD0DC\uADF8\uAC00 \uC5EC\uB7EC \uACB9\uC73C\uB85C \uBD99\uC5B4\uC788\uC744 \uC218 \uC788\uC5B4\uC11C(\uC608: "\u2705[\uC57D\uC5C5] \uC81C\uBAA9"),
// \uB354 \uC774\uC0C1 \uC548 \uC9C0\uC6CC\uC9C8 \uB54C\uAE4C\uC9C0 \uBC88\uAC08\uC544 \uCD5C\uB300 5\uBC88 \uBC18\uBCF5 \uC801\uC6A9\uD568.
function cleanLeadingNoise(text) {
  let t = (text || "").trim();
  for (let i = 0; i < 5; i++) {
    const next = stripNoiseLeadingTag(stripLeadingEmoji(t)).trim();
    if (next === t) break;
    t = next;
  }
  return t;
}

function splitMessageText(raw) {
  const text = cleanLeadingNoise(raw);
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
