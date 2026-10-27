"use client";

import { useEffect, useRef } from "react";

// components/Header.js
//
// [2026-10-19 디자인 개편] 흰 바탕 + 주황 강조였던 헤더를 짙은 남색 띠로
// 바꿨습니다. 홈 화면의 브리핑 밴드와 같은 색이라 위쪽이 하나로 이어져
// 보입니다. 다른 페이지에서는 이 띠만 단독으로 깔립니다.
//
// 바뀐 점:
//  · 배경 남색(--deep), 글자 밝은 색
//  · 메뉴를 알약 모양으로 — 지금 보고 있는 메뉴가 확실히 드러납니다
//  · 아이콘 제거 — 글자만 남기니 훨씬 정돈돼 보입니다. 좁은 화면에서
//    아이콘이 차지하던 자리만큼 메뉴가 더 들어갑니다.
//  · [2026-10-19 추가] 로고 그림을 뺐습니다 — 재성님 판단으로 남색 띠와
//    어울리지 않아서, 글씨만 남겼습니다. 그림 파일(public/logo.png)은
//    지우지 않았습니다(다른 곳에서 쓸 수 있어서). 다시 넣고 싶으면
//    아래 brand 안에 <img src="/logo.png" ... /> 한 줄만 되살리면 됩니다.
//
// [2026-10-20 추가] "뉴스매매"의 첫 글자 "뉴"만 붉은색으로 바꿨습니다.
//
//   왜 코드가 아래처럼 두 조각으로 나뉘었나:
//   글자 하나만 색을 다르게 하려면 그 글자를 따로 감싸줘야 합니다.
//   그래서 "뉴"와 "스매매"를 나눠 적었습니다. 화면에는 붙어서 나옵니다.
//
//   왜 그냥 빨강(--up)이 아니라 #ff5b4e 인가:
//   사이트의 기본 빨강(--up, #d8342b)은 흰 바탕에 맞춘 색이라
//   남색 배경 위에 올리면 어둡게 묻힙니다. 그래서 같은 계열에서
//   조금 밝은 빨강을 따로 썼습니다.
//
//   ★ 색을 바꾸고 싶으면 아래 BRAND_ACCENT 한 줄만 고치면 됩니다.
//     · 더 진하게 → "#e03a2c"
//     · 더 밝게   → "#ff7a6d"
//     · 주황 느낌 → "#ff7a33"
//   ★ 붉은 글자를 "뉴" 말고 다른 글자로 바꾸고 싶으면, 아래 brand-name
//     안의 "뉴" 와 "스매매" 를 나누는 위치만 옮기면 됩니다.
//     예) "뉴스"를 붉게 → <span style=...>뉴스</span>매매

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "./ThemeToggle";
import { MENU, isMenuActive } from "../lib/siteMenu";

// 로고 글씨에서 강조할 글자의 색입니다.
const BRAND_ACCENT = "#ff5b4e";

// [2026-10-27 변경] 메뉴 목록은 lib/siteMenu.js로 옮겼습니다(휴대폰 "전체" 창과 같이 씀).
//   메뉴를 고치려면 lib/siteMenu.js의 MENU를 고치세요.

export default function Header() {
  const pathname = usePathname();
  // [2026-10-27 추가] 휴대폰에서 메뉴 줄은 옆으로 밀어야 다 보이는데, 지금 보고 있는 메뉴(예: 공시 일정)가
  // 화면 밖에 숨어 있었습니다. 페이지에 들어오면 그 메뉴를 보이는 곳으로 살짝 밀어 줍니다(PC에서는 변화 없음).
  const navRef = useRef(null);
  useEffect(() => {
    const nav = navRef.current;
    const el = nav?.querySelector(".nav-btn.active");
    if (!nav || !el || nav.scrollWidth <= nav.clientWidth) return;
    const left = el.offsetLeft - (nav.clientWidth - el.offsetWidth) / 2;
    nav.scrollTo({ left: Math.max(0, left), behavior: "auto" });
  }, [pathname]);

  // [2026-10-27] 휴대폰(760px 이하)에서는 이 메뉴 줄을 숨기고, 맨 아래 탭 줄(components/MobileTabBar.js)이 대신합니다.
  return (
    <header className="site-header">
      <div className="container-wide site-header-inner">
        <Link href="/" className="brand">
          <span className="brand-name">
            <span style={{ color: BRAND_ACCENT }}>뉴</span>스매매
          </span>
          {/* [2026-10-26 추가] 이름 옆에 무슨 사이트인지 작게 — 처음 온 사람용 */}
          <span className="brand-tag">실시간 속보 · 관련주</span>
        </Link>

        <nav className="nav" ref={navRef}>
          {MENU.map((m) => {
            if (m.external) {
              return (
                <a key={m.href} href={m.href} target="_blank" rel="noopener noreferrer" className="nav-btn">
                  {m.label}
                </a>
              );
            }
            const active = isMenuActive(m, pathname);
            return (
              <Link key={m.href} href={m.href} className={`nav-btn ${active ? "active" : ""}`}>
                {m.label}
              </Link>
            );
          })}
        </nav>

        {/* [2026-10-26 추가] 어두운 화면 ↔ 밝은 화면 전환 단추 */}
        <ThemeToggle />
      </div>
    </header>
  );
}
