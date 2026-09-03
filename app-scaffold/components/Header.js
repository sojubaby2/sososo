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
          {/* 공모주 일정을 우리 데이터로 만들지 않고 금융감독원 DART 공식
              공모정보 페이지로 바로 연결만 함 — 민간 사이트(38커뮤니케이션
              등)를 크롤링해서 재가공/게시하면 이용약관·부정경쟁방지법 쪽
              리스크가 있어서, 공식 출처로 안내만 하는 쪽을 선택함. */}
          
            href="https://dart.fss.or.kr/dsac008/main.do"
            target="_blank"
            rel="noopener noreferrer"
            className="nav-btn"
            title="금융감독원 DART 공모정보 페이지로 이동합니다"
          >
            <Rocket size={15} />공모주 정보
          </a>
        </nav>
      </div>
    </header>
  );
}
