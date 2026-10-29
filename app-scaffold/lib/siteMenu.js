// lib/siteMenu.js
//
// [2026-10-27 신설] 사이트 메뉴 목록을 한 곳에 모았습니다.
//
// 예전에는 메뉴 목록이 components/Header.js 안에만 있었습니다. 이제 휴대폰 화면에는
// 맨 아래 탭 줄(components/MobileTabBar.js)의 "전체" 창에도 같은 메뉴가 나와서,
// 두 곳이 같은 목록을 보도록 여기로 옮겼습니다.
//
// ★ 메뉴를 더하거나 빼거나 이름을 바꾸려면 아래 MENU만 고치면 됩니다.
//   PC 위쪽 메뉴 줄과 휴대폰 "전체" 창이 함께 바뀝니다.
//   external: true 면 새 창으로 열리는 바깥 링크입니다.
//   icon: 휴대폰 "전체" 창에 그려지는 그림 이름(components/MobileTabBar.js의 ICONS에 있는 이름)
//   vignette: true 면 이 메뉴를 누를 때 구글 "전면 광고(비넷)"가 뜰 수 있습니다.
//     [2026-10-28] 재성님: "메뉴중 테마별 종목정리를 누르면 팝업광고 뜨게 해줘"
//     → 사이트가 직접 띄우는 팝업 광고는 애드센스 정책 위반이라, 구글 공식 전면 광고를 이 메뉴에서만 허용합니다.
//     다른 링크는 전부 막아 둡니다(components/VignetteGuard.js). 다른 메뉴에도 켜려면 그 줄에 vignette: true 를 붙이면 됩니다.
//     ★ 실제로 뜨게 하려면 애드센스 → 광고 → 사이트 설정(연필) → "전면 광고" 켜기가 필요합니다.
//       구글이 정한 횟수 제한이 있어서 누를 때마다 뜨지는 않습니다.

// [2026-10-29 추가] live: true → PC 메뉴에 깜빡이는 빨간 점(실시간), badge: "글자" → 메뉴 옆 작은 꼬리표
//   재성님: "이 메뉴들이 눈에 너무 안띄어" → PC 위 메뉴에 그림·꼬리표를 붙여 눈에 띄게(components/Header.js)
//   ★ 꼬리표를 없애려면 그 줄의 badge: "..." 를 지우면 됩니다.
export const MENU = [
  { href: "/", label: "홈 · 뉴스", short: "홈 · 속보", icon: "zap", match: (p) => p === "/", live: true },
  { href: "/patterns", label: "패턴검색", short: "패턴검색", icon: "candle" },
  { href: "/themes", label: "테마별 종목정리", short: "테마별 종목", icon: "layers", vignette: true },
  // [2026-10-26 변경] 바깥 DART 링크 → 우리 사이트 공모주 페이지(app/ipo, 3시간마다 자동 갱신)
  { href: "/ipo", label: "공모주 정보", short: "공모주", icon: "ticket" },
  // [2026-10-27 추가] DART 공시 일정·주요 공시(app/disclosure)
  { href: "/disclosure", label: "공시 일정", short: "공시 일정", icon: "calendar" },
  { href: "/market", label: "장 마감 정리", short: "장 마감 정리", icon: "bars", badge: "NEW" },
  { href: "/guide", label: "차트 가이드", short: "차트 가이드", icon: "line" },
  { href: "/blog", label: "칼럼", short: "칼럼", icon: "book" },
];

// 맨 아래 작은 글씨 링크들(components/SiteFooterNav.js와 휴대폰 "전체" 창 아래쪽)
export const FOOTER_LINKS = [
  { href: "/about", label: "소개" },
  { href: "/blog", label: "칼럼" },
  { href: "/glossary", label: "용어사전" },
  { href: "/faq", label: "자주 묻는 질문" },
  { href: "/contact", label: "문의" },
  { href: "/disclaimer", label: "면책조항" },
  { href: "/privacy", label: "개인정보처리방침" },
  { href: "/terms", label: "이용약관" },
];

// 지금 주소(pathname)가 이 메뉴에 해당하는지
export function isMenuActive(m, pathname) {
  if (m.external) return false;
  return m.match ? m.match(pathname) : Boolean(pathname?.startsWith(m.href));
}
