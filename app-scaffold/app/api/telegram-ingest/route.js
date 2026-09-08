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

// [2026-09-08 추가] 재성님 리포트 — "[김과장 네프콘]" 처럼 개인 브랜드·유료
// 세미나/컨퍼런스 홍보용으로 붙는 태그가, 본문 내용이 진짜 시황처럼 그럴듯해서
// (이 경우도 LNG·천연가스 얘기라 AI 필터가 재료성 있다고 판단해버림) 광고인데도
// 필터를 통과해 게재된 사례. NOISE_LEADING_TAGS(약업/재업)는 "태그만 지우고
// 본문은 진짜 뉴스로 계속 진행"하는 경우고, 이건 반대로 "이 태그가 보이면
// 광고이므로 메시지 전체를 아예 게재하지 않음" — AI 필터를 태우기 전에
// 여기서 하드 차단해서 확실하게 막음. 나중에 다른 광고 태그가 또 나오면
// 이 배열에 한 줄만 추가하면 됨.
const AD_LEADING_TAGS = ["김과장 네프콘"];

function isAdTaggedMessage(text) {
  const match = (text || "").trim().match(/^\[([^[\]]{1,20})\]/);
  return !!match && AD_LEADING_TAGS.includes(match[1].trim());
}

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
// [2026-09-08 수정] 재성님 리포트 — 카드에 제목과 본문(summary)이 완전히
// 똑같이 뜨는 경우가 있었음. 원인 두 가지: ① 예전엔 summary를 "제목+본문
// 전체"(text)에서 만들었는데, 짧은 속보성 메시지는 애초에 제목 한 줄 +
// 링크가 전부라(본문 문단 자체가 없음) 그 상태로 URL만 잘라내면 결과가
// 제목과 완전히 같아짐. ② 본문이 있는 경우에도 summary 맨 앞에 제목이 또
// 한 번 포함돼 있었음. 그래서 이제 summary는 "제목 줄 다음"부터만 뽑고,
// 그 나머지가 아예 없으면(=제목+링크만 있는 메시지) summary를 빈
// 문자열로 둬서 프론트에서 그 줄 자체를 안 보여주도록 함
// (components/NewsCard.js 참고) — 제목 반복보다 안 보여주는 게 나음. 길이
// 상한도 280 -> 100자로 줄임(재성님 요청).
const SUMMARY_MAX_LENGTH = 100;

function trimSummaryBody(text) {
  let t = (text || "").replace(/https?:\/\/\S+[\s\S]*$/, "").trim();
  if (!t) return "";
  if (t.length <= SUMMARY_MAX_LENGTH) return t;
  const cut = t.slice(0, SUMMARY_MAX_LENGTH);
  // 잘라낸 지점 바로 앞의 줄바꿈이나 문장 마침("다.", ". ") 위치를 찾아서 그
  // 자리에서 자름 — 다만 그 위치가 너무 앞쪽(원래 길이의 60% 미만)이면 그냥
  // 글자 수 기준으로 자름(문장부호 없는 메시지도 많아서).
  const lastBreak = Math.max(cut.lastIndexOf("\n"), cut.lastIndexOf("다. "), cut.lastIndexOf(". "));
  const safeCut = lastBreak > SUMMARY_MAX_LENGTH * 0.6 ? cut.slice(0, lastBreak + 1) : cut;
  return safeCut.trim() + "…";
}

// [2026-09-08 추가] 재성님 리포트 — "AWAKE 실시간 주식 공시 정리채널"에서
// 넘어온(그 채널이 다른 채널로 전달한) 메시지의 제목이 "2026.09.08
// 15:03:44" 같은 타임스탬프로만 뜨는 문제. 원인: 이 채널 메시지는 일반
// 뉴스와 형식이 완전히 달라서, 첫 줄이 헤드라인이 아니라 타임스탬프뿐이고
// 실제 내용은 "기업명:", "보고서명:", "계약상대 :" 같은 "키: 값" 줄들로만
// 이뤄진 "공시 요약" 포맷임(전자공시 DART 내용을 봇이 필드별로 정리해서
// 보내주는 방식). splitMessageText의 "첫 줄 = 제목" 규칙은 일반 뉴스에는
// 맞지만 이 포맷에는 안 맞아서, 이 포맷을 감지하면 필드를 직접 조합해
// 자연스러운 한국어 제목을 새로 만들어줌.
function buildDisclosureHeadline(text) {
  if (!/기업명\s*[:：]/.test(text)) return null; // 이 포맷의 표식 — 없으면 일반 메시지

  const fields = {};
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = line.match(/^([가-힣A-Za-z0-9\s]{2,12}?)\s*[:：]\s*(.+)$/);
    if (!m) continue;
    const key = m[1].trim();
    if (!(key in fields)) fields[key] = m[2].trim(); // 같은 키가 또 나와도 처음 값만 씀
  }

  // "대명에너지(시가총액: 2,324억) A389260" 형태에서 회사명만 뽑음(괄호 앞까지).
  const companyName = (fields["기업명"] || "").split("(")[0].trim();
  if (!companyName) return null;

  const counterparty = fields["계약상대"]; // 있으면 계약 상대방
  const amount = fields["계약금액"]; // 있으면 계약 규모
  const label = fields["보고서명"] || fields["계약내용"] || "공시"; // 공시 종류 — 없으면 마지막 대체

  let title = `${companyName},`;
  if (counterparty) title += ` ${counterparty} 대상`;
  if (amount) title += ` ${amount} 규모`;
  title += ` ${label}`;
  return title.replace(/\s+/g, " ").trim().slice(0, 200);
}

function splitMessageText(raw) {
  const text = cleanLeadingNoise(raw);
  if (!text) return { title: "", summary: "" };
  const disclosureTitle = buildDisclosureHeadline(text);
  const firstBreak = text.indexOf("\n");
  const firstLineTitle = (firstBreak === -1 ? text : text.slice(0, firstBreak)).trim().slice(0, 200);
  const title = disclosureTitle || firstLineTitle || text.slice(0, 200);
  // 제목 줄 "다음" 부분만 본문으로 취급 — 줄바꿈이 아예 없던 메시지(제목+
  // 링크만 있던 경우)라면 bodyOnly는 빈 문자열이 되고, trimSummaryBody도
  // 빈 문자열을 그대로 돌려줘서 summary가 "" 가 됨. 공시 포맷이어도 제목만
  // 새로 만들 뿐 본문(summary) 추출 방식은 그대로 — 원래도 "첫 줄(타임스탬프)
  // 다음"부터 잘 뽑혔음(NewsCard에 이미 정상적으로 보이던 부분).
  const bodyOnly = firstBreak === -1 ? "" : text.slice(firstBreak + 1);
  return { title, summary: trimSummaryBody(bodyOnly) };
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

// [2026-09-08 추가] 재성님 리포트 — "본문내용이 전혀 안 적히고 있어". 원인:
// 이 채널은 "제목 한 줄 + 링크"만 오는 메시지가 대부분이라(문단으로 된 본문
// 자체가 없음), splitMessageText가 뽑아내는 summary가 거의 항상 빈 문자열이
// 됨 — 의도한 동작(제목 반복 방지)이었지만, 그 결과 카드에 본문이 아예
// 안 보이는 경우가 너무 잦아짐. 그래서 텔레그램 메시지 자체에 본문이 없으면,
// 링크로 걸린 실제 기사 페이지에서 og:description(대부분의 국내 언론사가
// 기사 요약을 이 메타태그에 넣어둠)을 대신 가져와서 씀 — 진짜 기사 요약이라
// 제목과 겹칠 걱정도 없음.
//
// [2026-09-08 수정(2차)] 재성님 리포트 — 카드 제목이 아예
// "http://www.hani.co.kr/arti/area/honam/1276805.html" 처럼 URL 그대로
// 뜨는 경우 발견. 원인: 이 메시지는 헤드라인 텍스트 없이 링크 하나만 딱
// 왔던 경우라(첫 줄 자체가 URL), splitMessageText의 "첫 줄 = 제목" 규칙이
// 그 URL을 그대로 제목으로 삼아버림. 그래서 제목도 og:description과 같은
// 방식으로 원문 기사 페이지에서 og:title(대부분의 언론사가 기사 제목을
// 이 메타태그에 정확히 넣어둠)을 대신 가져오도록 함 — summary와 한 번의
// fetch로 같이 처리(제목·본문 둘 다 필요한 경우 URL을 두 번 요청하지
// 않게). 사이트 구조가 달라도 안전하게 실패(빈 문자열 반환)하도록 하고,
// 이 시도 자체가 전체 게재 흐름을 막지 않게 함(아래 POST 핸들러의 호출부
// 참고 — 제목을 끝내 못 찾으면 그때는 게재 자체를 건너뜀).
function decodeHtmlEntities(raw) {
  return raw
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickMetaContent(html, patterns) {
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1] && m[1].trim()) return m[1];
  }
  return "";
}

async function fetchArticleMetaFallback(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; newsmeme-bot/1.0)" },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return { title: "", summary: "" };
    const html = await res.text();

    // og:xxx을 우선 쓰고, 없으면 일반 메타태그/<title> 태그로 대체. 속성
    // 순서(property/content vs content/property)가 사이트마다 달라서 두
    // 방향 다 시도함.
    const rawTitle =
      pickMetaContent(html, [
        /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i,
        /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:title["']/i,
      ]) || (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");

    const rawSummary = pickMetaContent(html, [
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i,
      /<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:description["']/i,
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i,
      /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i,
    ]);

    return {
      title: rawTitle ? decodeHtmlEntities(rawTitle).slice(0, 200) : "",
      summary: rawSummary ? trimSummaryBody(decodeHtmlEntities(rawSummary)) : "",
    };
  } catch {
    // 사이트 차단, 타임아웃, HTML 구조 이상 등 — 실패해도 게재 자체를
    // 무조건 막진 않고, 호출부에서 상황에 맞게 처리함(제목이 필요했는데
    // 못 얻었으면 게재를 건너뜀 / summary만 필요했으면 빈 채로 진행).
    return { title: "", summary: "" };
  }
}

// 텔레그램 메시지에 헤드라인 텍스트 없이 링크만 달랑 온 경우, splitMessageText가
// 그 링크 자체를 "제목"으로 뽑아버림 — 그걸 감지하기 위한 판별.
function looksLikeBareUrl(text) {
  return /^https?:\/\/\S+$/i.test((text || "").trim());
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

  if (isAdTaggedMessage(cleanLeadingNoise(rawText))) {
    await redis.set(key, "1", { ex: SEEN_TTL_SECONDS });
    return Response.json({ published: false, reason: "광고성 태그로 제외됨" });
  }

  const { title: rawTitle, summary: telegramSummary } = splitMessageText(rawText);
  if (!rawTitle) {
    return Response.json({ published: false, reason: "빈 메시지" });
  }

  const articleUrl = extractArticleUrl(rawText);
  if (!articleUrl) {
    await redis.set(key, "1", { ex: SEEN_TTL_SECONDS });
    return Response.json({ published: false, reason: "뉴스 링크 없음" });
  }

  // 텔레그램 메시지 자체에 헤드라인/본문이 없으면(제목 없이 링크만 왔거나,
  // 제목+링크만 왔거나) 실제 기사 페이지에서 제목·요약을 대신 가져옴 — 위
  // fetchArticleMetaFallback 주석 참고. fetch는 필요할 때만(제목 또는
  // 요약 중 하나라도 부족할 때) 한 번만 함.
  const needsTitleFallback = looksLikeBareUrl(rawTitle);
  let title = rawTitle;
  let summary = telegramSummary;
  if (needsTitleFallback || !summary) {
    const meta = await fetchArticleMetaFallback(articleUrl);
    if (needsTitleFallback) {
      if (!meta.title) {
        // 원문 기사에서도 제목을 못 뽑으면, URL을 그대로 제목으로 노출시키느니
        // 게재를 건너뜀(재성님 리포트 — 카드 제목이 통째로 URL로 뜨는 문제).
        await redis.set(key, "1", { ex: SEEN_TTL_SECONDS });
        return Response.json({ published: false, reason: "제목을 찾을 수 없음(링크만 있는 메시지)" });
      }
      title = meta.title;
    }
    if (!summary) summary = meta.summary || "";
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
