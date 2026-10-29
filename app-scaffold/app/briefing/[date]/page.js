// app/briefing/[date]/page.js
//
// [2026-10-29 신설] 날짜별 장전 브리핑 — 예) /briefing/2026-10-30
// lib/premarket.js가 그날 아침 만들어 저장한 것을 보여 줍니다(이 페이지는 AI를 부르지 않음).

import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "../../../components/Header";
import AdSlot from "../../../components/AdSlot";
import BriefingView from "../../../components/BriefingView";
import { getRedis } from "../../../lib/redis";
import { getPremarket, getPremarketDates } from "../../../lib/premarket";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const b = await getPremarket(getRedis(), params.date).catch(() => null);
  if (!b) return {};
  const md = `${Number(b.date.slice(5, 7))}월 ${Number(b.date.slice(8, 10))}일`;
  const description = `${md} 장전 브리핑 — ${b.headline}. ${(b.summary || []).join(" ")}`.slice(0, 160);
  return {
    title: `${md} 장전 브리핑 — ${b.headline} | 뉴스매매`,
    description,
    alternates: { canonical: `/briefing/${b.date}` },
    openGraph: { title: `${md} 장전 브리핑`, description, type: "article" },
  };
}

export default async function BriefingDayPage({ params }) {
  const redis = getRedis();
  const b = await getPremarket(redis, params.date).catch(() => null);
  if (!b) notFound();
  const dates = await getPremarketDates(redis, 400).catch(() => []);
  const i = dates.indexOf(b.date);
  const newer = i > 0 ? dates[i - 1] : null;
  const older = i >= 0 && i < dates.length - 1 ? dates[i + 1] : null;

  return (
    <div>
      <Header />
      <main className="stock-page market-page mk2 pmk">
        <nav className="stock-crumb" aria-label="위치">
          <Link href="/">홈</Link> › <Link href="/briefing">장전 브리핑</Link> › <span>{b.date}</span>
        </nav>
        <BriefingView b={b} />
        <AdSlot />
        <nav className="mk-pager" aria-label="다른 날짜">
          {older ? <Link href={`/briefing/${older}`}>← {older}</Link> : <span />}
          <Link href="/briefing">최신 브리핑</Link>
          {newer ? <Link href={`/briefing/${newer}`}>{newer} →</Link> : <span />}
        </nav>
      </main>
    </div>
  );
}
