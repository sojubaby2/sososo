// app/ipo/page.js
//
// [2026-10-26 신설] 공모주 일정 페이지 — https://newsmeme.co.kr/ipo
//
// 재성님 요청: "공모주 정보를 외부 사이트로 연결되게 해놨는데, 그냥 내 사이트에 만들고
//              지속 업데이트 되도록 하는 방법은 없어?"
//
// 자료: 금융감독원 DART 증권신고서(지분증권) — lib/ipo.js가 3시간마다 자동으로 모읍니다.
// 사람이 손댈 일이 없습니다. 새 공모주가 DART에 신고되면 다음 갱신 때 저절로 나타납니다.
//
// 화면 순서:
//   1. 지금 청약 중   (가장 중요 — 호박색 테두리)
//   2. 청약 예정      (가까운 날짜부터)
//   3. 최근 청약 마감 (최근 30일, 최근 것부터)
//   4. 일정 미정      (신고서에 청약일이 아직 안 적힌 회사)
//
// 비용: 0원 (DART 무료, AI·Redis 안 씀)

import Header from "../../components/Header";
// [2026-10-26 추가] 맨 위 청약 달력(평일 5칸, 이번 달/다음 달)
import IpoCalendar from "../../components/IpoCalendar";
import { fetchIpoSchedule, statusOf, kstTodayIso } from "../../lib/ipo";

export const revalidate = 10800; // 3시간마다 새로 만듦

export const metadata = {
  title: "공모주 청약 일정 — 청약일·공모가·주관사 | 뉴스매매",
  description:
    "금융감독원 DART 증권신고서를 바탕으로 공모주 청약 일정, 공모가, 공모 규모, 주관 증권사를 3시간마다 자동으로 정리합니다.",
};

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

// "2026-11-03" → "11.03(화)"
function dayText(iso) {
  if (!iso) return "";
  const wd = new Date(`${iso}T00:00:00Z`).getUTCDay(); // 날짜만 보므로 시간대 영향 없음
  return `${iso.slice(5, 7)}.${iso.slice(8, 10)}(${WEEK[wd]})`;
}

function subRange(it) {
  if (!it.subStart) return /\d/.test(it.subText || "") ? it.subText : "미정";
  if (!it.subEnd || it.subEnd === it.subStart) return dayText(it.subStart);
  return `${dayText(it.subStart)} ~ ${dayText(it.subEnd)}`;
}

// 오늘부터 며칠 남았나
function daysUntil(iso, todayIso) {
  if (!iso) return null;
  return Math.round((new Date(`${iso}T00:00:00Z`) - new Date(`${todayIso}T00:00:00Z`)) / 86400000);
}

function won(n) {
  return typeof n === "number" ? `${Math.round(n).toLocaleString("ko-KR")}원` : "—";
}
// 공모 총액: 억 원 단위로
function eok(n) {
  if (typeof n !== "number") return "—";
  const v = n / 1e8;
  return v >= 10 ? `${Math.round(v).toLocaleString("ko-KR")}억 원` : `${v.toFixed(1)}억 원`;
}
function shares(n) {
  return typeof n === "number" ? `${Math.round(n).toLocaleString("ko-KR")}주` : "";
}

function IpoRow({ it, status, todayIso }) {
  const dDay = status === "예정" ? daysUntil(it.subStart, todayIso) : null;
  const managers = it.leadManagers.length ? it.leadManagers : it.coManagers.slice(0, 2);
  return (
    <li id={`ipo-${it.corpCode}`} className={`ipo-row ${status === "진행" ? "is-live" : ""}`}>
      <div className="ipo-name">
        <span className="ipo-corp">{it.corpName}</span>
        {it.isSpac && <span className="ipo-tag">스팩</span>}
        {status === "진행" && <span className="ipo-tag live">청약 중</span>}
        {dDay !== null && dDay >= 0 && <span className="ipo-tag dday">{dDay === 0 ? "D-day" : `D-${dDay}`}</span>}
      </div>

      <dl className="ipo-facts">
        <div>
          <dt>청약일</dt>
          <dd className="mono">{subRange(it)}</dd>
        </div>
        <div>
          <dt>공모가</dt>
          <dd className="mono">{won(it.price)}</dd>
        </div>
        <div>
          <dt>공모 규모</dt>
          <dd className="mono">
            {eok(it.totalAmount)}
            {it.shares ? <small className="ipo-shares">{shares(it.shares)}</small> : null}
          </dd>
        </div>
        <div>
          <dt>{it.leadManagers.length ? "대표 주관" : "인수"}</dt>
          <dd>{managers.length ? managers.join(", ") : "—"}</dd>
        </div>
        {it.payDate && (
          <div>
            <dt>납입일</dt>
            <dd className="mono">{dayText(it.payDate)}</dd>
          </div>
        )}
      </dl>

      <a className="ipo-link" href={it.dartUrl} target="_blank" rel="noopener noreferrer">
        신고서 원문 ↗
      </a>
    </li>
  );
}

function Section({ title, note, rows, todayIso, empty }) {
  return (
    <section className="ipo-section">
      <h2 className="ipo-h2">
        {title} <span className="ipo-count mono">{rows.length}</span>
      </h2>
      {note && <p className="ipo-note">{note}</p>}
      {rows.length ? (
        <ul className="ipo-list">
          {rows.map((r) => (
            <IpoRow key={r.it.corpCode} it={r.it} status={r.status} todayIso={todayIso} />
          ))}
        </ul>
      ) : (
        <p className="ipo-empty">{empty}</p>
      )}
    </section>
  );
}

export default async function IpoPage() {
  const data = await fetchIpoSchedule().catch((err) => ({ items: [], error: String(err?.message || err) }));
  const todayIso = kstTodayIso();
  const rows = (data.items || []).map((it) => ({ it, status: statusOf(it, todayIso) }));

  const live = rows.filter((r) => r.status === "진행").sort((a, b) => (a.it.subEnd || "").localeCompare(b.it.subEnd || ""));
  const upcoming = rows.filter((r) => r.status === "예정").sort((a, b) => a.it.subStart.localeCompare(b.it.subStart));
  const monthAgo = new Date(Date.now() - 30 * 86400000 + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const done = rows
    .filter((r) => r.status === "마감" && (r.it.subEnd || r.it.subStart) >= monthAgo)
    .sort((a, b) => (b.it.subEnd || b.it.subStart).localeCompare(a.it.subEnd || a.it.subStart));
  const unknown = rows.filter((r) => r.status === "미정");

  const updated = data.fetchedAt
    ? new Date(new Date(data.fetchedAt).getTime() + 9 * 3600 * 1000).toISOString().slice(5, 16).replace("-", ".").replace("T", " ")
    : null;

  return (
    <div>
      <Header />
      <main className="container-wide ipo-page">
        <header className="ipo-head">
          <h1 className="ipo-h1">공모주 청약 일정</h1>
          <p className="ipo-lead">
            금융감독원 DART에 올라온 증권신고서를 3시간마다 자동으로 모아 정리합니다.
            {updated && <span className="mono"> · {updated} 기준</span>}
          </p>
          <div className="ipo-summary">
            <span>
              청약 중 <b className="mono">{live.length}</b>
            </span>
            <span>
              청약 예정 <b className="mono">{upcoming.length}</b>
            </span>
            <span>
              최근 마감 <b className="mono">{done.length}</b>
            </span>
          </div>
        </header>

        {data.error && !rows.length ? (
          <p className="ipo-empty">공모주 일정을 잠시 불러오지 못했습니다. 잠시 뒤 다시 확인해 주세요.</p>
        ) : (
          <>
            {/* [2026-10-26 추가] 한눈에 보는 청약 달력 — 아래 자세한 목록은 그대로 */}
            <IpoCalendar items={data.items || []} todayIso={todayIso} />
            <Section title="지금 청약 중" rows={live} todayIso={todayIso} empty="오늘 청약 중인 공모주가 없습니다." />
            <Section title="청약 예정" rows={upcoming} todayIso={todayIso} empty="예정된 청약이 아직 없습니다." />
            <Section title="최근 청약 마감" note="최근 30일" rows={done} todayIso={todayIso} empty="최근 30일 동안 마감된 청약이 없습니다." />
            {unknown.length > 0 && (
              <Section title="일정 미정" note="신고서에 청약일이 아직 정해지지 않은 회사" rows={unknown} todayIso={todayIso} empty="" />
            )}
          </>
        )}

        <div className="ipo-foot">
          <p>
            · 공모가는 증권신고서에 적힌 값입니다. 수요예측 전에는 희망 범위 중 한 값일 수 있고, 확정되면 정정신고서가 올라와
            다음 갱신 때 자동으로 바뀝니다. 정확한 내용은 각 줄의 &ldquo;신고서 원문&rdquo;에서 확인하세요.
          </p>
          <p>· 상장 예정일은 증권신고서에 따로 정리돼 있지 않아 표시하지 않습니다.</p>
          <p>· 이 페이지는 일정 정리용이며 투자 권유가 아닙니다. 자료: 금융감독원 전자공시시스템(DART).</p>
        </div>
      </main>
    </div>
  );
}
