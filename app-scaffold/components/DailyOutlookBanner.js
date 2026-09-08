"use client";

import { useEffect, useState } from "react";
import { TrendingUp } from "lucide-react";

// [2026-09-08 추가] 재성님 요청 — 홈페이지 맨 위에 매일 아침 "나스닥 기반
// 국장 예측" 한 줄 배너. 실제 데이터는 /api/daily-outlook/refresh가 매일
// 아침 cron으로 미리 계산해서 Redis에 저장해두고, 이 컴포넌트는 그 저장된
// 값을 읽어오기만 함(자세한 흐름은 lib/dailyOutlook.js 주석 참고).
export default function DailyOutlookBanner() {
  const [outlook, setOutlook] = useState(null);
  const [state, setState] = useState("loading");

  useEffect(() => {
    fetch("/api/daily-outlook")
      .then((r) => r.json())
      .then((data) => {
        if (!data.outlook || !data.outlook.summary) {
          setState("empty");
          return;
        }
        setOutlook(data.outlook);
        setState("ready");
      })
      .catch(() => setState("empty"));
  }, []);

  // 아직 한 번도 안 돌았거나(cron 설정 전) 실패했으면 그냥 안 보여줌 —
  // 빈 배너보다는 아예 안 보이는 쪽이 나음.
  if (state !== "ready" || !outlook) return null;

  return (
    <div className="daily-outlook-banner">
      <TrendingUp size={15} style={{ flexShrink: 0 }} />
      <span className="daily-outlook-date">{outlook.dateLabel} 나스닥 기반 국장 예측</span>
      <span className="daily-outlook-sep">·</span>
      <span className="daily-outlook-summary">{outlook.summary}</span>
    </div>
  );
}
