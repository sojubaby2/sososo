// app/guide/page.js
//
// [2026-10-29 전면 개편] 차트 가이드 — 화면은 components/GuideClient.js("차트 도감").
//   이 파일은 검색엔진용 제목·설명만 정하고 화면 조각을 불러옵니다.
//   (예전에는 이 파일 전체가 브라우저 쪽 코드라 검색엔진용 제목·설명을 따로 줄 수 없었습니다)

import Header from "../../components/Header";
import GuideClient from "../../components/GuideClient";

export const metadata = {
  title: "차트 가이드 — 캔들·이동평균선·RSI·MACD를 움직이는 그림으로 | 뉴스매매",
  description:
    "캔들차트, 거래량, 이동평균선, 볼린저밴드, RSI, MACD, 일목균형표 등 47개 차트 지표를 같은 가격 데이터 위에서 움직이는 그림으로 보여 주고, 읽는 법을 쉽게 설명합니다.",
  alternates: { canonical: "/guide" },
};

export default function GuidePage() {
  return (
    <div>
      <Header />
      <GuideClient />
    </div>
  );
}
