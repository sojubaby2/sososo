// lib/recentFeed.js
//
// [2026-10-27 신설] 종목 페이지·장 마감 정리 페이지가 "최근 속보"를 읽는 곳입니다.
//
// 비용이 늘지 않게 하는 방법:
//   Redis(Upstash)를 직접 부르지 않고, 홈 화면이 쓰는 /api/feed 주소를 서버가 받아서
//   5분 동안 저장해 두고 모든 종목 페이지가 그 한 벌을 같이 씁니다.
//   → 종목 페이지가 1,000개든 방문자가 몇 명이든 Redis 읽기는 5분에 한 번이 최대입니다.
//
// 보관 범위: 피드는 최근 300건만 남기므로(lib/newsPipeline.js의 FEED_MAX_LENGTH),
// 여기서 보이는 것도 "최근 며칠" 속보입니다.

const SITE_URL = "https://newsmeme.co.kr";
const FEED_CACHE_SECONDS = 300;

export async function getRecentFeed() {
  try {
    const res = await fetch(`${SITE_URL}/api/feed?limit=250`, { next: { revalidate: FEED_CACHE_SECONDS } });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.items) ? data.items : [];
  } catch {
    return []; // 못 받아와도 페이지는 떠야 합니다
  }
}

// 기사 시각(pubDate)을 한국 날짜 "2026-10-27"로
export function kstDateOf(value) {
  const t = new Date(value).getTime();
  if (!Number.isFinite(t)) return "";
  return new Date(t + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

// "2026/10/27 09:36" 모양
export function kstDateTimeText(value) {
  const t = new Date(value).getTime();
  if (!Number.isFinite(t)) return "";
  const s = new Date(t + 9 * 3600 * 1000).toISOString();
  return `${s.slice(0, 4)}/${s.slice(5, 7)}/${s.slice(8, 10)} ${s.slice(11, 16)}`;
}

// 특정 종목이 붙은 속보만. 반환: [{ id, title, link, pubDate, keyword, reason, catalyst }]
export function newsForStock(items, code, max = 20) {
  const out = [];
  for (const it of items) {
    const m = (it.matches || []).find((x) => x.code === code);
    if (!m) continue;
    out.push({
      id: it.id,
      title: it.title,
      link: it.link,
      pubDate: it.pubDate,
      keyword: it.keyword,
      reason: m.reason || "",
      catalyst: m.catalyst || null,
    });
    if (out.length >= max) break;
  }
  return out;
}
