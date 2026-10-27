// app/market/[date]/page.js
//
// [2026-10-27 신설] 날짜별 "장 마감 정리" — 예) /market/2026-10-26
//
// 재성님 요청: 방문자를 늘릴 아이디어 중 "오늘 장 마감 정리 페이지 매일 쌓기".
// "10월 26일 급등주"처럼 날짜로 검색하는 사람이 들어오는 입구가 됩니다.
// 매일 따로 글을 쓰는 게 아니라, 이미 저장되는 전 종목 일별 시세로 자동 계산합니다
// (lib/marketDay.js — 비용 0, 계산 결과는 날짜별로 저장해 재사용).
//
// 그날 시세는 한국거래소 자료가 장 마감 뒤에 들어온 다음부터 보입니다.

import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "../../../components/Header";
// [2026-10-27 추가] 애드센스 광고 칸(번호는 lib/ads.js)
import AdSlot from "../../../components/AdSlot";
import { getMarketDay, describeMarketDay, koreanDate } from "../../../lib/marketDay";
import { getRecentFeed, kstDateOf, kstDateTimeText } from "../../../lib/recentFeed";
import { decodeEntities } from "../../../lib/decodeEntities";

// [2026-10-27] 저장소(Redis) 읽기는 "매번 새로" 방식이라 미리 만들어 두는 페이지와 함께 쓰면 오류가 납니다.
// 그래서 요청 때 만들고, 무거운 계산 결과는 lib/marketDay.js가 날짜별로 저장해 둔 것을 씁니다(Redis 읽기 횟수는 같음).
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const d = await getMarketDay(params.date);
  if (!d) return {};
  const md = `${Number(d.date.slice(5, 7))}월 ${Number(d.date.slice(8, 10))}일`;
  const top = d.gainers.slice(0, 3).map((x) => x.name).join(", ");
  const themes = d.themesUp.slice(0, 2).map((x) => x.theme).join("·");
  const title = `${md} 장 마감 정리 — 급등주·급락주·테마 | 뉴스매매`;
  const description = `${koreanDate(d.date)} 코스피·코스닥 마감 정리. 상승률 상위 ${top} 등, 강세 테마 ${themes}, 거래대금 상위 종목과 관련 속보.`;
  return {
    title,
    description,
    alternates: { canonical: `/market/${d.date}` },
    openGraph: { title: `${md} 장 마감 정리`, description, type: "article" },
  };
}

const pct = (v) => `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
const tone = (v) => (v > 0 ? "up" : v < 0 ? "down" : "flat");
const won = (v) => `${Math.round(v).toLocaleString("ko-KR")}`;
function eok(v) {
  if (typeof v !== "number") return "—";
  const e = v / 1e8;
  return e >= 10000 ? `${(e / 10000).toFixed(1)}조` : `${Math.round(e).toLocaleString("ko-KR")}억`;
}

function StockTable({ title, rows, showValue }) {
  return (
    <div className="mk-table-wrap">
      <h3 className="mk-h3">{title}</h3>
      <table className="mk-table">
        <thead>
          <tr>
            <th>종목</th>
            <th className="num">종가</th>
            <th className="num">{showValue ? "거래대금" : "등락률"}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.code}>
              <td>
                <Link href={`/stock/${r.code}`}>{r.name}</Link>
                <span className="mk-mkt">{r.market}</span>
              </td>
              <td className="num mono">{won(r.close)}</td>
              <td className={`num mono ${showValue ? "" : tone(r.chg)}`}>{showValue ? eok(r.value) : pct(r.chg)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ThemeList({ title, list }) {
  return (
    <div className="mk-table-wrap">
      <h3 className="mk-h3">{title}</h3>
      <ul className="mk-themes">
        {list.map((t) => (
          <li key={t.theme}>
            <div className="mk-theme-head">
              <Link href={`/themes?theme=${encodeURIComponent(t.theme)}`}>{t.theme}</Link>
              <span className={`mono ${tone(t.avg)}`}>평균 {pct(t.avg)}</span>
              <span className="mk-mkt">{t.count}종목</span>
            </div>
            <div className="mk-theme-stocks">
              {(t.avg >= 0 ? t.best : t.worst).map((s) => (
                <Link key={s.code} href={`/stock/${s.code}`}>
                  {s.name} <span className={`mono ${tone(s.chg)}`}>{pct(s.chg)}</span>
                </Link>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function MarketDayPage({ params }) {
  const d = await getMarketDay(params.date);
  if (!d) notFound();
  const lines = describeMarketDay(d);

  // 그날 올라온 속보 중 상승·하락 상위 종목이 걸린 것(피드가 최근 300건만 보관하므로 최근 날짜만 나옴)
  const movers = new Set([...d.gainers, ...d.losers, ...d.byValue].map((x) => x.code));
  const feed = await getRecentFeed();
  const news = feed
    .filter((it) => kstDateOf(it.pubDate) === d.date && (it.matches || []).some((m) => movers.has(m.code)))
    .slice(0, 12);

  return (
    <div>
      <Header />
      <main className="stock-page market-page">
        <nav className="stock-crumb" aria-label="위치">
          <Link href="/">홈</Link> › <Link href="/market">장 마감 정리</Link> › <span>{d.date}</span>
        </nav>
        <h1 className="mk-title">{koreanDate(d.date)} 장 마감 정리</h1>
        <p className="stock-asof">한국거래소 일별 시세 기준 · 전 거래일({d.prevDate}) 종가 대비</p>

        <section className="panel stock-section">
          {lines.map((t, i) => (
            <p key={i} className="stock-text">
              {t}
            </p>
          ))}
          <div className="stock-stats">
            {["코스피", "코스닥"].map((mk) => (
              <div key={mk} className="stock-stat">
                <span className="stock-stat-k">{mk} 오름/내림</span>
                <span className="stock-stat-v mono">
                  <span className="up">{d.breadth[mk]?.up ?? "—"}</span> / <span className="down">{d.breadth[mk]?.down ?? "—"}</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* [2026-10-27] 광고 — 요약 아래 */}
        <AdSlot />

        <section className="panel stock-section mk-grid">
          <ThemeList title="강했던 테마" list={d.themesUp} />
          <ThemeList title="약했던 테마" list={d.themesDown} />
        </section>

        <section className="panel stock-section mk-grid">
          <StockTable title="상승률 상위" rows={d.gainers} />
          <StockTable title="하락률 상위" rows={d.losers} />
        </section>

        <section className="panel stock-section">
          <StockTable title="거래대금 상위" rows={d.byValue} showValue />
        </section>

        {news.length > 0 && (
          <section className="panel stock-section">
            <h2 className="stock-h2">그날 이 종목들이 걸린 속보</h2>
            <ul className="stock-news">
              {news.map((n) => (
                <li key={n.id}>
                  <a href={n.link} target="_blank" rel="noopener noreferrer" className="stock-news-title">
                    {decodeEntities(n.title)}
                  </a>
                  <div className="stock-news-meta">
                    <span className="mono">{kstDateTimeText(n.pubDate)}</span>
                    {(n.matches || [])
                      .filter((m) => movers.has(m.code))
                      .slice(0, 3)
                      .map((m) => (
                        <Link key={m.code} href={`/stock/${m.code}`}>
                          {m.name}
                        </Link>
                      ))}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <nav className="mk-pager" aria-label="다른 날짜">
          {d.prevDate ? <Link href={`/market/${d.prevDate}`}>← {d.prevDate}</Link> : <span />}
          <Link href="/market">날짜 목록</Link>
          {d.nextDate ? <Link href={`/market/${d.nextDate}`}>{d.nextDate} →</Link> : <span />}
        </nav>

        <p className="stock-disclaimer">
          동전주(1,000원 미만)와 그날 거래가 없었던 종목은 순위에서 뺐습니다. 테마 평균은 이 사이트 테마 자료에 3종목 이상 있는 테마만
          계산했습니다. 투자 권유가 아닌 참고 자료입니다.
        </p>
      </main>
    </div>
  );
}
