// components/BriefingView.js
//
// [2026-10-29 신설] 장전 브리핑 한 편을 그리는 조각 — /briefing(최신)과 /briefing/날짜가 같이 씀.
// 자료는 lib/premarket.js가 매일 아침 만들어 저장한 것(record)을 그대로 받습니다. 서버에서 그려서 추가 비용 없음.

import Link from "next/link";
import ShareButton from "./ShareButton";
import { heat, tone } from "./MarketParts";
import { koreanDate } from "../lib/marketDay";

const MOOD = {
  up: { label: "상승 출발 기대", cls: "up" },
  down: { label: "하락 출발 우려", cls: "down" },
  mixed: { label: "혼조 · 종목별 장세", cls: "flat" },
};
const pct = (v) => (typeof v === "number" ? `${v > 0 ? "+" : ""}${v.toFixed(2)}%` : "—");
function price(v, sym) {
  if (typeof v !== "number") return "—";
  const d = sym === "KRW=X" || sym === "BTC-USD" ? 0 : 2;
  return v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function kstTime(iso) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  return new Date(t + 9 * 3600 * 1000).toISOString().slice(11, 16);
}

function Tiles({ rows, full = 3 }) {
  return (
    <div className="pmk-tiles">
      {rows.map((x) => (
        <div key={x.sym} className="pmk-tile" style={heat(x.chg, full)}>
          <span className="pmk-tile-name">{x.name}</span>
          <span className="pmk-tile-px mono">{price(x.price, x.sym)}</span>
          <span className={`pmk-tile-chg mono ${tone(x.chg)}`}>{pct(x.chg)}</span>
        </div>
      ))}
    </div>
  );
}

export default function BriefingView({ b, latest = false }) {
  const mood = MOOD[b.mood] || MOOD.mixed;
  const us = b.us || [];
  const idx = us.filter((x) => x.group === "index" || x.group === "korea");
  const stocks = us.filter((x) => x.group === "stock");
  const macro = us.filter((x) => x.group === "macro");
  const md = `${Number(b.date.slice(5, 7))}월 ${Number(b.date.slice(8, 10))}일`;

  return (
    <>
      <header className="mk2-hero pmk-hero">
        <div className="mk2-kicker">
          <span>장전 브리핑</span>
          <span className="mono">{koreanDate(b.date)}</span>
          {b.generatedAt && <span className="mono">{kstTime(b.generatedAt)} 작성</span>}
        </div>
        <h1 className="mk2-headline">{b.headline}</h1>
        <div className={`pmk-mood ${mood.cls}`}>
          <b>{mood.label}</b>
          {b.moodReason && <span>{b.moodReason}</span>}
        </div>
        {b.summary?.length > 0 && (
          <ul className="pmk-summary">
            {b.summary.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        )}
        <div className="mk2-hero-actions">
          <ShareButton title={`${md} 장전 브리핑 | 뉴스매매`} text={b.headline} path={`/briefing/${b.date}`} label="브리핑 공유하기" />
        </div>
      </header>

      {idx.length > 0 && (
        <section className="panel stock-section">
          <h2 className="stock-h2">밤사이 해외 시장</h2>
          <p className="mk2-cap">미국 정규장 마감 기준 · 색이 진할수록 많이 움직였어요</p>
          <Tiles rows={idx} />
          {stocks.length > 0 && (
            <>
              <h3 className="mk-h3 mk2-gap">미국 주요 종목</h3>
              <Tiles rows={stocks} full={5} />
            </>
          )}
          {macro.length > 0 && (
            <>
              <h3 className="mk-h3 mk2-gap">환율 · 금리 · 원자재</h3>
              <Tiles rows={macro} full={2} />
            </>
          )}
        </section>
      )}

      {/* AI가 정리한 미국장 핵심(usNotes) — 위 지표 목록(us)과 따로 저장 */}
      {(b.usNotes || []).length > 0 && (
        <section className="panel stock-section">
          <h2 className="stock-h2">미국장 핵심</h2>
          <ul className="pmk-list">
            {b.usNotes.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </section>
      )}

      {b.news?.length > 0 && (
        <section className="panel stock-section">
          <h2 className="stock-h2">주목할 뉴스</h2>
          <div className="pmk-news">
            {b.news.map((n, i) => (
              <article key={i} className="pmk-news-card">
                <span className="mk2-rank mono">{i + 1}</span>
                <div>
                  <h3>{n.title}</h3>
                  <p>{n.point}</p>
                  {n.stocks?.length > 0 && (
                    <div className="mk2-chips">
                      {n.stocks.map((s) => (
                        <Link key={s.code} href={`/stock/${s.code}`} className="mk2-chip">
                          {s.name}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {(b.themes?.length > 0 || b.stocks?.length > 0) && (
        <section className="panel stock-section mk-grid pmk-picks">
          {b.themes?.length > 0 && (
            <div>
              <h2 className="stock-h2">오늘 주목할 테마</h2>
              <div className="pmk-themes">
                {b.themes.map((t) => (
                  <Link key={t.theme} href={`/themes?theme=${encodeURIComponent(t.theme)}`} className={`pmk-theme ${t.direction === "up" ? "up" : "down"}`}>
                    <span className="pmk-theme-top">
                      <b>{t.theme}</b>
                      <span className={`pmk-dir ${t.direction === "up" ? "up" : "down"}`}>{t.direction === "up" ? "▲ 강세 기대" : "▼ 약세 우려"}</span>
                    </span>
                    <span className="pmk-theme-why">{t.reason}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
          {b.stocks?.length > 0 && (
            <div>
              <h2 className="stock-h2">주목 종목</h2>
              <ul className="pmk-stocks">
                {b.stocks.map((s) => (
                  <li key={s.code}>
                    <Link href={`/stock/${s.code}`}>{s.name}</Link>
                    <span className="mk-mkt">{s.market}</span>
                    <p>{s.reason}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {(b.risks?.length > 0 || b.checklist?.length > 0) && (
        <section className="panel stock-section mk-grid">
          {b.risks?.length > 0 && (
            <div>
              <h2 className="stock-h2">⚠️ 조심할 점</h2>
              <ul className="pmk-list">
                {b.risks.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          )}
          {b.checklist?.length > 0 && (
            <div>
              <h2 className="stock-h2">✅ 장중 체크리스트</h2>
              <ul className="pmk-list check">
                {b.checklist.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {b.prevDate && (
        <Link href={`/market/${b.prevDate}`} className="mkh-cta pmk-prev">
          어제({Number(b.prevDate.slice(5, 7))}/{Number(b.prevDate.slice(8, 10))}) 장 마감 리포트 보기 →
          <small>수급 · 테마 지도 · 급등주가 오른 이유</small>
        </Link>
      )}

      <p className="stock-disclaimer">
        이 브리핑은 밤사이 해외 시세(야후), 이 사이트 속보, 전 거래일 장 마감 자료를 바탕으로 AI가 매일 아침 자동으로 정리한 참고 자료입니다.
        틀린 내용이 있을 수 있고, 투자 권유가 아닙니다. 투자 판단과 책임은 본인에게 있습니다.
        {latest ? " 매 거래일 아침 7시 40분쯤 새로 올라옵니다." : ""}
      </p>
    </>
  );
}
