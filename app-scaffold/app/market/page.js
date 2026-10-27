// app/market/page.js
//
// [2026-10-27 신설] 장 마감 정리 — 날짜 목록. 최신 날짜 정리를 위에 크게 보여주고,
// 아래에 최근 거래일 목록을 둡니다(각 날짜 → /market/날짜).
// 날짜 목록은 이미 저장되는 일별 시세의 날짜 색인(1시간 저장본)을 씁니다. 비용 0.

import Link from "next/link";
import Header from "../../components/Header";
import { getMarketDates, getMarketDay, describeMarketDay, koreanDate } from "../../lib/marketDay";

// [2026-10-27] 저장소(Redis) 읽기는 "매번 새로" 방식이라 미리 만들어 두는 페이지와 함께 쓰면 오류가 납니다.
// 그래서 요청 때 만들고, 무거운 계산 결과는 lib/marketDay.js가 날짜별로 저장해 둔 것을 씁니다(Redis 읽기 횟수는 같음).
export const dynamic = "force-dynamic";

export const metadata = {
  title: "장 마감 정리 — 날짜별 급등주·급락주·강세 테마 | 뉴스매매",
  description: "코스피·코스닥 장 마감 뒤 그날 많이 오른 종목, 많이 내린 종목, 거래대금 상위 종목과 강세·약세 테마를 날짜별로 자동 정리합니다.",
  alternates: { canonical: "/market" },
};

const SHOW_DATES = 60;

export default async function MarketIndexPage() {
  let dates = [];
  try {
    dates = await getMarketDates();
  } catch {
    dates = [];
  }
  // 첫 날짜는 비교할 전 거래일이 없어서 정리가 안 되므로 뺍니다.
  const list = dates.slice(1).reverse().slice(0, SHOW_DATES);
  const latest = list[0] ? await getMarketDay(list[0]) : null;
  const lines = describeMarketDay(latest);

  return (
    <div>
      <Header />
      <main className="stock-page market-page">
        <h1 className="mk-title">장 마감 정리</h1>
        <p className="stock-asof">한국거래소 일별 시세로 매 거래일 자동 정리 · 장 마감 뒤 자료가 들어오면 새 날짜가 생깁니다</p>

        {latest && (
          <section className="panel stock-section">
            <h2 className="stock-h2">
              <Link href={`/market/${latest.date}`}>최신: {koreanDate(latest.date)} →</Link>
            </h2>
            {lines.map((t, i) => (
              <p key={i} className="stock-text">
                {t}
              </p>
            ))}
          </section>
        )}

        <section className="panel stock-section">
          <h2 className="stock-h2">날짜별 보기</h2>
          {list.length === 0 ? (
            <p className="stock-text muted">아직 정리할 자료가 없습니다.</p>
          ) : (
            <ul className="mk-dates">
              {list.map((d) => (
                <li key={d}>
                  <Link href={`/market/${d}`}>{koreanDate(d)}</Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
