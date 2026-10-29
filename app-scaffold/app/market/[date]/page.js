// app/market/[date]/page.js
//
// [2026-10-27 신설] 날짜별 "장 마감 정리" — 예) /market/2026-10-26
//
// 재성님 요청: 방문자를 늘릴 아이디어 중 "오늘 장 마감 정리 페이지 매일 쌓기".
// "10월 26일 급등주"처럼 날짜로 검색하는 사람이 들어오는 입구가 됩니다.
// 매일 따로 글을 쓰는 게 아니라, 이미 저장되는 전 종목 일별 시세로 자동 계산합니다
// (lib/marketDay.js — 비용 0, 계산 결과는 날짜별로 저장해 재사용).
//
// [2026-10-29 전면 개편] 재성님: "장 마감 정리로 홍보를 좀 해보려고하는데 화면이 좀 단조로운거같어
//   혁신적으로 바꿔봐 영양가도 좀 올려주고" → "마감 리포트" 모양으로 다시 짰습니다.
//   1. 맨 위 큰 제목 한 줄(숫자로 자동 작성) + 코스피·코스닥 지수 카드(오름/내림 막대, 상한가·하한가, 거래대금)
//   2. 오늘의 포인트 — 수급·시장 온도·주도 테마·거래대금 쏠림·상한가를 문장으로
//   3. 누가 샀나 — 개인·외국인·기관 순매수 막대
//   4. 테마 지도 — 강했던/약했던 테마를 색 칸으로(진할수록 많이 움직임)
//   5. 등락률 분포 — 전 종목이 몇 % 구간에 몇 개씩 있나
//   6. 오늘의 급등주 카드 — 소속 테마 + 그 종목이 걸린 최근 속보(왜 올랐나 힌트)
//   7. 주요 대형주 성적표, 거래대금 상위(막대), 하락률 상위, 그날 속보, 공유 단추
//   전부 이미 있는 자료로 계산합니다(AI 호출 없음, 비용 0).

import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "../../../components/Header";
// [2026-10-27 추가] 애드센스 광고 칸(번호는 lib/ads.js)
import AdSlot from "../../../components/AdSlot";
import ShareButton from "../../../components/ShareButton";
import { getMarketDay, koreanDate } from "../../../lib/marketDay";
import { getRecentFeed, kstDateOf, kstDateTimeText } from "../../../lib/recentFeed";
import { decodeEntities } from "../../../lib/decodeEntities";
// [2026-10-28 추가] 지수 마감 + 투자자별(개인·외국인·기관) 순매수
import { getMarketFlow } from "../../../lib/investorFlow";
import { marketHeadline, marketPoints, wonText } from "../../../lib/marketReport";
// [2026-10-29] 숫자 모양·지수 카드는 /market 목록 화면과 같이 씀
import { pct, pct1, tone, won, eok, heat, IndexCard } from "../../../components/MarketParts";

// [2026-10-27] 저장소(Redis) 읽기는 "매번 새로" 방식이라 미리 만들어 두는 페이지와 함께 쓰면 오류가 납니다.
// 그래서 요청 때 만들고, 무거운 계산 결과는 lib/marketDay.js가 날짜별로 저장해 둔 것을 씁니다(Redis 읽기 횟수는 같음).
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const d = await getMarketDay(params.date);
  if (!d) return {};
  const flow = await getMarketFlow(d.date, { latest: !d.nextDate });
  const md = `${Number(d.date.slice(5, 7))}월 ${Number(d.date.slice(8, 10))}일`;
  const top = d.gainers.slice(0, 3).map((x) => x.name).join(", ");
  const head = marketHeadline(d, flow);
  const title = `${md} 장 마감 정리 — ${head || "급등주·급락주·테마"} | 뉴스매매`;
  const description = `${koreanDate(d.date)} 코스피·코스닥 마감 리포트. ${head}. 외국인·기관 수급, 테마 지도, 상승률 상위 ${top} 등 급등주와 관련 속보.`;
  return {
    title,
    description,
    alternates: { canonical: `/market/${d.date}` },
    openGraph: { title: `${md} 장 마감 정리`, description, type: "article" },
  };
}

// ── 3. 누가 샀나 ────────────────────────────────────────────────
function FlowBlock({ flow }) {
  const markets = ["코스피", "코스닥"].filter((mk) => flow?.[mk]?.flow);
  if (!markets.length) return null;
  const max = Math.max(
    1,
    ...markets.flatMap((mk) => {
      const f = flow[mk].flow;
      return [f.individual, f.foreign, f.institution].map((v) => Math.abs(v || 0));
    })
  );
  return (
    <section className="panel stock-section">
      <h2 className="stock-h2">누가 사고, 누가 팔았나</h2>
      <div className="mk2-flow-grid">
        {markets.map((mk) => {
          const f = flow[mk].flow;
          const rows = [
            ["개인", f.individual],
            ["외국인", f.foreign],
            ["기관", f.institution],
          ];
          return (
            <div key={mk} className="mk2-flow">
              <div className="mk2-flow-mk">{mk}</div>
              {rows.map(([n, v]) => (
                <div key={n} className="mk2-flow-row">
                  <span className="mk2-flow-who">{n}</span>
                  <span className="mk2-flow-track">
                    <span className="mk2-flow-axis" />
                    {typeof v === "number" && v !== 0 && (
                      <span
                        className={`mk2-flow-bar ${v > 0 ? "buy" : "sell"}`}
                        style={{ width: `${(Math.abs(v) / max) * 50}%`, [v > 0 ? "left" : "right"]: "50%" }}
                      />
                    )}
                  </span>
                  <span className={`mk2-flow-v mono ${tone(v)}`}>
                    {typeof v === "number" ? `${v > 0 ? "+" : ""}${Math.round(v).toLocaleString("ko-KR")}억` : "—"}
                  </span>
                </div>
              ))}
              {typeof f.pension === "number" && (
                <div className="mk2-flow-note">
                  기관 중 연기금 <span className={`mono ${tone(f.pension)}`}>{`${f.pension > 0 ? "+" : ""}${Math.round(f.pension).toLocaleString("ko-KR")}억`}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="mk-note">오른쪽(빨강)은 산 돈이 더 많음(순매수), 왼쪽(파랑)은 판 돈이 더 많음(순매도) · 단위 억 원 · 자료: 네이버 금융</p>
    </section>
  );
}

// ── 4. 테마 지도 ────────────────────────────────────────────────
function ThemeTiles({ list }) {
  return (
    <div className="mk2-tiles">
      {list.map((t) => (
        <Link key={t.theme} href={`/themes?theme=${encodeURIComponent(t.theme)}`} className="mk2-tile" style={heat(t.avg)}>
          <span className="mk2-tile-name">{t.theme}</span>
          <span className={`mk2-tile-avg mono ${tone(t.avg)}`}>{pct1(t.avg)}</span>
          {t.lead && (
            <span className="mk2-tile-lead">
              {t.lead.name} {pct1(t.lead.chg)}
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}

// ── 5. 등락률 분포 ──────────────────────────────────────────────
function Histogram({ hist }) {
  if (!hist?.length) return null;
  const max = Math.max(1, ...hist.map((h) => h.n));
  return (
    <div className="mk2-hist" role="img" aria-label="등락률 구간별 종목 수">
      {hist.map((h) => (
        <div key={h.label} className="mk2-hist-col">
          <span className="mk2-hist-n mono">{h.n.toLocaleString("ko-KR")}</span>
          <span className={`mk2-hist-bar ${h.side > 0 ? "up" : h.side < 0 ? "down" : "flat"}`} style={{ height: `${Math.max(2, (h.n / max) * 100)}%` }} />
          <span className="mk2-hist-label">{h.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── 거래대금 상위(막대) ─────────────────────────────────────────
function ValueBars({ rows }) {
  const max = Math.max(1, ...rows.map((r) => r.value || 0));
  return (
    <ol className="mk2-vbars">
      {rows.map((r, i) => (
        <li key={r.code}>
          <span className="mk2-rank mono">{i + 1}</span>
          <Link href={`/stock/${r.code}`} className="mk2-vbar-name">
            {r.name}
          </Link>
          <span className="mk2-vbar-track">
            <span className="mk2-vbar" style={{ width: `${((r.value || 0) / max) * 100}%` }} />
          </span>
          <span className="mk2-vbar-v mono">{eok(r.value)}</span>
          <span className={`mk2-vbar-c mono ${tone(r.chg)}`}>{pct1(r.chg)}</span>
        </li>
      ))}
    </ol>
  );
}

function StockTable({ title, rows }) {
  return (
    <div className="mk-table-wrap">
      <h3 className="mk-h3">{title}</h3>
      <table className="mk-table">
        <thead>
          <tr>
            <th>종목</th>
            <th className="num">종가</th>
            <th className="num">등락률</th>
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
              <td className={`num mono ${tone(r.chg)}`}>{pct(r.chg)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function MarketDayPage({ params }) {
  const d = await getMarketDay(params.date);
  if (!d) notFound();

  // [2026-10-28] 지수 마감·투자자별 순매수(못 받으면 그 부분만 빠짐)
  const flow = await getMarketFlow(d.date, { latest: !d.nextDate });
  const headline = marketHeadline(d, flow);
  const points = marketPoints(d, flow);

  // 속보: 그날(과 전날 저녁) 올라온 것 중 오늘 많이 움직인 종목이 걸린 것
  const feed = await getRecentFeed();
  const inWindow = (it) => {
    const day = kstDateOf(it.pubDate);
    return day === d.date || day === d.prevDate;
  };
  const windowFeed = feed.filter(inWindow);
  const newsOf = (code) => {
    for (const it of windowFeed) {
      const m = (it.matches || []).find((x) => x.code === code);
      if (m) return { title: decodeEntities(it.title), link: it.link, at: it.pubDate, reason: m.reason || "" };
    }
    return null;
  };
  const movers = new Set([...d.gainers, ...d.losers, ...d.byValue, ...(d.limitUps || [])].map((x) => x.code));
  const news = feed
    .filter((it) => kstDateOf(it.pubDate) === d.date && (it.matches || []).some((m) => movers.has(m.code)))
    .slice(0, 12);

  const themeMap = d.themeMap || [];
  const hot = themeMap.filter((t) => t.avg > 0).slice(0, 16);
  const cold = themeMap.filter((t) => t.avg < 0).slice(-8).reverse();
  const allUp = (d.breadth["코스피"]?.up || 0) + (d.breadth["코스닥"]?.up || 0);
  const allN = ["코스피", "코스닥"].reduce((s, mk) => s + (d.breadth[mk] ? d.breadth[mk].up + d.breadth[mk].down + d.breadth[mk].flat : 0), 0);
  const md = `${Number(d.date.slice(5, 7))}월 ${Number(d.date.slice(8, 10))}일`;

  return (
    <div>
      <Header />
      <main className="stock-page market-page mk2">
        <nav className="stock-crumb" aria-label="위치">
          <Link href="/">홈</Link> › <Link href="/market">장 마감 정리</Link> › <span>{d.date}</span>
        </nav>

        {/* ── 맨 위: 리포트 제목 ── */}
        <header className="mk2-hero">
          <div className="mk2-kicker">
            <span>장 마감 리포트</span>
            <span className="mono">{koreanDate(d.date)}</span>
            {d.provisional && <span className="mk-provisional">잠정</span>}
          </div>
          <h1 className="mk2-headline">{headline}</h1>
          <p className="mk2-sub">
            코스피·코스닥 {d.stockCount.toLocaleString("ko-KR")}종목 자동 분석 ·{" "}
            {d.provisional ? "장 마감 직후 시세(15~20분 지연), 다음 날 아침 한국거래소 확정치로 자동으로 바뀝니다" : "한국거래소 일별 시세 기준"} · 전 거래일(
            {d.prevDate}) 종가 대비
          </p>
          <div className="mk2-idx-grid">
            {["코스피", "코스닥"].map((mk) => (
              <IndexCard key={mk} mk={mk} b={d.breadth[mk]} ix={flow?.[mk]?.index} />
            ))}
          </div>
          <div className="mk2-hero-actions">
            <ShareButton title={`${md} 장 마감 정리 | 뉴스매매`} text={headline} path={`/market/${d.date}`} label="이 리포트 공유하기" />
          </div>
        </header>

        {/* ── 오늘의 포인트 ── */}
        {points.length > 0 && (
          <section className="panel stock-section mk2-points">
            <h2 className="stock-h2">오늘의 포인트</h2>
            <ol>
              {points.map((p, i) => (
                <li key={i}>
                  <span className="mk2-pt-n mono">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <span className="mk2-pt-k">{p.k}</span>
                    <p>{p.t}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        <FlowBlock flow={flow} />

        {/* [2026-10-27] 광고 — 요약 아래 */}
        <AdSlot />

        {/* ── 테마 지도 ── */}
        {themeMap.length > 0 && (
          <section className="panel stock-section">
            <h2 className="stock-h2">테마 지도</h2>
            <p className="mk2-cap">테마에 속한 종목들의 평균 등락률 · 색이 진할수록 많이 움직였어요 · 누르면 테마 종목 보기</p>
            {hot.length > 0 && (
              <>
                <h3 className="mk-h3">강했던 테마</h3>
                <ThemeTiles list={hot} />
              </>
            )}
            {cold.length > 0 && (
              <>
                <h3 className="mk-h3 mk2-gap">약했던 테마</h3>
                <ThemeTiles list={cold} />
              </>
            )}
          </section>
        )}

        {/* ── 등락률 분포 ── */}
        {d.hist && (
          <section className="panel stock-section">
            <h2 className="stock-h2">등락률 분포</h2>
            <p className="mk2-cap">
              전 종목이 어느 구간에 몇 개씩 있었나 · 오른 종목 비율 <b className="mono">{allN ? Math.round((allUp / allN) * 100) : 0}%</b>
            </p>
            <Histogram hist={d.hist} />
          </section>
        )}

        {/* ── 오늘의 급등주 ── */}
        <section className="panel stock-section">
          <h2 className="stock-h2">오늘 가장 많이 오른 종목</h2>
          <p className="mk2-cap">소속 테마와, 그 종목이 걸린 최근 속보(왜 올랐는지 힌트)를 같이 보여 드려요</p>
          <div className="mk2-cards">
            {d.gainers.map((s, i) => {
              const n = newsOf(s.code);
              return (
                <article key={s.code} className="mk2-card">
                  <div className="mk2-card-top">
                    <span className="mk2-rank mono">{i + 1}</span>
                    <Link href={`/stock/${s.code}`} className="mk2-card-name">
                      {s.name}
                    </Link>
                    <span className="mk-mkt">{s.market}</span>
                    <span className={`mk2-card-chg mono ${tone(s.chg)}`}>{pct(s.chg)}</span>
                  </div>
                  <div className="mk2-card-meta">
                    <span className="mono">{won(s.close)}원</span>
                    {typeof s.value === "number" && <span>거래대금 {eok(s.value)}</span>}
                    {s.chg >= 29.5 && <span className="mk2-badge-up">상한가</span>}
                  </div>
                  {s.themes?.length > 0 && (
                    <div className="mk2-chips">
                      {s.themes.map((t) => (
                        <Link key={t} href={`/themes?theme=${encodeURIComponent(t)}`} className="mk2-chip">
                          {t}
                        </Link>
                      ))}
                    </div>
                  )}
                  {n && (
                    <a href={n.link} target="_blank" rel="noopener noreferrer" className="mk2-card-news">
                      <span className="mk2-card-news-at mono">{kstDateTimeText(n.at).slice(5)}</span>
                      {n.title}
                    </a>
                  )}
                </article>
              );
            })}
          </div>
          {(d.limitUps || []).length > 0 && (
            <div className="mk2-limit">
              <span className="mk2-badge-up">상한가 {d.limitUps.length}</span>
              {d.limitUps.map((s) => (
                <Link key={s.code} href={`/stock/${s.code}`}>
                  {s.name}
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* ── 주요 대형주 ── */}
        {(d.bigCaps || []).length > 0 && (
          <section className="panel stock-section">
            <h2 className="stock-h2">주요 대형주 성적표</h2>
            <p className="mk2-cap">
              {d.bigCaps.length}종목 중 <b className="up">{d.bigCaps.filter((s) => s.chg > 0).length}</b> 상승 ·{" "}
              <b className="down">{d.bigCaps.filter((s) => s.chg < 0).length}</b> 하락
            </p>
            <div className="mk2-caps">
              {d.bigCaps.map((s) => (
                <Link key={s.code} href={`/stock/${s.code}`} className="mk2-cap-tile" style={heat(s.chg, 6)}>
                  <span className="mk2-cap-name">{s.name}</span>
                  <span className={`mono ${tone(s.chg)}`}>{pct1(s.chg)}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── 거래대금 상위 ── */}
        <section className="panel stock-section">
          <h2 className="stock-h2">돈이 몰린 종목 (거래대금 상위)</h2>
          {typeof d.top10Share === "number" && (
            <p className="mk2-cap">
              전체 거래대금 {wonText(d.totalValue)} 중 상위 10종목이 <b className="mono">{d.top10Share.toFixed(0)}%</b>
            </p>
          )}
          <ValueBars rows={d.byValue} />
        </section>

        <AdSlot />

        <section className="panel stock-section">
          <StockTable title="많이 내린 종목" rows={d.losers} />
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

        <div className="mk2-bottom-share">
          <span>이 정리가 도움이 됐다면 주식 하는 친구에게 공유해 주세요</span>
          <ShareButton title={`${md} 장 마감 정리 | 뉴스매매`} text={headline} path={`/market/${d.date}`} />
        </div>

        <nav className="mk-pager" aria-label="다른 날짜">
          {d.prevDate ? <Link href={`/market/${d.prevDate}`}>← {d.prevDate}</Link> : <span />}
          <Link href="/market">날짜 목록</Link>
          {d.nextDate ? <Link href={`/market/${d.nextDate}`}>{d.nextDate} →</Link> : <span />}
        </nav>

        <p className="stock-disclaimer">
          동전주(1,000원 미만)와 그날 거래가 없었던 종목은 순위에서 뺐습니다. 하루 등락이 ±30%를 넘는 종목(액면병합·거래재개 등으로 기준가가 바뀐
          종목)은 계산에서 뺐습니다. 테마 평균은 이 사이트 테마 자료에 3종목 이상 있는 테마만 계산했습니다. 제목과 포인트 문장은 숫자를 보고
          자동으로 만든 것입니다. 투자 권유가 아닌 참고 자료입니다.
        </p>
      </main>
    </div>
  );
}
