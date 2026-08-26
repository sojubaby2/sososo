"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Newspaper, LayoutGrid } from "lucide-react";

function MarketTicker() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch("/api/market-ticker")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, []);

  const items = [];
  if (data?.usd) items.push(`원/달러 ${data.usd.toLocaleString("ko-KR")}원`);
  if (data?.jpy) items.push(`원/엔(100엔) ${data.jpy.toLocaleString("ko-KR")}원`);
  if (data?.gold) items.push(`국제 금값 1oz $${Number(data.gold).toLocaleString("ko-KR")}`);

  return (
    <div className="ticker-strip">
      <div className="ticker-track">
        {items.length > 0 ? (
          [...items, ...items].map((t, i) => (
            <span key={i} className="ticker-item">{t}</span>
          ))
        ) : (
          <span className="ticker-item">시세 불러오는 중...</span>
        )}
      </div>
    </div>
  );
}

export default function Header() {
  const pathname = usePathname();

  return (
    <>
      <MarketTicker />
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
          </nav>
        </div>
      </header>
    </>
  );
}
