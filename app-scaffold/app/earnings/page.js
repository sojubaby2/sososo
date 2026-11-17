// app/earnings/page.js
//
// [2026-11-15 신설] 실적 캘린더 — 이번 분기에 실적을 발표한 회사를 날짜별로 모으고, 영업이익을 전년 같은 분기와 비교해 보여 주는 페이지
//   재성님: (다른 서비스의 실적 캘린더 영상을 보여 주며) "이거도 만들어"
//   자료·한계 설명은 lib/earnings.js 맨 위에 있습니다(DART 공식 API, 무료).
//   화면은 미리 만든 것을 먼저 보여 주고(검색엔진·속도), 들어온 뒤 /api/earnings로 새 자료를 한 번 더 받습니다.

import Header from "../../components/Header";
import EarningsClient from "./EarningsClient";
import { getEarningsData } from "../../lib/earnings";

export const revalidate = 1800;

export async function generateMetadata() {
  let label = "이번 분기";
  let n = 0;
  try {
    const d = await getEarningsData();
    if (d?.season?.label) label = d.season.label;
    n = d?.items?.length || 0;
  } catch {
    // 못 받아도 기본 문구로
  }
  const title = `실적 캘린더 — ${label} 실적 발표 일정과 영업이익 한눈에 | 뉴스매매`;
  const description = `${label} 실적을 발표한 상장사${n ? ` ${n}곳` : ""}을 날짜별로 정리했습니다. 영업이익을 전년 같은 분기와 비교하고 흑자전환·적자전환 종목을 따로 모아 봅니다. 금융감독원 DART 공시 기준.`;
  return { title, description, alternates: { canonical: "https://newsmeme.co.kr/earnings" }, openGraph: { title, description } };
}

export default async function EarningsPage() {
  let initial = null;
  try {
    initial = await getEarningsData();
  } catch {
    initial = null;
  }
  return (
    <>
      <Header />
      <EarningsClient initial={initial} />
    </>
  );
}
