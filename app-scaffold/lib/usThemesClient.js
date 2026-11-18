// lib/usThemesClient.js
//
// [2026-11-18 신설] 미국 테마 자료(/api/us-themes)를 화면 전체에서 한 번만 받기 — 5분 동안 다시 안 받음.
//   테마 화면과 "내일 장 미리 보기"가 같이 씁니다. (설명은 lib/usThemeQuotes.js)

const KEEP_MS = 5 * 60 * 1000;
let cached = null;

export function loadUsThemes() {
  if (cached && Date.now() - cached.t < KEEP_MS) return cached.p;
  const p = fetch("/api/us-themes")
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
    .then((d) => {
      if (!d || !Array.isArray(d.themes)) {
        cached = null;
        return null;
      }
      return d;
    });
  cached = { t: Date.now(), p };
  return p;
}

// 한국 테마 이름 → 그 테마와 이어지는 미국 테마들
export function usThemesForKorean(data, krTheme) {
  if (!data?.themes) return [];
  return data.themes.filter((t) => !t.etf && Array.isArray(t.kr) && t.kr.includes(krTheme));
}
