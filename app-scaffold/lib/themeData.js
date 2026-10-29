import raw from "./themeData.json";

// raw: [{ theme, name, code, market }, ...]  — built from the theme research we did earlier in the project.
//
// [2026-10-26 전체 점검] 재성님 요청: "테마 업데이트 — 싹 검토해서 최신 테마 추가, 기존 테마 종목 검토,
//   추가할 건 추가, 뺄 건 빼". 지금 157개 테마 · 1,599개 종목행.
//   ① 2026-10-22 전 종목 목록(2,868개)과 하나하나 대조:
//      상장폐지·합병 17건 삭제, 다른 회사를 가리키던 종목코드 24건 정정, 회사 이름 변경 31건 반영,
//      코스피/코스닥 표시 30건 정정, 사업이 바뀐 3건 삭제, 같은 테마 안 중복 4건 제거.
//   ② 8~10월 일일 시장 정리(주도 테마·상승 이유)를 훑어 새 테마 11개 추가
//      (호남 반도체 클러스터, HLB그룹, 서울고속버스터미널 재개발, 우주태양광, CPO, 가스터빈·가스발전,
//       6G, 슈퍼커패시터, 데이터센터 냉각, 피지컬 AI, 여름(폭염)),
//      기존 테마 24개에 새로 묶이는 종목 추가(로봇·ESS·2차전지·광통신·사이버 보안·우주항공 등).
//   ③ 기존 테마 이름은 하나도 바꾸지 않았습니다 — 홈 화면·전망 배너가 이름으로 연결돼 있어서입니다.
//   ※ 정치인 테마는 2026-09-18 결정대로 넣지 않았습니다(오세훈 관련주가 10월에 움직였지만 제외).

// [2026-10-29 추가] 세분화 테마 11개 · 70개 종목행 — 재성님: "의료 로봇 테마를 따로 나눠야할거같은데 … 같은 섹터에서
//   더 세분화되는것들이 있으면 새로 만들어줘". 큰 테마(로봇·2차전지·바이오)는 그대로 두고 하위 테마를 새로 더했습니다.
//   · 로봇 → 의료 로봇, 휴머노이드 로봇, 협동로봇, 로봇 부품(감속기·액추에이터), 서비스·물류 로봇
//   · 2차전지 → 2차전지 소재(양극재/음극재/전해질/분리막/동박)
//   · 바이오 → ADC(항체약물접합체)
//   종목마다 2025~2026년 기사로 사업 내용을 확인하고, 종목코드·시장은 실제 시세 조회로 한 번 더 확인했습니다.
//   ★ SK아이이테크놀로지(361610)는 2027-01-01 SK이노베이션에 합병 예정 → 그때 "2차전지 소재(분리막)"에서 SK이노베이션(096770)으로 바꿔야 함.
//   뉴스 관련주 매칭은 lib/newsPipeline.js의 EXTRA_THEME_KEYWORDS(하위 테마 전용 검색어)와 프롬프트 규칙으로 하위 테마를 먼저 고릅니다.

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
