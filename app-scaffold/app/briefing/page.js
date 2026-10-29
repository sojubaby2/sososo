// app/briefing/page.js
//
// [2026-10-29 신설] 장전 브리핑 — 가장 최근 브리핑을 크게 + 지난 브리핑 목록.
// 매일 아침 07:40(월~토) lib/premarket.js가 만들어 저장한 것을 보여 줍니다(이 페이지는 AI를 부르지 않음).

import Link from "next/link";
import Header from "../../components/Header";
import AdSlot from "../../components/AdSlot";
import BriefingView from "../../components/BriefingView";
import { getRedis } from "../../lib/redis";
import { getPremarket, getPremarketDates } from "../../lib/premarket";
import { koreanDate } from "../../lib/marketDay";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "장전 브리핑 — 매일 아침 미국장·밤사이 뉴스·오늘 주목 테마 | 뉴스매매",
  description:
    "매 거래일 아침 7시 40분, 밤사이 나스닥·미국 주요 종목·환율과 어제 장 마감 이후 속보를 종합해 오늘 한국장 분위기, 주목 테마와 종목, 조심할 점을 정리합니다.",
  alternates: { canonical: "/briefing" },
};

export default async function BriefingIndexPage() {
  const redis = getRedis();
  let dates = [];
  try {
    dates = await getPremarketDates(redis, 60);
  } catch {
    dates = [];
  }
  const latest = dates[0] ? await getPremarket(redis, dates[0]).catch(() => null) : null;

  return (
    <div>
      <Header />
      <main className="stock-page market-page mk2 pmk">
        {latest ? (
          <BriefingView b={latest} latest />
        ) : (
          <section className="mk2-hero">
            <div className="mk2-kicker">
              <span>장전 브리핑</span>
            </div>
            <h1 className="mk2-headline">매일 아침 7시 40분, 오늘 장을 미리 봅니다</h1>
            <p className="mk2-sub">첫 브리핑이 곧 올라옵니다. 밤사이 미국장, 어제 장 마감 이후 속보, 오늘 주목할 테마·종목을 한 장으로 정리해 드려요.</p>
          </section>
        )}

        <AdSlot />

        {dates.length > 1 && (
          <section className="panel stock-section">
            <h2 className="stock-h2">지난 브리핑</h2>
            <ul className="mk-dates">
              {dates.slice(1).map((d) => (
                <li key={d}>
                  <Link href={`/briefing/${d}`}>{koreanDate(d)}</Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
