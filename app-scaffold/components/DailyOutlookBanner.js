"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, ChevronDown, ChevronUp, ChevronRight } from "lucide-react";

// [2026-09-08 추가] 재성님 요청 — 홈페이지 맨 위에 매일 아침 "나스닥 기반
// 국장 예측" 배너. 실제 데이터는 /api/daily-outlook/refresh가 매일 아침
// cron으로 미리 계산해서 Redis에 저장해두고, 이 컴포넌트는 그 저장된 값을
// 읽어오기만 함(자세한 흐름은 lib/dailyOutlook.js 주석 참고).
//
// [2026-09-08 수정] 처음엔 문장 하나(summary)였는데, 재성님 요청으로 테마별
// 상승/하락 예측을 최대 3개까지 각각 보여주도록 바꿈 — 상승 예측은 붉은
// 배경 + 위쪽 화살표, 하락 예측은 파란 배경 + 아래쪽 화살표로 한 줄씩
// 표시함(국내 증시 관행: 상승=빨강, 하락=파랑, 종목 급등락 표시와 동일한
// 색 규칙 — app/globals.css의 --up/--down 참고).
//
// [2026-09-08 수정(2차)] 재성님 요청으로 최대 개수를 3개 → 10개로 늘림.
// 다만 처음 화면엔 첫 줄(가장 우선순위 높은 예측) 하나만 보여주고, 나머지는
// "펼치기" 버튼을 눌러야 펼쳐지도록 함 — picks가 10개까지 늘어나도 배너가
// 화면을 다 차지하지 않도록.
//
// [2026-09-08 수정(3차)] 재성님 질문 — "관련주 매칭 되나?" — 재성님이 고른
// 방식대로, 각 줄을 누르면 그 테마의 "테마별 종목정리"(/themes) 페이지로
// 이동해서 실제 관련주를 바로 보여주게 함(lib/dailyOutlook.js가 이제
// theme을 /themes가 아는 정식 테마명 중에서만 고르도록 강제하기 때문에
// 링크가 항상 유효함 — 자세한 이유는 그 파일 주석 참고).
export default function DailyOutlookBanner() {
  const [outlook, setOutlook] = useState(null);
  const [state, setState] = useState("loading");
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch("/api/daily-outlook")
      .then((r) => r.json())
      .then((data) => {
        if (!data.outlook || !Array.isArray(data.outlook.picks) || data.outlook.picks.length === 0) {
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

  const [firstPick, ...restPicks] = outlook.picks;
  const hasMore = restPicks.length > 0;

  const renderRow = (pick, i) => {
    const isUp = pick.direction === "up";
    const Icon = isUp ? TrendingUp : TrendingDown;
    return (
      <Link
        key={i}
        href={`/themes?theme=${encodeURIComponent(pick.theme)}`}
        className={`daily-outlook-row ${isUp ? "up" : "down"}`}
      >
        <Icon size={14} style={{ flexShrink: 0 }} />
        <span className="daily-outlook-theme">{pick.theme}</span>
        <span className="daily-outlook-reason">{pick.reason}</span>
        <span className="daily-outlook-verdict">{isUp ? "강세 예상" : "하락 예상"}</span>
        <ChevronRight size={14} style={{ flexShrink: 0, opacity: 0.5 }} />
      </Link>
    );
  };

  return (
    <div className="daily-outlook-banner">
      <p className="daily-outlook-heading">{outlook.dateLabel} 나스닥 기반 국장 예측</p>
      {renderRow(firstPick, 0)}
      {expanded && restPicks.map((pick, i) => renderRow(pick, i + 1))}
      {hasMore && (
        <button
          type="button"
          className="daily-outlook-toggle"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? (
            <>
              접기 <ChevronUp size={14} />
            </>
          ) : (
            <>
              나머지 {restPicks.length}개 더보기 <ChevronDown size={14} />
            </>
          )}
        </button>
      )}
    </div>
  );
}
