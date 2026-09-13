// /health — 사이트 상태 점검 화면 (관리자용)
//
// [2026-09-11 추가] app/api/health/route.js가 내려주는 진단 결과를 신호등
// 형태로 보여주는 화면. 주소창에 newsmeme.co.kr/health 만 치면 됨.
//
// 검색엔진에는 노출되지 않게 noindex 처리함 — 방문자용 화면이 아니라
// 재성님이 "지금 뭐가 멈췄나" 확인할 때 쓰는 관리용 화면이라서.
// (app/admin 과 같은 성격)

import HealthClient from "./HealthClient";

export const metadata = {
  title: "사이트 상태 점검",
  robots: { index: false, follow: false },
};

export default function HealthPage() {
  return <HealthClient />;
}
