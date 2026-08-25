"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Newspaper, LayoutGrid, Coins } from "lucide-react";

export default function Header() {
  const pathname = usePathname();
  const [goldPrice, setGoldPrice] = useState(null);
  const [tickerItems, setTickerItems] = useState([]);

  useEffect(() => {
    fetch("/api/gold")
      .then((r) => r.json())
      .then((data) => {
        // Field name isn't fully verified yet — see app/api/gold/route.js note.
        const price = data?.price ?? data?.rates?.XAU ?? null;
        if (price) setGoldPrice(price);
      })
      .catch(() => {});

    fetch("/api/theme-momentum")
      .then((r) => r.json())
      .then((data) => {
        if (!data.themeChanges) return;
        const sorted = [...data.themeChanges]
          .filter((t) => typeof t.change1M === "number")
          .sort((a, b) => b.change1M - a.change1M)
          .map((t) => `${t.theme} ${t.change1M > 0 ? "+" : ""}${t.change1M.toFixed(1)}%`);
        setTickerItems(sorted);
      })
      .catch(() => {});
  }, []);

  return (
    <>
      <div className="ticker-strip">
        <div className="ticker-track">
          {tickerItems.length > 0 ? (
            [...tickerItems, ...tickerItems].map((t, i) => (
              <span key={i} className="ticker-item">{t}</span>
            ))
          ) : (
            <span className="ticker-item">테마별 1개월 등락률 불러오는 중...</span>
          )}
        </div>
      </div>

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
          <div className="gold-tag">
            <Coins size={16} style={{ color: "var(--amber)" }} />
            <span className="mono">{goldPrice ? `1oz $${Number(goldPrice).toLocaleString()}` : "금 시세 불러오는 중..."}</span>
          </div>
        </div>
      </header>
    </>
  );
}
