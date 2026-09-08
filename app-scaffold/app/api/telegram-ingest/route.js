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

// [2026-09-08 추가] 재성님 요청 — "[약업]", "[재업]"처럼 채널 운영자가 자기
// 채널/출처 표시용으로 그냥 붙이는 태그는 기사 내용과 무관하니 지워야 하고,
// 반대로 "[특징주]", "[속보]"처럼 기사 성격 자체를 나타내는 진짜 태그는 그대로
// 살려야 함(재성님 확인: "특징주, 속보 이런 글씨는 그대로 가져와도 돼"). 그래서
// "지울 태그"만 화이트리스트로 관리함(블랙리스트로 하면 새로 나타나는 진짜
// 태그까지 실수로 지울 위험이 있음) — 나중에 재성님이 다른 태그도 지워달라고
// 하면 이 배열에 그 단어만 한 줄 추가하면 됨.
const NOISE_LEADING_TAGS = ["약업", "재업"];

function stripNoiseLeadingTag(text) {
  const t = text || "";
  const match = t.match(/^\[([^[\]]{1,10})\]\s*/);
  if (match && NOISE_LEADING_TAGS.includes(match[1].trim())) {
    return t.slice(match[0].length);
  }
  return t;
}

// 이모지와 잡음 태그가 여러 겹으로 붙어있을 수 있어서(예: "✅[약업] 제목"),
// 더 이상 안 지워질 때까지 번갈아 최대 5번 반복 적용함.
function cleanLeadingNoise(text) {
  let t = (text || "").trim();
  for (let i = 0; i < 5; i++) {
    const next = stripNoiseLeadingTag(stripLeadingEmoji(t)).trim();
    if (next === t) break;
    t = next;
  }
  return t;
}

// [2026-09-08 추가] 재성님 요청 — 텔레그램 메시지 원문을 그대로 summary에
// 다 넣으면 카드에 문단 여러 개짜리 "글 벽"이 통째로 뜨는 문제가 있었음.
// summary는 카드 미리보기 + AI 필터/매칭 프롬프트에 쓰이는 용도지(SYSTEM_PROMPT
// 자체가 "너한테는 뉴스 제목과 요약만 주어져"라고 전제함) 기사 전문을 보여주는
// 자리가 아님 — 전문은 "원문 기사 전체 보기" 링크로 감. 그래서:
// 1) 본문에 섞여 있는 실제 기사 URL과 그 뒤에 흔히 붙는 해시태그·구독 유도
//    문구 같은 꼬리말은 통째로 잘라내고(원문 링크는 extractArticleUrl로 이미
//    따로 뽑아서 "원문 기사 전체 보기"에 쓰고 있음),
// 2) 그러고 남은 본문도 일정 길이(SUMMARY_MAX_LENGTH)를 넘으면 자름 — 문장
//    중간이 아니라 마지막 줄바꿈/문장 경계에서 자르도록 함.
const SUMMARY_MAX_LENGTH = 280;

function trimSummaryBody(text) {
  let t = (text || "").replace(/https?:\/\/\S+[\s\S]*$/, "").trim();
  if (t.length <= SUMMARY_MAX_LENGTH) return t;
  const cut = t.slice(0, SUMMARY_MAX_LENGTH);
  // 잘라낸 지점 바로 앞의 줄바꿈이나 문장 마침("다.", ". ") 위치를 찾아서 그
  // 자리에서 자름 — 다만 그 위치가 너무 앞쪽(원래 길이의 60% 미만)이면 그냥
  // 글자 수 기준으로 자름(문장부호 없는 메시지도 많아서).
  const lastBreak = Math.max(cut.lastIndexOf("\n"), cut.lastIndexOf("다. "), cut.lastIndexOf(". "));
  const safeCut = lastBreak > SUMMARY_MAX_LENGTH * 0.6 ? cut.slice(0, lastBreak + 1) : cut;
  return safeCut.trim() + "…";
}

function splitMessageText(raw) {
  const text = cleanLeadingNoise(raw);
  if (!text) return { title: "", summary: "" };
  const firstBreak = text.indexOf("\n");
  const title = (firstBreak === -1 ? text : text.slice(0, firstBreak)).trim().slice(0, 200);
  return { title: title || text.slice(0, 200), summary: trimSummaryBody(text) };
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
