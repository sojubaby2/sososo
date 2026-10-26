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
import { Newspaper, Loader2, Flame, Bell, BellOff, Volume2, VolumeX, Smartphone, X, ArrowDown } from "lucide-react";
// [2026-10-21 추가] 뉴스 제목의 &#039; 같은 글자를 원래대로 되돌립니다.
import { decodeEntities } from "../lib/decodeEntities";
// [2026-10-21 추가] 속보를 채팅 말풍선으로 보여주는 컴포넌트.
import ChatMessage from "../components/ChatMessage";
import Header from "../components/Header";
import DailyOutlookBanner from "../components/DailyOutlookBanner";
import BriefingBand from "../components/BriefingBand";
import { extractThemes } from "../lib/todayBrief";
import { isPoliticalTheme } from "../lib/themeData";

const HOT_THEME_COUNT = 8;
const FEED_POLL_MS = 10000; // check for new articles every 10s
// [2026-09-09 추가] 폴링(재조회) 때는 전체 250개 대신 최근 30개만 받아옴 —
// 새 글은 보통 폴링 주기 사이에 0~2개뿐이라 30개면 충분히 여유 있고,
// Upstash 대역폭 사용량을 크게 줄여줌(자세한 이유는 app/api/feed/route.js
// 주석 참고). 최초 로딩 때는 이 값을 안 쓰고 기본값(250개)을 그대로 받음.
const FEED_POLL_LIMIT = 30;
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
const ALWAYS_FOLLOW = true;

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
        change: typeof live?.changePct === "number" ? live.changePct : m.change,
      };
    }),
  };
}

// Compact sidebar panel — a smaller reference version of what used to be a
// big colored grid across the top of the page. Toggle switches between the
// 1-week and 1-month change field from /api/theme-momentum.
function HotThemePanel() {
  const [rawThemes, setRawThemes] = useState([]);
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

  useEffect(() => {
    fetch("/api/theme-momentum")
      .then((r) => r.json())
      .then((data) => {
        if (!data.dailyMovers || !data.themeChanges) {
          setState("error");
          return;
        }
        setMovers(data.dailyMovers.slice(0, DAILY_MOVER_COUNT));
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
        전일 급등주 · 급등테마
      </h2>
      {state === "loading" ? (
        <p className="trending-empty">불러오는 중...</p>
      ) : (
        <>
          <p className="mover-section-label">종목</p>
          {movers.map((s) => (
            <div key={s.code} className="trending-row">
              <span className="trending-row-name">
                {s.name}
                <span className="trending-row-code">{s.code}</span>
              </span>
              <span className="mono up" style={{ fontSize: 13, fontWeight: 700 }}>
                {s.change > 0 ? "+" : ""}
                {s.change.toFixed(1)}%
              </span>
            </div>
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
        </>
      )}
    </aside>
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
              onClick={() => onPick(r.name)}
              title={`${r.name} 관련 속보만 보기`}
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
                      <span className="flag-when-abroad"> · {kstClock(a.asOf)}</span>
                    </span>
                    {a.krwPerShare ? (
                      <span className="flag-gap">
                        1주 환산 <span className="mono">{fmtWon(a.krwPerShare)}원</span>
                        {typeof a.gapPct === "number" && (
                          <span className={`flag-gap-pct ${toneOf(a.gapPct)}`}> · {a.gapBase} 대비 <span className="mono">{fmtPct(a.gapPct)}</span></span>
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
      <span>모바일에서는 "홈 화면에 추가"를 하면 앱처럼 빠르게 열어볼 수 있어요. PC에서는 Ctrl+D로 즐겨찾기 해두세요.</span>
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
// 스타일은 globals.css에 새 클래스를 추가하는 대신 인라인으로 넣었습니다 —
// 기존 디자인 파일을 건드리지 않아야 다른 화면이 깨질 위험이 없기 때문입니다.
const aboutSectionStyle = {
  marginTop: 40,
  paddingTop: 28,
  borderTop: "1px solid var(--border)",
  maxWidth: 760,
  lineHeight: 1.75,
  fontSize: 14.5,
  color: "var(--ink-muted)",
};
const aboutH2Style = { fontSize: 19, fontWeight: 700, margin: "0 0 12px", color: "var(--ink)" };
const aboutH3Style = { fontSize: 15.5, fontWeight: 700, margin: "22px 0 8px", color: "var(--ink)" };
const aboutPStyle = { margin: "0 0 12px" };

function AboutSiteSection() {
  return (
    <section style={aboutSectionStyle}>
      <h2 style={aboutH2Style}>뉴스매매는 어떤 사이트인가요</h2>
      <p style={aboutPStyle}>
        장중에 속보가 하나 뜨면, 그 뉴스와 사업적으로 연결된 상장 종목을 찾아내는 데만 보통 몇 분이 걸립니다.
        기사를 읽고, 사업보고서를 떠올리고, 테마를 짚어보는 과정을 사람이 매번 반복해야 하기 때문입니다.
        뉴스매매는 그 과정을 자동화해서, 기사와 함께 관련 종목을 바로 보여주는 것을 목표로 만든 사이트입니다.
      </p>
      <h3 style={aboutH3Style}>관련주는 어떻게 고르나요</h3>
      <p style={aboutPStyle}>
        기사 제목과 요약에서 먼저 기업명이 직접 언급됐는지를 찾습니다. 그다음 기사에 등장한 제품·기술·사건과
        연결되는 테마를 추려, 그 테마에 속한 종목들을 후보로 올립니다. 마지막으로 그 후보들 가운데 기사 내용과
        실제로 연결되는 종목만 남깁니다. 종목마다 왜 붙었는지를 한 줄로 같이 적어두는 이유가 여기 있습니다 —
        근거 없이 종목 이름만 나열하면 읽는 사람이 판단할 수가 없기 때문입니다.
      </p>
      <h3 style={aboutH3Style}>무엇을 보여주지 않나요</h3>
      <p style={aboutPStyle}>
        목표 주가, 매수·매도 의견, 수익률 전망은 제공하지 않습니다. 이 사이트가 보여주는 것은 &ldquo;이 뉴스와
        이 종목이 이런 이유로 연결되어 있다&rdquo;는 사실 관계까지이며, 그 종목이 오를지 내릴지에 대한 판단은
        담지 않습니다. 관련주로 표시됐다는 것이 주가 상승을 뜻하지 않는다는 점을 분명히 해둡니다.
      </p>
      <h3 style={aboutH3Style}>다른 메뉴들</h3>
      <p style={aboutPStyle}>
        <Link href="/patterns">패턴검색</Link>은 국내 상장 종목의 최근 시세 흐름을 차트 패턴과 대조해 비슷한
        모양이 나타난 종목을 모아 보여줍니다. <Link href="/themes">테마별 종목정리</Link>는 테마마다 어떤 종목이
        묶여 있는지와 기간별 등락률을 정리한 표입니다. <Link href="/blog">칼럼</Link>에는 튤립 버블부터 최근
        금융 사고까지 경제사에서 실제로 벌어진 일들을 한 편씩 풀어 쓴 글을 모아두었습니다. 투자 조언이 아니라
        읽을거리로 쓴 글들입니다.
      </p>
    </section>
  );
}

export default function HomeClient({ initialItems = [], worldIndices = null, brief = null, liveQuotes = {}, strip = null }) {
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
  // 10초 뒤 첫 확인 때 이미 보고 있는 글들이 전부 "새 글"로 잡혀서 알림이
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
    // 불러올 이유가 없습니다 — 그래서 바로 10초 주기 확인만 시작합니다.
    // (이 한 줄이 방문자 한 명당 서버 호출 한 번을 통째로 없애줍니다.)
    // 서버 쪽에서 못 가져왔을 때만 예전처럼 전체를 불러옵니다.
    if (initialItems.length === 0) load(true);

    const interval = setInterval(() => load(false), FEED_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
      clearTimeout(toastTimerRef.current);
      clearTimeout(newIdsTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const items = useMemo(() => rawItems.map((it) => toCardShape(it, liveQuotes)), [rawItems, liveQuotes]);

  // [2026-10-19 추가] 테마나 종목을 누르면 아래 속보를 그것만 남깁니다.
  // filter: null | { kind: "theme" | "stock", value: "해운" }
  const [filter, setFilter] = useState(null);

  function toggleFilter(kind, value) {
    setFilter((cur) => (cur && cur.kind === kind && cur.value === value ? null : { kind, value }));
  }

  const visible = useMemo(() => {
    if (!filter) return items;
    if (filter.kind === "theme") return items.filter((n) => n.themes?.includes(filter.value));
    return items.filter((n) => n.stocks?.some((s) => s.name === filter.value));
  }, [items, filter]);

  // ── [2026-10-21 전면 변경] 속보를 "채팅방"으로 ──────────────────────
  //
  // 재성님 요청: "채팅창처럼 보이게, 진짜 채팅처럼 최신이 아래로"
  //
  // 예전에는 최신 3건을 위에 크게(topStories), 나머지를 아래 2단 격자로
  // (restStories) 나눠 보여줬습니다. 이제는 하나의 긴 대화방입니다.
  //
  // ★ 여기가 핵심입니다 — 순서를 뒤집습니다.
  //   서버가 주는 visible은 "최신이 맨 앞"입니다(뉴스 순서).
  //   채팅은 "최신이 맨 아래"입니다. 그래서 뒤집어서 그립니다.
  //
  // ★ 그럼 최신 속보를 보려고 매번 끝까지 내려야 하지 않나?
  //   아닙니다. 아래 chatRef가 **화면에 뜨는 순간 맨 아래로 보내줍니다.**
  //   카카오톡을 열면 바로 마지막 대화가 보이는 것과 똑같습니다.
  //   그래서 속보 영역은 페이지와 따로 노는 "스크롤 상자"여야 합니다
  //   (globals.css의 .chatroom). 페이지 전체를 뒤집으면 매번 바닥까지
  //   내려야 하므로 그렇게 하지 않았습니다.
  //
  // 날짜가 바뀌는 자리에는 "— 10월 21일 (수) —" 구분선을 넣습니다.
  // time은 "2026/10/21 09:14" 형태라 앞쪽만 떼면 날짜입니다.
  const chatRows = useMemo(() => {
    const rows = [];
    let lastDay = null;
    // slice()로 복사한 뒤 뒤집습니다 — 원본 배열을 그대로 reverse하면
    // 다른 곳에서 쓰는 순서까지 같이 망가집니다.
    const oldestFirst = visible.slice().reverse();
    for (const n of oldestFirst) {
      const day = String(n.time || "").split(" ")[0];
      if (day && day !== lastDay) {
        rows.push({ kind: "day", key: `day-${day}`, day });
        lastDay = day;
      }
      rows.push({ kind: "msg", key: n.id, n });
    }
    return rows;
  }, [visible]);

  // 날짜를 "10월 21일 (수)"로 바꿉니다.
  function dayLabel(day) {
    const [y, m, d] = String(day).split("/").map(Number);
    if (!y || !m || !d) return day;
    const names = ["일", "월", "화", "수", "목", "금", "토"];
    const w = names[new Date(y, m - 1, d).getDay()];
    const today = new Date();
    const isToday = today.getFullYear() === y && today.getMonth() + 1 === m && today.getDate() === d;
    return `${isToday ? "오늘 · " : ""}${m}월 ${d}일 (${w})`;
  }

  // ── 채팅방 스크롤 다루기 ──────────────────────────────────────────
  //
  // [2026-10-21 변경] 재성님 판단으로 "무조건 따라 내려가기"로 바꿨습니다.
  //
  //   "속보는 빨리 읽어야 하니까(지난 뉴스보다는) 자동으로 화면이
  //    내려가게 했으면 좋겠는데"
  //
  // 처음에는 위쪽 옛날 글을 읽는 중이면 끌어내리지 않고 "새 속보 N건 ↓"
  // 단추만 띄웠습니다. 읽던 자리를 뺏지 않으려던 것인데, 이 사이트의
  // 성격에는 안 맞습니다. 여기는 지난 뉴스를 정독하러 오는 곳이 아니라
  // **지금 막 터진 걸 제일 먼저 보러 오는 곳**입니다. 한 박자라도 빨리
  // 보여주는 쪽이 맞습니다. 그래서 단추를 없애고 항상 내려갑니다.
  //
  // ★ 되돌리고 싶으면 아래 ALWAYS_FOLLOW를 false로만 바꾸면 됩니다.
  //   그러면 맨 아래에 붙어 있을 때만 따라 내려가고, 위를 읽는 중이면
  //   가만히 둡니다.
  const JUMP_SHOW_PX = 300;
  const chatRef = useRef(null);
  const pinnedRef = useRef(true); // 지금 맨 아래에 붙어 있나?

  // [2026-10-22 추가] "최신 속보 보기" 단추를 보여줄지.
  // 재성님 요청: "대화창 올라가 있을 때 누를 수 있게 최신속보 보기 버튼".
  // 옛날 속보를 읽으려고 위로 올려 둔 상태에서, 한 번 눌러서 바로 맨 아래
  // (가장 최근 속보)로 돌아올 수 있게 합니다.
  // 맨 아래 근처에 있을 때는 필요 없으니 숨깁니다(JUMP_SHOW_PX 참고).
  const [showJump, setShowJump] = useState(false);

  function scrollChatToBottom(smooth) {
    const el = chatRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    pinnedRef.current = true;
    setShowJump(false); // 맨 아래로 갔으니 단추는 숨김
  }

  // 스크롤할 때마다 "바닥에 붙어 있는지"를 기록합니다.
  // (ALWAYS_FOLLOW를 false로 돌렸을 때 쓰입니다.)
  // 60px은 여유값입니다 — 딱 0px일 때만 인정하면 손가락이 살짝만 움직여도
  // 붙어있지 않은 것으로 판정돼 버립니다.
  function onChatScroll() {
    const el = chatRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight; // 바닥까지 남은 거리
    pinnedRef.current = distance < 60;

    // [2026-10-22 추가] 바닥에서 300px 넘게 올라가 있으면 "최신 속보 보기"
    // 단추를 띄웁니다. 60px(위의 "붙어 있음" 기준)보다 넉넉하게 잡은 이유:
    // 손가락이 살짝만 움직여도 단추가 깜빡깜빡 나타났다 사라지면 거슬립니다.
    // 속보 말풍선 하나가 대략 200~300px이라, "한 건 이상 올라갔을 때"쯤
    // 나타나게 맞췄습니다.
    // (값이 같으면 React가 화면을 다시 그리지 않으므로, 스크롤할 때마다
    //  불러도 느려지지 않습니다.)
    setShowJump(distance > JUMP_SHOW_PX);
  }

  // 목록이 바뀔 때마다(처음 로딩 / 새 속보 도착 / 필터 변경) 처리합니다.
  const lastCountRef = useRef(0);
  const firstFitRef = useRef(false);
  useEffect(() => {
    const el = chatRef.current;
    if (!el || chatRows.length === 0) return;

    // 처음 한 번은 애니메이션 없이 바로 맨 아래로.
    // 스르륵 내려가는 걸 보여줄 필요가 없습니다 — 처음부터 거기 있어야 합니다.
    if (!firstFitRef.current) {
      firstFitRef.current = true;
      lastCountRef.current = chatRows.length;
      scrollChatToBottom(false);
      return;
    }

    const grew = chatRows.length - lastCountRef.current;
    lastCountRef.current = chatRows.length;
    if (grew <= 0) return;

    if (ALWAYS_FOLLOW || pinnedRef.current) scrollChatToBottom(true);
  }, [chatRows]);

  // 필터를 바꾸면 목록이 통째로 달라지므로 다시 맨 아래로 보냅니다.
  useEffect(() => {
    firstFitRef.current = false;
  }, [filter]);

  // [2026-10-26 삭제] "오늘 많이 불린 종목" 계산(topStocks)을 없앴습니다.
  // 재성님 요청으로 그 자리에 대표 종목(삼성전자·SK하이닉스) 칸이 들어갔습니다.

  return (
    <div>
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

      <main className="container-wide home-main">
        <DailyOutlookBanner />
        <InstallHintBanner />

        <div className="home-split">
          <div className="home-main-col">

        {/* [2026-10-19 변경] "실시간 급등뉴스 감시중" 띠와 "오늘의 머리기사"를
            하나로 합쳤습니다. 머리글에 실시간 표시와 알림 토글이 같이 있고,
            바로 아래에 가장 최근 속보 3건이 큰 카드로 들어갑니다. */}
        <div className="live-head">
          <h2>
            <span className="live-dot" />
            실시간 속보
          </h2>
          <span className="stories-count mono">
            {filter ? `${visible.length}건 / 전체 ${items.length}건` : `${items.length}건`}
          </span>
          <div className="watch-toggles">
            <button type="button" className={`sound-toggle ${soundEnabled ? "on" : ""}`} onClick={toggleSound}>
              {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
              알림음 {soundEnabled ? "켜짐" : "꺼짐"}
            </button>
            <button type="button" className={`sound-toggle ${notifyEnabled ? "on" : ""}`} onClick={toggleNotify}>
              {notifyEnabled ? <Bell size={14} /> : <BellOff size={14} />}
              데스크톱 알림 {notifyEnabled ? "켜짐" : "꺼짐"}
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

        {/* [2026-10-26 변경] "오늘 많이 불린 종목" 띠를 지우고 그 자리에
            대표 종목(삼성전자·SK하이닉스) 칸을 넣었습니다. 위 FlagshipStrip 설명 참고. */}
        <FlagshipStrip filter={filter} onPick={(name) => toggleFilter("stock", name)} />


        {/* [2026-10-21 신설] 속보 채팅방.
            onScroll로 "바닥에 붙어 있는지"를 계속 확인합니다 — 위를 읽는
            중에 새 글이 와도 화면을 끌어내리지 않기 위해서입니다. */}
        {chatRows.length > 0 && (
          <div className="chatroom-wrap">
            <div className="chatroom" ref={chatRef} onScroll={onChatScroll}>
              {chatRows.map((row) =>
                row.kind === "day" ? (
                  <div className="chat-day" key={row.key}>
                    {dayLabel(row.day)}
                  </div>
                ) : (
                  <ChatMessage
                    key={row.key}
                    n={row.n}
                    isNew={newIds.has(row.n.id)}
                    onThemeClick={(t) => toggleFilter("theme", t)}
                  />
                )
              )}

              {/* [2026-10-22 추가] 맨 아래 "입력 중..." 말풍선.
                  재성님 요청: "맨 밑에 뭔가 입력되고 있는 듯한 모션이 있으면 좋겠다".
                  카카오톡에서 상대가 글을 쓰는 중일 때 점 세 개가 통통 튀는
                  것과 같은 모양입니다. 이 사이트는 속보가 오면 자동으로 아래에
                  붙기 때문에, "이 방은 살아 있고 다음 속보를 받는 중"이라는
                  느낌을 주려고 넣었습니다.
                  - 실제로 누가 글을 쓰는 건 아니라서, 화면 읽기 프로그램
                    (시각장애인용)에는 "새 속보를 기다리는 중"이라고만 읽어주고
                    점 모양은 건너뛰게 했습니다(aria-hidden).
                  - 맨 아래에 붙어 있으니 새 속보가 오면 그 바로 위에 쌓이고,
                    이 말풍선은 항상 제일 아래에 남습니다.
                  - 움직임 스타일은 app/globals.css의 ".chat-typing" 부분입니다. */}
              <div className="chat-row chat-typing" role="status" aria-label="새 속보를 기다리는 중">
                <div className="chat-av typing-av" aria-hidden="true">
                  속보
                </div>
                <div className="chat-main">
                  <div className="chat-meta" aria-hidden="true">
                    <span className="chat-sender as-text">뉴스매매</span>
                    <span className="typing-text">새 속보 받는 중</span>
                  </div>
                  <div className="chat-bubble typing-bubble" aria-hidden="true">
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                    <span className="typing-dot" />
                  </div>
                </div>
              </div>
            </div>

            {/* [2026-10-22 추가] "최신 속보 보기" 단추.
                채팅 상자(.chatroom) 바깥, 감싸는 상자(.chatroom-wrap) 안에 둬서
                상자 아래쪽 가운데에 떠 있게 했습니다. 상자 안에 넣으면 스크롤과
                같이 위로 밀려 올라가 버립니다.
                누르면 스르륵 맨 아래(가장 최근 속보)로 내려갑니다. */}
            {showJump && (
              <button type="button" className="chat-jump-latest" onClick={() => scrollChatToBottom(true)}>
                <ArrowDown size={15} />
                최신 속보 보기
              </button>
            )}
          </div>
        )}

        {filter && visible.length === 0 && (
          <p style={{ fontSize: 14, color: "var(--ink-muted)", padding: "24px 0" }}>
            {filter.value}에 해당하는 속보가 아직 없습니다.{" "}
            <button type="button" className="clear-filter" onClick={() => setFilter(null)}>
              필터 해제 ✕
            </button>
          </p>
        )}

          </div>

          {/* 오른쪽 — 스크롤을 따라오는 보조 패널들 */}
          <aside className="side-rail">
            <DailyMoversPanel />
            <HotThemePanel />
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
