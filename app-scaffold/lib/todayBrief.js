// lib/todayBrief.js
//
// [2026-10-19 신설] 홈 화면 맨 위 문장을 만드는 곳입니다.
//
//   "오늘 시장을 움직인 건 해운이었습니다"
//   "밤사이 미국을 움직인 건 로봇이었습니다"
//
// 재성님과 정한 규칙이 전부 여기 들어 있습니다.
//
// ── 규칙 1. "움직였다"는 뉴스 개수가 아니라 등락률로 판단합니다 ──
// 처음에는 뉴스가 가장 많이 올라온 테마를 1등으로 쓰려고 했는데, 재성님
// 지적대로 뉴스 개수는 "화제성"이지 "수익률"이 아닙니다. 뉴스만 많고 주가는
// 안 움직인 테마를 1등이라고 하면 그 문장은 거짓말이 됩니다.
// 그래서 두 조건을 다 봅니다.
//   · 후보: 오늘 속보가 MIN_NEWS_FOR_THEME건 이상 올라온 테마
//   · 1등: 그중 그 테마 종목들의 오늘 평균 등락률이 가장 높은 테마
// 종목이 하나뿐인 테마는 한 종목이 급등하면 바로 1등이 되므로 제외합니다.
//
// ── 규칙 2. 시간대에 따라 미국/국내를 바꿉니다 ──
// 미국장은 우리 새벽에 끝납니다. 개장 전에 들어온 사람에게는 그게 제일
// 신선한 재료입니다. 반대로 오후 2시에 들어온 사람에게 새벽 미국 얘기만
// 하면 그것도 안 맞습니다.
//   · 한국시간 00:00 ~ 08:30 → 미국 (밤사이 결과)
//   · 08:30 ~ 24:00          → 국내
//   · 국내인데 오늘 속보가 너무 적으면(새벽·주말·휴장일) → 미국으로 넘김
//
// ── 규칙 3. 하락장이면 문구를 뒤집습니다 ──
// 1등 테마마저 마이너스인데 "움직였다"고 하면 어색합니다.
//   · 플러스  → "시장을 움직인 건 ○○이었습니다"
//   · 마이너스 → "시장을 끌어내린 건 ○○이었습니다"

import { US_THEMES } from "./usThemes";

// 테마가 후보에 오르려면 오늘 속보가 최소 이만큼 있어야 합니다.
const MIN_NEWS_FOR_THEME = 2;
// 테마 안에 등락률을 아는 종목이 최소 이만큼 있어야 합니다(한 종목 급등 방어).
const MIN_STOCKS_FOR_THEME = 2;
// 국내 모드로 가려면 오늘 속보가 최소 이만큼 있어야 합니다.
const MIN_NEWS_FOR_DOMESTIC = 5;

// 한국시간 기준 "오늘 몇 시인지"와 "오늘 0시가 언제인지"를 구합니다.
// 서버는 UTC로 돌아가므로 9시간을 더한 뒤 getUTC* 로 읽습니다
// (app/HomeClient.js의 formatKoreanDateTime과 같은 방식).
export function kstNow(now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const startOfDayUtcMs =
    Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - 9 * 60 * 60 * 1000;
  return {
    year: kst.getUTCFullYear(),
    month: kst.getUTCMonth() + 1,
    day: kst.getUTCDate(),
    weekday: kst.getUTCDay(), // 0=일
    hour: kst.getUTCHours(),
    minute: kst.getUTCMinutes(),
    startOfDayMs: startOfDayUtcMs,
  };
}

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

export function formatKstStamp(now = new Date()) {
  const k = kstNow(now);
  const hh = String(k.hour).padStart(2, "0");
  const mm = String(k.minute).padStart(2, "0");
  return `${k.month}월 ${k.day}일 (${WEEKDAY_KO[k.weekday]}) · ${hh}:${mm} 기준`;
}

// 피드 항목에서 테마 이름을 뽑아냅니다.
//
// 왜 이렇게 하나: 지금 저장되는 피드 항목에는 테마가 따로 담겨 있지 않고,
// 테마로 묶인 종목의 reason에만 "'해운' 테마 동반 종목" 형태로 들어 있습니다
// (lib/newsPipeline.js 참고). 앞으로 저장되는 항목에는 themes를 직접 넣게
// 바꿨지만, 이미 쌓여 있는 항목들을 위해 reason에서 읽어내는 길도 남겨둡니다.
const THEME_FROM_REASON = /'([^']+)'\s*테마 동반 종목/;

export function extractThemes(item) {
  // 새 형식: lib/newsPipeline.js가 첫 번째 종목에 붙여서 저장한 값
  const tagged = item?.matches?.[0]?.themes;
  if (Array.isArray(tagged) && tagged.length) return [...new Set(tagged)];
  // 옛 형식: reason에서 읽어내기
  const found = new Set();
  for (const m of item?.matches || []) {
    const hit = THEME_FROM_REASON.exec(m?.reason || "");
    if (hit) found.add(hit[1]);
  }
  return [...found];
}

// 오늘(한국시간 0시 이후) 올라온 항목만 추립니다.
export function todaysItems(items, now = new Date()) {
  const { startOfDayMs } = kstNow(now);
  return (items || []).filter((it) => {
    const ms = Date.parse(it?.pubDate || it?.savedAt || "");
    return Number.isFinite(ms) && ms >= startOfDayMs;
  });
}

// 테마별 집계 — 속보 건수와, 그 테마에 묶인 종목들의 평균 등락률.
//
// quotes: Map(종목코드 -> { changePct })  (lib/quotes.js가 준 것)
export function summarizeThemes(items, quotes) {
  const byTheme = new Map(); // 테마 -> { theme, news, codes:Set }

  for (const item of items) {
    const themes = extractThemes(item);
    if (themes.length === 0) continue;
    for (const theme of themes) {
      let row = byTheme.get(theme);
      if (!row) {
        row = { theme, news: 0, codes: new Set() };
        byTheme.set(theme, row);
      }
      row.news += 1;
      for (const m of item.matches || []) {
        if (m?.code) row.codes.add(m.code);
      }
    }
  }

  const rows = [];
  for (const row of byTheme.values()) {
    const changes = [];
    for (const code of row.codes) {
      const q = quotes?.get?.(code);
      if (q && typeof q.changePct === "number" && Number.isFinite(q.changePct)) changes.push(q.changePct);
    }
    const avg = changes.length ? changes.reduce((a, b) => a + b, 0) / changes.length : null;
    rows.push({
      theme: row.theme,
      news: row.news,
      stockCount: changes.length,
      avgChangePct: avg,
    });
  }

  // 화면의 테마 히트맵은 "오늘 뉴스가 몰린 순서"로 보여줍니다.
  rows.sort((a, b) => b.news - a.news || (b.avgChangePct ?? -99) - (a.avgChangePct ?? -99));
  return rows;
}

// 국내 1등 테마 고르기 — 위의 규칙 1.
function pickDomesticLeader(themeRows) {
  const candidates = themeRows.filter(
    (r) =>
      r.news >= MIN_NEWS_FOR_THEME &&
      r.stockCount >= MIN_STOCKS_FOR_THEME &&
      typeof r.avgChangePct === "number"
  );
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => b.avgChangePct - a.avgChangePct)[0];
}

// 미국 1등 테마 고르기 — ETF 등락률이 가장 높은 것.
function pickUsLeader(etfQuotes) {
  const rows = [];
  for (const t of US_THEMES) {
    const q = etfQuotes?.get?.(t.etf);
    if (q && typeof q.changePct === "number" && Number.isFinite(q.changePct)) {
      rows.push({ ...t, changePct: q.changePct });
    }
  }
  if (rows.length === 0) return null;
  rows.sort((a, b) => b.changePct - a.changePct);
  return rows[0];
}

// 홈 화면 맨 위 문장과 거기 붙는 숫자들을 한 번에 만들어 줍니다.
//
// 돌려주는 모양:
//   {
//     mode: "domestic" | "us" | "quiet",
//     stamp: "10월 19일 (월) · 13:44 기준",
//     lead:  { before, highlight, after },   // 문장을 세 토막으로 (가운데만 색칠)
//     sub:   "오늘 들어온 속보 38건 가운데 …",
//     themeRows: [...],                      // 테마 히트맵용
//     newsCount: 38,
//   }
export function buildTodayBrief({ items, quotes, etfQuotes, now = new Date() }) {
  const k = kstNow(now);
  const stamp = formatKstStamp(now);
  const today = todaysItems(items, now);
  const themeRows = summarizeThemes(today, quotes);

  const beforeOpen = k.hour < 8 || (k.hour === 8 && k.minute < 30);
  const domesticLeader = pickDomesticLeader(themeRows);
  const usLeader = pickUsLeader(etfQuotes);

  // 국내 모드로 갈 수 있는 조건: 개장 뒤이고, 오늘 속보가 충분하고,
  // 1등 테마를 고를 수 있어야 합니다.
  const canDomestic = !beforeOpen && today.length >= MIN_NEWS_FOR_DOMESTIC && domesticLeader;

  if (canDomestic) {
    const up = domesticLeader.avgChangePct >= 0;
    const pct = `${up ? "+" : ""}${domesticLeader.avgChangePct.toFixed(1)}%`;
    return {
      mode: "domestic",
      stamp,
      lead: {
        before: up ? "오늘 시장을 움직인 건 " : "오늘 시장을 끌어내린 건 ",
        highlight: domesticLeader.theme,
        after: "이었습니다",
      },
      sub: `${domesticLeader.theme} 종목 평균 ${pct} · 오늘 들어온 속보 ${today.length}건 가운데 ${domesticLeader.news}건이 이 테마를 가리켰습니다.`,
      themeRows,
      newsCount: today.length,
      leaderTheme: domesticLeader.theme,
      up,
    };
  }

  if (usLeader) {
    const up = usLeader.changePct >= 0;
    const pct = `${up ? "+" : ""}${usLeader.changePct.toFixed(1)}%`;
    const linked = usLeader.koreanTheme ? ` 국내 연결 테마는 ${usLeader.koreanTheme}입니다.` : "";
    return {
      mode: "us",
      stamp,
      lead: {
        before: up ? "밤사이 미국을 움직인 건 " : "밤사이 미국을 끌어내린 건 ",
        highlight: usLeader.label,
        after: "이었습니다",
      },
      sub: `${usLeader.etf} ${pct}.${linked}`,
      themeRows,
      newsCount: today.length,
      leaderTheme: usLeader.koreanTheme || null,
      up,
    };
  }

  // 둘 다 못 고르는 경우(장도 쉬고 미국 시세도 못 받아온 때).
  // 빈 자리를 남기는 대신 지금 상태를 그대로 말합니다.
  return {
    mode: "quiet",
    stamp,
    lead: { before: "오늘은 아직 ", highlight: "조용합니다", after: "" },
    sub:
      today.length > 0
        ? `오늘 들어온 속보는 ${today.length}건입니다. 아래에서 확인하세요.`
        : "새 속보가 들어오면 이 자리에 바로 올라옵니다.",
    themeRows,
    newsCount: today.length,
    leaderTheme: null,
    up: true,
  };
}
