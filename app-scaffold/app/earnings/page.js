// app/earnings/page.js
//
// [2026-11-15 신설] 실적 캘린더 화면.
// [2026-11-17 변경] 재성님: "뭐 클릭하면 버벅버벅" — 이 화면은 서버가 실적 자료(DART)를 다 받을 때까지 기다렸다가
//   보여 줘서, 자료가 늦는 날엔 메뉴를 눌러도 8초 넘게 아무 반응이 없었습니다.
//   → 화면 틀은 바로 보여 주고, 자료는 화면이 뜬 뒤에 받아서 채웁니다(app/earnings/EarningsClient.js).

import Header from "../../components/Header";
import EarningsClient from "./EarningsClient";

export const metadata = {
  title: "실적 캘린더 — 분기 실적 발표 일정과 어닝 서프라이즈·쇼크 한눈에 | 뉴스매매",
  description:
    "이번 분기 실적을 발표한 상장사를 날짜별로 정리했습니다. 영업이익을 전년 같은 분기와 비교하고 어닝 서프라이즈·어닝 쇼크·흑자전환 종목을 따로 모아 봅니다. 금융감독원 DART 공시 기준.",
  alternates: { canonical: "https://newsmeme.co.kr/earnings" },
};

export default function EarningsPage() {
  return (
    <>
      <Header />
      <EarningsClient initial={null} />
    </>
  );
}
