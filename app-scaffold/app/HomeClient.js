"use client";

// app/HomeClient.js
//
// [2026-10-14 분리] 원래 app/page.js였던 화면 코드입니다. 알림음, 데스크톱
// 알림, 10초마다 새 글 확인 같은 기능은 브라우저에서만 돌아갈 수 있어서
// 그대로 "use client"로 남겨두고, "처음 보여줄 뉴스를 서버가 미리 채워서
// 넘겨주는" 부분만 app/page.js로 떼어냈습니다. 바뀐 점은 딱 두 군데입니다.
//   ① initialItems(서버가 미리 가져온 기사들)를 받아 첫 화면에 바로 씁니다.
//   ② 그래서 예전처럼 "처음에 전체를 한 번 더 불러오는" 호출을 생략합니다.
// 나머지 동작은 예전과 완전히 동일합니다.

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Newspaper, Loader2, Flame, Bell, BellOff, Volume2, VolumeX, Smartphone, X, ArrowUp, Star, Search } from "lucide-react";
// [2026-10-21 추가] 뉴스 제목의 &#039; 같은 글자를 원래대로 되돌립니다.
import { decodeEntities } from "../lib/decodeEntities";
// [2026-10-21 추가] 속보를 채팅 말풍선으로 보여주는 컴포넌트.
import NewsBoard from "../components/NewsBoard";
// [2026-10-27 추가] 휴대폰 전용 속보 탭(큰 속보 카드 + 테마 지도 + 시간대별 목록) — components/MobileFeed.js
import { HourTimeline } from "../components/MobileFeed";
import MobileShorts from "../components/MobileShorts";
import MobileChat from "../components/MobileChat";
import { MOBILE_FEED } from "../lib/mobileLayout";
import ThemeRadar from "../components/ThemeRadar";
// [2026-10-27 추가] 애드센스 광고 칸(번호는 lib/ads.js)
import AdSlot from "../components/AdSlot";
import { openStockChart } from "../lib/openStockChart";
import { openStockSearch } from "../lib/openStockSearch"; // [2026-10-29] 홈 종목 검색창
import { useWatchlist } from "../lib/watchlist";
import Header from "../components/Header";
import DailyOutlookBanner from "../components/DailyOutlookBanner";
import BriefingBand from "../components/BriefingBand";
import { extractThemes } from "../lib/todayBrief";
import { isPoliticalTheme } from "../lib/themeData";
// [2026-10-27 추가] 휴대폰 전용 홈 탭(속보·시장·관심) — lib/mobileTab.js 설명 참고
import {
  HOME_TAB_REQUEST,
  tabFromHash,
  hrefForTab,
  takePendingHomeTab,
  announceHomeTab,
  announceFeedNew,
} from "../lib/mobileTab";

const HOT_THEME_COUNT = 8;
// [2026-10-26 변경 — 속보 지연 줄이기, 비용 그대로]
// 예전: 화면을 보든 안 보든 늘 10초마다 새 속보를 확인했습니다.
// 이제: 상황에 따라 확인 간격을 바꿉니다.
//   · 이 탭을 보고 있을 때          → 5초마다 (속보가 더 빨리 뜸)
//   · 다른 탭/최소화 + 알림 켜짐    → 10초마다 (예전과 같음 — 알림이 늦으면 안 되니까)
//   · 다른 탭/최소화 + 알림 꺼짐    → 60초마다 (아무도 안 보는 화면이라 아껴 둠)
//   · 다시 이 탭으로 돌아오는 순간  → 즉시 한 번 확인
// 비용: 보고 있는 탭은 확인이 2배로 늘지만, 대신 한 번에 받는 양을 30개 → 15개로
// 반으로 줄여서 주고받는 데이터 양은 예전과 같고, 안 보는 탭에서 크게 아낍니다.
// Redis 읽기는 app/api/feed/route.js의 8초 공용 저장 덕분에 방문자 수·확인 횟수와
// 상관없이 "8초에 최대 1번"이라 늘지 않습니다.
const FEED_POLL_VISIBLE_MS = 5000;
const FEED_POLL_HIDDEN_NOTIFY_MS = 10000;
const FEED_POLL_HIDDEN_MS = 60000;
// [2026-09-09 추가 / 2026-10-26 30→15] 폴링(재조회) 때는 전체 250개 대신 최근
// 몇 개만 받아옴 — 새 글은 5초 사이에 보통 0~1개라 15개면 충분히 여유 있음.
// (60초 쉬었다 돌아와도 1분에 15건 넘게 게재되는 일은 없습니다.)
// 최초 로딩 때는 이 값을 안 쓰고 기본값(250개)을 그대로 받음.
const FEED_POLL_LIMIT = 15;
const FEED_DISPLAY_CAP = 250; // 화면에 유지하는 최대 개수 — 기존 동작과 동일
const ALERT_KEYWORDS = ["공급계약", "특허", "FDA", "무상증자", "단독", "세계 최초", "국내 최초", "인수", "합병", "수주", "유상증자"];

// Short beep via Web Audio — no audio file to host/fetch. Browsers block
// audio autoplay until the user has interacted with the page at least
// once, which is exactly what clicking the toggle button provides.
function playAlertBeep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1046, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.42);
  } catch {
    // Web Audio unavailable — fail quietly, the visual toast still shows
  }
}

// Turns a saved /api/poll feed item into the shape NewsCard expects.
// [2026-09-18 추가] UTC ISO 문자열 -> 한국 시간 표기.
//
// 뉴스에 붙어 오는 시각은 세계표준시(UTC) ISO 문자열
// ("2026-09-17T23:12:00+00:00")이라 그대로 뿌리면 읽기가 힘듭니다.
// 한국 시간(UTC+9)으로 옮겨서 "2026/09/18 08:12" 형태로 보여줍니다.
//
// [2026-09-18 수정] 처음엔 오늘 뉴스면 날짜를 빼고 시각만 보여줬는데,
// 재성님 요청으로 항상 연도/월/일까지 전부 표시하도록 바꿨습니다.
//
// 서버는 UTC로 돌아가므로, 9시간을 더한 뒤 getUTC* 계열로 읽어야
// "한국 시간 기준 벽시계 값"이 나옵니다(브라우저 시간대와 무관하게 항상
// 한국 시간으로 보이게 하려는 것 — 해외에서 접속해도 동일).
function formatKoreanDateTime(iso) {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return String(iso); // 못 읽으면 원본 그대로(빈칸보단 나음)
  const kst = new Date(ms + 9 * 60 * 60 * 1000);
  const yyyy = kst.getUTCFullYear();
  const MM = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(kst.getUTCDate()).padStart(2, "0");
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  const mm = String(kst.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}/${MM}/${dd} ${hh}:${mm}`;
}

// 등락률 표시용 — 숫자가 없으면 "—"로 비웁니다.
function fmtPct(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}
function toneOf(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "flat";
  return value > 0 ? "up" : value < 0 ? "down" : "flat";
}

// [2026-10-19 변경] 세 가지를 더 넘깁니다.
//   · reasons  — 예전엔 근거를 "/"로 이어 붙인 한 줄이었는데, 카드에서
//                줄바꿈된 목록으로 보여주려고 배열 그대로 넘깁니다.
//   · theme    — 테마 이름(히트맵 거르기와 카드 표시에 씁니다).
//   · change   — 종목 등락률. 원래부터 item.matches 안에 있었는데
//                (lib/newsPipeline.js의 finalizeMatches가 붙여줍니다)
//                여기서 버려지고 있었습니다. liveQuotes가 있으면 지금
//                시세로 덮어씁니다.
// 새 속보가 들어오면 읽던 위치와 상관없이 항상 맨 아래로 따라 내려갈지.
// false로 바꾸면 맨 아래에 붙어 있을 때만 따라갑니다.


function toCardShape(item, liveQuotes) {
  const hasLegitimate = item.matches.some((m) => m.confidence === "confirmed" || m.confidence === "theme");
  const reasons = item.matches
    .map((m) => m.reason)
    .filter(Boolean)
    .slice(0, 3);
  const reason = reasons.join(" / ");
  const themes = extractThemes(item);
  // Any match Claude tagged with a confirmed negative-catalyst type (유상증자
  // 등) — surfaced once at the card level for the "악재" badge, and again
  // per-chip so it's clear exactly which stock it's about.
  const badMatch = item.matches.find((m) => m.catalyst);

  return {
    id: item.id,
    // [2026-09-18 수정] 세계표준시 원본 대신 한국 시간
    // "2026/09/18 08:12" 형태로 보여줌 (formatKoreanDateTime 참고).
    time: formatKoreanDateTime(item.pubDate),
    // [2026-10-26 추가] "3분 전"을 계산하려면 원본 시각이 필요합니다(components/NewsBoard.js).
    ts: item.pubDate,
    source: item.keyword,
    // [2026-10-21 수정] 제목·요약에 &#039; 가 그대로 보이던 문제.
    // RSS가 따옴표를 암호처럼 바꿔 보내는데 되돌리는 단계가 없었습니다.
    headline: decodeEntities(item.title),
    summary: decodeEntities(item.summary),
    link: item.link,
    confidence: hasLegitimate ? "confirmed" : "rumor",
    reason: reason || "관련 근거 정보 없음",
    badCatalyst: badMatch?.catalyst || null,
    reasons,
    theme: themes[0] || null,
    themes,
    stocks: item.matches.map((m) => {
      const live = liveQuotes?.[m.code];
      return {
        name: m.name,
        code: m.code,
        market: m.market,
        catalyst: m.catalyst || null,
        // [2026-10-28] 휴대폰 숏폼 카드에 "왜 관련주인지" 한 줄(예: 수송선 개발 주체)
        reason: m.reason || "",
        // [2026-10-29 전체 점검] 오늘 시세를 못 받은 종목은 등락률을 비워 둠 — 예전엔 기사 들어올 때 찍힌
        //   "전 거래일" 등락률(m.change)이 오늘 숫자처럼 보였음(속보 40건 밖의 오래된 기사 등).
        change: typeof live?.changePct === "number" ? live.changePct : null,
      };
    }),
  };
}

// Compact sidebar panel — a smaller reference version of what used to be a
// big colored grid across the top of the page. Toggle switches between the
// 1-week and 1-month change field from /api/theme-momentum.
// [2026-10-29 전체 점검] 패널 숫자가 몇 월 며칠 확정 시세 기준인지 보여 주기("20261028" → "10/28")
const mdOf = (d) => (/^\d{8}$/.test(String(d || "")) ? `${Number(String(d).slice(4, 6))}/${Number(String(d).slice(6, 8))}` : "");

function HotThemePanel() {
  const [rawThemes, setRawThemes] = useState([]);
  const [baseDay, setBaseDay] = useState("");
  const [state, setState] = useState("loading");
  const [range, setRange] = useState("1W"); // "1W" | "1M" — 재성님 요청으로 기본값을 1주일로 변경

  useEffect(() => {
    fetch("/api/theme-momentum")
      .then((r) => r.json())
      .then((data) => {
        if (!data.themeChanges) {
          setState("error");
          return;
        }
        setRawThemes(data.themeChanges);
        setBaseDay(mdOf(data.recentBasDt));
        setState("ready");
      })
      .catch(() => setState("error"));
  }, []);

  const field = range === "1W" ? "change1W" : "change1M";

  const themes = useMemo(() => {
    return rawThemes
      .filter((t) => typeof t[field] === "number" && !isPoliticalTheme(t.theme))
      .sort((a, b) => b[field] - a[field])
      .slice(0, HOT_THEME_COUNT);
  }, [rawThemes, field]);

  if (state === "error") return null;

  return (
    <aside className="trending-panel">
      <div className="trending-panel-header">
        <h2 className="trending-panel-title">
          <Flame size={12} style={{ color: "var(--up)" }} />
          HOT 테마
          {baseDay && <span className="trending-panel-day mono">{baseDay} 기준</span>}
        </h2>
        <div className="range-toggle">
          <button
            type="button"
            className={`range-toggle-btn ${range === "1W" ? "active" : ""}`}
            onClick={() => setRange("1W")}
          >
            1주일
          </button>
          <button
            type="button"
            className={`range-toggle-btn ${range === "1M" ? "active" : ""}`}
            onClick={() => setRange("1M")}
          >
            1개월
          </button>
        </div>
      </div>
      {state === "loading" ? (
        <p className="trending-empty">불러오는 중...</p>
      ) : (
        themes.map((t) => {
          const val = t[field];
          return (
            // [2026-09-08 추가] 재성님 요청 — HOT 테마를 누르면 "테마별
            // 종목정리"(/themes) 페이지의 그 테마로 바로 이동해서 관련
            // 종목이 보이게 함(DailyOutlookBanner의 테마 링크와 동일한 방식).
            <Link key={t.theme} href={`/themes?theme=${encodeURIComponent(t.theme)}`} className="trending-row trending-row-link">
              <span className="trending-row-name">{t.theme}</span>
              <span className="mono up" style={{ fontSize: 13, fontWeight: 700 }}>
                {val > 0 ? "+" : ""}
                {val.toFixed(1)}%
              </span>
            </Link>
          );
        })
      )}
    </aside>
  );
}

const DAILY_MOVER_COUNT = 6;
const DAILY_THEME_COUNT = 6;

// 전일(가장 최근 거래일) 하루짜리 등락률 랭킹 — HOT 테마 패널의 1주일/1개월
// 수치와는 성격이 달라서(당일 변동성이라 노이즈가 큼) 별도 패널로 분리함.
// 개별 종목 랭킹은 테마 등록 여부와 무관하게 시장 전체 대상.
function DailyMoversPanel() {
  const [movers, setMovers] = useState([]);
  const [themes, setThemes] = useState([]);
  const [state, setState] = useState("loading");
  const [baseDay, setBaseDay] = useState("");

  useEffect(() => {
    fetch("/api/theme-momentum")
      .then((r) => r.json())
      .then((data) => {
        if (!data.dailyMovers || !data.themeChanges) {
          setState("error");
          return;
        }
        setMovers(data.dailyMovers.slice(0, DAILY_MOVER_COUNT));
        setBaseDay(mdOf(data.recentBasDt));
        const topThemes = data.themeChanges
          .filter((t) => typeof t.change1D === "number" && !isPoliticalTheme(t.theme))
          .sort((a, b) => b.change1D - a.change1D)
          .slice(0, DAILY_THEME_COUNT);
        setThemes(topThemes);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, []);

  if (state === "error") return null;

  return (
    <aside className="trending-panel">
      <h2 className="trending-panel-title">
        <Flame size={12} style={{ color: "var(--up)" }} />
        {/* [2026-10-29 전체 점검] "전일"이 며칠인지 — 장 마감 뒤엔 오늘이 아니라 그 전 거래일 숫자라 헷갈렸음 */}
        {baseDay ? `${baseDay} 급등주 · 급등테마` : "전일 급등주 · 급등테마"}
      </h2>
      {state === "loading" ? (
        <p className="trending-empty">불러오는 중...</p>
      ) : (
        <>
          <p className="mover-section-label">종목</p>
          {/* [2026-10-26 변경] 종목 줄을 누르면 일봉 차트 창이 뜹니다 */}
          {movers.map((s) => (
            <button
              type="button"
              key={s.code}
              className="trending-row trending-row-btn"
              onClick={() => openStockChart({ code: s.code, name: s.name, market: s.market })}
              title={`${s.name} 일봉 차트 보기`}
            >
              <span className="trending-row-name">
                {s.name}
                <span className="trending-row-code">{s.code}</span>
              </span>
              <span className="mono up" style={{ fontSize: 13, fontWeight: 700 }}>
                {s.change > 0 ? "+" : ""}
                {s.change.toFixed(1)}%
              </span>
            </button>
          ))}
          <p className="mover-section-label">테마</p>
          {themes.map((t) => (
            <div key={t.theme} className="trending-row">
              <span className="trending-row-name">{t.theme}</span>
              <span className="mono up" style={{ fontSize: 13, fontWeight: 700 }}>
                {t.change1D > 0 ? "+" : ""}
                {t.change1D.toFixed(1)}%
              </span>
            </div>
          ))}
          {/* [2026-10-27] 날짜별 장 마감 정리 페이지로 */}
          <Link href="/market" className="panel-more-link">
            장 마감 정리 전체 보기 →
          </Link>
        </>
      )}
    </aside>
  );
}

// [2026-10-27 신설] 관심종목 칸 — 오른쪽 칸 맨 위.
// 별표(☆)로 담은 종목의 오늘 등락률(quotes: 1분마다 받아오는 값)과 종목 페이지 링크.
// 이름을 누르면 차트 창, "관심종목만 보기"를 누르면 아래 속보가 담은 종목 것만 남습니다.
function WatchPanel({ list, quotes, active, onToggleFilter, onRemove }) {
  return (
    <section className="panel watch-panel" aria-label="관심종목">
      <div className="watch-panel-head">
        <span className="panel-label" style={{ margin: 0 }}>
          <Star size={12} fill="currentColor" className="watch-star-ico" /> 관심종목
        </span>
        {list.length > 0 && (
          <button type="button" className={`watch-filter-btn ${active ? "on" : ""}`} onClick={onToggleFilter} aria-pressed={active}>
            {active ? "전체 속보 보기" : "관심종목 속보만"}
          </button>
        )}
      </div>
      {list.length === 0 ? (
        <p className="watch-empty">종목을 눌러 차트 창의 ☆ 관심종목 담기를 누르면 여기 모입니다. 이 기기에만 저장돼요.</p>
      ) : (
        <ul className="watch-list">
          {list.map((s) => {
            const q = quotes?.[s.code];
            const chg = typeof q?.changePct === "number" ? q.changePct : null;
            return (
              <li key={s.code} className="watch-row">
                <button
                  type="button"
                  className="watch-name"
                  onClick={() => openStockChart({ code: s.code, name: s.name, market: s.market })}
                  title={`${s.name} 일봉 차트 보기`}
                >
                  {s.name}
                  <span className="trending-row-code">{s.code}</span>
                </button>
                <span className={`mono watch-chg ${chg === null ? "flat" : chg > 0 ? "up" : chg < 0 ? "down" : "flat"}`}>
                  {chg === null ? "—" : `${chg > 0 ? "+" : ""}${chg.toFixed(1)}%`}
                </span>
                <Link href={`/stock/${s.code}`} className="watch-page" aria-label={`${s.name} 종목 페이지`}>
                  보기
                </Link>
                <button type="button" className="watch-remove" onClick={() => onRemove(s)} aria-label={`${s.name} 관심종목에서 빼기`}>
                  <X size={12} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// Replaces the old scrolling top ticker — everything visible at once
// instead of waiting for text to scroll by.
// [2026-10-20 삭제] GlobalMarketPanel("글로벌 시황")을 없앴습니다.
// 재성님: "이제 이거 필요가없겠네 없애버려"
// 맨 위 남색 띠의 "환율 · 금리" / "원자재" 탭이 같은 숫자를 더 많이,
// 더 정확하게(야후 기준) 보여주게 되면서 완전히 겹쳤습니다.
// 이 패널은 /api/market-ticker를 쓰던 예전 방식이었습니다.

// [2026-10-26 신설] 대표 종목 칸 — 삼성전자·SK하이닉스.
//
// 재성님 요청: "많이 불린 종목은 삭제하고, 그 위치에 삼성·하이닉스를 넣자.
//              해외 시세도 가져와서 보여주자."
//
// 각 칸에 보여주는 것:
//   · 국내 현재가·등락률 (야후, 15~20분 지연)
//   · 해외 시세 — 삼성전자는 런던 GDR, SK하이닉스는 나스닥 ADR.
//     해외 가격을 국내 1주 값(원)으로 바꾼 금액과, 그게 국내 종가보다
//     몇 % 높은지/낮은지. 밤사이 해외 반응 = 다음 날 아침 참고값입니다.
//
// 데이터는 /api/flagships(계산은 lib/flagships.js)에서 1분마다 새로 받습니다.
// 처음 뜰 때는 숫자 자리에 회색 막대를 그려 둬서, 값이 들어와도 화면이
// 출렁이지 않게 했습니다.
//
// 칸을 누르면 그 종목이 걸린 속보만 아래에 남습니다(다시 누르면 해제) —
// 예전 "많이 불린 종목" 단추가 하던 거르기 기능을 그대로 이어받았습니다.
const FLAGSHIP_POLL_MS = 60000;
const FLAGSHIP_PLACEHOLDERS = [
  { code: "005930", name: "삼성전자" },
  { code: "000660", name: "SK하이닉스" },
];

// "2026-10-26T00:04:00Z" → "09:04" (한국 시간). 오늘이 아니면 "10/24 05:00".
function kstClock(iso) {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() + 9 * 3600 * 1000);
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  const hm = `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  const sameDay = d.getUTCFullYear() === now.getUTCFullYear() && d.getUTCMonth() === now.getUTCMonth() && d.getUTCDate() === now.getUTCDate();
  return sameDay ? hm : `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${hm}`;
}
function fmtWon(v) {
  return typeof v === "number" && Number.isFinite(v) ? Math.round(v).toLocaleString("ko-KR") : "—";
}
function fmtForeign(v, currency) {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  const sign = currency === "USD" ? "$" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : "";
  const body = v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return sign ? `${sign}${body}` : `${body} ${currency || ""}`.trim();
}

function FlagshipStrip({ filter, onPick }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/flagships")
        .then((r) => r.json())
        .then((d) => { if (alive && Array.isArray(d?.items) && d.items.length) setData(d.items); })
        .catch(() => {});
    load();
    const t = setInterval(load, FLAGSHIP_POLL_MS);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const rows = data || FLAGSHIP_PLACEHOLDERS;

  return (
    <section className="flagship" aria-label="대표 종목">
      <div className="panel-label">대표 종목</div>
      <div className="flagship-list">
        {rows.map((r) => {
          const d = r.domestic;
          const a = r.abroad;
          const loading = !data;
          const pressed = filter?.kind === "stock" && filter.value === r.name;
          return (
            <button
              key={r.code}
              type="button"
              className="flag-card"
              aria-pressed={pressed}
              // [2026-10-26 변경] 누르면 일봉 차트 창이 뜹니다. 예전 기능("관련 속보만
              // 보기")은 차트 창 아래 단추로 옮겼습니다.
              onClick={() => openStockChart({ code: r.code, name: r.name, market: "코스피", onFilter: () => onPick(r.name) })}
              title={`${r.name} 일봉 차트 보기`}
            >
              <span className="flag-top">
                <span className="flag-nm">
                  {r.name}
                  <span className="flag-code mono">{r.code}</span>
                </span>
                {loading ? (
                  <span className="flag-skel flag-skel-px" />
                ) : (
                  <span className="flag-px">
                    <span className="mono">{fmtWon(d?.price)}</span>
                    <small>원</small>
                    <span className={`flag-chg mono ${toneOf(d?.changePct)}`}>{fmtPct(d?.changePct)}</span>
                  </span>
                )}
              </span>
              <span className="flag-when">{loading ? "\u00a0" : d ? `국내 ${kstClock(d.asOf)} 기준` : "국내 시세를 못 받아왔어요"}</span>

              <span className="flag-abroad">
                {loading ? (
                  <span className="flag-skel" />
                ) : a ? (
                  <>
                    <span className="flag-venue">
                      {a.venue} <b className="mono">{a.ticker}</b> <span className="mono">{fmtForeign(a.price, a.currency)}</span>
                      {/* [2026-10-28 추가] 해외 자체 등락률 — 밤사이 해외 투자자 반응 */}
                      {typeof a.changePct === "number" && <span className={`mono ${toneOf(a.changePct)}`}> {fmtPct(a.changePct)}</span>}
                      <span className="flag-when-abroad"> · {kstClock(a.asOf)}</span>
                    </span>
                    {a.krwPerShare ? (
                      <span className="flag-gap">
                        1주 환산 <span className="mono">{fmtWon(a.krwPerShare)}원</span>
                        {typeof a.gapPct === "number" && (
                          // [2026-10-28 변경] "국내 전일 종가 대비 +45%" → "국내가보다 31% 비싸게 거래 중"
                          //   (하이닉스 ADR은 원래 국내보다 30~50% 비쌈 — lib/flagships.js 설명)
                          <span className="flag-gap-pct" title="해외 가격을 국내 1주 값으로 바꿔서 국내 가격과 비교한 차이(해외 프리미엄)">
                            국내가보다 <span className="mono">{Math.abs(a.gapPct).toFixed(1)}%</span> {a.gapPct >= 0 ? "비싸게" : "싸게"} 거래 중
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="flag-gap">원화 환산은 잠시 쉬고 있어요</span>
                    )}
                  </>
                ) : (
                  <span className="flag-venue">해외 시세를 못 받아왔어요</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// [2026-10-27 신설] 휴대폰 "속보" 탭 맨 위 — 지수 한 줄. (PC에서는 안 보임)
//   맨 위 브리핑 띠(시장 탭으로 옮김)의 세계 증시 숫자를 짧게. 옆으로 밀면 더 보임.
//   [2026-10-27 오후] 테마 칩 줄은 없앴습니다 — 아래 "테마 지도"(components/MobileFeed.js)가 같은 일을 더 크게 합니다.
function MobileFeedTop({ worldIndices }) {
  const indices = Array.isArray(worldIndices?.items) ? worldIndices.items : [];
  if (!indices.length) return null;
  return (
    <div className="m-feedtop">
      <div className="m-ticker" aria-label="주요 지수">
        {indices.map((it) => (
          <span key={it.key} className="m-tk">
            <b>{String(it.label || "").split("-").pop()}</b>
            <span className="mono">
              {typeof it.close === "number" ? it.close.toLocaleString("ko-KR", { maximumFractionDigits: 2 }) : "—"}
            </span>
            <span className={`mono ${toneOf(it.changePct)}`}>{fmtPct(it.changePct)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function InstallHintBanner() {
  const [dismissed, setDismissed] = useState(true); // hidden until localStorage check to avoid a flash
  useEffect(() => {
    setDismissed(localStorage.getItem("installHintDismissed") === "1");
  }, []);

  function dismiss() {
    localStorage.setItem("installHintDismissed", "1");
    setDismissed(true);
  }

  if (dismissed) return null;
  return (
    <div className="install-hint">
      <Smartphone size={15} style={{ flexShrink: 0 }} />
      {/* [2026-10-27] 휴대폰에서만 보이는 안내라 PC 문구를 빼고 한 줄로 */}
      <span>"홈 화면에 추가"하면 앱처럼 바로 열려요.</span>
      <button type="button" className="install-hint-close" onClick={dismiss}><X size={14} /></button>
    </div>
  );
}

// [2026-10-14 추가] 사이트 설명 블록.
//
// 애드센스 심사에서 "가치 없는 콘텐츠" 판정을 받은 또 하나의 이유는, 첫
// 화면에 "이 사이트가 무엇이고 이 숫자들이 어떻게 만들어지는가"를 설명하는
// 글이 한 줄도 없었다는 점입니다. 기계가 모아온 목록만 있고 사람이 쓴
// 설명이 없는 페이지는 심사에서 불리합니다.
//
// 이 블록은 자바스크립트와 무관한 고정 글이라 서버가 보내는 첫 HTML에
// 그대로 담깁니다 — 크롤러도, 심사자도, 처음 온 방문자도 똑같이 봅니다.
//
// [2026-10-26 변경] 스타일을 인라인에서 globals.css의 .about-site로 옮겼습니다.
// 어두운 화면으로 바꾸면서 색·글꼴을 한 곳에서 관리하려고요.

function AboutSiteSection() {
  return (
    <section className="about-site">
      <h2>뉴스매매는 어떤 사이트인가요</h2>
      <p>
        장중에 속보가 하나 뜨면, 그 뉴스와 사업적으로 연결된 상장 종목을 찾아내는 데만 보통 몇 분이 걸립니다.
        기사를 읽고, 사업보고서를 떠올리고, 테마를 짚어보는 과정을 사람이 매번 반복해야 하기 때문입니다.
        뉴스매매는 그 과정을 자동화해서, 기사와 함께 관련 종목을 바로 보여주는 것을 목표로 만든 사이트입니다.
      </p>
      <h3>관련주는 어떻게 고르나요</h3>
      <p>
        기사 제목과 요약에서 먼저 기업명이 직접 언급됐는지를 찾습니다. 그다음 기사에 등장한 제품·기술·사건과
        연결되는 테마를 추려, 그 테마에 속한 종목들을 후보로 올립니다. 마지막으로 그 후보들 가운데 기사 내용과
        실제로 연결되는 종목만 남깁니다. 종목마다 왜 붙었는지를 한 줄로 같이 적어두는 이유가 여기 있습니다 —
        근거 없이 종목 이름만 나열하면 읽는 사람이 판단할 수가 없기 때문입니다.
      </p>
      <h3>무엇을 보여주지 않나요</h3>
      <p>
        목표 주가, 매수·매도 의견, 수익률 전망은 제공하지 않습니다. 이 사이트가 보여주는 것은 &ldquo;이 뉴스와
        이 종목이 이런 이유로 연결되어 있다&rdquo;는 사실 관계까지이며, 그 종목이 오를지 내릴지에 대한 판단은
        담지 않습니다. 관련주로 표시됐다는 것이 주가 상승을 뜻하지 않는다는 점을 분명히 해둡니다.
      </p>
      <h3>다른 메뉴들</h3>
      <p>
        <Link href="/patterns">패턴검색</Link>은 국내 상장 종목의 최근 시세 흐름을 차트 패턴과 대조해 비슷한
        모양이 나타난 종목을 모아 보여줍니다. <Link href="/themes">테마별 종목정리</Link>는 테마마다 어떤 종목이
        묶여 있는지와 기간별 등락률을 정리한 표입니다. <Link href="/blog">칼럼</Link>에는 튤립 버블부터 최근
        금융 사고까지 경제사에서 실제로 벌어진 일들을 한 편씩 풀어 쓴 글을 모아두었습니다. 투자 조언이 아니라
        읽을거리로 쓴 글들입니다.
      </p>
    </section>
  );
}

export default function HomeClient({ initialItems = [], worldIndices: worldIndicesInit = null, brief = null, liveQuotes = {}, strip = null }) {
  // [2026-10-29 전체 점검] 홈 화면은 미리 만들어 둔 화면을 보여 주는데, 한동안 방문자가 없으면 첫 방문자에게
  //   몇 시간 전 화면이 나갈 수 있음(오후 5시 19분에 코스피가 오후 장중 값 5,968로 보였음). 그래서 화면이 뜬 뒤
  //   세계 지수를 한 번 새로 받아 덮어쓰고, 보고 있는 동안 5분마다 다시 받음(서버가 5분 저장 — 비용 0).
  const [worldIndices, setWorldIndices] = useState(worldIndicesInit);
  useEffect(() => {
    let alive = true;
    const load = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      fetch("/api/world-indices?v=4")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (alive && Array.isArray(d?.items) && d.items.length) setWorldIndices(d);
        })
        .catch(() => {});
    };
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  // [2026-10-14 변경] 서버(app/page.js)가 미리 가져다 준 기사들로 시작합니다.
  // 예전에는 빈 배열로 시작해서 브라우저가 불러올 때까지 화면이 비어 있었고,
  // 그 빈 화면이 크롤러에게 그대로 노출됐습니다.
  const [rawItems, setRawItems] = useState(initialItems);
  const [loadState, setLoadState] = useState(initialItems.length > 0 ? "ready" : "loading");
  const [newIds, setNewIds] = useState(new Set());
  const [toast, setToast] = useState(null); // { count, headline } | null
  const [soundEnabled, setSoundEnabled] = useState(false);
  // [2026-09-08 추가] 재성님 요청 — 사이트 안에서 뜨는 우측 하단 토스트(위
  // .new-toast, 이건 그대로 둠)와는 별개로, 윈도우 화면 자체의 우측 하단에
  // 뜨는 OS 알림(브라우저 Notification API)도 추가함. 이 사이트 탭이 다른
  // 창에 가려져 있거나 최소화돼 있어도 뜨는 게 핵심 차이 — 브라우저가 열려있기만
  // 하면 됨(브라우저 자체가 꺼져 있을 때도 뜨게 하려면 서비스워커 + 웹푸시
  // 구독/서버 발송까지 만들어야 하는 훨씬 큰 작업이라, 일단은 "탭이
  // 열려있는 동안" 범위로 구현함). 브라우저 정책상 사용자가 버튼을 눌러
  // 명시적으로 허용해야만 알림을 띄울 수 있어서 토글 버튼으로 만듦.
  const [notifyEnabled, setNotifyEnabled] = useState(false);
  // 서버가 넘겨준 기사들의 id를 "이미 아는 글"로 등록해둡니다 — 이게 없으면
  // 첫 확인 때 이미 보고 있는 글들이 전부 "새 글"로 잡혀서 알림이
  // 한꺼번에 울립니다.
  const knownIdsRef = useRef(new Set(initialItems.map((it) => it.id)));
  const toastTimerRef = useRef(null);
  const newIdsTimerRef = useRef(null);
  const soundEnabledRef = useRef(false);
  const notifyEnabledRef = useRef(false);

  function toggleSound() {
    const next = !soundEnabled;
    setSoundEnabled(next);
    soundEnabledRef.current = next;
    if (next) playAlertBeep(); // confirms it's on AND unlocks autoplay for later
  }

  // 이전에 켜둔 적이 있으면(로컬 저장소) 자동으로 다시 켜줌 — 단, 그 사이에
  // 사용자가 브라우저 설정에서 알림 권한을 직접 껐다면(Notification.permission
  // 이 더 이상 "granted"가 아니면) 존중해서 꺼진 채로 둠.
  useEffect(() => {
    if (typeof window === "undefined" || typeof Notification === "undefined") return;
    const wantedOn = localStorage.getItem("browserNotifyEnabled") === "1";
    if (wantedOn && Notification.permission === "granted") {
      setNotifyEnabled(true);
      notifyEnabledRef.current = true;
    }
  }, []);

  function toggleNotify() {
    if (typeof Notification === "undefined") {
      alert("이 브라우저는 데스크톱 알림 기능을 지원하지 않아요.");
      return;
    }
    if (notifyEnabled) {
      setNotifyEnabled(false);
      notifyEnabledRef.current = false;
      localStorage.setItem("browserNotifyEnabled", "0");
      return;
    }
    Notification.requestPermission().then((perm) => {
      if (perm !== "granted") return; // 사용자가 거부했거나 닫음 — 꺼진 채로 둠
      setNotifyEnabled(true);
      notifyEnabledRef.current = true;
      localStorage.setItem("browserNotifyEnabled", "1");
      // 켜지자마자 확인용 알림 한 번 — "정말 뜨는구나"를 바로 확인시켜줌.
      new Notification("데스크톱 알림이 켜졌어요", {
        body: "새 소식이 올라오면 이렇게 화면 알림으로 알려드릴게요.",
        icon: "/icon-192.png",
      });
    });
  }

  // [2026-09-09 추가] isFirstLoad가 아닐 땐(=폴링) items가 이제 전체
  // 목록이 아니라 최근 FEED_POLL_LIMIT개짜리 "작은 조각"임 — 그래서 예전처럼
  // setRawItems(items)로 통째로 갈아끼우면 화면에 보이던 나머지 글들이
  // 사라져버림. 대신 기존 목록(prev)에 새로 온 조각을 병합하고, 최신순으로
  // 다시 정렬한 다음 FEED_DISPLAY_CAP개까지만 유지함 — 화면에 보이는 개수는
  // 예전과 동일하게 유지되면서 서버에서 매번 받아오는 양만 줄어듦.
  function applyFeed(items, isFirstLoad) {
    const incomingIds = items.map((it) => it.id);
    if (!isFirstLoad) {
      const freshIds = incomingIds.filter((id) => !knownIdsRef.current.has(id));
      if (freshIds.length > 0) {
        setNewIds(new Set(freshIds));
        const freshItems = items.filter((it) => freshIds.includes(it.id));
        const latest = freshItems[0];
        setToast({ count: freshIds.length, headline: decodeEntities(latest?.title || "") });
        clearTimeout(newIdsTimerRef.current);
        newIdsTimerRef.current = setTimeout(() => setNewIds(new Set()), 4000);
        clearTimeout(toastTimerRef.current);
        toastTimerRef.current = setTimeout(() => setToast(null), 4500);

        if (soundEnabledRef.current) {
          const hasKeywordHit = freshItems.some((it) => ALERT_KEYWORDS.some((k) => it.title?.includes(k)));
          if (hasKeywordHit) playAlertBeep();
        }

        // [2026-09-08 추가] 기존 우측 하단 인앱 토스트(위 setToast)는 그대로
        // 두고, 그 옆에 윈도우 자체의 데스크톱 알림도 띄움 — tag를 고정값으로
        // 줘서 폴링이 연달아 새 글을 여러 번 감지해도 알림이 계속 쌓이지
        // 않고 마지막 것으로 교체되게 함.
        if (notifyEnabledRef.current && typeof Notification !== "undefined" && Notification.permission === "granted") {
          const notifTitle = freshIds.length > 1 ? `새 소식 ${freshIds.length}건 도착` : latest?.title || "새 소식 도착";
          const notifBody = freshIds.length > 1 ? latest?.title || "" : latest?.summary || "";
          const n = new Notification(notifTitle, {
            body: notifBody,
            icon: "/icon-192.png",
            tag: "newsmeme-feed",
          });
          n.onclick = () => {
            window.focus();
            n.close();
          };
        }
      }
    }

    if (isFirstLoad) {
      knownIdsRef.current = new Set(incomingIds);
      setRawItems(items);
      return;
    }

    setRawItems((prev) => {
      const byId = new Map(prev.map((it) => [it.id, it]));
      for (const it of items) byId.set(it.id, it);
      const merged = Array.from(byId.values()).sort(
        (a, b) => new Date(b.savedAt || b.pubDate || 0) - new Date(a.savedAt || a.pubDate || 0)
      );
      const capped = merged.slice(0, FEED_DISPLAY_CAP);
      knownIdsRef.current = new Set(capped.map((it) => it.id));
      return capped;
    });
  }

  useEffect(() => {
    let cancelled = false;

    function load(isFirstLoad) {
      const url = isFirstLoad ? "/api/feed" : `/api/feed?limit=${FEED_POLL_LIMIT}`;
      fetch(url)
        .then((r) => r.json())
        .then((data) => {
          if (cancelled) return;
          if (data.error) {
            setLoadState("error");
            return;
          }
          applyFeed(data.items || [], isFirstLoad);
          setLoadState("ready");
        })
        .catch(() => {
          if (!cancelled) setLoadState("error");
        });
    }

    // [2026-10-14 변경] 서버가 이미 기사를 채워줬다면 처음에 전체를 다시
    // 불러올 이유가 없습니다 — 그래서 바로 주기 확인만 시작합니다.
    // (이 한 줄이 방문자 한 명당 서버 호출 한 번을 통째로 없애줍니다.)
    // 서버 쪽에서 못 가져왔을 때만 예전처럼 전체를 불러옵니다.
    if (initialItems.length === 0) load(true);

    // [2026-10-26 변경] setInterval(늘 같은 간격) 대신 "한 번 확인 → 다음
    // 확인 예약"을 반복합니다. 그래야 탭을 보고 있는지에 따라 간격을 바꿀 수
    // 있습니다(간격은 맨 위 FEED_POLL_* 설명 참고).
    //
    // 첫 확인은 1초 뒤에 합니다. 첫 화면은 서버가 최대 1분 전에 만들어 둔
    // 것이라, 예전처럼 10초를 기다리면 방문자가 1분 넘게 지난 목록을 보고
    // 있을 수 있었습니다. 확인 횟수는 그대로이고 "첫 확인 시점"만 당긴 것입니다.
    let timer = null;
    function nextDelay() {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return notifyEnabledRef.current ? FEED_POLL_HIDDEN_NOTIFY_MS : FEED_POLL_HIDDEN_MS;
      }
      return FEED_POLL_VISIBLE_MS;
    }
    function schedule(ms) {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (cancelled) return;
        load(false);
        schedule(nextDelay());
      }, ms);
    }
    schedule(1000);

    // 다른 탭에 있다가 이 탭으로 돌아오면, 남은 대기시간(최대 60초)을 기다리지
    // 않고 바로 확인합니다. 숨겨질 때는 다음 확인을 긴 간격으로 다시 예약합니다.
    function onVisibility() {
      if (document.visibilityState === "visible") schedule(0);
      else schedule(nextDelay());
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      clearTimeout(toastTimerRef.current);
      clearTimeout(newIdsTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // [2026-10-26 추가] 칩 등락률을 "오늘 값"으로 계속 맞추기.
  // 재성님 질문: "종목을 누르기 전 등락률과 눌렀을 때 등락률이 왜 다르냐"
  //   → 페이지를 연 뒤 들어온 속보는 오늘 시세가 없어서 기사 들어올 때 찍힌
  //     KRX 값(= 전 거래일 등락률)이 보이고 있었습니다(app/api/live-quotes 주석 참고).
  // 이제 화면을 보고 있는 동안 1분마다, 그리고 새 속보가 들어올 때 위쪽 속보 40건에
  // 붙은 종목들의 오늘 등락률을 다시 받아 덮어씁니다. 서버가 처음 넣어준 값(liveQuotes)에서 시작.
  const [quotesNow, setQuotesNow] = useState(liveQuotes);
  // [2026-10-27 수정] 재성님 질문: "지앤비에스 에코 칩 -1.8%인데 눌러 보면 +3.31%"
  //   원인: 속보 40건에 붙은 종목이 88개였는데 한 번에 60개까지만 물어봤고, 그 60개를
  //   "종목코드 번호 순"으로 골랐습니다. 번호가 뒤쪽인 종목(382800 등)은 아예 안 물어봐서
  //   기사 들어올 때 찍힌 어제 등락률이 그대로 남아 있었습니다.
  //   → 최신 기사에 붙은 종목부터 순서대로, 50개씩 나눠서 빠짐없이 물어봅니다.
  //     (주소가 같으면 1분 동안 공용으로 저장되고, 야후 값은 서버에서 5분 저장 — 비용 0원)
  const QUOTE_CHUNK = 50;
  // [2026-10-27] 관심종목(별표로 담은 종목)도 오늘 등락률을 받아옵니다 — 맨 앞에 넣어 항상 포함.
  const watch = useWatchlist();
  const watchKey = watch.list.map((s) => `${s.code}.${String(s.market || "").includes("닥") ? "KQ" : "KS"}`).join(",");
  const quoteKeys = useMemo(() => {
    const syms = [];
    const seen = new Set();
    for (const sym of watchKey ? watchKey.split(",") : []) {
      if (seen.has(sym)) continue;
      seen.add(sym);
      syms.push(sym);
    }
    for (const it of rawItems.slice(0, 40)) {
      for (const m of it.matches || []) {
        if (!/^[0-9A-Z]{6}$/i.test(m.code || "")) continue;
        const sym = `${m.code.toUpperCase()}.${String(m.market || "").includes("닥") ? "KQ" : "KS"}`;
        if (seen.has(sym)) continue;
        seen.add(sym);
        syms.push(sym);
      }
    }
    const chunks = [];
    for (let i = 0; i < syms.length; i += QUOTE_CHUNK) chunks.push(syms.slice(i, i + QUOTE_CHUNK).join(","));
    return chunks;
  }, [rawItems, watchKey]);
  const quoteKey = quoteKeys.join("|"); // 목록이 바뀌었는지 알아보는 용도
  useEffect(() => {
    if (!quoteKey) return;
    let alive = true;
    const load = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      for (const key of quoteKeys) {
        fetch(`/api/live-quotes?s=${encodeURIComponent(key)}`)
          .then((r) => r.json())
          .then((d) => {
            if (alive && d?.quotes && Object.keys(d.quotes).length) setQuotesNow((cur) => ({ ...cur, ...d.quotes }));
          })
          .catch(() => {});
      }
    };
    load(); // 종목 목록이 바뀌면(새 속보) 바로 한 번
    const t = setInterval(load, 60000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [quoteKey]);

  const items = useMemo(() => rawItems.map((it) => toCardShape(it, quotesNow)), [rawItems, quotesNow]);

  // [2026-10-19 추가] 테마나 종목을 누르면 아래 속보를 그것만 남깁니다.
  // filter: null | { kind: "theme" | "stock" | "watch", value: "해운" }
  //   [2026-10-27] kind "watch" = 관심종목에 담은 종목이 걸린 속보만
  const [filter, setFilter] = useState(null);

  function toggleFilter(kind, value) {
    setFilter((cur) => (cur && cur.kind === kind && cur.value === value ? null : { kind, value }));
  }

  // ── [2026-10-27 신설] 휴대폰 전용 홈 탭: "feed"(속보) | "market"(시장) | "watch"(관심) ──
  // 재성님: "pc 배치를 아예 벗어나서 새롭고 혁신적이게 모바일 전용 ui배치를 해보는건 어때?"
  // 탭을 바꾸면 겉의 class(m-feed / m-market / m-watch)만 바뀌고, 어느 칸을 보일지는
  // globals.css의 "휴대폰 앱형 화면" 부분이 정합니다. 그래서 PC 화면(761px 이상)은 전혀 영향이 없습니다.
  // 모든 칸이 늘 화면 코드 안에 들어 있어서(숨김만) 검색엔진이 읽는 내용도 그대로입니다.
  const [mTab, setMTab] = useState("feed");
  const mTabRef = useRef("feed");

  function switchTab(tab, { scrollTop = true } = {}) {
    if (mTabRef.current === tab) {
      // 같은 탭을 다시 누르면 맨 위로(증권 앱과 같은 동작). 속보 탭(숏폼)은 첫 카드로.
      if (tab === "feed") window.dispatchEvent(new Event("nm-shorts-top"));
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    mTabRef.current = tab;
    setMTab(tab);
    try {
      window.history.replaceState(window.history.state, "", hrefForTab(tab));
    } catch {
      // 주소 바꾸기가 막힌 환경 — 화면만 바꿈
    }
    if (scrollTop) window.scrollTo(0, 0);
  }

  // 처음 열 때(주소 끝 #market 등) + 아래 탭 줄에서 오는 신호 + 뒤로 가기
  useEffect(() => {
    const first = takePendingHomeTab() || tabFromHash(window.location.hash);
    if (first !== "feed") {
      mTabRef.current = first;
      setMTab(first);
    }
    const onRequest = (e) => switchTab(e.detail || "feed");
    const onHash = () => {
      const t = tabFromHash(window.location.hash);
      mTabRef.current = t;
      setMTab(t);
    };
    window.addEventListener(HOME_TAB_REQUEST, onRequest);
    window.addEventListener("hashchange", onHash);
    return () => {
      window.removeEventListener(HOME_TAB_REQUEST, onRequest);
      window.removeEventListener("hashchange", onHash);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 탭이 바뀌면: 아래 탭 줄에 알리고, 관심 탭이면 관심종목 속보만 남기기
  useEffect(() => {
    announceHomeTab(mTab);
    if (mTab === "watch") setFilter({ kind: "watch", value: "관심종목" });
    else setFilter((cur) => (cur?.kind === "watch" ? null : cur));
  }, [mTab]);

  // [2026-10-28] 휴대폰 속보 탭(숏폼, components/MobileShorts.js)이 걸러 볼 테마·종목과 바로 넘어갈 카드
  //   shortsFilter: null | { kind: "theme" | "stock", value }
  const [shortsFilter, setShortsFilter] = useState(null);
  const [shortsFocus, setShortsFocus] = useState(null);

  // 테마 탭에서 대표 종목 "관련 속보만 보기"를 누르면 → 속보 탭으로 넘어가서 보여 줌
  function filterAndShow(kind, value) {
    toggleFilter(kind, value);
    if (mTabRef.current === "market") {
      setShortsFilter({ kind, value });
      switchTab("feed");
    }
  }

  // 테마 탭(레이더)에서 테마의 속보를 보러 갈 때 — id가 있으면 그 카드로 바로
  function openThemeShorts(theme, id) {
    setShortsFilter({ kind: "theme", value: theme });
    setShortsFocus(id || null);
    switchTab("feed");
  }

  const visible = useMemo(() => {
    if (!filter) return items;
    if (filter.kind === "theme") return items.filter((n) => n.themes?.includes(filter.value));
    if (filter.kind === "watch") {
      const codes = new Set(watch.list.map((s) => s.code));
      return items.filter((n) => n.stocks?.some((s) => codes.has(s.code)));
    }
    return items.filter((n) => n.stocks?.some((s) => s.name === filter.value));
  }, [items, filter, watch.list]);

  // ── [2026-10-26 변경] 채팅방 → "헤드라인 + 테이프" (components/NewsBoard.js) ──
  //
  // 재성님: "채팅방 컨셉이 스크롤 내리는 게 불편하고 시인성이 안 나온다".
  // 최신이 맨 위로 오고, 속보 칸 안의 따로 스크롤이 없어졌습니다.
  //
  // 그래서 예전 "최신 속보 보기 ↓" 단추는 방향이 바뀌었습니다:
  //   아래로 내려가서 지난 속보를 읽는 중에 새 속보가 들어오면
  //   속보 칸 위쪽에 "↑ 새 속보 N건" 단추가 떠서, 누르면 맨 위로 올라갑니다.
  //   속보 칸 맨 위가 화면에 보이는 상태면 단추를 띄우지 않습니다(이미 보이니까).
  const feedTopRef = useRef(null);
  const [unseen, setUnseen] = useState(0);

  function feedTopVisible() {
    const el = feedTopRef.current;
    if (!el) return true;
    return el.getBoundingClientRect().top > -40;
  }

  // 새 속보가 들어온 순간(newIds가 채워짐) 화면이 아래쪽이면 숫자를 올립니다.
  useEffect(() => {
    if (newIds.size === 0) return;
    // [2026-10-27] 휴대폰에서 시장·관심 탭을 보는 중이면 아래 탭 줄 "속보"에 숫자를 띄웁니다.
    if (mTabRef.current !== "feed") {
      announceFeedNew(newIds.size);
      return;
    }
    if (!feedTopVisible()) setUnseen((c) => c + newIds.size);
  }, [newIds]);

  // 스크롤해서 다시 맨 위가 보이면 숫자를 지웁니다.
  useEffect(() => {
    function onScroll() {
      if (feedTopVisible()) setUnseen(0);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function goFeedTop() {
    const el = feedTopRef.current;
    if (el) window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - 72, behavior: "smooth" });
    setUnseen(0);
  }

  // [2026-10-26 삭제] "오늘 많이 불린 종목" 계산(topStocks)을 없앴습니다.
  // 재성님 요청으로 그 자리에 대표 종목(삼성전자·SK하이닉스) 칸이 들어갔습니다.

  return (
    <div className={`home-app m-${mTab}`}>
      <Header />

      {/* [2026-10-19 신설] 남색 브리핑 밴드 — 오늘을 한 문장으로 요약하고,
          테마 히트맵과 세계 지수 띠를 함께 보여줍니다. 지도는 배경입니다.
          예전 components/WorldMarketMap.js(네모난 지도 위젯)가 여기로 흡수됐습니다. */}
      <BriefingBand
        brief={brief}
        worldIndices={worldIndices}
        strip={strip}
        activeTheme={filter?.kind === "theme" ? filter.value : null}
        onThemeClick={(t) => toggleFilter("theme", t)}
      />

      {/* [2026-10-26 전면 개편] 3칸 배치 — 왼쪽(예측·HOT 테마) / 가운데(속보) /
          오른쪽(대표 종목·전일 급등주). 스타일 설명은 app/globals.css의
          "홈 화면 — 어두운 터미널형 3칸 배치" 부분에 있습니다. */}
      <main className="container-wide home-main">
        {/* [2026-10-27] 휴대폰 지수 한 줄 (PC에서는 안 보임) — [2026-10-28] 속보 탭에서 테마 탭 맨 위로 옮김 */}
        <MobileFeedTop worldIndices={worldIndices} />
        <InstallHintBanner />
        {/* [2026-10-28] 휴대폰 속보 탭 — 모양은 lib/mobileLayout.js의 MOBILE_FEED로 고름
              "chat"   = C. 속보 채널(채팅방처럼 아래로 쌓임, components/MobileChat.js)
              "shorts" = A. 숏폼 속보(속보 한 건이 화면 하나, components/MobileShorts.js)
            재성님: "c형으로 한번적용 해봐도돼? 맘에안들면 다시 a+b로 올게". PC에서는 둘 다 그려지지 않습니다. */}
        {MOBILE_FEED === "chat" ? (
          <MobileChat
            items={items}
            newIds={newIds}
            filter={shortsFilter}
            onFilter={setShortsFilter}
            focusId={shortsFocus}
            onFocused={() => setShortsFocus(null)}
            soundEnabled={soundEnabled}
            onToggleSound={toggleSound}
          />
        ) : (
          <MobileShorts
            items={items}
            newIds={newIds}
            filter={shortsFilter}
            onFilter={setShortsFilter}
            focusId={shortsFocus}
            onFocused={() => setShortsFocus(null)}
          />
        )}
        {/* [2026-10-28] 휴대폰 테마 탭 맨 위: 테마 레이더 (components/ThemeRadar.js) */}
        <div className="m-radar-wrap">
          <ThemeRadar items={items} onOpen={openThemeShorts} goText={MOBILE_FEED === "chat" ? "모아보기" : "넘겨보기"} />
        </div>

        <div className="home-grid">
          {/* ── 왼쪽 칸 ── */}
          <aside className="home-col home-left" aria-label="오늘의 예측과 광고">
            <DailyOutlookBanner />
            {/* [2026-10-28] 재성님: "이쪽 칸 비우고 광고로 넣는게 낫지않아?" → 이어서
                "hot테마를 아예 오른쪽으로 배치해버리면 안되나? 왼쪽 공간에는 지금처럼 긴 광고를 2개정도 넣고"
                → HOT 테마는 오른쪽 칸(대표 종목 아래)으로 옮기고, 왼쪽은 오늘의 예측 + 광고 2개.
                PC·태블릿에서만(휴대폰 시장 탭에는 대표 종목 아래 광고가 따로 있음).
                광고가 화면을 따라다니면 애드센스 정책 위반이라, 이 왼쪽 칸은 스크롤하면 같이 올라가게 바꿈(globals.css).
                두 번째 광고는 아래로 내려 거기까지 왔을 때만 불러옵니다(지연 불러오기). */}
            {/* [2026-10-29 변경] 재성님: "왼쪽사이드 광고중 위에꺼를 앵커로 대체하고 아래꺼는 그대로 두고"
                → 광고 1개는 그대로(스크롤하면 같이 올라감), 다른 1개는 화면을 따라다니는 광고로.
                따라다니는 광고가 그대로인 광고를 덮으면 안 되므로, 그대로인 광고를 위에 두고 따라다니는 광고를 그 아래에 둠
                (내려가다 이 광고 자리에 닿으면 그때부터 화면 위쪽에 붙어 따라옴).
                따라다니는 광고는 한 화면에 1개만 — 구글 아래쪽 앵커 광고가 떠 있는 동안에는 따라다니지 않고 제자리에 있음
                (components/AnchorAdSpacer.js가 앵커가 떠 있는지 보고 html에 nm-anchor-on 표시를 붙임, globals.css 참고).
                넓은 PC(3칸 화면)에서만 따라다니고, 노트북·태블릿에선 그냥 제자리 광고. */}
            <div className="desk-only home-side-ad">
              <AdSlot kind="display" />
            </div>
            <div className="desk-only home-side-ad home-side-ad2 home-side-sticky">
              <AdSlot kind="display" />
            </div>
          </aside>

          {/* ── 가운데 칸: 실시간 속보 ── */}
          <section className="home-col home-center" aria-label="실시간 속보">
            {/* [2026-10-29 추가] 종목 검색창 — 재성님: "홈에서 종목 검색도 할수있는걸 하나 만들어줘"
                누르면 검색 창(components/StockSearch.js)이 열림. 휴대폰은 위 머리띠의 돋보기 단추를 씀 */}
            <button type="button" className="home-search desk-only" onClick={() => openStockSearch()}>
              <Search size={18} />
              <span>종목명 · 초성 · 테마로 검색 — 관련 속보와 차트를 바로 확인</span>
              <kbd>/</kbd>
            </button>
            <div className="panel feed-panel">
              <div className="live-head" ref={feedTopRef}>
                {/* 화면의 대표 제목(h1) — 검색엔진과 화면 읽기 프로그램이 "이 페이지는
                    실시간 속보"라고 알아보게 합니다. 예전엔 페이지에 h1이 없었습니다. */}
                <h1>
                  <span className="live-dot" />
                  {/* [2026-10-27] 휴대폰 "관심" 탭에서는 제목을 "관심종목 속보"로 */}
                  {mTab === "watch" ? "관심종목 속보" : "실시간 속보"}
                </h1>
                <span className="stories-count">
                  {filter ? `${visible.length}건 / 전체 ${items.length}건` : `${items.length}건`}
                </span>
                {/* 예전 채팅방 맨 아래 "새 속보 받는 중" 점 세 개를 머리로 옮겼습니다 */}
                <span className="nb-waiting" role="status" aria-label="새 속보를 기다리는 중">
                  <span className="nb-dots" aria-hidden="true"><i /><i /><i /></span>
                  새 속보 받는 중
                </span>
                <div className="watch-toggles">
                  {/* [2026-10-27] 휴대폰에서는 글자를 숨기고 아이콘만(.toggle-label) — 첫 화면 공간 확보 */}
                  <button
                    type="button"
                    className={`sound-toggle ${soundEnabled ? "on" : ""}`}
                    onClick={toggleSound}
                    aria-label={`알림음 ${soundEnabled ? "켜짐" : "꺼짐"}`}
                    title={`알림음 ${soundEnabled ? "켜짐" : "꺼짐"}`}
                  >
                    {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
                    <span className="toggle-label">알림음 {soundEnabled ? "켜짐" : "꺼짐"}</span>
                  </button>
                  <button
                    type="button"
                    className={`sound-toggle ${notifyEnabled ? "on" : ""}`}
                    onClick={toggleNotify}
                    aria-label={`데스크톱 알림 ${notifyEnabled ? "켜짐" : "꺼짐"}`}
                    title={`데스크톱 알림 ${notifyEnabled ? "켜짐" : "꺼짐"}`}
                  >
                    {notifyEnabled ? <Bell size={14} /> : <BellOff size={14} />}
                    <span className="toggle-label">데스크톱 알림 {notifyEnabled ? "켜짐" : "꺼짐"}</span>
                  </button>
                  {filter && (
                    <button type="button" className="clear-filter" onClick={() => setFilter(null)}>
                      필터 해제 · {filter.value} ✕
                    </button>
                  )}
                </div>
              </div>


              {loadState === "loading" && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--ink-muted)", fontSize: 14, padding: "24px 0" }}>
                  <Loader2 size={16} />
                  불러오는 중...
                </div>
              )}

              {loadState === "error" && (
                <p style={{ fontSize: 13, color: "var(--amber-tint-ink)", background: "var(--amber-tint)", padding: "8px 12px", borderRadius: 8 }}>
                  피드를 불러오지 못했습니다. Redis(Upstash) 환경변수 설정을 확인해주세요.
                </p>
              )}

              {loadState === "ready" && items.length === 0 && (
                <p style={{ fontSize: 14, color: "var(--ink-muted)", padding: "24px 0" }}>
                  아직 자동 수집된 뉴스가 없어요. 스케줄러가 연결되면 여기 자동으로 쌓이기 시작해요.
                </p>
              )}

              {/* [2026-10-26] 새 속보 알림 단추 — 아래로 내려가 있을 때만 뜹니다. */}
              {unseen > 0 && (
                <button type="button" className="nb-newpill" onClick={goFeedTop}>
                  <ArrowUp size={14} />
                  새 속보 {unseen}건
                </button>
              )}

              {/* [2026-10-26] 속보 본문 — 헤드라인 + 테이프 (components/NewsBoard.js) */}
              {/* PC: 헤드라인 + 테이프 / 휴대폰: 시간대별 묶음 목록(components/MobileFeed.js) */}
              <div className="desk-only">
                {/* [2026-10-28] PC 속보 목록 사이는 일반 광고(인피드 광고 단위는 휴대폰 모양으로 만들어서) */}
                {/* [2026-10-29] 큰 상품 광고가 화면 반을 덮어 거슬린다는 재성님 의견 → 가로 띠 광고(banner)로 납작하게 */}
                <NewsBoard items={visible} newIds={newIds} ad={<AdSlot kind="display" banner className="ad-in-feed" />} />
              </div>
              <HourTimeline
                items={visible}
                newIds={newIds}
                filterKey={filter ? `${filter.kind}:${filter.value}` : ""}
                ad={<AdSlot kind="inFeed" className="ad-in-feed" />}
              />

              {filter && visible.length === 0 && (
                <p className="feed-empty" style={{ fontSize: 14, color: "var(--ink-muted)", padding: "24px 0" }}>
                  {filter.value}에 해당하는 속보가 아직 없습니다.{" "}
                  <button type="button" className="clear-filter" onClick={() => setFilter(null)}>
                    필터 해제 ✕
                  </button>
                </p>
              )}

            </div>
          </section>

          {/* ── 오른쪽 칸 ── */}
          <aside className="home-col home-right" aria-label="관심종목·대표 종목·HOT 테마·전일 급등주">
            {/* [2026-10-27] 관심종목 칸 — WatchPanel 설명 참고 */}
            <WatchPanel
              list={watch.list}
              quotes={quotesNow}
              active={filter?.kind === "watch"}
              onToggleFilter={() => toggleFilter("watch", "관심종목")}
              onRemove={(s) => watch.toggle(s)}
            />
            {/* 대표 종목(삼성전자·SK하이닉스) — 2026-10-26 추가, FlagshipStrip 설명 참고 */}
            <FlagshipStrip filter={filter} onPick={(name) => filterAndShow("stock", name)} />
            {/* [2026-10-27] 광고 — 휴대폰 시장 탭에서만(PC 오른쪽 칸에는 광고를 넣지 않음) */}
            <div className="m-only m-market-ad">
              <AdSlot />
            </div>
            {/* [2026-10-28] HOT 테마 — 왼쪽 칸에서 이리로 옮김(왼쪽은 광고 자리) */}
            <HotThemePanel />
            <DailyMoversPanel />
          </aside>
        </div>

        <AboutSiteSection />
      </main>

      <footer className="site-footer">
        <Newspaper size={14} style={{ marginTop: 2, flexShrink: 0 }} />
        <span>
          "관련주"는 사업내용상 근거가 확인된 연결이며, "시장 추정 · 검증되지 않은 연관"은 실적과 무관한 풍문·인맥 기반
          정보를 있는 그대로 전달하는 것으로 투자 추천이 아닙니다. "악재" 표시는 유상증자·감자·거래정지 등 공시로 확인되는
          객관적 이벤트에만 표시되며, 그 자체로 매도·매수를 권유하는 것이 아닙니다.
        </span>
      </footer>

      {toast && (
        <div className="toast-container">
          <div key={toast.headline + toast.count} className="new-toast">
            <Bell size={16} className="new-toast-icon" />
            <div>
              <p className="new-toast-title">새 소식 {toast.count}건 도착</p>
              {toast.headline && <p className="new-toast-headline">{toast.headline}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
