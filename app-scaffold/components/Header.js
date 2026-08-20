"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Newspaper, LayoutGrid, Coins } from "lucide-react";

const TICKER_HIGHLIGHTS = [
  "호르무즈 봉쇄(정유/원유) +4.8%",
  "보안(사이버/양자) +3.9%",
  "비만치료제(위고비) +2.1%",
  "반도체 장비(증착) +1.6%",
  "방산주 +1.3%",
  "2차전지 -0.8%",
];

export default function Header() {
  const pathname = usePathname();
  const [goldPrice, setGoldPrice] = useState(null);

  useEffect(() => {
    fetch("/api/gold")
      .then((r) => r.json())
      .then((data) => {
        // Field name isn't fully verified yet — see app/api/gold/route.js note.
        const price = data?.price ?? data?.rates?.XAU ?? null;
        if (price) setGoldPrice(price);
      })
      .catch(() => {});
  }, []);

  return (
    <>
      <div className="ticker-strip">
        <div className="ticker-track">
          {[...TICKER_HIGHLIGHTS, ...TICKER_HIGHLIGHTS].map((t, i) => (
            <span key={i} className="ticker-item">{t}</span>
          ))}
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
