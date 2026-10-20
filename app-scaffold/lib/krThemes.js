// lib/krThemes.js
//
// [2026-10-20 신설] 국내 테마 ETF 목록입니다.
//
// 왜 만들었나 — 재성님 질문:
// "한국도 뉴스 기준 말고 실제 증시값 기준으로 할 수 없냐"
//
// 그동안 한국 칸은 **우리 사이트 뉴스에 걸린 종목들의 평균 등락률**로
// 1등 테마를 뽑았습니다. 이건 "오늘 뉴스가 몰린 테마가 실제로 올랐나"를
// 보는 것이라 의미는 있지만, 시장 전체를 본 건 아닙니다. 뉴스가 한 건도
// 안 들어온 테마가 그날 제일 많이 올랐어도 알 수가 없습니다.
//
// 그래서 미국과 똑같은 방식을 국내에도 붙였습니다 — 테마마다 ETF 하나씩.
// 종목 수백 개를 세는 대신 그 테마를 담은 ETF 하나의 등락률만 보면 됩니다.
//
// ── 한계를 분명히 적어둡니다 ───────────────────────────────────────
// ETF가 있는 테마만 1등 후보가 됩니다. 해운·조선처럼 전용 ETF가 없거나
// 제가 종목코드를 확신하지 못한 테마는 아래 목록에 없고, 따라서 ETF
// 기준으로는 1등이 될 수 없습니다.
//
// 다만 그런 테마도 화면에서 사라지지는 않습니다.
//   · 테마 히트맵("뉴스가 몰린 테마")은 그대로 뉴스 기준입니다
//   · ETF를 하나도 못 받아오면 한국 칸 전체가 예전 뉴스 기준으로 돌아갑니다
//     (lib/todayBrief.js의 buildDomesticPanel 참고)
//
// ── 목록을 늘리는 방법 ─────────────────────────────────────────────
// 아래에 { code, label, koreanTheme } 한 줄만 더하면 됩니다.
// 종목코드가 틀리면 **그 줄만 조용히 빠집니다**(화면이 깨지지 않습니다).
// 어떤 테마가 아무리 올라도 1등에 안 나오면 그 줄의 코드부터 의심하세요.
// 확인은 주소창에 아래를 치면 1초면 됩니다. longName이 기대한 ETF 이름과
// 같은지만 보면 됩니다.
//   query1.finance.yahoo.com/v8/finance/chart/091160.KS
//
// koreanTheme은 lib/themeData.json에 실제로 있는 테마 이름이어야
// 화면에서 연결이 됩니다(없는 이름을 적어도 문장은 정상으로 나옵니다).

export const KR_THEMES = [
  // 오래 상장돼 있어 코드가 안정적인 업종 ETF들입니다.
  { code: "091160", label: "반도체", koreanTheme: "반도체" }, // KODEX 반도체
  { code: "305720", label: "2차전지", koreanTheme: "2차전지" }, // KODEX 2차전지산업
  { code: "091180", label: "자동차", koreanTheme: "자동차" }, // KODEX 자동차
  { code: "143860", label: "헬스케어", koreanTheme: "제약업체" }, // TIGER 헬스케어
  { code: "091170", label: "은행", koreanTheme: "은행" }, // KODEX 은행
  { code: "102970", label: "증권", koreanTheme: "증권" }, // KODEX 증권
  { code: "117680", label: "철강", koreanTheme: "철강 주요종목" }, // KODEX 철강
  { code: "117700", label: "건설", koreanTheme: "건설 대표주" }, // KODEX 건설
  { code: "140710", label: "운송", koreanTheme: "해운" }, // Kodex Transportation (항공·해운·육운)

  // [2026-10-20 정정] 아래 세 줄은 처음에 라벨을 잘못 붙였습니다.
  // 배포 후 /api/etf-check 로 야후가 돌려준 실제 이름을 보고 바로잡았습니다.
  // 점검 창구를 만들어둔 보람이 바로 여기서 나왔습니다.
  //   102960 -> "Kodex Shipbuilding"  (기계장비가 아니라 조선)
  //   266360 -> "KODEX IT Software"   (미디어·엔터가 아니라 IT 소프트웨어)
  //   463250 -> "Tiger Space Tech"    (방산보다 우주·항공이 정확)
  { code: "102960", label: "조선", koreanTheme: "조선" }, // Kodex Shipbuilding
  { code: "266360", label: "IT 소프트웨어", koreanTheme: "소프트웨어" }, // KODEX IT Software
  { code: "228790", label: "화장품", koreanTheme: "화장품" }, // Tiger Cosmetics
  { code: "463250", label: "우주·항공", koreanTheme: "우주항공" }, // Tiger Space Tech
];

// 국내 ETF도 코스피 상장이라 야후 기호는 뒤에 .KS를 붙입니다.
export const KR_ETF_SYMBOLS = KR_THEMES.map((t) => `${t.code}.KS`);
