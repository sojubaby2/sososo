"use client";

// components/NoDrag.js
//
// [2026-10-27 신설] 드래그 방지 — 재성님 요청: "드래그방지 기능추가"
//
// 하는 일
//   · 글자를 마우스로 끌어서 선택하는 것 막기 → app/globals.css 맨 아래 "드래그 방지" 부분(user-select)
//   · 사진·링크를 끌어서 다른 곳에 떨어뜨리는 것 막기 → 아래 dragstart 막기
//
// 막지 않는 것
//   · 검색칸 같은 입력칸(글자를 써야 하니까)
//   · "코드 복사" 단추처럼 사이트가 직접 넣어 주는 복사 기능
//
// 참고: 이런 방지는 "쉽게 긁어 가지 못하게" 하는 정도이고, 작정하고 가져가는 것까지 막지는 못합니다.

import { useEffect } from "react";

function isEditable(el) {
  return !!el?.closest?.("input, textarea, select, [contenteditable='true']");
}

export default function NoDrag() {
  useEffect(() => {
    const onDragStart = (e) => {
      if (!isEditable(e.target)) e.preventDefault();
    };
    document.addEventListener("dragstart", onDragStart);
    return () => document.removeEventListener("dragstart", onDragStart);
  }, []);
  return null;
}
