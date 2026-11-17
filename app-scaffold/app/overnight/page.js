// app/overnight/page.js
//
// [2026-11-15 신설] 내일 장 미리 보기 — 밤사이 미국 지수·반도체주와 해외에 상장된 한국 주식을 한 화면에 모은 페이지
//   자료·한계 설명은 lib/overnight.js 맨 위. 화면은 들어온 뒤 1분마다 새로 받습니다.

import Header from "../../components/Header";
import OvernightClient from "./OvernightClient";

export const metadata = {
  title: "내일 장 미리 보기 — 밤사이 미국 증시·엔비디아·삼성전자 해외 시세 | 뉴스매매",
  description:
    "나스닥·필라델피아 반도체 지수, 엔비디아·마이크론·테슬라 주가와 삼성전자 런던 GDR, SK하이닉스 미국 ADR, 한국 ETF(EWY)를 한 화면에 모아 내일 한국 증시 분위기를 미리 살펴봅니다.",
  alternates: { canonical: "https://newsmeme.co.kr/overnight" },
};

export default function OvernightPage() {
  return (
    <>
      <Header />
      <OvernightClient />
    </>
  );
}
