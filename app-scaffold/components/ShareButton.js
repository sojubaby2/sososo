"use client";

// components/ShareButton.js
//
// [2026-10-29 신설] "공유하기" 단추 — 장 마감 정리를 카카오톡·X 등에 퍼뜨리기 쉽게.
//   휴대폰: 휴대폰 기본 공유 창(카카오톡·문자·X 등 고르기)
//   PC 등 공유 창이 없는 곳: 링크를 복사하고 "복사됐어요" 표시
// 비용 0, 외부 요청 없음.

import { useState } from "react";
import { Share2, Check } from "lucide-react";

export default function ShareButton({ title, text, path, label = "공유하기" }) {
  const [done, setDone] = useState(false);

  const onClick = async () => {
    const url = typeof window !== "undefined" ? new URL(path || window.location.pathname, window.location.origin).toString() : path;
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url });
        return;
      }
    } catch {
      return; // 사용자가 공유 창을 닫음
    }
    try {
      await navigator.clipboard.writeText(`${text ? `${text}\n` : ""}${url}`);
      setDone(true);
      setTimeout(() => setDone(false), 2200);
    } catch {
      window.prompt("아래 주소를 복사하세요", url);
    }
  };

  return (
    <button type="button" className="mk2-share" onClick={onClick}>
      {done ? <Check size={16} /> : <Share2 size={16} />}
      {done ? "링크가 복사됐어요" : label}
    </button>
  );
}
