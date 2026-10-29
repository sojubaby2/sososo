// lib/usNews.js
//
// [2026-10-29 신설] 밤사이 미국 주요 뉴스(영문 헤드라인) 모으기 — 장전 브리핑(lib/premarket.js)이 씁니다.
// 재성님: "장전 브리핑에는 미국 주요뉴스 분석도 포함이지?" → "나스닥 뉴스 cnn같은거 뒤적거리면 되지않아?"
//
// 예전 브리핑은 미국 "숫자"(지수·종목 시세)만 받고, 뉴스는 이 사이트 속보(국내 관련주가 붙은 것)만 썼습니다.
// 그래서 연준·빅테크 실적처럼 국내 종목이 바로 안 붙는 미국 뉴스는 브리핑에 안 들어갔습니다.
//
// 방법: 미국 언론사가 공개해 둔 RSS(새 기사 목록을 기계가 읽도록 내놓은 공식 창구)에서 제목·짧은 소개만 읽습니다.
//   기사 본문을 긁어 오지 않고(저작권·차단 문제), AI가 제목·소개를 보고 한국어로 요약·분석한 문장만 화면에 씁니다.
//   화면엔 출처 이름과 원문 링크를 같이 둡니다.
// 받는 곳(앞에서부터, 한 곳이 막혀도 나머지로 진행): CNBC, MarketWatch, 야후 파이낸스, CNN 비즈니스, 나스닥
// 비용: 무료(RSS). AI에 넘기는 글이 조금 늘어날 뿐 — 하루 1번, 한 달 몇십 원 수준.

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

export const US_NEWS_FEEDS = [
  { source: "CNBC", url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114" }, // Top News
  { source: "CNBC", url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258" }, // Economy
  { source: "CNBC", url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=19854910" }, // Technology
  { source: "MarketWatch", url: "https://feeds.content.dowjones.io/public/rss/mw_topstories" },
  { source: "MarketWatch", url: "https://feeds.content.dowjones.io/public/rss/mw_marketpulse" },
  { source: "Yahoo Finance", url: "https://finance.yahoo.com/news/rssindex" },
  { source: "CNN Business", url: "http://rss.cnn.com/rss/money_latest.rss" },
  { source: "Nasdaq", url: "https://www.nasdaq.com/feed/rssoutbound?category=Markets" },
];

function decode(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}
const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(m[1]) : "";
};

// RSS 글 하나 → [{ source, title, desc, link, t }]
export function parseRss(xml, source) {
  const out = [];
  const items = String(xml || "").match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
  for (const it of items) {
    const title = tag(it, "title");
    if (!title) continue;
    const t = Date.parse(tag(it, "pubDate") || tag(it, "dc:date") || "");
    out.push({
      source,
      title: title.slice(0, 160),
      desc: tag(it, "description").slice(0, 200),
      link: tag(it, "link") || (it.match(/<link[^>]*href="([^"]+)"/i) || [])[1] || "",
      t: Number.isFinite(t) ? t : null,
    });
  }
  return out;
}

async function getFeed(f) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(f.url, {
      headers: { "User-Agent": UA, Accept: "application/rss+xml,application/xml,text/xml,*/*" },
      cache: "no-store",
      signal: ctrl.signal,
    });
    if (!res.ok) return { source: f.source, ok: false, status: res.status, items: [] };
    const items = parseRss(await res.text(), f.source);
    return { source: f.source, ok: items.length > 0, status: res.status, items };
  } catch (e) {
    return { source: f.source, ok: false, status: String(e?.name || "error"), items: [] };
  } finally {
    clearTimeout(timer);
  }
}

// 최근 sinceMs 이후 기사(시각 없는 기사는 뒤로), 제목 중복 제거, 최신순 최대 n개
// 반환: { items, sources: [{source, ok, status, count}] }
export async function fetchUsNews({ sinceMs = Date.now() - 20 * 3600 * 1000, n = 40 } = {}) {
  const got = await Promise.all(US_NEWS_FEEDS.map(getFeed));
  const seen = new Set();
  const all = [];
  for (const g of got) {
    for (const it of g.items) {
      const key = it.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 80);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      all.push(it);
    }
  }
  const fresh = all.filter((it) => it.t === null || it.t >= sinceMs);
  fresh.sort((a, b) => (b.t || 0) - (a.t || 0));
  return {
    items: fresh.slice(0, n),
    sources: got.map((g) => ({ source: g.source, ok: g.ok, status: g.status, count: g.items.length })),
  };
}
