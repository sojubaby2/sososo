// lib/usThemes.js
//
// [2026-10-19 신설] 미국 테마 목록입니다.
//
// 왜 필요한가 — 재성님 아이디어:
// 미국장은 우리 새벽에 끝납니다. 국내 개장 전에 사이트에 들어온 사람에게는
// "밤사이 미국에서 뭐가 올랐나"가 제일 신선한 재료이고, 그게 오늘 국내에서
// 뭐가 반응할지로 이어집니다.
//
// 어떻게 재나 — 테마 ETF 하나씩:
// 미국 종목 수천 개를 세는 대신, 그 테마를 담고 있는 ETF 하나의 등락률만
// 보면 됩니다. "로봇이 올랐다"는 BOTZ 하나로 충분합니다. 요청 수도 적고
// 숫자도 흔들리지 않습니다.
//
// koreanTheme: 이 미국 테마와 이어지는 국내 테마 이름입니다.
// lib/themeData.json에 실제로 있는 이름이어야 화면에서 연결이 됩니다.
// (없는 이름을 적으면 연결만 안 될 뿐, 문장 자체는 정상으로 나옵니다.)
//
// 테마를 더하거나 빼고 싶으면 이 배열만 고치면 됩니다. 늘려도 비용은
// 거의 안 늘어납니다 — 5분에 한 번씩만 부르고 저장해두기 때문입니다.

// [2026-10-26 수정] koreanTheme 이름 몇 개가 실제 테마 목록(lib/themeData.json)에 없는 이름이라
//   눌러도 아무 테마로 안 이어지고 있었습니다. 실제 있는 이름으로 바꿨습니다:
//   "바이오시밀러" → "바이오"
//   "원자력발전" → "원자력발전(SMR)"
//   "양자암호" → "양자암호통신"
//   "태양광에너지" → "태양광"
export const US_THEMES = [
  { etf: "SMH", label: "반도체", koreanTheme: "반도체" },
  { etf: "BOTZ", label: "로봇", koreanTheme: "로봇" },
  { etf: "ITA", label: "방산", koreanTheme: "방산주" },
  { etf: "XLE", label: "에너지", koreanTheme: "석유가스" },
  { etf: "IYT", label: "운송", koreanTheme: "해운" },
  { etf: "XBI", label: "바이오", koreanTheme: "바이오" },
  { etf: "NLR", label: "원자력", koreanTheme: "원자력발전(SMR)" },
  { etf: "QTUM", label: "양자·AI", koreanTheme: "양자암호통신" },
  { etf: "LIT", label: "2차전지", koreanTheme: "2차전지" },
  { etf: "TAN", label: "태양광", koreanTheme: "태양광" },
  { etf: "SKYY", label: "클라우드", koreanTheme: "클라우드" },
  { etf: "HACK", label: "사이버 보안", koreanTheme: "사이버 보안" },
];

export const US_ETF_SYMBOLS = US_THEMES.map((t) => t.etf);
