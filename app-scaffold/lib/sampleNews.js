// Placeholder news items with pre-attached stock matches, standing in for
// the real "뉴스 수집 → 후보 검색 → AI 근거 검증" pipeline discussed earlier.
// Swap this for a real fetch (your news source + matching endpoint) when
// that backend piece is built — the NewsCard component doesn't need to change.

const SAMPLE_NEWS = [
  {
    id: 1,
    time: "6분 전",
    source: "연합뉴스",
    headline: "OO물류, 고객 개인정보 해킹 피해··· 이용자 120만명 노출",
    summary:
      "OO물류가 운영하는 배송조회 시스템이 외부 공격을 받아 이름·연락처·주소 등 개인정보가 유출된 것으로 확인됐다.",
    confidence: "confirmed",
    reason: "정보 유출 사고 대응 수요 증가 — 보안 소프트웨어·인증 사업과 직접 연관",
    stocks: [
      { name: "안랩", code: "053800", market: "코스닥" },
      { name: "드림시큐리티", code: "203650", market: "코스닥" },
      { name: "한국전자인증", code: "041460", market: "코스닥" },
    ],
  },
  {
    id: 2,
    time: "22분 전",
    source: "로이터",
    headline: "이란, 호르무즈 해협 통항 추가 제한 시사··· 국제유가 급등",
    summary:
      "이란 혁명수비대가 호르무즈 해협 인근에서 추가 군사 훈련을 예고하면서 국제유가가 장중 5% 넘게 급등했다.",
    confidence: "confirmed",
    reason: "원유 수급 구조상 직접 연관 — 정유·에너지 기업 매출과 직결",
    stocks: [
      { name: "에쓰오일", code: "010950", market: "코스피" },
      { name: "SK이노베이션", code: "096770", market: "코스피" },
      { name: "흥구석유", code: "024060", market: "코스닥" },
    ],
  },
  {
    id: 3,
    time: "41분 전",
    source: "커뮤니티/SNS 발",
    headline: "OO 의원, 고교 동창이 대표인 기업과 사적 만찬 포착",
    summary:
      "정치권 유력 인사로 거론되는 OO 의원이 지역구 기업인들과 비공개 만찬을 가진 사실이 알려지며 온라인 커뮤니티에서 관련설이 확산되고 있다.",
    confidence: "rumor",
    reason: "인맥·동창 관계 기반 연결 — 사업내용상 실질적 근거 확인 안 됨. 시장에서 도는 추정일 뿐 공식 관련성 아님",
    stocks: [
      { name: "동신건설", code: "025950", market: "코스닥" },
      { name: "에이텍", code: "045660", market: "코스닥" },
    ],
  },
  {
    id: 4,
    time: "1시간 전",
    source: "메디컬투데이",
    headline: "美 FDA, 국산 경구용 비만치료제 후보물질 패스트트랙 지정",
    summary:
      "국내 제약사가 개발 중인 경구용 비만치료제 후보물질이 미국 식품의약국(FDA)으로부터 패스트트랙 심사 대상으로 지정됐다.",
    confidence: "confirmed",
    reason: "공식 임상 파이프라인 발표 — 사업보고서상 해당 파이프라인 존재 확인",
    stocks: [
      { name: "한미약품", code: "128940", market: "코스피" },
      { name: "펩트론", code: "087010", market: "코스닥" },
    ],
  },
];

export default SAMPLE_NEWS;
