import Link from "next/link";

// components/ScheduleSwitch.js
//
// [2026-10-27 신설] 휴대폰 전용 — "공시 일정 | 공모주 청약" 두 칸 단추.
// 맨 아래 탭 줄의 "일정" 탭을 누르면 공시 일정 페이지가 열리는데, 공모주 일정도
// 같은 "일정" 성격이라 위쪽에서 한 번에 오갈 수 있게 했습니다.
// PC 화면(761px 이상)에서는 보이지 않습니다(globals.css의 .m-sched).
//
// current: "disclosure" | "ipo"  — 지금 보고 있는 쪽에 불이 켜집니다.

export default function ScheduleSwitch({ current }) {
  return (
    <nav className="m-sched" aria-label="일정 종류">
      <Link href="/disclosure" className={current === "disclosure" ? "on" : ""} aria-current={current === "disclosure" ? "page" : undefined}>
        공시 일정
      </Link>
      <Link href="/ipo" className={current === "ipo" ? "on" : ""} aria-current={current === "ipo" ? "page" : undefined}>
        공모주 청약
      </Link>
    </nav>
  );
}
