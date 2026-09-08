"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Newspaper, LayoutGrid, BookOpen, Rocket, Landmark, Activity, FileText } from "lucide-react";

export default function Header() {
  const pathname = usePathname();

  return (
    <header className="site-header">
      <div className="container-wide site-header-inner">
        <div className="brand">
          {/* [2026-09-08 추가] 재성님이 만든 로고 이미지(public/logo.png).
              처음엔 텍스트 대신 이미지로만 바꿨었는데, 재성님이 "뉴스매매"
              글씨는 그대로 두고 로고만 옆에 붙여달라고 해서 둘 다 표시함. */}
          <img src="/logo.png" alt="뉴스매매 로고" className="brand-logo" />
          <h1>뉴스매매</h1>
        </div>
        {/* 재성님 요청으로 메뉴 순서 재배치: 홈·뉴스 - 패턴검색 - 테마별
            종목정리(구 "테마 둘러보기") - 공모주 정보 - 차트가이드 - 칼럼 */}
        <nav className="nav">
          <Link href="/" className={`nav-btn ${pathname === "/" ? "active" : ""}`}>
            <Newspaper size={15} />홈 · 뉴스
          </Link>
          <Link href="/patterns" className={`nav-btn ${pathname?.startsWith("/patterns") ? "active" : ""}`}>
            <Activity size={15} />패턴검색
          </Link>
          <Link href="/themes" className={`nav-btn ${pathname?.startsWith("/themes") ? "active" : ""}`}>
            <LayoutGrid size={15} />테마별 종목정리
          </Link>
          {/* [2026-09-08 추가] 매 거래일 저녁 9시 자동 생성되는 마감시황 —
              재성님 요청. */}
          <Link href="/daily-review" className={`nav-btn ${pathname?.startsWith("/daily-review") ? "active" : ""}`}>
            <FileText size={15} />마감시황
          </Link>
          {/* IPO schedule link: points to DART's own official page instead of scraping a private site. */}
          <a href="https://dart.fss.or.kr/dsac008/main.do" target="_blank" rel="noopener noreferrer" className="nav-btn">
            <Rocket size={15} />공모주 정보
          </a>
          <Link href="/guide" className={`nav-btn ${pathname?.startsWith("/guide") ? "active" : ""}`}>
            <BookOpen size={15} />차트 가이드
          </Link>
          <Link href="/blog" className={`nav-btn ${pathname?.startsWith("/blog") ? "active" : ""}`}>
            <Landmark size={15} />칼럼
          </Link>
        </nav>
      </div>
    </header>
  );
}
