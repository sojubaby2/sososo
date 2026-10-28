"use client";

// components/SideAds.js
//
// [2026-10-28 신설] PC 화면 양옆 빈자리 광고 — 재성님: "사이드레일광고 그냥 빼고 너가 페이지마다 양옆 사이드에 넣어주라"
//
// 구글 자동 "사이드 레일 광고"는 끄고(애드센스 설정), 대신 우리가 직접 양옆 빈자리에 세로로 긴 광고를 1개씩 넣습니다.
//   · 본문(main) 양옆에 광고가 들어갈 만큼 빈자리가 있을 때만 나옵니다.
//       빈자리가 넓으면 300×600, 좁으면 160×600, 그보다 좁으면 안 나옴(노트북·태블릿·휴대폰은 보통 안 나옴)
//   · 홈 화면은 화면을 꽉 채운 3칸이라 빈자리가 없어서 안 나옵니다(홈은 왼쪽 칸 광고 2개가 따로 있음)
//   · 화면을 따라다니지 않습니다(스크롤하면 같이 올라감).
//       애드센스 정책상 따라다니는 광고는 "한쪽에만, 한 번에 1개"만 허용 → 양쪽에 두려면 따라다니지 않게 해야 함
//   · 본문과 겹치지 않게, 본문에서 24px 이상 떨어뜨리고 빈자리 가운데에 놓습니다
//   · 페이지를 옮기면 새 광고를 받습니다(AdSlot이 주소별로 새로 만듦)

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import AdSlot from "./AdSlot";

const GAP = 24; // 본문·화면 끝과 광고 사이 최소 거리
const SIZES = [300, 160]; // 넓은 것부터 시도

function measure() {
  if (typeof window === "undefined") return null;
  const W = document.documentElement.clientWidth; // 스크롤바 뺀 화면 폭
  if (W < 1181) return null; // 노트북 이하 화면은 안 넣음
  const main = document.querySelector("body main");
  if (!main) return null;
  const r = main.getBoundingClientRect();
  if (r.width <= 0) return null;
  const space = Math.min(r.left, W - r.right); // 양쪽 중 좁은 쪽 기준으로 같은 크기
  const size = SIZES.find((s) => space >= s + GAP * 2);
  if (!size) return null;
  // 본문 글자가 시작하는 높이에 맞춤(main 위쪽 안 여백만큼 내림)
  const padTop = parseFloat(getComputedStyle(main).paddingTop) || 0;
  const top = Math.round(r.top + window.scrollY + Math.min(padTop, 48));
  return {
    size,
    top,
    left: Math.round(r.left / 2 - size / 2), // 왼쪽 빈자리 가운데
    right: Math.round((W - r.right) / 2 - size / 2), // 오른쪽 빈자리 가운데
  };
}

export default function SideAds() {
  const pathname = usePathname();
  const [pos, setPos] = useState(null);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const p = measure();
        setPos((cur) =>
          JSON.stringify(cur) === JSON.stringify(p) ? cur : p
        );
      });
    };
    update();
    // 페이지 내용이 늦게 그려지는 경우가 있어 조금 뒤에 한 번 더
    const t1 = setTimeout(update, 400);
    const t2 = setTimeout(update, 1500);
    window.addEventListener("resize", update);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    ro?.observe(document.body);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener("resize", update);
      ro?.disconnect();
    };
  }, [pathname]);

  if (!pos) return null;
  const common = { top: pos.top, width: pos.size };
  return (
    <>
      <div className={`side-ad side-ad-${pos.size}`} style={{ ...common, left: pos.left }}>
        <AdSlot box key={`l-${pos.size}`} />
      </div>
      <div className={`side-ad side-ad-${pos.size}`} style={{ ...common, right: pos.right }}>
        <AdSlot box key={`r-${pos.size}`} />
      </div>
    </>
  );
}
