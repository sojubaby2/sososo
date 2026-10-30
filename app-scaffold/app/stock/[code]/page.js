// app/stock/[code]/page.js
//
// [2026-10-27 신설] 종목별 페이지 — 예) /stock/382800
//
// 재성님 요청: 사이트 방문자를 늘릴 아이디어 중 "종목별 페이지" 진행.
// 사람들이 "○○ 주가 왜 올라" 처럼 검색할 때 들어오는 입구가 되도록,
// 종목 하나에 대한 정보를 한 화면에 모읍니다.
//
// 화면 구성
//   1. 종목명·코드·시장, 최근 종가와 등락률, 관심종목 별표
//   2. 일봉 차트(오늘 포함, 15~20분 지연)
//   3. 한눈에 보기 — 1주/1개월/3개월 등락률, 기간 고점·저점, 평균선 위치를 문장으로
//   4. 이 종목이 걸린 최근 속보(이 사이트가 자동 매칭한 이유와 함께)
//   5. 속한 테마 → 테마별 종목정리로 이동 / 같은 테마 종목 → 그 종목 페이지로 이동
//   6. [2026-10-27 추가] 최근 공시와 공시 일정(DART — lib/disclosures.js의 30분 저장본을 같이 씀)
//
// 데이터와 비용(전부 0원)
//   · 일봉: 야후 무료 시세(lib/candles.js) — 2분 저장
//   · 속보: 홈과 같은 피드를 5분 저장본으로 공유(lib/recentFeed.js) — Redis 읽기가 늘지 않음
//   · 테마: lib/themeData.json(파일)
//   · 페이지 자체는 10분마다 새로 만들어 저장(revalidate) — 방문자가 몰려도 매번 계산하지 않음
//
// 어떤 종목이 있나: 테마 자료에 있는 종목(약 1,100개)은 사이트맵에 넣어 검색엔진에 알립니다.
// 그 밖의 종목도 주소로 들어오면 보이지만, 정보가 적어서 검색 노출은 막아 둡니다(noindex).

import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "../../../components/Header";
// [2026-10-27 추가] 애드센스 광고 칸(번호는 lib/ads.js)
import AdSlot from "../../../components/AdSlot";
import StockInlineChart from "../../../components/StockInlineChart";
import WatchStar from "../../../components/WatchStar";
import { getStock, peersOf } from "../../../lib/stockDirectory";
import { fetchDailyCandles } from "../../../lib/candles";
import { getRecentFeed, newsForStock, kstDateTimeText } from "../../../lib/recentFeed";
import { summarizeCandles, describeSummary } from "../../../lib/stockSummary";
import { decodeEntities } from "../../../lib/decodeEntities";
import { disclosuresForStock, categoryLabel, dartViewerUrl, kstTodayIso } from "../../../lib/disclosures";

export const revalidate = 600; // 10분
export const dynamicParams = true;

// 빌드할 때 미리 만들지 않고, 처음 누가 들어올 때 만들어 저장합니다(빌드 시간·비용 절약).
export function generateStaticParams() {
  return [];
}

const SHOW_BARS = 130;

function normCode(raw) {
  const c = String(raw || "").trim().toUpperCase();
  return /^[0-9A-Z]{6}$/.test(c) ? c : null;
}

async function loadStock(code) {
  const dir = getStock(code);
  const [chart, feed, disc] = await Promise.all([
    fetchDailyCandles(code, dir?.market || "").catch(() => null),
    getRecentFeed(),
    disclosuresForStock(code).catch(() => ({ recent: [], events: [] })),
  ]);
  const news = newsForStock(feed, code, 20);
  // 이름: 테마 자료 → 속보에 붙은 이름 → 코드
  let name = dir?.name || null;
  if (!name) {
    for (const it of feed) {
      const m = (it.matches || []).find((x) => x.code === code);
      if (m?.name) {
        name = m.name;
        break;
      }
    }
  }
  const market = chart?.market || dir?.market || "";
  return { dir, chart, news, name, market, disc };
}

export async function generateMetadata({ params }) {
  const code = normCode(params.code);
  if (!code) return {};
  const { dir, name, market, chart } = await loadStock(code);
  if (!name && !chart) return {};
  const label = name || code;
  const themes = dir?.themes?.slice(0, 3).join("·");
  const title = `${label}(${code}) 주가·관련 뉴스·테마 | 뉴스매매`;
  const description = `${label}(${code}${market ? `, ${market}` : ""}) 일봉 차트와 최근 등락률, 이 종목이 걸린 최근 속보와 매칭 이유${
    themes ? `, 관련 테마(${themes})` : ""
  }를 한 화면에 정리했습니다.`;
  return {
    title,
    description,
    alternates: { canonical: `/stock/${code}` },
    robots: dir ? undefined : { index: false, follow: true },
    openGraph: { title: `${label}(${code}) 주가·관련 뉴스`, description, type: "website" },
  };
}

const sign = (v) => (typeof v === "number" ? `${v > 0 ? "+" : ""}${v.toFixed(2)}%` : "—");
const tone = (v) => (typeof v === "number" ? (v > 0 ? "up" : v < 0 ? "down" : "flat") : "flat");

export default async function StockPage({ params }) {
  const code = normCode(params.code);
  if (!code) notFound();
  const { dir, chart, news, name, market, disc } = await loadStock(code);
  if (!name && !chart) notFound();
  const today = kstTodayIso();
  const upcomingEvents = (disc?.events || []).filter((e) => e.date >= today);

  const label = name || code;
  const candles = chart?.candles || [];
  const summary = summarizeCandles(candles);
  const lines = describeSummary(label, summary);
  const peers = dir ? peersOf(code, 12) : [];

  const stats = summary
    ? [
        ["1주", summary.week],
        ["1개월", summary.month],
        ["3개월", summary.quarter],
      ]
    : [];

  return (
    <div>
      <Header />
      <main className="stock-page">
        <nav className="stock-crumb" aria-label="위치">
          <Link href="/">홈</Link> › <Link href="/themes">테마별 종목정리</Link> › <span>{label}</span>
        </nav>

        <header className="stock-head">
          <div>
            <h1>
              {label} <span className="stock-code mono">{code}</span>
              {market && <span className="sc-mkt">{market}</span>}
            </h1>
            {summary ? (
              <p className="stock-price">
                <span className="mono">{Math.round(summary.close).toLocaleString("ko-KR")}원</span>
                <span className={`mono ${tone(summary.change)}`}>{sign(summary.change)}</span>
                <span className="stock-asof">{summary.date} 기준 · 15~20분 지연</span>
                {/* [2026-10-30] 실시간 시세는 네이버 증권으로(링크만) */}
                <a className="stock-live" href={`https://finance.naver.com/item/main.naver?code=${code}`} target="_blank" rel="noopener noreferrer">
                  실시간 시세는 네이버 ↗
                </a>
              </p>
            ) : (
              <p className="stock-asof">시세를 받아오지 못했어요.</p>
            )}
          </div>
          <WatchStar stock={{ code, name: label, market }} variant="big" />
        </header>

        <section className="panel stock-section">
          <StockInlineChart candles={candles.slice(-Math.max(SHOW_BARS + 30, 160))} />
        </section>

        {/* [2026-10-27] 광고 — 차트 아래 */}
        <AdSlot />

        {summary && (
          <section className="panel stock-section">
            <h2 className="stock-h2">한눈에 보기</h2>
            <div className="stock-stats">
              {stats.map(([k, v]) => (
                <div key={k} className="stock-stat">
                  <span className="stock-stat-k">{k}</span>
                  <span className={`stock-stat-v mono ${tone(v)}`}>{sign(v)}</span>
                </div>
              ))}
              <div className="stock-stat">
                <span className="stock-stat-k">{summary.periodLabel} 고점</span>
                <span className="stock-stat-v mono">{Math.round(summary.periodHigh.price).toLocaleString("ko-KR")}</span>
              </div>
              <div className="stock-stat">
                <span className="stock-stat-k">{summary.periodLabel} 저점</span>
                <span className="stock-stat-v mono">{Math.round(summary.periodLow.price).toLocaleString("ko-KR")}</span>
              </div>
            </div>
            {lines.map((t, i) => (
              <p key={i} className="stock-text">
                {t}
              </p>
            ))}
          </section>
        )}

        <section className="panel stock-section">
          <h2 className="stock-h2">이 종목이 걸린 최근 속보</h2>
          {news.length === 0 ? (
            <p className="stock-text muted">
              최근 며칠 사이 이 종목이 걸린 속보가 없습니다. 새 속보가 들어오면 <Link href="/">홈 실시간 속보</Link>에 먼저 뜹니다.
            </p>
          ) : (
            <ul className="stock-news">
              {news.map((n) => (
                <li key={n.id}>
                  <a href={n.link} target="_blank" rel="noopener noreferrer" className="stock-news-title">
                    {decodeEntities(n.title)}
                  </a>
                  <div className="stock-news-meta">
                    <span className="mono">{kstDateTimeText(n.pubDate)}</span>
                    {n.keyword && <span>{n.keyword}</span>}
                    {n.catalyst && <span className="stock-bad">악재: {n.catalyst}</span>}
                  </div>
                  {n.reason && <p className="stock-news-reason">매칭 이유: {n.reason}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>

        {(disc?.recent?.length > 0 || upcomingEvents.length > 0) && (
          <section className="panel stock-section">
            <h2 className="stock-h2">최근 공시</h2>
            {upcomingEvents.length > 0 && (
              <ul className="stock-news">
                {upcomingEvents.map((e, i) => (
                  <li key={`${e.rceptNo}-${e.type}-${i}`}>
                    <span className="dc-tag dc-tag-sched">일정</span>{" "}
                    <b className="mono">{e.date}</b> {e.label}
                  </li>
                ))}
              </ul>
            )}
            {disc.recent.length > 0 && (
              <ul className="stock-news">
                {disc.recent.map((d) => (
                  <li key={d.rceptNo}>
                    <span className={`dc-tag dc-tag-${d.cat}`}>{categoryLabel(d.cat)}</span>{" "}
                    <a href={dartViewerUrl(d.rceptNo)} target="_blank" rel="noopener noreferrer" className="stock-news-title">
                      {d.title}
                    </a>
                    <div className="stock-news-meta">
                      <span className="mono">{d.date}</span>
                      <span>DART 원문</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="stock-text muted" style={{ fontSize: 13, marginTop: 8 }}>
              최근 7일 주요 공시만 보여 줍니다. 전체 공시 일정은 <Link href="/disclosure">공시 일정</Link>에서 볼 수 있어요.
            </p>
          </section>
        )}

        {dir && (
          <section className="panel stock-section">
            <h2 className="stock-h2">속한 테마</h2>
            <div className="chip-row">
              {dir.themes.map((t) => (
                <Link key={t} className="chip" href={`/themes?theme=${encodeURIComponent(t)}`}>
                  <span className="dot theme" />
                  {t}
                </Link>
              ))}
            </div>
            {peers.length > 0 && (
              <>
                <h2 className="stock-h2">같은 테마 종목</h2>
                <div className="chip-row">
                  {peers.map((p) => (
                    <Link key={p.code} className="chip" href={`/stock/${p.code}`} title={`${p.theme} 테마`}>
                      {p.name}
                      <span className="code">{p.code}</span>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </section>
        )}

        <p className="stock-disclaimer">
          이 페이지는 공개된 시세와 이 사이트가 자동으로 모은 속보를 정리한 참고 자료이며, 특정 종목의 매수·매도를 권하지 않습니다.
          시세는 15~20분 지연된 값입니다.{" "}
          <a href={`https://finance.naver.com/item/main.naver?code=${code}`} target="_blank" rel="noopener noreferrer">
            네이버 증권에서 보기
          </a>
        </p>
      </main>
    </div>
  );
}
