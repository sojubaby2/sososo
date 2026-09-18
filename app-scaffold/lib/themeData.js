import raw from "./themeData.json";

// raw: [{ theme, name, code, market }, ...]  — 109 themes, 1021 stock rows,
// built from the theme research we did earlier in the project.

export function getAllThemeNames() {
  return Array.from(new Set(raw.map((r) => r.theme))).sort();
}

export function getStocksByTheme(themeName) {
  return raw.filter((r) => r.theme === themeName);
}

export function getThemesGrouped() {
  const map = new Map();
  for (const row of raw) {
    if (!map.has(row.theme)) map.set(row.theme, []);
    map.get(row.theme).push(row);
  }
  return Array.from(map.entries()).map(([theme, stocks]) => ({ theme, stocks }));
}

// [2026-09-18 변경] 재성님 요청으로 정치인 테마주를 themeData.json에서
// 아예 제거했습니다(11개 테마 · 78개 종목행 삭제 — 이재명·한동훈·오세훈·
// 이준석·안철수·홍준표·김경수·김민석·김동연·최재형·애국테마주).
// 그래서 이제 이 목록에 걸리는 테마는 데이터에 없습니다.
//
// 목록 자체는 남겨둡니다 — app/page.js가 HOT테마·급등테마 패널에서
// isPoliticalTheme()로 걸러내는 데 쓰고 있고, 나중에 정치 테마를 다시
// 넣더라도 그 필터가 그대로 동작해야 하기 때문입니다. 다시 넣으실 때는
// themeData.json에 종목을 추가하기만 하면 됩니다.
export const POLITICAL_THEMES = new Set([
  "이재명", "애국테마주", "김민석", "김경수", "김동연",
  "최재형", "안철수", "한동훈", "홍준표", "오세훈", "이준석",
]);

export function isPoliticalTheme(themeName) {
  return POLITICAL_THEMES.has(themeName);
}

export default raw;
