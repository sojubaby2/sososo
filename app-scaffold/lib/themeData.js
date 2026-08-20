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

// Political/rumor-prone theme names — used to show the caution badge.
export const POLITICAL_THEMES = new Set([
  "이재명", "애국테마주", "김민석", "김경수", "김동연",
  "최재형", "안철수", "한동훈", "홍준표", "오세훈", "이준석",
]);

export function isPoliticalTheme(themeName) {
  return POLITICAL_THEMES.has(themeName);
}

export default raw;
