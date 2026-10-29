// lib/premarket.js
//
// [2026-10-29 신설] 장전 브리핑 — 재성님: "장전 브리핑 가능해? 오전 8시 정도에. 새벽시간 미국 나스닥, 미국 뉴스,
//   전일 주요 한국뉴스 등등 종합적으로 분석하고 판단해서 장전 브리핑 같은거"
//
// 언제 만드나: 매일 아침 07:40(한국 시간, 월~토) Cloudflare 예약 실행(custom-worker.js → /api/premarket/refresh).
//   07:50 cron-job.org가 부르는 /api/daily-outlook/refresh도 같은 일을 함(이미 만들었으면 건너뜀) → 한쪽이 실패해도 다른 쪽이 만듦.
//   일요일은 미국장 새 자료가 없어 건너뜀(토요일 아침 = 미국 금요일 마감 반영, 월요일 아침 = 주말 뉴스까지 반영).
//
// 재료(모두 무료):
//   1) 미국 지수·주요 종목·환율·금리·원자재 — 야후 일봉(사이트 다른 곳에서도 쓰는 방식)
//   2) 밤사이·어제 속보 — 우리 사이트 속보 피드(텔레그램 4개 채널에서 모은 것, 관련 종목 포함)
//   3) 어제 한국장 마감 — 장 마감 정리 계산 결과(lib/marketDay.js)와 지수·수급(lib/investorFlow.js)
// 분석: AI(Claude Haiku) 하루 1번. 예상 비용 하루 약 20원(입력 약 1만 자 토큰 + 출력 약 1,500 토큰) → 한 달 약 500원.
//   예전 "오늘의 전망" 배너도 같은 AI를 하루 1번 썼으므로(지금은 미국 시세 업체 고장으로 멈춤) 사실상 그 자리를 대신합니다.
//
// 저장(Redis): premarket:YYYYMMDD(400일 보관), premarket:dates(날짜 목록)
//   + 홈 맨 위 "오늘의 전망" 배너(dailyOutlook:latest)도 브리핑의 "주목 테마"로 같이 채움 → 배너가 다시 살아남.
//
// 지키는 것: AI에게 "받은 자료에 있는 사실만, 숫자를 지어내지 말 것, 사라/팔라 권유 금지"를 지시하고,
//   테마는 사이트 정식 테마명만, 종목은 사이트 종목 사전에 있는 이름만 남깁니다(링크가 깨지지 않게).

import { getAllThemeNames } from "./themeData";
import { STOCKS } from "./stockDirectory";
import { getRecentFeed } from "./recentFeed";
import { getMarketDates, getMarketDay } from "./marketDay";
import { getMarketFlow } from "./investorFlow";
import { askJson } from "./claude"; // [2026-10-29] AI 부르기(Haiku 5.5 + 4.5 대체 + 비용 계량기)

const YAHOO_URL = "https://query1.finance.yahoo.com/v8/finance/chart";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

export const PREMARKET_PREFIX = "premarket:";
export const PREMARKET_DATES = "premarket:dates";
const OUTLOOK_REDIS_KEY = "dailyOutlook:latest"; // 홈 배너(lib/dailyOutlook.js와 같은 자리)

// 화면과 AI에 함께 쓰는 미국·해외 지표 목록
export const US_SYMBOLS = [
  { sym: "^IXIC", name: "나스닥", group: "index" },
  { sym: "^GSPC", name: "S&P500", group: "index" },
  { sym: "^DJI", name: "다우", group: "index" },
  { sym: "^SOX", name: "필라델피아 반도체", group: "index" },
  { sym: "^VIX", name: "VIX(공포지수)", group: "index" },
  { sym: "EWY", name: "MSCI 한국 ETF(EWY)", group: "korea" },
  { sym: "SKHY", name: "SK하이닉스 ADR", group: "korea" },
  { sym: "NVDA", name: "엔비디아", group: "stock" },
  { sym: "AAPL", name: "애플", group: "stock" },
  { sym: "MSFT", name: "마이크로소프트", group: "stock" },
  { sym: "GOOGL", name: "알파벳", group: "stock" },
  { sym: "AMZN", name: "아마존", group: "stock" },
  { sym: "META", name: "메타", group: "stock" },
  { sym: "TSLA", name: "테슬라", group: "stock" },
  { sym: "AVGO", name: "브로드컴", group: "stock" },
  { sym: "MU", name: "마이크론", group: "stock" },
  { sym: "AMD", name: "AMD", group: "stock" },
  { sym: "TSM", name: "TSMC", group: "stock" },
  { sym: "KRW=X", name: "원/달러 환율", group: "macro" },
  { sym: "^TNX", name: "미국 10년물 금리", group: "macro" },
  { sym: "CL=F", name: "WTI 유가", group: "macro" },
  { sym: "GC=F", name: "금", group: "macro" },
  { sym: "BTC-USD", name: "비트코인", group: "macro" },
];

function kst(now = new Date()) {
  const k = new Date(now.getTime() + 9 * 3600 * 1000);
  return { iso: k.toISOString().slice(0, 10), wd: k.getUTCDay(), minutes: k.getUTCHours() * 60 + k.getUTCMinutes() };
}
const isoToBas = (iso) => iso.replace(/-/g, "");

// 야후에서 한 종목의 마지막 종가와 전일 대비 등락률
async function quote(sym) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 7000);
  try {
    const res = await fetch(`${YAHOO_URL}/${encodeURIComponent(sym)}?range=10d&interval=1d`, {
      headers: { "User-Agent": UA, Accept: "application/json,text/plain,*/*" },
      cache: "no-store",
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const j = await res.json();
    const r = j?.chart?.result?.[0];
    const closes = (r?.indicators?.quote?.[0]?.close || []).filter((v) => typeof v === "number" && Number.isFinite(v));
    const meta = r?.meta || {};
    const price = typeof meta.regularMarketPrice === "number" ? meta.regularMarketPrice : closes[closes.length - 1];
    if (typeof price !== "number") return null;
    // 전일 종가: 마지막 봉이 오늘 값이면 그 앞, 아니면 마지막 봉
    let prev = null;
    if (closes.length >= 2) {
      const last = closes[closes.length - 1];
      prev = Math.abs(last - price) / price < 1e-6 ? closes[closes.length - 2] : last;
    }
    if (typeof meta.chartPreviousClose === "number" && !prev) prev = meta.chartPreviousClose;
    const chg = prev ? ((price - prev) / prev) * 100 : null;
    return { price: Math.round(price * 100) / 100, chg: chg === null ? null : Math.round(chg * 100) / 100, at: meta.regularMarketTime || null };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function usSnapshot() {
  const out = [];
  // 한꺼번에 너무 많이 보내지 않게 6개씩
  for (let i = 0; i < US_SYMBOLS.length; i += 6) {
    const part = US_SYMBOLS.slice(i, i + 6);
    const got = await Promise.all(part.map((s) => quote(s.sym)));
    part.forEach((s, k) => out.push({ ...s, ...(got[k] || {}), ok: !!got[k] }));
  }
  return out;
}

// 피드에서 "어제 15:00 이후(밤사이 포함)" 속보 위주로, 없으면 최근 것으로 최대 n건
function pickNews(feed, sinceMs, n = 45) {
  const rows = (feed || [])
    .map((it) => ({ ...it, t: new Date(it.pubDate).getTime() }))
    .filter((it) => Number.isFinite(it.t))
    .sort((a, b) => b.t - a.t);
  const recent = rows.filter((it) => it.t >= sinceMs);
  return (recent.length >= 8 ? recent : rows).slice(0, n);
}
const kstHM = (ms) => new Date(ms + 9 * 3600 * 1000).toISOString().slice(5, 16).replace("T", " ");

function fmt(v, d = 2) {
  return typeof v === "number" ? v.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d }) : "—";
}
const sgn = (v) => (typeof v === "number" ? `${v > 0 ? "+" : ""}${v.toFixed(2)}%` : "—");

function buildPrompt({ us, news, prevDay, prevFlow, themes, todayIso }) {
  const usLines = us.filter((x) => x.ok).map((x) => `${x.name}: ${fmt(x.price)} (${sgn(x.chg)})`).join("\n") || "(못 받음)";
  let kr = "(자료 없음)";
  if (prevDay) {
    const kp = prevFlow?.["코스피"];
    const kq = prevFlow?.["코스닥"];
    const idx = (ix) => (ix?.index ? `${fmt(ix.index.close)} (${sgn(ix.index.chgPct)})` : "—");
    const flow = (f) => (f?.flow ? `개인 ${f.flow.individual}억, 외국인 ${f.flow.foreign}억, 기관 ${f.flow.institution}억` : "수급 자료 없음");
    kr = [
      `날짜: ${prevDay.date}`,
      `코스피 ${idx(kp)} / ${flow(kp)}`,
      `코스닥 ${idx(kq)} / ${flow(kq)}`,
      `강했던 테마: ${(prevDay.themesUp || []).slice(0, 5).map((t) => `${t.theme}(${sgn(t.avg)})`).join(", ")}`,
      `약했던 테마: ${(prevDay.themesDown || []).slice(0, 3).map((t) => `${t.theme}(${sgn(t.avg)})`).join(", ")}`,
      `상승률 상위: ${(prevDay.gainers || []).slice(0, 8).map((s) => `${s.name}(${sgn(s.chg)})`).join(", ")}`,
      `거래대금 상위: ${(prevDay.byValue || []).slice(0, 5).map((s) => s.name).join(", ")}`,
    ].join("\n");
  }
  const newsLines =
    news
      .map((n) => {
        const st = (n.matches || []).slice(0, 4).map((m) => m.name).join(", ");
        const sum = String(n.summary || "").replace(/\s+/g, " ").slice(0, 140);
        return `- [${kstHM(n.t)}] ${n.title}${sum ? ` — ${sum}` : ""}${st ? ` (관련: ${st})` : ""}`;
      })
      .join("\n") || "(속보 없음)";

  const system = `너는 한국 주식 투자자를 위한 "장전 브리핑"을 쓰는 애널리스트다. 오늘은 ${todayIso}(한국 시간), 한국장 개장(09:00) 전이다.
아래 [자료]에 있는 사실만 근거로 써라. 숫자는 자료에 있는 것만 쓰고 절대 지어내지 마라. 자료에 없는 일정·실적·발언을 만들어내지 마라.
"사라/팔라/매수 추천" 같은 투자 권유 표현은 쓰지 말고, "주목", "부담", "기대" 같은 관찰 표현만 써라. 쉬운 한국어로, 문장은 짧게.
반드시 아래 JSON 하나만 출력하라(설명 문장 없이):
{
 "headline": "오늘 장을 한 줄로(35자 이내)",
 "mood": "up 또는 down 또는 mixed (오늘 한국장 출발 분위기 판단)",
 "moodReason": "그렇게 본 이유 한 문장",
 "summary": ["핵심 요약 3~4문장, 각 문장 60자 이내"],
 "us": ["밤사이 미국장 핵심 3~5줄(지수·업종·종목 흐름, 자료 숫자 사용)"],
 "news": [{"title": "주목할 뉴스(자료의 제목을 짧게)", "point": "한국장에 왜 중요한지 한 문장", "stocks": ["관련 국내 종목명"]}],
 "themes": [{"theme": "정식 테마명", "direction": "up 또는 down", "reason": "근거 한 문장"}],
 "stocks": [{"name": "국내 상장 종목명(정확한 이름)", "reason": "주목 이유 한 문장"}],
 "risks": ["오늘 조심할 점 2~3줄"],
 "checklist": ["오늘 장중에 확인할 것 2~4줄(자료에 근거한 것만)"]
}
news는 최대 6개, themes는 최대 6개, stocks는 최대 8개. 근거가 약하면 개수를 줄여라.
themes의 theme은 반드시 다음 정식 테마명 목록 중에서만 그대로 골라라: ${themes.join(" | ")}`;

  const user = `[자료]
[1. 밤사이 미국·해외 시장(야후, 미국 정규장 마감 기준)]
${usLines}

[2. 어제 한국장 마감]
${kr}

[3. 어제 장 마감 이후~지금까지(없으면 최근) 속보 — 시각은 한국 시간]
${newsLines}`;
  return { system, user };
}

function extractJson(text) {
  const s = text.indexOf("{");
  if (s < 0) return null;
  let depth = 0;
  for (let i = s; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) return text.slice(s, i + 1);
    }
  }
  return null;
}

const strArr = (a, n, max = 120) =>
  (Array.isArray(a) ? a : [])
    .filter((x) => typeof x === "string" && x.trim())
    .slice(0, n)
    .map((x) => x.trim().slice(0, max));

function clean(parsed, themeSet, nameMap) {
  const stockOf = (name) => {
    const s = nameMap.get(String(name || "").trim());
    return s ? { code: s.code, name: s.name, market: s.market } : null;
  };
  const themes = (Array.isArray(parsed.themes) ? parsed.themes : [])
    .filter((t) => t && themeSet.has(String(t.theme || "").trim()) && (t.direction === "up" || t.direction === "down") && t.reason)
    .slice(0, 6)
    .map((t) => ({ theme: t.theme.trim(), direction: t.direction, reason: String(t.reason).trim().slice(0, 120) }));
  const stocks = (Array.isArray(parsed.stocks) ? parsed.stocks : [])
    .map((s) => ({ s: stockOf(s?.name), reason: String(s?.reason || "").trim().slice(0, 120) }))
    .filter((x) => x.s && x.reason)
    .slice(0, 8)
    .map((x) => ({ ...x.s, reason: x.reason }));
  const news = (Array.isArray(parsed.news) ? parsed.news : [])
    .filter((n) => n && n.title && n.point)
    .slice(0, 6)
    .map((n) => ({
      title: String(n.title).trim().slice(0, 100),
      point: String(n.point).trim().slice(0, 140),
      stocks: (Array.isArray(n.stocks) ? n.stocks : []).map(stockOf).filter(Boolean).slice(0, 4),
    }));
  return {
    headline: String(parsed.headline || "").trim().slice(0, 60),
    mood: ["up", "down", "mixed"].includes(parsed.mood) ? parsed.mood : "mixed",
    moodReason: String(parsed.moodReason || "").trim().slice(0, 140),
    summary: strArr(parsed.summary, 4, 140),
    usNotes: strArr(parsed.us, 5, 160), // AI가 쓴 "미국장 핵심" 문장(지표 목록 us와 이름이 겹치지 않게)
    news,
    themes,
    stocks,
    risks: strArr(parsed.risks, 3, 140),
    checklist: strArr(parsed.checklist, 4, 140),
  };
}

// [2026-10-29 변경] Haiku 5.5로 바꿈 — 부르는 방법은 lib/claude.js askJson(실패하면 4.5로 자동 대체, 비용 계량기 기록도 거기서)
async function askClaude(system, user) {
  const { text, usage, model } = await askJson({ system, user, maxTokens: 2200, stage: "premarket" });
  return { text, usage, model };
}

// 만들기 — force면 오늘 것이 있어도 다시 만듦
export async function refreshPremarket(redis, { force = false, now = new Date() } = {}) {
  if (!redis) return { ok: false, reason: "저장소 없음" };
  const { iso, wd } = kst(now);
  if (!force && wd === 0) return { ok: false, skipped: true, reason: "일요일은 건너뜀(미국장 새 자료 없음)" };
  const key = PREMARKET_PREFIX + isoToBas(iso);
  if (!force && (await redis.get(key))) return { ok: true, skipped: true, reason: "오늘 브리핑이 이미 있음", date: iso };

  // 재료 모으기
  const [us, feed, dates] = await Promise.all([usSnapshot(), getRecentFeed(), getMarketDates().catch(() => [])]);
  const prevIso = dates.filter((d) => d < iso).pop() || null;
  const [prevDay, prevFlow] = prevIso
    ? await Promise.all([getMarketDay(prevIso).catch(() => null), getMarketFlow(prevIso, { latest: true }).catch(() => null)])
    : [null, null];
  // 어제 장 마감(15:00) 이후 속보 위주
  const sinceMs = prevIso ? new Date(`${prevIso}T15:00:00+09:00`).getTime() : now.getTime() - 18 * 3600 * 1000;
  const news = pickNews(feed, sinceMs);

  const themes = getAllThemeNames();
  const { system, user } = buildPrompt({ us, news, prevDay, prevFlow, themes, todayIso: iso });
  const { text, usage } = await askClaude(system, user);
  let parsed;
  try {
    parsed = JSON.parse(extractJson(text) || "null");
  } catch {
    parsed = null;
  }
  if (!parsed) return { ok: false, reason: "AI 응답을 읽지 못함", preview: text.slice(0, 300) };

  const nameMap = new Map([...STOCKS.values()].map((s) => [s.name, s]));
  const body = clean(parsed, new Set(themes), nameMap);
  if (!body.headline || body.summary.length === 0) return { ok: false, reason: "AI 응답이 비어 있음", preview: text.slice(0, 300) };

  const record = {
    date: iso,
    generatedAt: new Date().toISOString(),
    prevDate: prevIso,
    us: us.filter((x) => x.ok).map(({ sym, name, group, price, chg }) => ({ sym, name, group, price, chg })),
    newsCount: news.length,
    usage,
    ...body,
  };
  await redis.set(key, JSON.stringify(record), { ex: 400 * 86400 });
  await redis.zadd(PREMARKET_DATES, { score: Number(isoToBas(iso)), member: isoToBas(iso) });

  // 홈 맨 위 "오늘의 전망" 배너도 같이 채움(배너 모양: picks = [{theme, direction, reason}])
  if (body.themes.length) {
    const md = `${Number(iso.slice(5, 7))}월 ${Number(iso.slice(8, 10))}일`;
    await redis.set(
      OUTLOOK_REDIS_KEY,
      { dateLabel: md, heading: `${md} 장전 브리핑 · 오늘 주목할 테마`, weekend: wd === 6, picks: body.themes, generatedAt: record.generatedAt, briefing: `/briefing/${iso}` },
      { ex: 4 * 86400 }
    );
  }
  return { ok: true, date: iso, headline: body.headline, themes: body.themes.length, usage };
}

// 읽기
export async function getPremarket(redis, iso) {
  if (!redis || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const raw = await redis.get(PREMARKET_PREFIX + isoToBas(iso));
  if (!raw) return null;
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}
export async function getPremarketDates(redis, limit = 60) {
  if (!redis) return [];
  const total = await redis.zcard(PREMARKET_DATES);
  if (!total) return [];
  const raw = await redis.zrange(PREMARKET_DATES, Math.max(0, total - limit), total - 1);
  return raw
    .map((d) => String(d))
    .filter((d) => /^\d{8}$/.test(d))
    .map((d) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`)
    .sort()
    .reverse();
}
