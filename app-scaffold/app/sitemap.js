// app/sitemap.js
//
// [2026-10-01 추가] 이 파일 하나가 https://newsmeme.co.kr/sitemap.xml 주소를
// 만들어 줍니다. 사이트맵은 "우리 사이트에는 이런 페이지들이 있습니다"라고
// 검색엔진에 건네주는 목차입니다.
//
// 왜 필요한가: 검색엔진은 링크를 타고 다니며 페이지를 찾는데, 칼럼이 88편쯤
// 되면 전부 찾아내는 데 시간이 오래 걸리고 일부는 영영 못 찾기도 합니다.
// 목차를 직접 건네주면 훨씬 빨리, 빠짐없이 등록됩니다.
//
// 좋은 점 하나: 칼럼 목록(lib/allBlogPosts)을 그대로 읽어오기 때문에,
// 앞으로 칼럼을 더 써서 추가하면 이 파일은 손대지 않아도 사이트맵에 자동으로
// 들어갑니다.
//
// 만든 뒤 할 일(한 번만 하면 됩니다):
//  · 네이버 서치어드바이저 → 요청 → 사이트맵 제출 → https://newsmeme.co.kr/sitemap.xml
//  · 구글 서치콘솔 → Sitemaps → 같은 주소 제출

import { blogPosts } from "../lib/allBlogPosts";

const SITE_URL = "https://newsmeme.co.kr";

// 칼럼에 적힌 날짜 문자열("2026-09-27")을 날짜로 바꿉니다. 혹시 날짜가
// 비었거나 형식이 깨진 글이 섞여 있어도 사이트맵 전체가 망가지면 안 되므로,
// 이상하면 조용히 오늘 날짜로 대체합니다.
function safeDate(value) {
  const parsed = value ? new Date(value) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();
}

export default function sitemap() {
  const now = new Date();

  // 고정 페이지들.
  // changeFrequency(내용이 얼마나 자주 바뀌는지)와 priority(사이트 안에서의
  // 중요도, 0~1)는 검색엔진에 주는 참고값입니다. 뉴스가 계속 올라오는 첫
  // 화면과 패턴검색을 높게, 거의 안 바뀌는 약관·개인정보 안내를 낮게 뒀습니다.
  // /health와 /admin은 내부용이라 일부러 뺐습니다(robots.js에서도 막아둠).
  const staticPages = [
    { path: "", changeFrequency: "hourly", priority: 1.0 },
    { path: "/patterns", changeFrequency: "daily", priority: 0.9 },
    { path: "/themes", changeFrequency: "daily", priority: 0.8 },
    { path: "/blog", changeFrequency: "daily", priority: 0.8 },
    { path: "/guide", changeFrequency: "monthly", priority: 0.6 },
    { path: "/about", changeFrequency: "yearly", priority: 0.4 },
    { path: "/contact", changeFrequency: "yearly", priority: 0.4 },
    { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
    { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
  ].map((page) => ({
    url: `${SITE_URL}${page.path}`,
    lastModified: now,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));

  // 칼럼 88편(앞으로 늘어나는 것 포함). 한 번 쓰면 내용이 거의 안 바뀌므로
  // changeFrequency는 monthly로 두고, lastModified에는 글에 적힌 작성일을
  // 그대로 넣습니다.
  const columnPages = blogPosts.map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: safeDate(post.date),
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  return [...staticPages, ...columnPages];
}
