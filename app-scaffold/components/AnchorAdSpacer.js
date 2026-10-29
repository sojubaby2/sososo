"use client";

// components/AnchorAdSpacer.js
//
// [2026-10-28 신설] 구글 "앵커 광고"(휴대폰 화면 맨 아래나 맨 위에 붙는 띠 광고)와 사이트가 겹치지 않게 비켜 주기.
//
// 왜 필요한가:
//   앵커 광고는 휴대폰에서 단가가 좋은 편이라 켜 두는 게 수익에 유리합니다. 그런데 이 사이트는 휴대폰 맨 아래에
//   탭 줄(속보·시장·관심·일정·전체)이 있어서, 광고가 그 위를 덮으면 탭을 못 누릅니다.
//   그래서 앵커 광고가 뜨면 그 높이만큼 탭 줄을 위로 올리고, 광고를 닫으면 다시 내립니다.
//   (맨 위 앵커가 뜨면 같은 방식으로 머리띠를 아래로 내림)
//
// 방법: 0.7초마다 화면에 고정된 구글 광고 칸(앵커)을 찾아 높이를 재고, CSS 값
//   --nm-anchor-bottom / --nm-anchor-top 에 적어 둡니다. 실제로 비키는 건 globals.css가 합니다.
//   전면 광고(비넷)·옆 광고(사이드 레일)는 건드리지 않습니다.
//   앵커 광고를 꺼 두면 이 부품은 아무 일도 하지 않습니다(값 0).

import { useEffect } from "react";

export default function AnchorAdSpacer() {
  useEffect(() => {
    const root = document.documentElement;
    let last = "";
    const tick = () => {
      const H = window.innerHeight;
      const W = window.innerWidth;
      let top = 0;
      let bottom = 0;
      for (const el of document.querySelectorAll("ins.adsbygoogle-noablate, ins[data-anchor-status]")) {
        const cs = getComputedStyle(el);
        if (cs.position !== "fixed" || cs.display === "none" || cs.visibility === "hidden") continue;
        const r = el.getBoundingClientRect();
        if (r.height <= 0 || r.width < W * 0.5) continue; // 옆 광고 등은 제외
        if (r.bottom >= H - 2 && r.top > H / 2) bottom = Math.max(bottom, H - r.top); // 맨 아래 앵커
        else if (r.top <= 2 && r.bottom < H / 2) top = Math.max(top, r.bottom); // 맨 위 앵커
      }
      const v = `${Math.round(top)}|${Math.round(bottom)}`;
      if (v === last) return;
      last = v;
      root.style.setProperty("--nm-anchor-top", `${Math.round(top)}px`);
      root.style.setProperty("--nm-anchor-bottom", `${Math.round(bottom)}px`);
      // [2026-10-29 추가] 앵커가 떠 있는지 표시 — 홈 왼쪽 "따라다니는 광고"는 앵커가 떠 있는 동안 제자리에 둠(한 화면에 따라다니는 광고 1개)
      root.classList.toggle("nm-anchor-on", top > 0 || bottom > 0);
    };
    tick();
    const t = setInterval(tick, 700);
    window.addEventListener("resize", tick);
    return () => {
      clearInterval(t);
      window.removeEventListener("resize", tick);
    };
  }, []);
  return null;
}
