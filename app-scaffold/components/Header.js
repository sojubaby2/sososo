"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Newspaper, LayoutGrid, BookOpen, Rocket, Landmark, Activity } from "lucide-react";

export default function Header() {
  const pathname = usePathname();

  return (
    <header className="site-header">
      <div className="container-wide site-header-inner">
        <div className="brand">
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
