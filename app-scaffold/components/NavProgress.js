"use client";

// components/NavProgress.js
//
// [2026-11-17 신설] "누르면 바로 반응" — 재성님: "사이트가 전체적으로 뭐 클릭하면 버벅버벅 하는 느낌이 있어"
//   메뉴·종목·글 링크를 누르면 다음 화면을 서버에서 받아오는 0.2~1초 동안 화면에 아무 변화가 없어서
//   "안 눌린 것 같은" 느낌이 났습니다. 누르는 순간 맨 위에 가는 진행 막대를 바로 띄우고,
//   다음 화면이 뜨면 끝까지 채운 뒤 사라지게 합니다.
//
//   · 같은 사이트 안으로 가는 링크를 눌렀을 때만 뜹니다(새 창·바깥 사이트·같은 화면 안 이동은 제외).
//   · 화면에 그리는 건 막대 하나뿐이고, 움직임은 transform(가로 늘이기)만 써서 화면을 다시 그리지 않습니다.
//   · 8초가 지나도 화면이 안 바뀌면 스스로 사라집니다.

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export default function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const barRef = useRef(null);
  const timers = useRef([]);
  const active = useRef(false);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  // 화면이 바뀌면(주소가 달라지면) 끝까지 채우고 숨김
  useEffect(() => {
    const bar = barRef.current;
    if (!bar || !active.current) return;
    active.current = false;
    clearTimers();
    bar.dataset.state = "done";
    timers.current.push(setTimeout(() => (bar.dataset.state = "idle"), 260));
  }, [pathname, search]);

  useEffect(() => {
    const onClick = (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      let url;
      try {
        url = new URL(a.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      // 같은 화면 안에서의 이동(#위치만 바뀜)은 제외
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      const bar = barRef.current;
      if (!bar) return;
      clearTimers();
      active.current = true;
      bar.dataset.state = "idle";
      // 한 박자 뒤에 시작시켜야 "처음부터 다시" 차오릅니다
      requestAnimationFrame(() => {
        if (active.current) bar.dataset.state = "run";
      });
      timers.current.push(
        setTimeout(() => {
          active.current = false;
          bar.dataset.state = "idle";
        }, 8000)
      );
    };
    // 캡처 단계에서 듣기 — 링크 안쪽 부품이 이벤트를 막아도 반응하도록
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      clearTimers();
    };
  }, []);

  return <div ref={barRef} id="nav-progress" data-state="idle" aria-hidden="true" />;
}
