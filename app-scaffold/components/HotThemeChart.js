"use client";

// components/HotThemeChart.js
//
// [2026-11-04 신설] 홈 오른쪽 "HOT 테마" 칸 맨 위 막대그래프 — Bklit UI 그래프 도구 사용
//   재성님: "효과가 들어가면 좋을법한 곳에 전부 적용해" → 숫자만 줄지어 있던 HOT 테마를
//   한눈에 비교되는 막대그래프로. 막대가 아래에서 차례로 솟아오르고, 마우스를 올리면 테마 이름·수치가 뜸.
//   아래 테마 이름 줄(누르면 테마별 종목정리로 이동)은 그대로 둡니다.
//
// 자료: HotThemePanel이 이미 받아 둔 숫자를 그대로 받음(서버 요청 추가 0, 비용 0).
// 색: 오르면 빨강(--up), 내리면 파랑(--down) — 국내 관행.

import { BarChart, Bar, Grid, ChartTooltip } from "./bklit/charts";

export default function HotThemeChart({ themes, field }) {
  const rows = (themes || []).slice(0, 7).map((t) => ({
    name: t.theme,
    value: Math.round((t[field] || 0) * 10) / 10,
  }));
  if (rows.length < 2) return null;
  const allUp = rows.every((r) => r.value >= 0);

  return (
    <div className="fx-hotchart" aria-hidden="true">
      <BarChart key={field} data={rows} xDataKey="name" margin={{ top: 8, right: 4, bottom: 4, left: 4 }}>
        <Grid horizontal />
        <Bar dataKey="value" fill={allUp ? "var(--up)" : "var(--amber)"} lineCap="round" />
        <ChartTooltip />
      </BarChart>
    </div>
  );
}
