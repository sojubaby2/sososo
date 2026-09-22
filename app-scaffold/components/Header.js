"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
// [2026-09-22] 마감시황 기능을 전부 걷어내면서 그 메뉴에만 쓰였던 FileText
// 아이콘도 같이 뺐습니다(안 쓰는 import는 남겨두면 나중에 헷갈립니다).
import { Newspaper, LayoutGrid, BookOpen, Rocket, Landmark, Activity } from "lucide-react";

export default function Header() {
  const pathname = usePathname();

  return (
    <header className="site-header">
      <div className="container-wide site-header-inner">
        <div className="brand">
          {/* [2026-09-08 추가] 재성님이 만든 로고 이미지(public/logo.png).
              "뉴스매매" 글씨는 지우지 말고 로고와 같이 표시 — 로고 크기만
              키움. */}
          <img src="/logo.png" alt="뉴스매매 로고" className="brand-logo" />
          <h1>뉴스매매</h1>
        </div>
        {/* 재성님 요청으로 메뉴 순서 재배치: 홈·뉴스 - 패턴검색 - 테마별
            종목정리(구 "테마 둘러보기") - 공모주 정보 - 차트가이드 - 칼럼
            [2026-09-22] "마감시황" 메뉴 제거 — 아래 설명 참고.
            KRX가 그날 시세를 저녁까지 안 올려주는 탓에 글이 제대로 쌓이지
            않아서, 재성님 결정으로 기능을 통째로 없앴습니다. */}
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
