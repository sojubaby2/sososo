// GET /api/news?query=반도체&display=20&sort=date
//
// Proxies the News Search endpoint on NAVER API HUB (naverapihub.apigw.ntruss.com).
//
// IMPORTANT: NAVER migrated its Search APIs off the old developers.naver.com
// "Application" system onto NAVER Cloud Platform's "NAVER API HUB" in June
// 2026. The endpoint domain AND the auth header names both changed:
//   - old: openapi.naver.com/v1/search/news.json
//          headers: X-Naver-Client-Id / X-Naver-Client-Secret
//   - new: naverapihub.apigw.ntruss.com/search/v1/news
//          headers: X-NCP-APIGW-API-KEY-ID / X-NCP-APIGW-API-KEY
// Free quota is unchanged: 25,000 calls/day.
//
// Runs server-side only so the Client ID/Secret never reach the browser.
// sort=date (최신순) is the default here on purpose: for a "속보" feed we
// care about "what's newest", not "what's most relevant" (sort=sim).

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

export async function fetchNaverNews(query, { display = "20", sort = "date" } = {}) {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 환경변수가 설정되지 않았습니다.");
  }

  const qs = new URLSearchParams({ query, display: String(display), sort, format: "json" });
  const url = `https://naverapihub.apigw.ntruss.com/search/v1/news?${qs.toString()}`;

  const res = await fetch(url, {
    headers: {
      "X-NCP-APIGW-API-KEY-ID": clientId,
      "X-NCP-APIGW-API-KEY": clientSecret,
    },
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error("네이버 뉴스 API 오류: " + JSON.stringify(data));
  }

  return (data.items || []).map((it) => ({
    title: stripHtml(it.title),
    summary: stripHtml(it.description),
    link: it.originallink || it.link,
    naverLink: it.link,
    pubDate: it.pubDate,
  }));
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query");
  if (!query) {
    return Response.json({ error: "query 파라미터가 필요합니다. 예: /api/news?query=반도체" }, { status: 400 });
  }
  const display = searchParams.get("display") || "20";
  const sort = searchParams.get("sort") || "date";

  try {
    const items = await fetchNaverNews(query, { display, sort });
    return Response.json({ query, total: items.length, items });
  } catch (err) {
    return Response.json({ error: String(err.message || err) }, { status: 502 });
  }
}
