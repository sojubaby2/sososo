// app/page.js  (홈 화면 — 서버 쪽)
//
// [2026-10-14 전면 변경] 애드센스 "가치 없는 콘텐츠" 거절의 실제 원인을
// 잡기 위한 작업입니다.
//
// 무슨 일이 있었나:
// 이 파일은 원래 "use client"로 시작하는 파일 하나였습니다. 즉 브라우저가
// 페이지를 받은 "뒤에" 자바스크립트로 /api/feed를 불러와 뉴스를 채우는
// 구조였습니다. 사람 눈에는 잠깐 뒤에 채워지니 멀쩡해 보이지만, 구글
// 크롤러와 애드센스 심사 로봇은 그 "잠깐"을 기다려주지 않습니다. 처음 받은
// HTML만 보고 판단합니다. 그래서 그들 눈에 이 사이트의 첫 화면은
// "메뉴 + 불러오는 중..." 이 전부인 빈 페이지였습니다.
// (2026-10-14 확인: 크롤러 방식으로 읽어보니 기사가 단 한 건도 안 보였고,
//  구글 색인도 88편짜리 칼럼이 있는데도 1페이지뿐이었습니다.)
//
// 어떻게 바꿨나:
// 파일을 둘로 나눴습니다.
//   · app/page.js (이 파일)  = 서버에서 먼저 뉴스를 가져오는 부분
//   · app/HomeClient.js      = 예전 화면 코드 그대로(알림음·실시간 갱신 등)
// 서버가 뉴스를 미리 채워서 HTML을 보내주므로, 크롤러는 첫 HTML에서 바로
// 기사 제목과 요약과 관련주를 보게 됩니다. 사람에게도 화면이 더 빨리 뜹니다.
//
// 비용은 어떻게 되나:
// 아래 revalidate 설정 덕분에 이 페이지의 결과는 60초 동안 저장(캐시)됩니다.
// 1분 안에 들어온 방문자가 100명이어도 Redis는 한 번만 읽습니다. 예전에는
// 방문자 한 명당 /api/feed를 한 번씩 호출했으니, 방문자가 늘수록 오히려
// 지금 구조가 훨씬 쌉니다. Claude(AI) 비용은 이 변경과 전혀 무관합니다 —
// AI는 텔레그램 메시지가 들어올 때만 돌고, 사람이 페이지를 보는 것과는
// 상관이 없습니다.
//
// 실시간성은 그대로입니다:
// 첫 화면만 서버가 채워주고, 그 뒤로는 예전과 똑같이 브라우저가 10초마다
// 새 글을 확인합니다(HomeClient.js의 FEED_POLL_MS 참고).

import HomeClient from "./HomeClient";

// 이 페이지의 HTML을 60초 동안 재사용합니다(그 사이 방문자는 저장된 걸 받음).
// force-dynamic(매번 새로 만들기)에서 바뀐 부분 — 비용과 속도 둘 다 이쪽이
// 낫고, 실시간성은 브라우저 쪽 10초 갱신이 담당합니다.
export const revalidate = 60;

const SITE_URL = "https://newsmeme.co.kr";
// 서버가 HTML을 만들 때 미리 가져올 기사 개수.
// 너무 많으면 HTML이 무거워지고, 너무 적으면 크롤러가 볼 내용이 부족합니다.
// 60개면 검색엔진이 사이트 성격을 판단하기에 충분하고, 방문자도 스크롤로
// 한참 내려볼 분량입니다. 그 뒤에 올라오는 새 글은 브라우저가 알아서 위에
// 붙여줍니다.
const INITIAL_FEED_COUNT = 60;

async function getInitialFeed() {
  try {
    // 이미 만들어져 있는 /api/feed를 그대로 씁니다 — 데이터를 읽는 방식을
    // 새로 짜면 기존 동작과 미묘하게 달라질 위험이 있어서, 검증된 통로를
    // 재사용하는 쪽이 안전합니다.
    const res = await fetch(`${SITE_URL}/api/feed?limit=${INITIAL_FEED_COUNT}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.items) ? data.items : [];
  } catch {
    // 못 가져와도 페이지는 떠야 합니다 — 빈 배열로 넘기면 예전처럼
    // 브라우저가 불러옵니다(화면이 깨지지 않음).
    return [];
  }
}

// [2026-10-17 추가] 홈 화면 맨 위의 "오늘의 세계증시" 지도에 쓸 지수를
// 서버가 미리 받아옵니다. 브라우저가 나중에 불러오게 하면 크롤러 눈에는
// 또 빈 자리로 보이므로(10월에 겪은 문제) 처음부터 채워서 보냅니다.
//
// 실패해도 null을 넘기면 지도는 뜨고 숫자 자리만 "—"가 됩니다.
async function getWorldIndices() {
  try {
    const res = await fetch(`${SITE_URL}/api/world-indices`, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export default async function HomePage() {
  // 둘을 동시에 받아옵니다 — 순서대로 기다리면 첫 화면이 그만큼 늦어집니다.
  const [initialItems, worldIndices] = await Promise.all([getInitialFeed(), getWorldIndices()]);
  return <HomeClient initialItems={initialItems} worldIndices={worldIndices} />;
}