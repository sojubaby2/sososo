"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Newspaper, LayoutGrid } from "lucide-react";

export default function Header() {
  const pathname = usePathname();

  return (
    <header className="site-header">
      <div className="container-wide site-header-inner">
        <div className="brand">
          <h1>테마보드</h1>
          <span className="badge">MVP 프로토타입</span>
        </div>
        <nav className="nav">
          <Link href="/" className={`nav-btn ${pathname === "/" ? "active" : ""}`}>
            <Newspaper size={15} />홈 · 뉴스
          </Link>
          <Link href="/themes" className={`nav-btn ${pathname?.startsWith("/themes") ? "active" : ""}`}>
            <LayoutGrid size={15} />테마 둘러보기
          </Link>
        </nav>
      </div>
    </header>
  );
}
