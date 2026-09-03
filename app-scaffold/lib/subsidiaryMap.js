// 모회사-자회사 매핑 (비상장 자회사 → 상장된 모회사)
//
// 뉴스에 "SK온이 ~계약을 체결했다"처럼 비상장 자회사 이름이 나오면, 그
// 자회사 자체는 매매할 수 없으니 상장된 모회사를 관련주로 연결해준다.
//
// 원칙: 여기 있는 회사는 전부 "비상장(또는 자체 종목코드 없음)"인 경우만
// 넣는다. 자회사가 이미 자체 코드로 상장되어 있으면(예: 삼성SDI, LG에너지
// 솔루션처럼) 여기 넣지 않는다 — 그런 경우는 이미 전체 상장종목 목록에서
// 자기 코드로 직접 매칭되기 때문에, 모회사까지 같이 붙이면 오히려 부정확한
// 중복 매칭이 된다.
//
// 신뢰도가 낮거나(지분율 불명확, 최근 지배구조 변동 가능성) 최근 상장·상장
// 폐지·매각 등으로 상태가 바뀔 수 있는 항목은 DART 재확인 전까지 보류.

export const SUBSIDIARY_MAP = [
  // ---- SK그룹 ----
  { subsidiary: "SK온", parentName: "SK이노베이션", parentCode: "096770", parentMarket: "코스피" },
  { subsidiary: "SK어스온", parentName: "SK이노베이션", parentCode: "096770", parentMarket: "코스피" },
  { subsidiary: "SK엔텀", parentName: "SK이노베이션", parentCode: "096770", parentMarket: "코스피" },

  // ---- 카카오그룹 ----
  { subsidiary: "카카오모빌리티", parentName: "카카오", parentCode: "035720", parentMarket: "코스피" },
  { subsidiary: "카카오엔터테인먼트", parentName: "카카오", parentCode: "035720", parentMarket: "코스피" },
  { subsidiary: "카카오스타일", parentName: "카카오", parentCode: "035720", parentMarket: "코스피" },
  { subsidiary: "카카오엔터프라이즈", parentName: "카카오", parentCode: "035720", parentMarket: "코스피" },
  { subsidiary: "카카오헬스케어", parentName: "카카오", parentCode: "035720", parentMarket: "코스피" },
  { subsidiary: "카카오브레인", parentName: "카카오", parentCode: "035720", parentMarket: "코스피" },
  { subsidiary: "카카오벤처스", parentName: "카카오", parentCode: "035720", parentMarket: "코스피" },
  { subsidiary: "카카오VX", parentName: "카카오", parentCode: "035720", parentMarket: "코스피" },
  { subsidiary: "그라운드엑스", parentName: "카카오", parentCode: "035720", parentMarket: "코스피" },

  // ---- 현대차그룹 ----
  { subsidiary: "현대엔지니어링", parentName: "현대건설", parentCode: "000720", parentMarket: "코스피" },
  { subsidiary: "현대캐피탈", parentName: "현대자동차", parentCode: "005380", parentMarket: "코스피" },
  { subsidiary: "현대카드", parentName: "현대자동차", parentCode: "005380", parentMarket: "코스피" },
  { subsidiary: "현대커머셜", parentName: "현대자동차", parentCode: "005380", parentMarket: "코스피" },
  { subsidiary: "보스턴다이내믹스", parentName: "현대자동차", parentCode: "005380", parentMarket: "코스피" },

  // ---- 삼성그룹 ----
  { subsidiary: "하만", parentName: "삼성전자", parentCode: "005930", parentMarket: "코스피" },

    // ---- CJ ENM그룹 ---- (티빙은 CJ ENM 단독 자회사가 아니라 CJ ENM이 최대주주로
  // 참여하는 합작법인(약 48.85%)이지만, 뉴스에서 가장 밀접하게 다뤄지는 상장사가
  // CJ ENM이라 여기로 연결. 스튜디오드래곤은 별개 회사이니 절대 연결하지 말 것 —
  // SYSTEM_PROMPT의 계열사 혼동 주의 규칙 참고.
  { subsidiary: "티빙", parentName: "CJ ENM", parentCode: "035760", parentMarket: "코스피" },

  // ---- 하림그룹 ----
  { subsidiary: "NS쇼핑", parentName: "하림지주", parentCode: "003380", parentMarket: "코스피" },

  // ---- 코오롱그룹 ----
  { subsidiary: "코오롱모빌리티그룹", parentName: "코오롱", parentCode: "002020", parentMarket: "코스피" },
  { subsidiary: "코오롱베니트", parentName: "코오롱", parentCode: "002020", parentMarket: "코스피" },
  { subsidiary: "코오롱스페이스웍스", parentName: "코오롱", parentCode: "002020", parentMarket: "코스피" },

  // ---- 넷마블그룹 ----
  { subsidiary: "스핀엑스", parentName: "넷마블", parentCode: "251270", parentMarket: "코스피" },
  { subsidiary: "넷마블네오", parentName: "넷마블", parentCode: "251270", parentMarket: "코스피" },
  { subsidiary: "넷마블에프앤씨", parentName: "넷마블", parentCode: "251270", parentMarket: "코스피" },

  // ---- 하이브그룹 ----
  { subsidiary: "빅히트뮤직", parentName: "하이브", parentCode: "352820", parentMarket: "코스피" },
  { subsidiary: "쏘스뮤직", parentName: "하이브", parentCode: "352820", parentMarket: "코스피" },
  { subsidiary: "빌리프랩", parentName: "하이브", parentCode: "352820", parentMarket: "코스피" },
  { subsidiary: "어도어", parentName: "하이브", parentCode: "352820", parentMarket: "코스피" },
  { subsidiary: "플레디스엔터테인먼트", parentName: "하이브", parentCode: "352820", parentMarket: "코스피" },
  { subsidiary: "KOZ엔터테인먼트", parentName: "하이브", parentCode: "352820", parentMarket: "코스피" },

  // ---- 크래프톤그룹 ----
  { subsidiary: "블루홀스튜디오", parentName: "크래프톤", parentCode: "259960", parentMarket: "코스피" },
  { subsidiary: "라이징윙스", parentName: "크래프톤", parentCode: "259960", parentMarket: "코스피" },
  { subsidiary: "스트라이킹디스턴스스튜디오", parentName: "크래프톤", parentCode: "259960", parentMarket: "코스피" },
  { subsidiary: "나인비스튜디오", parentName: "크래프톤", parentCode: "259960", parentMarket: "코스피" },
  { subsidiary: "언노운월드", parentName: "크래프톤", parentCode: "259960", parentMarket: "코스피" },

  // ---- 에코프로그룹 ----
  { subsidiary: "에코프로로지스틱스", parentName: "에코프로", parentCode: "086520", parentMarket: "코스닥" },
  { subsidiary: "에코프로이노베이션", parentName: "에코프로", parentCode: "086520", parentMarket: "코스닥" },
  { subsidiary: "에코프로에이피", parentName: "에코프로", parentCode: "086520", parentMarket: "코스닥" },

  // ---- 오뚜기그룹 ----
  { subsidiary: "오뚜기SF", parentName: "오뚜기", parentCode: "007310", parentMarket: "코스피" },
  { subsidiary: "오뚜기물류서비스", parentName: "오뚜기", parentCode: "007310", parentMarket: "코스피" },

  // ---- 아모레퍼시픽그룹 ----
  { subsidiary: "이니스프리", parentName: "아모레퍼시픽", parentCode: "090430", parentMarket: "코스피" },
  { subsidiary: "에뛰드", parentName: "아모레퍼시픽", parentCode: "090430", parentMarket: "코스피" },
  { subsidiary: "에스쁘아", parentName: "아모레퍼시픽", parentCode: "090430", parentMarket: "코스피" },
  { subsidiary: "오설록", parentName: "아모레퍼시픽", parentCode: "090430", parentMarket: "코스피" },
  { subsidiary: "아모스프로페셔널", parentName: "아모레퍼시픽", parentCode: "090430", parentMarket: "코스피" },
  { subsidiary: "코스알엑스", parentName: "아모레퍼시픽", parentCode: "090430", parentMarket: "코스피" },

  // ---- 농심그룹 ----
  { subsidiary: "태경농산", parentName: "농심홀딩스", parentCode: "072710", parentMarket: "코스피" },
  { subsidiary: "농심태경", parentName: "농심홀딩스", parentCode: "072710", parentMarket: "코스피" },
  { subsidiary: "호텔농심", parentName: "농심홀딩스", parentCode: "072710", parentMarket: "코스피" },
  { subsidiary: "농심엔지니어링", parentName: "농심홀딩스", parentCode: "072710", parentMarket: "코스피" },
  { subsidiary: "엔디에스", parentName: "농심홀딩스", parentCode: "072710", parentMarket: "코스피" },

  // ---- 유한양행그룹 ----
  { subsidiary: "유한화학", parentName: "유한양행", parentCode: "000100", parentMarket: "코스피" },
  { subsidiary: "유한메디카", parentName: "유한양행", parentCode: "000100", parentMarket: "코스피" },

  // ---- LS그룹 ----
  { subsidiary: "LS전선", parentName: "LS", parentCode: "006260", parentMarket: "코스피" },
  { subsidiary: "LS MnM", parentName: "LS", parentCode: "006260", parentMarket: "코스피" },
  { subsidiary: "LS엠트론", parentName: "LS", parentCode: "006260", parentMarket: "코스피" },
  { subsidiary: "LS글로벌인코퍼레이티드", parentName: "LS", parentCode: "006260", parentMarket: "코스피" },

  // ---- 세아그룹 ----
  { subsidiary: "세아베스틸", parentName: "세아베스틸지주", parentCode: "001430", parentMarket: "코스피" },
  { subsidiary: "세아창원특수강", parentName: "세아베스틸지주", parentCode: "001430", parentMarket: "코스피" },

  // ---- 효성그룹 ----
  { subsidiary: "효성티앤에스", parentName: "효성", parentCode: "004800", parentMarket: "코스피" },
  { subsidiary: "효성굿스프링스", parentName: "효성", parentCode: "004800", parentMarket: "코스피" },

  // ---- 금호석유화학그룹 ----
  { subsidiary: "금호피앤비화학", parentName: "금호석유화학", parentCode: "011780", parentMarket: "코스피" },
  { subsidiary: "금호폴리켐", parentName: "금호석유화학", parentCode: "011780", parentMarket: "코스피" },
  { subsidiary: "금호티앤엘", parentName: "금호석유화학", parentCode: "011780", parentMarket: "코스피" },

  // ---- HDC그룹 ----
  { subsidiary: "HDC아이파크몰", parentName: "HDC", parentCode: "012630", parentMarket: "코스피" },
  { subsidiary: "HDC아이앤콘스", parentName: "HDC", parentCode: "012630", parentMarket: "코스피" },
  { subsidiary: "HDC호텔", parentName: "HDC", parentCode: "012630", parentMarket: "코스피" },

  // ---- 매일유업그룹 ----
  { subsidiary: "엠즈푸드시스템", parentName: "매일홀딩스", parentCode: "005990", parentMarket: "코스닥" },
  { subsidiary: "엠즈씨드", parentName: "매일홀딩스", parentCode: "005990", parentMarket: "코스닥" },
  { subsidiary: "폴바셋", parentName: "매일홀딩스", parentCode: "005990", parentMarket: "코스닥" },
  { subsidiary: "엠즈베버리지", parentName: "매일홀딩스", parentCode: "005990", parentMarket: "코스닥" },
  { subsidiary: "매일헬스뉴트리션", parentName: "매일유업", parentCode: "267980", parentMarket: "코스닥" },

  // ---- 컴투스그룹 ----
  { subsidiary: "컴투스플랫폼", parentName: "컴투스홀딩스", parentCode: "063080", parentMarket: "코스닥" },
  { subsidiary: "컴투스플러스", parentName: "컴투스홀딩스", parentCode: "063080", parentMarket: "코스닥" },

  // ---- 다우키움그룹 ----
  { subsidiary: "키움저축은행", parentName: "키움증권", parentCode: "039490", parentMarket: "코스피" },
  { subsidiary: "키움투자자산운용", parentName: "키움증권", parentCode: "039490", parentMarket: "코스피" },
  { subsidiary: "키움캐피탈", parentName: "키움증권", parentCode: "039490", parentMarket: "코스피" },

  // ---- 사조그룹 ----
  { subsidiary: "사조CPK", parentName: "사조대림", parentCode: "003960", parentMarket: "코스피" },
];

export function buildSubsidiaryPromptBlock() {
  return SUBSIDIARY_MAP.map(
    (r) => `${r.subsidiary} → ${r.parentName}(${r.parentCode}|${r.parentMarket})`
  ).join("\n");
}
