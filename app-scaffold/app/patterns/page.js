// app/patterns/page.js  (패턴검색 — 서버 쪽)
//
// [2026-10-14 전면 변경] 홈 화면(app/page.js)과 똑같은 이유로 고쳤습니다.
// 이 페이지도 "use client" 한 덩어리였던 탓에, 크롤러가 받아보는 첫 HTML에는
// "패턴 결과를 불러오는 중이에요..." 한 줄과 검색창만 있었습니다. 실제로
// 2026-10-14에 크롤러 방식으로 읽어보니 이 페이지에서 건질 수 있는 문장이
// 25단어 남짓이었습니다. 애드센스가 "가치 없는 콘텐츠"라고 판단할 만합니다.
//
// 이제 서버가 패턴 목록과 종목 결과를 먼저 가져와서 HTML에 담아 보냅니다.
// 화면 코드 자체는 app/patterns/PatternsClient.js에 그대로 옮겨두었고,
// 검색창·드롭다운·종목코드 복사 같은 동작은 예전과 똑같이 작동합니다.
//
// 비용: /api/patterns에는 이미 5분짜리 캐시가 걸려 있고(app/api/patterns/
// route.js의 CACHE_HEADERS), 아래 revalidate도 같은 5분으로 맞췄습니다.
// 방문자가 몇 명이든 5분에 한 번만 실제로 계산 결과를 읽어옵니다.

import PatternsClient from "./PatternsClient";

export const revalidate = 300; // 5분 — /api/patterns의 캐시 시간과 동일하게 맞춤

export const metadata = {
  title: "패턴검색 — 차트 패턴으로 종목 찾기 | 뉴스매매",
  description:
    "국내 상장 종목의 최근 시세 흐름을 쌍바닥·전고점 돌파·52주 신고가 등 차트 패턴과 대조해, 비슷한 모양이 나타난 종목을 모아 보여줍니다.",
};

const SITE_URL = "https://newsmeme.co.kr";

// 서버가 HTML에 담아 보낼 때 패턴 하나당 최대 몇 종목까지 넣을지.
// 전체 결과는 수백 KB까지 갈 수 있어서 그대로 담으면 첫 화면이 무거워집니다.
// 40개면 검색엔진이 페이지 내용을 파악하기에 충분하고, 방문자가 실제로 보는
// 전체 목록은 화면이 뜬 직후 브라우저가 이어받아 채웁니다.
const INITIAL_ROWS_PER_PATTERN = 40;

async function getInitialPatterns() {
  try {
    const res = await fetch(`${SITE_URL}/api/patterns`, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    const data = await res.json();
    const trimmed = {};
    for (const [id, rows] of Object.entries(data?.patterns || {})) {
      trimmed[id] = Array.isArray(rows) ? rows.slice(0, INITIAL_ROWS_PER_PATTERN) : [];
    }
    return {
      patternDefs: data?.patternDefs || [],
      patterns: trimmed,
      historyDays: data?.historyDays || 0,
      historyTarget: data?.historyTarget || 750,
      warming: !!data?.warming,
      error: data?.error || "",
    };
  } catch {
    // 못 가져와도 페이지는 떠야 합니다 — null을 넘기면 예전처럼 브라우저가
    // 직접 불러옵니다(화면이 깨지지 않음).
    return null;
  }
}

export default async function PatternsPage() {
  const initialData = await getInitialPatterns();
  return <PatternsClient initialData={initialData} />;
}
