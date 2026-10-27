"use client";

// components/MobileTabBar.js
//
// [2026-10-27 신설] 휴대폰 전용 — 화면 맨 아래 탭 줄(증권 앱처럼).
// 재성님 요청: "pc 배치를 아예 벗어나서 새롭고 혁신적이게 모바일 전용 ui배치를 해보는건 어때?"
//   → 시안 A(아래 탭 + 밑에서 올라오는 종목 창)에 시안 C(촘촘한 속보 목록)를 섞어서 결정.
//
// 탭 다섯 개:
//   속보 — 홈의 실시간 속보 (다른 탭을 보는 사이 새 속보가 오면 빨간 숫자)
//   시장 — 홈의 오늘 요약·지수·대표 종목·HOT 테마·전일 급등주
//   관심 — 별표로 담은 종목 + 그 종목 속보만 (담은 개수 표시)
//   일정 — 공시 일정(위쪽 단추로 공모주 일정과 오갈 수 있음)
//   전체 — 모든 메뉴가 바둑판으로 펼쳐지는 창
//
// ★ PC 화면(761px 이상)에서는 이 탭 줄이 아예 보이지 않습니다(globals.css의 .m-tabbar).
//   휴대폰에서는 대신 위쪽 메뉴 줄이 숨겨집니다.
// ★ 홈 탭 세 개를 바꾸는 방법은 lib/mobileTab.js 설명 참고.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Zap,
  BarChart3,
  Star,
  CalendarDays,
  LayoutGrid,
  CandlestickChart,
  Layers,
  Ticket,
  LineChart,
  BookOpen,
  X,
} from "lucide-react";
import { MENU, FOOTER_LINKS, isMenuActive } from "../lib/siteMenu";
import {
  HOME_TAB_STATE,
  FEED_NEW_EVENT,
  tabFromHash,
  hrefForTab,
  requestHomeTab,
  setPendingHomeTab,
} from "../lib/mobileTab";
import { useWatchlist } from "../lib/watchlist";

// lib/siteMenu.js의 icon 이름 → 그림
const ICONS = {
  zap: Zap,
  candle: CandlestickChart,
  layers: Layers,
  ticket: Ticket,
  calendar: CalendarDays,
  bars: BarChart3,
  line: LineChart,
  book: BookOpen,
};

export default function MobileTabBar() {
  const pathname = usePathname() || "/";
  const isHome = pathname === "/";
  const [homeTab, setHomeTab] = useState("feed");
  const [menuOpen, setMenuOpen] = useState(false);
  const [newCount, setNewCount] = useState(0);
  const watch = useWatchlist();

  // 홈 화면이 알려 주는 "지금 탭"과 "새 속보 수" 듣기
  useEffect(() => {
    if (isHome) setHomeTab(tabFromHash(window.location.hash));
    const onState = (e) => setHomeTab(e.detail || "feed");
    const onNew = (e) => setNewCount((c) => c + (Number(e.detail) || 0));
    window.addEventListener(HOME_TAB_STATE, onState);
    window.addEventListener(FEED_NEW_EVENT, onNew);
    return () => {
      window.removeEventListener(HOME_TAB_STATE, onState);
      window.removeEventListener(FEED_NEW_EVENT, onNew);
    };
  }, [isHome]);

  // 속보 탭을 보고 있으면 숫자 지우기
  useEffect(() => {
    if (isHome && homeTab === "feed") setNewCount(0);
  }, [isHome, homeTab]);

  // 다른 페이지로 넘어가면 "전체" 창 닫기
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // "전체" 창이 열려 있는 동안: 뒤 화면 스크롤 막기, Esc로 닫기
  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  function goHomeTab(e, tab) {
    setMenuOpen(false);
    if (isHome) {
      // 이미 홈이면 페이지를 다시 열지 않고 탭만 바꿉니다(같은 탭을 다시 누르면 맨 위로).
      e.preventDefault();
      requestHomeTab(tab);
    } else {
      setPendingHomeTab(tab);
    }
  }

  const onSchedule = pathname.startsWith("/disclosure") || pathname.startsWith("/ipo");
  const activeKey = menuOpen
    ? "all"
    : isHome
    ? homeTab
    : onSchedule
    ? "schedule"
    : "all";

  const homeTabs = [
    { key: "feed", label: "속보", Icon: Zap },
    { key: "market", label: "시장", Icon: BarChart3 },
    { key: "watch", label: "관심", Icon: Star },
  ];

  return (
    <>
      {menuOpen && <div className="m-dim" onClick={() => setMenuOpen(false)} aria-hidden="true" />}
      {menuOpen && (
        <div className="m-menu" role="dialog" aria-modal="true" aria-label="전체 메뉴">
          <div className="m-menu-head">
            <span>전체 메뉴</span>
            <button type="button" className="m-menu-close" onClick={() => setMenuOpen(false)} aria-label="메뉴 닫기">
              <X size={18} />
            </button>
          </div>
          <div className="m-menu-grid">
            {MENU.map((m) => {
              const Icon = ICONS[m.icon] || LayoutGrid;
              const on = isMenuActive(m, pathname);
              const inner = (
                <>
                  <span className="m-menu-ico">
                    <Icon size={22} strokeWidth={1.9} />
                  </span>
                  <span className="m-menu-lb">{m.short || m.label}</span>
                </>
              );
              return m.external ? (
                <a key={m.href} href={m.href} target="_blank" rel="noopener noreferrer" className="m-menu-item">
                  {inner}
                </a>
              ) : (
                <Link
                  key={m.href}
                  href={m.href}
                  className={`m-menu-item ${on ? "on" : ""}`}
                  onClick={(e) => (m.href === "/" ? goHomeTab(e, "feed") : setMenuOpen(false))}
                >
                  {inner}
                </Link>
              );
            })}
          </div>
          <nav className="m-menu-foot" aria-label="안내 페이지">
            {FOOTER_LINKS.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setMenuOpen(false)}>
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      )}

      <nav className="m-tabbar" aria-label="휴대폰 메뉴">
        {homeTabs.map(({ key, label, Icon }) => (
          <Link
            key={key}
            href={hrefForTab(key)}
            className={`m-tab ${activeKey === key ? "on" : ""}`}
            aria-current={activeKey === key ? "page" : undefined}
            onClick={(e) => goHomeTab(e, key)}
          >
            <span className="m-tab-ico">
              <Icon size={21} strokeWidth={activeKey === key ? 2.4 : 1.9} fill={key === "watch" && activeKey === key ? "currentColor" : "none"} />
              {key === "feed" && newCount > 0 && <span className="m-badge">{newCount > 99 ? "99+" : newCount}</span>}
              {key === "watch" && watch.list.length > 0 && <span className="m-count">{watch.list.length}</span>}
            </span>
            {label}
          </Link>
        ))}
        <Link
          href="/disclosure"
          className={`m-tab ${activeKey === "schedule" ? "on" : ""}`}
          aria-current={activeKey === "schedule" ? "page" : undefined}
          onClick={() => setMenuOpen(false)}
        >
          <span className="m-tab-ico">
            <CalendarDays size={21} strokeWidth={activeKey === "schedule" ? 2.4 : 1.9} />
          </span>
          일정
        </Link>
        <button
          type="button"
          className={`m-tab ${activeKey === "all" ? "on" : ""}`}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span className="m-tab-ico">
            {menuOpen ? <X size={21} strokeWidth={2.4} /> : <LayoutGrid size={21} strokeWidth={activeKey === "all" ? 2.4 : 1.9} />}
          </span>
          전체
        </button>
      </nav>
    </>
  );
}
