// lib/mobileLayout.js
//
// [2026-10-28 신설] 휴대폰 "속보" 탭을 어떤 모양으로 보여 줄지 고르는 스위치.
//   재성님: "c형으로 한번적용 해봐도돼? 맘에안들면 다시 a+b로 올게"
//
// ★ 바꾸는 법: 아래 MOBILE_FEED 따옴표 안 글자만 바꾸고 커밋·푸시하면 됩니다.
//   "chat"   — C. 속보 채널(텔레그램 채팅방처럼 아래로 쌓임)   components/MobileChat.js
//   "shorts" — A. 숏폼 속보(속보 한 건이 화면 하나, 위로 밀기)  components/MobileShorts.js
//
// [2026-10-28 11:44] 재성님: "이거 전꺼가 낫다" → 다시 숏폼(A)으로. 채팅형 코드는 지우지 않고 남겨 둠.
//
//   어느 쪽이든 "테마" 탭(테마 레이더, components/ThemeRadar.js)과 "관심" 탭, PC 화면은 그대로입니다.

// [2026-11-03] "list" = 새 휴대폰 홈(바로가기 4칸 + 테마 칩 + 스크롤 속보 목록, components/MobileHome.js)
//   재성님: "모바일 화면은 메뉴들도 눈에 잘 안 들어오고 불편한 느낌이 많아 — 다시 디자인해서 진행해봐"
//   예전 숏폼으로 되돌리려면 "shorts"로 바꾸면 됩니다.
export const MOBILE_FEED = "list";
