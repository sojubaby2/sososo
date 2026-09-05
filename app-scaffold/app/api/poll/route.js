// GET /api/poll
//
// This is the endpoint the external scheduler (cron-job.org) hits once a
// minute. For each watched keyword:
//   1. Fetch latest articles from Naver News Search (sort=date)
//   2. Skip already-processed articles (dedup via Redis, keyed on title)
//   3. Cheaply pre-filter out low-value articles (obituaries, event promos,
//      celebrity news, mechanical price-only reports, etc.) before spending
//      money on the expensive full match step
//   4. For articles that pass, ask Claude for:
//      - directly-named stocks (now pickable from the FULL KOSPI/KOSDAQ
//        universe, not just our curated ~750-stock theme database — so a
//        company outside our theme DB can still show up if it's actually
//        named in the article)
//      - a single PRIMARY theme (the article's real core focus — e.g.
//        "원자재(리튬)" for a lithium-supply story, not the broader
//        "2차전지" it's adjacent to) and up to 2 SECONDARY themes
//   5. Expand primary theme first, then secondary themes, using our
//      curated theme→stock groupings (this is the one thing the curated DB
//      is still needed for — the full KRX list has no theme structure)
//   6. Sort everything by today's price change% (today's strongest movers
//      first) — this naturally pushes sluggish mega-caps like 삼성전자·
//      SK하이닉스 down the list without needing a hardcoded blacklist,
//      since they rarely move as much % as smaller reactive names on the
//      same news. (True multi-day momentum/"대장주" ranking would need an
//      accumulated price-history database — not built yet, this is a
//      same-day proxy for it.)
//   7. Cap at 9 stocks total
//   8. Save to the published feed
//
// NOTE: the filter/match/dedup/publish pipeline itself now lives in
// lib/newsPipeline.js, shared with app/api/telegram-ingest/route.js (the
// Telegram-channel ingestion endpoint) — this file only keeps the parts
// that are specific to Naver News keyword polling.
//
// This is also where the daily OHLC price-history store (lib/priceHistory.js
// — feeds the chart-pattern feature at /api/patterns) gets extended by one
// more day: appendTodaysSnapshotIfMissing() below is a cheap check on
// almost every run and only does real work on the rare cycle where today's
// trading data hasn't been captured into history yet.

import { getRedis } from "../../../lib/redis";
import {
  getCachedUniverse,
  isMarketMovingHeadline,
  matchStocks,
  finalizeMatches,
  articleKey,
  SEEN_TTL_SECONDS,
  publishFeedItem,
} from "../../../lib/newsPipeline";
import { appendTodaysSnapshotIfMissing } from "../../../lib/priceHistory";

const WATCHED_KEYWORDS = ["특징주", "수주", "공시", "속보", "단독", "코스피", "코스닥", "잭팟"];
const ARTICLES_PER_KEYWORD = 5;

function stripHtml(str = "") {
  return str
    .replace(/<b>/g, "")
    .replace(/<\/b>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'");
}

async function fetchNaverNews(query) {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 환경변수가 설정되지 않았습니다.");
  }
  const qs = new URLSearchParams({ query, display: String(ARTICLES_PER_KEYWORD), sort: "date", format: "json" });
  const url = `https://naverapihub.apigw.ntruss.com/search/v1/news?${qs.toString()}`;
  const res = await fetch(url, {
    headers: { "X-NCP-APIGW-API-KEY-ID": clientId, "X-NCP-APIGW-API-KEY": clientSecret },
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) throw new Error("네이버 뉴스 API 오류: " + JSON.stringify(data));
  return (data.items || []).map((it) => ({
    title: stripHtml(it.title),
    summary: stripHtml(it.description),
    link: it.originallink || it.link,
    pubDate: it.pubDate,
  }));
}

// Vercel terminates a function that runs past this many seconds.
export const maxDuration = 60;

// Phase 1 (safe to run concurrently): dedup-by-title check, cheap filter,
// then the expensive match call. Does NOT publish or make the story-level
// dedup decision — that has to happen sequentially afterward (see below).
async function computeArticleResult(keyword, article, redis, universeCompanyList, priceMap) {
  const key = articleKey(article);

  const alreadySeen = await redis.get(key);
  if (alreadySeen) {
    return { type: "skip", log: { keyword, title: article.title, skipped: "이미 처리됨" } };
  }

  let passesFilter = false;
  try {
    passesFilter = await isMarketMovingHeadline(article.title, article.summary);
  } catch (err) {
    return { type: "skip", log: { keyword, title: article.title, error: "필터링 실패: " + String(err.message || err) } };
  }

  if (!passesFilter) {
    await redis.set(key, "1", { ex: SEEN_TTL_SECONDS });
    return { type: "skip", log: { keyword, title: article.title, published: false, reason: "재료성 부족으로 필터링됨" } };
  }

  let rawMatches = [];
  try {
    rawMatches = await matchStocks(article.title, article.summary, universeCompanyList);
  } catch (err) {
    return { type: "skip", log: { keyword, title: article.title, error: String(err.message || err) } };
  }

  await redis.set(key, "1", { ex: SEEN_TTL_SECONDS });
  const matches = finalizeMatches(rawMatches, priceMap);

  if (matches.length === 0) {
    return { type: "skip", log: { keyword, title: article.title, published: false, reason: "관련 종목/테마 없음" } };
  }

  return { type: "candidate", keyword, key, article, matches };
}

// Phase 2 (must run one at a time, not in parallel): the actual
// dedup-against-recent-stories decision and the Redis write. Cheap and
// fast (no AI calls), so doing this sequentially doesn't reintroduce the
// timeout problem — but it DOES fix the race condition where several
// articles about the same breaking story (e.g. 3 outlets all covering one
// earnings report in the same poll cycle) were all processed concurrently
// and none of them could see the others yet, so all three passed the
// dedup check and got published separately.
async function publishCandidate(redis, candidate, publishedThisRun) {
  const { keyword, key, article, matches } = candidate;
  const result = await publishFeedItem(
    redis,
    {
      id: key,
      keyword,
      title: article.title,
      summary: article.summary,
      link: article.link,
      pubDate: article.pubDate,
      matches,
    },
    publishedThisRun
  );
  return { keyword, ...result };
}

export async function GET(request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const { searchParams } = new URL(request.url);
    const provided =
      searchParams.get("secret") ||
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (provided !== cronSecret) {
      return Response.json({ error: "인증되지 않은 요청입니다." }, { status: 401 });
    }
  }

  const redis = getRedis();
  if (!redis) {
    return Response.json({ error: "Redis(Upstash) 환경변수가 아직 설정되지 않았습니다." }, { status: 500 });
  }

  // Full KOSPI/KOSDAQ universe — used both as Claude's direct-match
  // candidate pool and as the price/change lookup for sorting. Cached in
  // Redis for a few minutes (see lib/newsPipeline.js) so a cron tick every
  // minute doesn't re-fetch KRX every single time.
  const universe = await getCachedUniverse(redis);
  if (!universe) {
    return Response.json(
      { error: "KRX_SERVICE_KEY 환경변수가 없거나 시세 데이터를 가져오지 못했습니다." },
      { status: 500 }
    );
  }
  const { companyList: universeCompanyList, priceMap, basDt } = universe;

  // Best-effort — a failure here shouldn't block the actual news pipeline
  // this endpoint exists for.
  try {
    await appendTodaysSnapshotIfMissing(redis, basDt);
  } catch {
    // ignore — /api/patterns will simply be a day behind until next cycle
  }

  const log = [];
  const candidates = [];

  for (const keyword of WATCHED_KEYWORDS) {
    let articles;
    try {
      articles = await fetchNaverNews(keyword);
    } catch (err) {
      log.push({ keyword, error: String(err.message || err) });
      continue;
    }

    const results = await Promise.all(
      articles.map((article) => computeArticleResult(keyword, article, redis, universeCompanyList, priceMap))
    );
    for (const r of results) {
      if (r.type === "skip") log.push(r.log);
      else candidates.push(r);
    }
  }

  // Sequential on purpose — see publishCandidate's comment above.
  const publishedThisRun = [];
  for (const candidate of candidates) {
    log.push(await publishCandidate(redis, candidate, publishedThisRun));
  }

  return Response.json({ checkedAt: new Date().toISOString(), basDt, log });
}
