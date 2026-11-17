// lib/themeMomentumClient.js
//
// [2026-11-17 신설] 재성님: "사이트가 전체적으로 뭐 클릭하면 버벅버벅 하는 느낌 … 스무스하게 되도록 점검한 뒤에 수정해"
//   점검해 보니 홈 화면이 /api/theme-momentum(테마 등락률, 받는 데 약 3초)을 세 군데서 따로따로 3번 불렀습니다.
//   → 이 파일의 loadThemeMomentum()을 같이 쓰면 화면 전체에서 한 번만 받고, 5분 동안은 다시 안 받습니다
//     (테마 화면 → 홈 → 테마 화면처럼 오갈 때도 바로 뜸). 자료 자체가 하루 한 번 바뀌는 종가 기준이라 5분이면 충분합니다.

const KEEP_MS = 5 * 60 * 1000;
let cached = null; // { t, p }

export function loadThemeMomentum() {
  if (cached && Date.now() - cached.t < KEEP_MS) return cached.p;
  const p = fetch("/api/theme-momentum")
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
    .then((d) => {
      if (!d || d.error) {
        cached = null; // 실패하면 다음에 다시 시도
        return null;
      }
      return d;
    });
  cached = { t: Date.now(), p };
  return p;
}
