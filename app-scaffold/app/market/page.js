// app/market/page.js
//
// [2026-10-27 신설] 장 마감 정리 — 날짜 목록. 최신 날짜 정리를 위에 크게 보여주고,
// 아래에 최근 거래일 목록을 둡니다(각 날짜 → /market/날짜).
//
// [2026-10-29 전면 개편] 재성님: "장마감 정리를 눌렀을때 이 화면이 너무 허접해보여서 뭔가 더 눌러볼거같지가 않은데
//   눌러보고싶고 호기심생기게끔 만들어바"
//   1. 맨 위 "오늘의 리포트" 큰 카드 — 자동 제목 한 줄, 지수 카드, 포인트 2줄,
//      강했던 테마 TOP3 · 많이 오른 종목 TOP3 · 돈이 몰린 종목 TOP3 맛보기, 큰 "전체 리포트 보기" 단추
//   2. 최근 거래일 흐름 — 날마다 카드(오른 종목 비율 막대, 그날 1등 테마, 1등 종목) + 오른 종목 비율 막대그래프
//   3. 지난 리포트 달력 — 월별 달력(월~금), 최근 날짜는 그날 분위기 색(빨강=오른 날, 파랑=내린 날)
// 전부 이미 저장된 자료로 계산합니다(AI 호출 없음, 비용 0). 날짜별 계산 결과는 lib/marketDay.js가 저장해 두고 재사용합니다.

import Link from "next/link";
import Header from "../../components/Header";
import ShareButton from "../../components/ShareButton";
import { getMarketDates, getMarketDay, koreanDate } from "../../lib/marketDay";
import { getMarketFlow } from "../../lib/investorFlow";
import { marketHeadline, marketPoints } from "../../lib/marketReport";
import { pct1, tone, eok, heat, IndexCard } from "../../components/MarketParts";

// [2026-10-27] 저장소(Redis) 읽기는 "매번 새로" 방식이라 미리 만들어 두는 페이지와 함께 쓰면 오류가 납니다.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "장 마감 정리 — 매일 오후 4시 코스피·코스닥 마감 리포트 | 뉴스매매",
  description:
    "매 거래일 장 마감 뒤 코스피·코스닥 전 종목을 자동 분석한 마감 리포트. 외국인·기관 수급, 강세·약세 테마 지도, 급등주와 그 이유가 된 속보, 거래대금 상위 종목을 날짜별로 정리합니다.",
  alternates: { canonical: "/market" },
};

const SHOW_DATES = 60;
const RECENT_N = 10; // 흐름 카드·달력 색칠에 쓰는 최근 거래일 수
const WD = ["일", "월", "화", "수", "목", "금", "토"];

// 그날 전 종목 중 오른 종목 비율(%)
function upRatio(d) {
  if (!d?.breadth) return null;
  let up = 0;
  let all = 0;
  for (const mk of ["코스피", "코스닥"]) {
    const b = d.breadth[mk];
    if (!b) continue;
    up += b.up;
    all += b.up + b.down + b.flat;
  }
  return all ? Math.round((up / all) * 100) : null;
}
// 오른 종목 비율 → 달력 칸 색(50%를 기준으로 위면 빨강, 아래면 파랑)
function moodStyle(r) {
  if (typeof r !== "number") return null;
  return heat(r - 50, 30);
}
const mdText = (iso) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;
const wdOf = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay();

// 월별 달력 만들기 — 거래일 목록(오래된→최신)을 받아 [{ ym, weeks:[[iso|null x5]] }] (월~금만)
function buildCalendar(isoDates) {
  const set = new Set(isoDates);
  const months = [...new Set(isoDates.map((d) => d.slice(0, 7)))].sort().reverse();
  return months.map((ym) => {
    const [y, m] = ym.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const weeks = [];
    let week = null;
    for (let day = 1; day <= last; day++) {
      const iso = `${ym}-${String(day).padStart(2, "0")}`;
      const wd = wdOf(iso);
      if (wd === 0 || wd === 6) continue;
      if (!week || wd === 1) {
        week = [null, null, null, null, null];
        weeks.push(week);
      }
      week[wd - 1] = { iso, day, trading: set.has(iso) };
    }
    return { ym, label: `${y}년 ${m}월`, weeks };
  });
}

export default async function MarketIndexPage() {
  let dates = [];
  try {
    dates = await getMarketDates();
  } catch {
    dates = [];
  }
  // 첫 날짜는 비교할 전 거래일이 없어서 정리가 안 되므로 뺍니다.
  const usable = dates.slice(1);
  const list = [...usable].reverse().slice(0, SHOW_DATES);
  const recentIso = list.slice(0, RECENT_N);
  const recent = (await Promise.all(recentIso.map((iso) => getMarketDay(iso).catch(() => null)))).filter(Boolean);
  const latest = recent[0] || null;
  const flow = latest ? await getMarketFlow(latest.date, { latest: true }) : null;
  const headline = latest ? marketHeadline(latest, flow) : "";
  const points = latest ? marketPoints(latest, flow).slice(0, 3) : [];
  const ratioBy = new Map(recent.map((d) => [d.date, upRatio(d)]));
  const calendar = buildCalendar(list.slice().reverse());
  const chart = [...recent].reverse(); // 오래된 → 최신

  return (
    <div>
      <Header />
      <main className="stock-page market-page mk2 mkh">
        <header className="mkh-top">
          <h1 className="mk-title">장 마감 정리</h1>
          <p className="mkh-lead">
            매 거래일 <b>오후 4시 전후</b>, 코스피·코스닥 전 종목을 자동으로 분석해 한 장의 리포트로 정리합니다.
          </p>
          <div className="mkh-badges">
            <span>전 종목 {latest ? latest.stockCount.toLocaleString("ko-KR") : "2,500+"}개 분석</span>
            <span>외국인·기관 수급</span>
            <span>테마 지도</span>
            <span>급등주 + 이유가 된 속보</span>
            <span>무료</span>
          </div>
        </header>

        {/* ── 1. 오늘의 리포트 ── */}
        {latest && (
          <section className="mk2-hero mkh-hero">
            <div className="mk2-kicker">
              <span>{latest.date === list[0] ? "최신 리포트" : "리포트"}</span>
              <span className="mono">{koreanDate(latest.date)}</span>
              {latest.provisional && <span className="mk-provisional">잠정</span>}
            </div>
            <Link href={`/market/${latest.date}`} className="mkh-headline-link">
              <h2 className="mk2-headline">{headline}</h2>
            </Link>
            <div className="mk2-idx-grid">
              {["코스피", "코스닥"].map((mk) => (
                <IndexCard key={mk} mk={mk} b={latest.breadth[mk]} ix={flow?.[mk]?.index} />
              ))}
            </div>

            {points.length > 0 && (
              <ul className="mkh-points">
                {points.map((p, i) => (
                  <li key={i}>
                    <span className="mkh-pt-k">{p.k}</span>
                    {p.t}
                  </li>
                ))}
              </ul>
            )}

            <div className="mkh-peek">
              <div className="mkh-peek-col">
                <h3>🔥 강했던 테마</h3>
                {(latest.themeMap || latest.themesUp || []).filter((t) => t.avg > 0).slice(0, 3).map((t, i) => (
                  <Link key={t.theme} href={`/themes?theme=${encodeURIComponent(t.theme)}`} className="mkh-peek-row" style={heat(t.avg)}>
                    <span className="mkh-peek-n mono">{i + 1}</span>
                    <span className="mkh-peek-name">{t.theme}</span>
                    <span className={`mono ${tone(t.avg)}`}>{pct1(t.avg)}</span>
                  </Link>
                ))}
              </div>
              <div className="mkh-peek-col">
                <h3>🚀 많이 오른 종목</h3>
                {latest.gainers.slice(0, 3).map((s, i) => (
                  <Link key={s.code} href={`/stock/${s.code}`} className="mkh-peek-row">
                    <span className="mkh-peek-n mono">{i + 1}</span>
                    <span className="mkh-peek-name">{s.name}</span>
                    <span className={`mono ${tone(s.chg)}`}>{pct1(s.chg)}</span>
                  </Link>
                ))}
              </div>
              <div className="mkh-peek-col">
                <h3>💰 돈이 몰린 종목</h3>
                {latest.byValue.slice(0, 3).map((s, i) => (
                  <Link key={s.code} href={`/stock/${s.code}`} className="mkh-peek-row">
                    <span className="mkh-peek-n mono">{i + 1}</span>
                    <span className="mkh-peek-name">{s.name}</span>
                    <span className="mono mkh-peek-v">{eok(s.value)}</span>
                  </Link>
                ))}
              </div>
            </div>

            <div className="mkh-cta-row">
              <Link href={`/market/${latest.date}`} className="mkh-cta">
                전체 리포트 보기 →
                <small>수급 · 테마 지도 · 급등주가 오른 이유 · 대형주 성적표</small>
              </Link>
              <ShareButton
                title={`${Number(latest.date.slice(5, 7))}월 ${Number(latest.date.slice(8, 10))}일 장 마감 정리 | 뉴스매매`}
                text={headline}
                path={`/market/${latest.date}`}
              />
            </div>
          </section>
        )}

        {/* ── 2. 최근 흐름 ── */}
        {recent.length > 1 && (
          <section className="panel stock-section">
            <h2 className="stock-h2">최근 {recent.length}거래일 흐름</h2>
            <p className="mk2-cap">막대 = 그날 전 종목 중 오른 종목 비율 · 50%보다 높으면 오른 종목이 더 많았던 날</p>
            <div className="mkh-chart" role="img" aria-label="최근 거래일별 오른 종목 비율">
              {chart.map((d) => {
                const r = ratioBy.get(d.date);
                return (
                  <Link key={d.date} href={`/market/${d.date}`} className="mkh-chart-col" title={`${koreanDate(d.date)} 오른 종목 ${r}%`}>
                    <span className="mkh-chart-v mono">{r}%</span>
                    <span className="mkh-chart-track">
                      <span className={`mkh-chart-bar ${r >= 50 ? "up" : "down"}`} style={{ height: `${Math.max(4, r)}%` }} />
                      <span className="mkh-chart-mid" />
                    </span>
                    <span className="mkh-chart-d">{mdText(d.date)}</span>
                  </Link>
                );
              })}
            </div>

            <div className="mkh-days">
              {recent.slice(0, 6).map((d) => {
                const r = ratioBy.get(d.date);
                const t = (d.themesUp || [])[0];
                const g = d.gainers[0];
                return (
                  <Link key={d.date} href={`/market/${d.date}`} className="mkh-day">
                    <div className="mkh-day-top">
                      <b>{mdText(d.date)}</b>
                      <span className="mkh-day-wd">{WD[wdOf(d.date)]}</span>
                      {d.provisional && <span className="mk-provisional">잠정</span>}
                      <span className={`mkh-day-r mono ${r >= 50 ? "up" : "down"}`}>{r}% 상승</span>
                    </div>
                    <div className="mk2-breadth">
                      <span className="up-bar" style={{ width: `${r}%` }} />
                      <span className="down-bar" style={{ width: `${100 - r}%` }} />
                    </div>
                    {t && (
                      <div className="mkh-day-line">
                        <span className="mkh-day-k">1등 테마</span>
                        <span className="mkh-day-v">{t.theme}</span>
                        <span className={`mono ${tone(t.avg)}`}>{pct1(t.avg)}</span>
                      </div>
                    )}
                    {g && (
                      <div className="mkh-day-line">
                        <span className="mkh-day-k">1등 종목</span>
                        <span className="mkh-day-v">{g.name}</span>
                        <span className={`mono ${tone(g.chg)}`}>{pct1(g.chg)}</span>
                      </div>
                    )}
                    <span className="mkh-day-go">리포트 보기 →</span>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* ── 3. 지난 리포트 달력 ── */}
        <section className="panel stock-section">
          <h2 className="stock-h2">지난 리포트</h2>
          <p className="mk2-cap">날짜를 누르면 그날 리포트가 열려요 · 최근 날짜는 그날 분위기 색(빨강 = 오른 종목이 많았던 날, 파랑 = 내린 종목이 많았던 날)</p>
          {list.length === 0 ? (
            <p className="stock-text muted">아직 정리할 자료가 없습니다.</p>
          ) : (
            <div className="mkh-cal-wrap">
              {calendar.map((m) => (
                <div key={m.ym} className="mkh-cal">
                  <h3 className="mk-h3">{m.label}</h3>
                  <div className="mkh-cal-head">
                    {["월", "화", "수", "목", "금"].map((w) => (
                      <span key={w}>{w}</span>
                    ))}
                  </div>
                  {m.weeks.map((wk, i) => (
                    <div key={i} className="mkh-cal-row">
                      {wk.map((c, j) =>
                        !c ? (
                          <span key={j} className="mkh-cell empty" />
                        ) : c.trading ? (
                          <Link key={j} href={`/market/${c.iso}`} className="mkh-cell on" style={moodStyle(ratioBy.get(c.iso)) || undefined}>
                            {c.day}
                          </Link>
                        ) : (
                          <span key={j} className="mkh-cell off">
                            {c.day}
                          </span>
                        )
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
