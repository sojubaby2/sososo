// GET /api/poll
//
// This is the endpoint the external scheduler (cron-job.org) will hit once
// a minute. For each watched keyword:
//   1. Fetch latest articles from Naver News Search (sort=date)
//   2. Skip any article we've already processed (dedup via Redis — this is
//      the piece we just built)
//   3. For brand-new articles, run the AI stock-matching step
//   4. Mark the article as seen (so step 2 skips it next time, regardless
//      of whether it ended up published)
//   5. If it matched at least one stock, save it to the published feed
//
// Kept as a single self-contained file (rather than importing from
// app/api/news and app/api/match) so this piece works independently even
// if those routes change later.
//
// WATCHED_KEYWORDS starts small on purpose — broad category terms instead
// of one-per-stock, to stay well within both the Naver 25,000/day quota
// and a reasonable Claude API budget. Expand this list once you've seen
// real volume and cost from the Anthropic console.

import { getRedis } from "../../../lib/redis";
import rawThemeData from "../../../lib/themeData.json";

const WATCHED_KEYWORDS = ["증권"];
const ARTICLES_PER_KEYWORD = 10;
const SEEN_TTL_SECONDS = 60 * 60 * 24 * 7; // remember an article for 7 days
const FEED_MAX_LENGTH = 100;

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

function buildCompanyList() {
  const seen = new Map();
  for (const row of rawThemeData) {
    if (!seen.has(row.code)) seen.set(row.code, `${row.code}|${row.name}|${row.market}`);
  }
  return Array.from(seen.values()).join("\n");
}

function extractJsonArray(prefilledText) {
  let depth = 0;
  for (let i = 0; i < prefilledText.length; i++) {
    if (prefilledText[i] === "[") depth++;
    else if (prefilledText[i] === "]") {
      depth--;
      if (depth === 0) return prefilledText.slice(0, i + 1);
    }
  }
  return prefilledText;
}

const SYSTEM_PROMPT = `너는 한국 주식 뉴스와 종목을 연결하는 분석가야.

아래 [종목 목록]에 있는 종목 중에서만 골라야 해. 목록에 없는 종목이나 코드를 절대 지어내면 안 돼.

뉴스 기사 하나가 주어지면, 이 종목들 중 실제로 관련 있는 종목을 찾아서 다음 두 기준 중 하나로 분류해:

- "confirmed" (사업근거 확인): 기사에 그 회사명·제품명이 직접 언급되거나, 정부 정책·규제·계약·사고 등이 그 회사의 실제 사업 영역(매출이 발생하는 사업)에 직접 영향을 미치는 경우.
- "rumor" (시장 추정): 인맥·동창·지연 등 사업과 무관한 개인적 연결이거나, 출처가 불분명하거나 단일 커뮤니티/SNS발 추정성 정보인 경우.

진짜 관련된 종목이 없으면 반드시 빈 배열 []을 반환해. 어떻게든 연결을 만들어내려고 하지 마 — 이게 가장 중요한 규칙이야.

중요한 제약 조건 (반드시 지켜):
- 너한테는 뉴스 제목과 요약만 주어져. 본문 전체는 주어지지 않고, 앞으로도 주어지지 않아. 정보가 부족하다고 본문을 요청하거나 "정확한 판단이 어렵다"는 식으로 되묻지 마. 주어진 정보만으로 최선의 판단을 내려. 정말 판단이 안 서면 그냥 빈 배열 []을 반환해.
- 응답에는 오직 JSON 배열만 포함해야 해. 설명, 사과, 질문, 코드블록 표시(\`\`\`), 그 어떤 추가 텍스트도 앞뒤로 단 한 글자도 붙이면 안 돼. 이걸 어기면 시스템이 응답을 파싱하지 못해 완전히 실패해.

각 매치에는 reason에 왜 관련되는지 한국어로 한 문장, 20단어 이내로 설명해.

응답은 반드시 아래 JSON 배열 형식이어야 해:
[{"code":"005930","name":"삼성전자","market":"코스피","confidence":"confirmed","reason":"..."}]`;

async function matchStocks(title, summary) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.");

  const userMessage = `[종목 목록]\n${buildCompanyList()}\n\n---\n뉴스 제목: ${title}\n뉴스 요약: ${summary}`;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: userMessage },
        { role: "assistant", content: "[" },
      ],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error("Claude API 오류: " + JSON.stringify(data));
  const continuation = data?.content?.find((c) => c.type === "text")?.text || "]";
  try {
    return JSON.parse(extractJsonArray("[" + continuation));
  } catch {
    throw new Error("Claude 응답 파싱 실패");
  }
}

function articleKey(article) {
  // The article link is a stable unique id. base64 keeps it safe as a Redis key.
  return "seen:" + Buffer.from(article.link).toString("base64url").slice(0, 120);
}

export async function GET() {
  const redis = getRedis();
  if (!redis) {
    return Response.json(
      { error: "Redis(Upstash) 환경변수가 아직 설정되지 않았습니다." },
      { status: 500 }
    );
  }

  const log = [];

  for (const keyword of WATCHED_KEYWORDS) {
    let articles;
    try {
      articles = await fetchNaverNews(keyword);
    } catch (err) {
      log.push({ keyword, error: String(err.message || err) });
      continue;
    }

    for (const article of articles) {
      const key = articleKey(article);

      const alreadySeen = await redis.get(key);
      if (alreadySeen) {
        log.push({ keyword, title: article.title, skipped: "이미 처리됨" });
        continue;
      }

      let matches = [];
      try {
        matches = await matchStocks(article.title, article.summary);
      } catch (err) {
        log.push({ keyword, title: article.title, error: String(err.message || err) });
        continue; // don't mark as seen on failure — retry next poll
      }

      // Mark as seen now that matching succeeded, whether or not it published.
      await redis.set(key, "1", { ex: SEEN_TTL_SECONDS });

      if (matches.length > 0) {
        const feedItem = {
          id: key,
          keyword,
          title: article.title,
          summary: article.summary,
          link: article.link,
          pubDate: article.pubDate,
          matches,
          savedAt: new Date().toISOString(),
        };
        await redis.lpush("feed", JSON.stringify(feedItem));
        await redis.ltrim("feed", 0, FEED_MAX_LENGTH - 1);
        log.push({ keyword, title: article.title, published: true, matchCount: matches.length });
      } else {
        log.push({ keyword, title: article.title, published: false, reason: "관련 종목 없음" });
      }
    }
  }

  return Response.json({ checkedAt: new Date().toISOString(), log });
}
