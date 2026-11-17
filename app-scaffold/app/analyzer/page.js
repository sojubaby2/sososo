// app/analyzer/page.js
//
// [2026-11-14 신설] 내 종목 분석기 — 종목과 내 평단가를 넣으면 손절·익절·물타기 기준 가격을 차트 위에 보여 주는 페이지
//   재성님: (다른 사이트의 종목분석기 광고 영상을 보여 주며) "저런 기능을 만들어 줘"
//   계산은 브라우저에서 정해진 규칙으로만 합니다(lib/positionPlan.js). AI·서버 비용 없음, 입력한 평단가는 서버에 저장하지 않음.

import { Suspense } from "react";
import Header from "../../components/Header";
import AnalyzerClient from "./AnalyzerClient";

export const metadata = {
  title: "내 종목 분석기 — 평단가로 보는 손절·익절·물타기 기준 | 뉴스매매",
  description:
    "종목과 내 평단가를 입력하면 최근 지지선·저항선과 변동폭을 기준으로 손절 기준가, 익절 기준가, 물타기 구간을 차트 위에 보여 줍니다. 회원가입 없이 무료.",
  alternates: { canonical: "https://newsmeme.co.kr/analyzer" },
};

export default function AnalyzerPage() {
  return (
    <>
      {/* [2026-11-15] 위 메뉴가 빠져 있던 것 추가 */}
      <Header />
      <Suspense fallback={null}>
        <AnalyzerClient />
      </Suspense>
    </>
  );
}
