// lib/mobileTab.js
//
// [2026-10-27 신설] 휴대폰 화면의 홈 탭(속보 · 시장 · 관심)을 주고받는 작은 연결 고리.
//
// 휴대폰에서는 홈 화면이 탭 세 개로 나뉩니다(PC 화면은 그대로 한 화면).
//   속보(feed)   — 실시간 속보만 — [2026-10-28] 숏폼(속보 한 건이 화면 하나, components/MobileShorts.js)
//   테마(market) — [2026-10-28 "시장"에서 이름 바뀜] 테마 레이더(components/ThemeRadar.js) + 지수·대표 종목·HOT 테마·전일 급등주
//   관심(watch)  — 별표로 담은 종목 + 그 종목이 걸린 속보만
//
// 탭 단추는 맨 아래 탭 줄(components/MobileTabBar.js)에 있고, 화면을 실제로 바꾸는 건
// 홈 화면(app/HomeClient.js)입니다. 둘은 서로 다른 부품이라 "신호"로 이야기합니다.
//   탭 줄 → 홈:  requestHomeTab("market")   ("시장 탭 보여 줘")
//   홈 → 탭 줄:  announceHomeTab("market")  ("지금 시장 탭이야" — 탭 줄이 불을 켬)
//   홈 → 탭 줄:  announceFeedNew(3)         ("다른 탭 보는 사이 새 속보 3건" — 속보 탭에 숫자)
//
// 주소 뒤에 #market, #watch가 붙습니다(예: newsmeme.co.kr/#market). 그래서 다른 페이지에서
// "시장" 탭을 눌러도 홈으로 오면서 바로 시장 탭이 열립니다.

export const HOME_TABS = ["feed", "market", "watch"];
export const HOME_TAB_REQUEST = "nm-home-tab-request";
export const HOME_TAB_STATE = "nm-home-tab";
export const FEED_NEW_EVENT = "nm-feed-new";

// 다른 페이지에서 탭을 눌러 홈으로 넘어올 때, 주소의 #이 늦게 바뀌는 경우를 대비해 한 번 더 적어 둡니다.
let pendingTab = null;
export function setPendingHomeTab(tab) {
  pendingTab = HOME_TABS.includes(tab) ? tab : null;
}
export function takePendingHomeTab() {
  const t = pendingTab;
  pendingTab = null;
  return t;
}

// 주소 뒤 #market → "market". 없거나 모르는 값이면 "feed"
export function tabFromHash(hash) {
  const t = String(hash || "").replace(/^#/, "");
  return HOME_TABS.includes(t) ? t : "feed";
}

export function hrefForTab(tab) {
  return tab === "feed" ? "/" : `/#${tab}`;
}

function send(name, detail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(name, { detail }));
}
export const requestHomeTab = (tab) => send(HOME_TAB_REQUEST, tab);
export const announceHomeTab = (tab) => send(HOME_TAB_STATE, tab);
export const announceFeedNew = (count) => send(FEED_NEW_EVENT, count);
