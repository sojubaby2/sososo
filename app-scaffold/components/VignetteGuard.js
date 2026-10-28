"use client";

// components/VignetteGuard.js
//
// [2026-10-28 신설] 구글 "전면 광고(비넷)"를 "테마별 종목정리" 메뉴에서만 뜨게 하기.
//   재성님: "pc, 모바일 전부 메뉴중 테마별 종목정리를 누르면 팝업광고 뜨게 해줘"
//
// 왜 이렇게 하나:
//   · 사이트가 직접 만든 팝업 광고는 애드센스 정책 위반입니다(계정 정지 위험).
//   · 대신 구글이 공식으로 주는 "전면 광고"는 허용됩니다. 링크를 누르면 다음 페이지로 넘어가기 전에
//     화면 전체에 광고가 한 번 뜨고, 닫기 단추로 닫으면 원래 가려던 페이지로 갑니다.
//   · 그런데 전면 광고를 켜면 기본으로 "사이트 안 모든 링크"에서 뜰 수 있습니다.
//     속보·종목을 누를 때마다 광고가 끼어들면 사용자가 떠나므로,
//     구글이 정해 둔 방법대로 링크마다 data-google-vignette="false" 표시를 붙여 막습니다.
//   · 예외: data-vignette-allow 표시가 붙은 링크(= lib/siteMenu.js에서 vignette: true 인 메뉴)는 막지 않습니다.
//
// 방법: 화면에 링크가 새로 생길 때마다(속보가 들어오거나 페이지를 옮길 때) 찾아서 표시를 붙입니다.
//   화면 모양·속도에는 영향 없습니다.
//
// ★ 전면 광고 자체는 애드센스 화면에서 켜야 나옵니다(광고 → 사이트 설정 → 전면 광고).
//   "추가 트리거 허용"(뒤로 가기·글 끝 등에서도 뜨게 하는 설정)은 꺼 두세요. 켜 두면 메뉴가 아니어도 뜹니다.

import { useEffect } from "react";

function mark(root) {
  if (!root?.querySelectorAll) return;
  const list = root.matches?.("a[href]") ? [root] : [];
  for (const a of root.querySelectorAll("a[href]")) list.push(a);
  for (const a of list) {
    if (a.hasAttribute("data-vignette-allow")) {
      if (a.getAttribute("data-google-vignette") === "false") a.removeAttribute("data-google-vignette");
      continue;
    }
    if (a.getAttribute("data-google-vignette") !== "false") a.setAttribute("data-google-vignette", "false");
  }
}

export default function VignetteGuard() {
  useEffect(() => {
    mark(document.body);
    let queued = false;
    const mo = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      // 한꺼번에 많이 바뀌어도 한 번만 훑습니다
      requestAnimationFrame(() => {
        queued = false;
        mark(document.body);
      });
    });
    mo.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["href", "data-vignette-allow"],
    });
    // 누르는 순간에도 한 번 더 확인(표시가 붙기 전 아주 짧은 틈에 누른 경우 대비) — 광고 코드보다 먼저 실행되도록 capture 단계
    const onDown = (e) => {
      const a = e.target?.closest?.("a[href]");
      if (a) mark(a);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      mo.disconnect();
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, []);
  return null;
}
