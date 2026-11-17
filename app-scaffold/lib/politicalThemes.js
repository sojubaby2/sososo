// lib/politicalThemes.js
//
// [2026-11-17 신설] 정치 테마 이름 목록만 따로 뗀 가벼운 파일 — 재성님: "뭐 클릭하면 버벅버벅"
//   홈 화면은 isPoliticalTheme() 한 줄만 쓰는데, 그게 lib/themeData.js에 있어서 테마·종목 표 전체
//   (themeData.json, 약 320KB)가 홈 화면 코드에 통째로 딸려 왔습니다. 브라우저가 그걸 매번 읽느라 첫 화면과
//   화면 전환이 느려졌습니다. → 홈·휴대폰 화면은 이 파일에서 가져다 쓰고, 표가 실제로 필요한 테마 화면만
//   themeData.js를 씁니다. (목록 설명은 lib/themeData.js 참고)

export const POLITICAL_THEMES = new Set([
  "이재명", "애국테마주", "김민석", "김경수", "김동연",
  "최재형", "안철수", "한동훈", "홍준표", "오세훈", "이준석",
]);

export function isPoliticalTheme(themeName) {
  return POLITICAL_THEMES.has(themeName);
}
