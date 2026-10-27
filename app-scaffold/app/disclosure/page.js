// app/disclosure/page.js
//
// [2026-10-27 신설] 공시 일정 — 재성님 요청: "주요공시 일정 같은것도 정보 가져와서 게시가능?" → "한방에 다해줘"
//
// 화면 구성
//   1. 공시 일정 달력(이번 달·다음 달) — 무상증자 기준일·권리락·신주 상장, 감자 거래정지·신주 상장,
//      자사주 매입 기간, 정기보고서 제출 마감일
//   2. 다가오는 일정 목록(앞으로 30일)
//   3. 최근 7일 주요 공시 — 종류별로 골라 보기(실적·수주·증자·자사주 …)
//
// 데이터: 금융감독원 DART(lib/disclosures.js) — 30분 저장본. 비용 0.
// 페이지도 30분마다 새로 만들어 저장합니다.

import Link from "next/link";
import Header from "../../components/Header";
import DisclosureCalendar from "../../components/DisclosureCalendar";
import DisclosureList from "../../components/DisclosureList";
import { getDisclosureData, CATEGORIES, kstTodayIso } from "../../lib/disclosures";

export const revalidate = 1800;

// [2026-10-27 변경] 카카오톡 공유 때 누르고 싶게 — 이번 주 일정 수와 오늘 공시 수를 제목·설명에 넣습니다.
// (미리보기 그림은 app/disclosure/opengraph-image.js)
export async function generateMetadata() {
  const title = "공시 일정 — 무상증자 권리락·감자·자사주 매입·주요 공시 | 뉴스매매";
  const description =
    "금융감독원 DART 공시를 바탕으로 무상증자 권리락·신주 상장일, 감자 거래정지, 자사주 매입 기간, 정기보고서 마감일과 최근 실적·수주·증자 공시를 자동으로 정리합니다.";
  let ogTitle = "이번 주 놓치면 안 되는 공시 일정 — 권리락·감자·자사주 매입";
  let ogDesc = "무상증자 권리락일, 감자 거래정지, 자사주 매입 기간과 오늘 나온 실적·수주 공시를 한눈에.";
  try {
    const data = await getDisclosureData();
    if (data) {
      const today = data.today;
      const week = data.events.filter((e) => e.code && e.date >= today && e.date <= addDays(today, 7));
      const ex = week.filter((e) => e.type === "free-ex").map((e) => e.name);
      if (week.length)
        ogTitle = `이번 주 놓치면 안 되는 공시 일정 ${week.length}건 — ${
          ex.length ? `무상증자 권리락 ${ex.slice(0, 2).join(", ")}` : "권리락·감자·자사주 매입"
        }`;
      const lastDay = data.recent[0]?.date;
      const todays = data.recent.filter((r) => r.date === lastDay);
      const earn = todays.filter((r) => r.cat === "earn").length;
      const deal = todays.filter((r) => r.cat === "deal").length;
      if (todays.length) {
        ogDesc = `${lastDay === today ? "오늘" : "최근"} 주요 공시 ${todays.length}건(실적 ${earn}·수주 ${deal}). 권리락·감자·자사주 매입 일정까지 30분마다 자동 정리.`;
      }
    }
  } catch {
    // 못 받아와도 기본 문구로
  }
  return {
    title,
    description,
    alternates: { canonical: "/disclosure" },
    openGraph: { title: ogTitle, description: ogDesc, type: "website", siteName: "뉴스매매", locale: "ko_KR" },
    twitter: { card: "summary_large_image", title: ogTitle, description: ogDesc },
  };
}

const DAY = ["일", "월", "화", "수", "목", "금", "토"];
const dayText = (iso) => `${Number(iso.slice(5, 7))}.${iso.slice(8, 10)}(${DAY[new Date(`${iso}T00:00:00Z`).getUTCDay()]})`;
function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export default async function DisclosurePage() {
  const data = await getDisclosureData().catch(() => null);
  const today = data?.today || kstTodayIso();
  const events = data?.events || [];
  const upcoming = events.filter((e) => e.date >= today && e.date <= addDays(today, 30));
  // 화면으로 보내는 양을 줄이려고 목록은 필요한 칸만
  const recent = (data?.recent || []).slice(0, 1500).map((x) => ({
    rceptNo: x.rceptNo,
    date: x.date,
    name: x.name,
    code: x.code,
    market: x.market,
    title: x.title,
    cat: x.cat,
  }));
  const cats = CATEGORIES.map(({ key, label }) => ({ key, label }));

  return (
    <div>
      <Header />
      <main className="stock-page market-page">
        <h1 className="mk-title">공시 일정 · 주요 공시</h1>
        <p className="stock-asof">
          금융감독원 DART 공시 기준 · 30분마다 갱신
          {data?.updatedAt ? ` · 마지막 갱신 ${new Date(new Date(data.updatedAt).getTime() + 9 * 3600 * 1000).toISOString().slice(11, 16)}` : ""}
        </p>

        {!data && (
          <section className="panel stock-section">
            <p className="stock-text muted">지금 DART에서 공시를 받아오지 못했습니다. 잠시 뒤 새로 고쳐 주세요.</p>
          </section>
        )}

        {data && (
          <>
            <section className="panel stock-section">
              <DisclosureCalendar events={events} todayIso={today} />
            </section>

            <section className="panel stock-section">
              <h2 className="stock-h2">다가오는 일정 (30일)</h2>
              {upcoming.length === 0 ? (
                <p className="stock-text muted">앞으로 30일 안에 잡힌 일정이 없습니다.</p>
              ) : (
                <table className="mk-table dc-upcoming">
                  <thead>
                    <tr>
                      <th>날짜</th>
                      <th>종목</th>
                      <th>일정</th>
                    </tr>
                  </thead>
                  <tbody>
                    {upcoming.map((e, i) => (
                      <tr key={`${e.rceptNo || e.label}-${e.type}-${i}`}>
                        <td className="mono" style={{ whiteSpace: "nowrap" }}>
                          {dayText(e.date)}
                        </td>
                        <td>
                          {e.code ? (
                            <Link href={`/stock/${e.code}`}>{e.name}</Link>
                          ) : (
                            <span className="muted">전체 상장사</span>
                          )}
                        </td>
                        <td>
                          {e.rceptNo ? (
                            <a href={`https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${e.rceptNo}`} target="_blank" rel="noopener noreferrer">
                              {e.label}
                            </a>
                          ) : (
                            e.label
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="panel stock-section">
              <h2 className="stock-h2">최근 7일 주요 공시</h2>
              <DisclosureList items={recent} categories={cats} />
            </section>
          </>
        )}

        <p className="stock-disclaimer">
          권리락일은 신주배정기준일 바로 전 영업일로 계산한 예상값이고, 공휴일은 반영하지 않았습니다. 정기보고서 마감일은 법정 기한(분기·반기
          45일, 사업보고서 90일)이며 주말이면 다음 영업일로 옮겼습니다. 정확한 내용은 각 공시 원문(DART)을 확인하세요. 투자 권유가 아닌 참고
          자료입니다.
        </p>
      </main>
    </div>
  );
}
