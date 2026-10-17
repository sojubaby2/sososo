// app/rss.xml/route.js
//
// [2026-10-17 신설] https://newsmeme.co.kr/rss.xml 주소를 만들어 줍니다.
//
// 왜 필요한가: 네이버 서치어드바이저는 사이트맵과 별도로 RSS 제출을 권장합니다.
// 사이트맵이 "사이트의 전체 목록"이라면 RSS는 "최근에 올라온 글 몇 개"만
// 담는 짧은 목록이고, 검색엔진이 이쪽을 더 자주 들여다봅니다. 그래서 새 글이
// 더 빨리 수집됩니다.
//
// 무엇을 담나 — 중요한 원칙:
// 칼럼(우리가 직접 쓴 글)만 담습니다. 첫 화면의 뉴스 피드는 다른 언론사
// 기사로 연결되는 링크라서 RSS에 넣으면 남의 글을 우리 피드로 뿌리는 모양이
// 됩니다. 검색엔진도 그런 피드를 좋게 보지 않습니다. 그래서 뉴스는 빼고
// 칼럼 최신 30편만 넣습니다.
//
// 비용: 아래 revalidate 덕분에 결과가 1시간 동안 저장됩니다. 칼럼은 자주
// 바뀌지 않으므로 이 정도면 충분하고, 방문자가 몰려도 서버 부담이 없습니다.
//
// 만든 뒤 할 일(한 번만):
//  · 네이버 서치어드바이저 → 요청 → RSS 제출 → rss.xml

import { blogPosts } from "../../lib/allBlogPosts";

export const revalidate = 3600; // 1시간

const SITE_URL = "https://newsmeme.co.kr";
const FEED_TITLE = "뉴스매매 칼럼";
const FEED_DESCRIPTION = "알아두면 재밌는 경제역사 이야기를 모았습니다. 튤립 버블부터 최근 금융 사고까지, 실제로 벌어진 일들을 한 편씩 풀어 씁니다.";

// RSS에 담을 최신 글 개수. 너무 많으면 파일만 무거워지고, 검색엔진이 보는
// 것은 "최근에 뭐가 새로 올라왔나"뿐이라 30편이면 충분합니다.
const FEED_ITEM_COUNT = 30;

// XML 안에서 특별한 뜻을 갖는 다섯 글자를 안전한 형태로 바꿉니다.
// 이걸 안 하면 제목에 & 나 < 가 들어간 글 하나 때문에 피드 전체가 깨집니다.
function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// "2026-10-14" -> "Tue, 14 Oct 2026 00:00:00 +0900"
// RSS 규격이 요구하는 날짜 형식입니다. 날짜가 깨진 글이 섞여 있어도 피드
// 전체가 망가지면 안 되므로, 이상하면 조용히 현재 시각으로 대체합니다.
function toRfc822(dateString) {
  const parsed = dateString ? new Date(`${dateString}T00:00:00+09:00`) : null;
  const date = parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();
  return date.toUTCString().replace("GMT", "+0000");
}

export async function GET() {
  // 최신순으로 정렬한 뒤 앞에서부터 잘라냅니다. 글 목록 자체는 파일에 적힌
  // 순서대로 들어 있어서 날짜 기준 정렬을 한 번 해줍니다.
  const items = [...blogPosts]
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
    .slice(0, FEED_ITEM_COUNT);

  const lastBuildDate = toRfc822(items[0]?.date);

  const itemsXml = items
    .map((post) => {
      const url = `${SITE_URL}/blog/${post.slug}`;
      return [
        "    <item>",
        `      <title>${escapeXml(post.title)}</title>`,
        `      <link>${escapeXml(url)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
        `      <description>${escapeXml(post.excerpt)}</description>`,
        `      <pubDate>${toRfc822(post.date)}</pubDate>`,
        "    </item>",
      ].join("\n");
    })
    .join("\n");

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${escapeXml(FEED_TITLE)}</title>`,
    `    <link>${SITE_URL}/blog</link>`,
    `    <description>${escapeXml(FEED_DESCRIPTION)}</description>`,
    "    <language>ko</language>",
    `    <lastBuildDate>${lastBuildDate}</lastBuildDate>`,
    `    <atom:link href="${SITE_URL}/rss.xml" rel="self" type="application/rss+xml" />`,
    itemsXml,
    "  </channel>",
    "</rss>",
  ].join("\n");

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      // 검색엔진과 Vercel 쪽 모두 1시간 동안 저장된 값을 쓰게 합니다.
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
