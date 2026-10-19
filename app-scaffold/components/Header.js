"use client";

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
//  · 로고 높이 52px -> 34px. 띠 높이를 줄여서 본문이 위로 올라옵니다.

import Link from "next/link";
import { usePathname } from "next/navigation";

// 메뉴는 여기만 고치면 됩니다.
// external: true 면 새 창으로 열리는 바깥 링크입니다.
const MENU = [
  { href: "/", label: "홈 · 뉴스", match: (p) => p === "/" },
  { href: "/patterns", label: "패턴검색" },
  { href: "/themes", label: "테마별 종목정리" },
  { href: "https://dart.fss.or.kr/dsac008/main.do", label: "공모주 정보", external: true },
  { href: "/guide", label: "차트 가이드" },
  { href: "/blog", label: "칼럼" },
];

export default function Header() {
  const pathname = usePathname();

  return (
    <header className="site-header">
      <div className="container-wide site-header-inner">
        <Link href="/" className="brand">
          <img src="/logo.png" alt="뉴스매매 로고" className="brand-logo" />
          <span className="brand-name">뉴스매매</span>
        </Link>

        <nav className="nav">
          {MENU.map((m) => {
            if (m.external) {
              return (
                <a key={m.href} href={m.href} target="_blank" rel="noopener noreferrer" className="nav-btn">
                  {m.label}
                </a>
              );
            }
            const active = m.match ? m.match(pathname) : pathname?.startsWith(m.href);
            return (
              <Link key={m.href} href={m.href} className={`nav-btn ${active ? "active" : ""}`}>
                {m.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
