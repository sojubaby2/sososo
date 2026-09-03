"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Newspaper, LayoutGrid, BookOpen, Rocket } from "lucide-react";

export default function Header() {
  const pathname = usePathname();

  return (
    <header className="site-header">
      <div className="container-wide site-header-inner">
        <div className="brand">
          <h1>뉴스매매</h1>
        </div>
        <nav className="nav">
          <Link href="/" className={`nav-btn ${pathname === "/" ? "active" : ""}`}>
            <Newspaper size={15} />홈 · 뉴스
          </Link>
          <Link href="/themes" className={`nav-btn ${pathname?.startsWith("/themes") ? "active" : ""}`}>
            <LayoutGrid size={15} />테마 둘러보기
          </Link>
          <Link href="/guide" className={`nav-btn ${pathname?.startsWith("/guide") ? "active" : ""}`}>
            <BookOpen size={15} />차트 가이드
          </Link>
          {/* IPO schedule link: points to DART's own official page instead of scraping a private site. */}
          <a href="https://dart.fss.or.kr/dsac008/main.do" target="_blank" rel="noopener noreferrer" className="nav-btn">
            <Rocket size={15} />공모주 정보
          </a>
        </nav>
      </div>
    </header>
  );
}
