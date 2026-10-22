// lib/todayBrief.js
//
// [2026-10-19 신설] 홈 화면 맨 위 문장을 만드는 곳입니다.
//
//   "오늘 시장을 움직인 건 해운이었습니다"
//   "밤사이 미국을 움직인 건 로봇이었습니다"
//
// 재성님과 정한 규칙이 전부 여기 들어 있습니다.
//
// ── 규칙 0. 한국 칸의 기준 (2026-10-20 변경) ──
// 1순위: 국내 테마 ETF 등락률 (lib/krThemes.js) — 실제 증시값입니다.
// 2순위: ETF를 하나도 못 받아오면, 아래 규칙 1의 뉴스 기준으로 돌아갑니다.
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
// ── 규칙 2. 미국과 한국을 나란히 보여줍니다 ──
// [2026-10-20 변경] 처음에는 시간대에 따라 둘 중 하나만 보여줬는데,
// 재성님 요청으로 왼쪽 미국 / 오른쪽 한국 두 줄을 항상 같이 띄웁니다.
// 대신 시각에 맞춰 말투를 바꿉니다.
//   · 미국: 장중(한국시간 밤)이면 "지금 미국을 움직이는 건"
//           장이 끝났으면        "밤사이 미국을 움직인 건"
//   · 한국: 장중이면             "오늘 한국을 움직이는 건"
//           장이 끝났으면        "오늘 한국을 움직인 건"
//           개장 전이라 오늘 자료가 모자라면 어제 것으로 "어제 한국을 …"
//           그마저 없으면        "아직 조용합니다"
//
// ── 규칙 3. 하락장이면 문구를 뒤집습니다 ──
// 1등 테마마저 마이너스인데 "움직였다"고 하면 어색합니다.
//   · 플러스  → "시장을 움직인 건 ○○이었습니다"
//   · 마이너스 → "시장을 끌어내린 건 ○○이었습니다"

import { US_THEMES } from "./usThemes";
import { KR_THEMES } from "./krThemes";

// 테마가 후보에 오르려면 오늘 속보가 최소 이만큼 있어야 합니다.
const MIN_NEWS_FOR_THEME = 2;
// 테마 안에 등락률을 아는 종목이 최소 이만큼 있어야 합니다(한 종목 급등 방어).
const MIN_STOCKS_FOR_THEME = 2;
// 국내 모드로 가려면 오늘 속보가 최소 이만큼 있어야 합니다.
const MIN_NEWS_FOR_DOMESTIC = 5;

// ── 규칙 4. 잠잠한 날에는 "움직였다"고 하지 않습니다 ──
// [2026-10-20 추가] 12개 테마가 전부 ±0.3%인 날에도 1등은 반드시 나옵니다.
// 그때 "시장을 움직였다"고 하면 과장입니다. 1등의 등락이 아래 기준보다
// 작으면 "조용했습니다"로 바꿔 말합니다.
//
// 국내 테마주는 미국 ETF보다 변동이 커서 기준을 더 높게 잡았습니다.
// 너무 자주 "조용합니다"가 뜨면 숫자를 낮추고, "움직였다"가 남발되면
// 올리면 됩니다. 이 두 줄만 고치면 됩니다.
const US_QUIET_PCT = 1.0; // 미국 ETF 기준
// [2026-10-21 변경] 재성님 요청 — 한국 칸 문장은 **코스피 지수**가 정합니다.
//
//   코스피 +0.5% 이상  ->  "오늘 한국을 움직인 건 ○○"   (제일 많이 오른 테마)
//   코스피 -0.5% 이하  ->  "오늘 한국을 끌어내린 건 ○○" (제일 많이 빠진 테마)
//   그 사이(±0.5% 안)  ->  "오늘 한국은 조용했습니다"
//
// 예전에는 테마 ETF들끼리 비교해서 제일 크게 움직인 쪽으로 정했습니다.
// 그러면 코스피는 올랐는데 "끌어내린 건"이라고 쓰는 일이 생깁니다
// (어느 테마 하나가 크게 빠지면). 시장 전체 방향은 코스피가 정하고,
// 테마는 그 방향의 대표선수를 고르는 것이 맞습니다.
const KOSPI_QUIET_PCT = 0.5;

// 오늘 시세가 최소 이만큼은 들어와야 "오늘 값"으로 인정합니다.
// 장 시작 직후에는 종목별로 들어오는 시간이 조금씩 다릅니다.
const MIN_FRESH_KR_THEMES = 5; // 국내 테마 평균 기준

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

// 어제(한국시간 어제 0시 ~ 오늘 0시) 올라온 항목.
// 개장 전에는 오늘 자료가 거의 없어서, 그 자리를 어제 것으로 채웁니다.
export function yesterdaysItems(items, now = new Date()) {
  const { startOfDayMs } = kstNow(now);
  const prevStart = startOfDayMs - 24 * 60 * 60 * 1000;
  return (items || []).filter((it) => {
    const ms = Date.parse(it?.pubDate || it?.savedAt || "");
    return Number.isFinite(ms) && ms >= prevStart && ms < startOfDayMs;
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

// ── 1등 고르기 ────────────────────────────────────────────────────────
//
// [2026-10-20 수정] 하락장에서 거꾸로 나오던 버그를 고쳤습니다.
//
// 예전 코드는 "제일 많이 오른 것" 하나만 뽑고, 그게 마이너스면 문구만
// "끌어내린 건"으로 바꿨습니다. 그런데 12개 테마가 전부 마이너스인 날
// (로봇 -0.5%, 나머지 -3~-5%)에는 **제일 덜 빠진** 로봇이 1등이 되고,
// "밤사이 미국을 끌어내린 건 로봇이었습니다"라고 나갔습니다. 반대입니다.
//
// 이제 양쪽 끝을 다 구해서 상황에 맞는 쪽을 씁니다.
//   · 제일 많이 오른 것이 플러스면  -> 그것이 "움직인 건"
//   · 그것마저 마이너스면           -> 제일 많이 빠진 것이 "끌어내린 건"

// 국내 후보 추리기 — 위의 규칙 1.
function rankDomestic(themeRows) {
  const candidates = themeRows.filter(
    (r) =>
      r.news >= MIN_NEWS_FOR_THEME &&
      r.stockCount >= MIN_STOCKS_FOR_THEME &&
      typeof r.avgChangePct === "number"
  );
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort((a, b) => b.avgChangePct - a.avgChangePct);
  return { best: sorted[0], worst: sorted[sorted.length - 1] };
}

// 국내 ETF 후보 추리기 — 미국과 똑같은 방식입니다.
//
// [2026-10-20 추가] 재성님 요청 — "한국도 뉴스 기준 말고 실제 증시값
// 기준으로". 뉴스에 걸린 종목 평균 대신, 그 테마를 담은 ETF의 등락률을
// 봅니다. 뉴스가 한 건도 안 들어온 테마도 후보가 됩니다.
//
// ETF를 하나도 못 받아오면 null을 돌려주고, 그때는 부르는 쪽에서
// 예전 뉴스 기준으로 돌아갑니다.
//
// [2026-10-21 수정] 재성님 리포트 — "한국 장중인데 왜 안 바뀌지?"
//
// 실제로 안 바뀌고 있었습니다. 10월 20일에도 10월 21일 오전에도 똑같이
// "우주·항공 ETF -9.9%"가 떴습니다. 같은 숫자가 이틀 연속 소수점까지
// 똑같이 나올 수는 없습니다. **어제 종가를 오늘 값인 것처럼 보여주고
// 있었습니다.**
//
// 왜 그랬나:
// 야후의 국내 시세는 15~20분 지연입니다. 그래서 9시에 장이 열려도
// 9시 20분쯤까지는 야후가 아직 "어제 종가"를 현재가로 들고 있습니다.
// 그런데 이 함수는 숫자만 보고 **그 숫자가 언제 것인지는 보지 않았습니다.**
// (lib/quotes.js의 날짜 검사는 "5일보다 오래된 것"만 버리기 때문에
//  어제 값은 그냥 통과합니다.)
//
// 그 결과 9시~9시 20분에 들어온 방문자는
//   라벨: "지금 한국 (장중)"   ← 오늘
//   숫자: 어제 종가            ← 어제
// 이렇게 짝이 안 맞는 화면을 봤습니다. 장중인데 안 바뀌는 것처럼 보인
// 이유가 이것입니다.
//
// 어떻게 고쳤나:
// 시세마다 딸려오는 "기준 시각(asOf)"을 보고 **오늘 것만** 씁니다.
//   · 오늘 것이 하나라도 있으면 -> 그것만 쓰고 fresh: true
//   · 전부 어제 것이면          -> 그대로 쓰되 fresh: false 를 달아서
//                                 부르는 쪽이 "어제 마감 기준"이라고
//                                 솔직하게 쓰게 합니다
//   · 아무것도 없으면           -> null (예전 뉴스 기준으로 돌아감)
//
// 이러면 9시~9시 20분에는 "어제 한국 (마감)"으로 뜨다가, 오늘 값이
// 들어오는 순간 자동으로 "지금 한국 (장중)"으로 바뀝니다.
function rankKrEtf(krEtfQuotes, startOfDayMs) {
  const fresh = [];
  const all = [];

  for (const t of KR_THEMES) {
    const q = krEtfQuotes?.get?.(`${t.code}.KS`);
    if (!q || typeof q.changePct !== "number" || !Number.isFinite(q.changePct)) continue;

    const row = { ...t, changePct: q.changePct };
    all.push(row);

    // asOf는 "2026-10-21T00:16:00.000Z" 같은 글자입니다. 이것이 한국시간
    // 오늘 0시 이후면 오늘 장 자료입니다.
    const stamp = q.asOf ? Date.parse(q.asOf) : NaN;
    if (Number.isFinite(stamp) && typeof startOfDayMs === "number" && stamp >= startOfDayMs) {
      fresh.push(row);
    }
  }

  // 오늘 값이 한두 개만 들어온 상태에서 그것만 쓰면 "테마 1개 중 1위"
  // 같은 말이 나옵니다. 절반 이상 들어왔을 때만 오늘 것으로 인정합니다.
  const enough = fresh.length >= MIN_FRESH_KR_THEMES;
  const rows = enough ? fresh : all;
  if (rows.length === 0) return null;

  const sorted = [...rows].sort((a, b) => b.changePct - a.changePct);
  return {
    best: sorted[0],
    worst: sorted[sorted.length - 1],
    count: rows.length,
    fresh: enough,
  };
}

// 미국 후보 추리기 — ETF 등락률.
function rankUs(etfQuotes) {
  const rows = [];
  for (const t of US_THEMES) {
    const q = etfQuotes?.get?.(t.etf);
    if (q && typeof q.changePct === "number" && Number.isFinite(q.changePct)) {
      rows.push({ ...t, changePct: q.changePct });
    }
  }
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => b.changePct - a.changePct);
  return { best: sorted[0], worst: sorted[sorted.length - 1] };
}

// ── 받침 처리 ────────────────────────────────────────────────────────
//
// 한글은 마지막 글자에 받침이 있으면 "이었습니다", 없으면 "였습니다"입니다.
//   해운(받침 ㄴ)      -> 해운이었습니다
//   2차전지(받침 없음) -> 2차전지였습니다
// 이걸 안 하면 "2차전지이었습니다"처럼 어색해집니다.
//
// 한글 한 글자의 코드에서 0xAC00을 빼고 28로 나눈 나머지가 0이 아니면
// 받침이 있는 글자입니다. 마지막 글자가 한글이 아니면(영문·숫자 등)
// 그냥 받침이 있는 것으로 봅니다("ETF이었습니다"가 덜 어색합니다).
function hasFinalConsonant(word) {
  const last = String(word || "").trim().slice(-1);
  const code = last.charCodeAt(0);
  if (!Number.isFinite(code)) return true;
  if (code < 0xac00 || code > 0xd7a3) return true;
  return (code - 0xac00) % 28 !== 0;
}

function pastSuffix(word) {
  return hasFinalConsonant(word) ? "이었습니다" : "였습니다";
}

function signed(value, digits = 1) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

// [2026-10-21 신설] "제일 크게 움직인 것" 고르기.
//
// 왜 만들었나 — 시험하다 발견한 버그입니다:
// 원래는 "1등이 플러스면 1등을, 마이너스면 꼴찌를" 골랐습니다.
// 그런데 이러면 오르는 것과 내리는 것이 섞인 날에 틀립니다.
//   예) 헬스케어 +0.4% / 방산·우주 -9.9%
//       -> 1등(헬스케어)이 플러스니까 헬스케어를 고름
//       -> 심지어 "+0.4%는 2% 미만이니 오늘은 조용했습니다"가 됨
//       -> 9.9% 빠진 날인데 조용했다고 써버립니다
//
// 그래서 부호를 먼저 보지 말고 **움직인 폭(절댓값)이 큰 쪽**을 고릅니다.
// 올라서 1등이든 내려서 꼴찌든, 그날 제일 크게 움직인 것이 그날의 주인공입니다.
//
// "조용한 날" 판단도 같이 고쳤습니다. 위아래 둘 다 기준치 안쪽일 때만
// 조용한 것이지, 한쪽이라도 크게 움직였으면 조용한 날이 아닙니다.
function pickMover(best, worst) {
  const bestMag = Math.abs(best.changePct);
  const worstMag = Math.abs(worst.changePct);
  const leader = bestMag >= worstMag ? best : worst;
  return { leader, up: leader.changePct >= 0, maxMag: Math.max(bestMag, worstMag) };
}

// ── 미국 칸 ──────────────────────────────────────────────────────────
function buildUsPanel(etfQuotes, k) {
  // 미국 정규장은 한국시간으로 대략 23:30 ~ 06:00입니다(서머타임에 따라
  // 한 시간 움직입니다). 그 사이면 "지금", 아니면 "밤사이"로 씁니다.
  const live = k.hour >= 23 || k.hour < 6;
  const when = live ? "지금 미국" : "밤사이 미국";

  const r = rankUs(etfQuotes);
  if (!r) {
    return {
      label: "미국",
      lead: { before: "미국 지표를 ", highlight: "불러오지 못했습니다", after: "" },
      sub: "잠시 후 다시 확인해주세요.",
      up: true,
      theme: null,
    };
  }

  const { leader, up, maxMag } = pickMover(r.best, r.worst);

  // 잠잠한 날에는 1등을 뽑아도 "움직였다"고 말할 수 없습니다.
  if (maxMag < US_QUIET_PCT) {
    return {
      label: when,
      lead: { before: `${when}은 `, highlight: live ? "조용합니다" : "조용했습니다", after: "" },
      sub: `테마별 등락이 ±${US_QUIET_PCT}% 안쪽입니다. 가장 큰 건 ${leader.label} ${signed(leader.changePct)}.`,
      up: true,
      theme: null,
    };
  }

  return {
    label: live ? "지금 미국 (장중)" : "밤사이 미국",
    lead: {
      before: up ? `${when}을 움직${live ? "이는" : "인"} 건 ` : `${when}을 끌어내${live ? "리는" : "린"} 건 `,
      highlight: leader.label,
      after: live ? "입니다" : pastSuffix(leader.label),
    },
    sub: `${leader.etf} ${signed(leader.changePct)}${leader.koreanTheme ? ` · 국내 연결 테마는 ${leader.koreanTheme}` : ""}`,
    up,
    theme: leader.koreanTheme || null,
  };
}

// ── 한국 칸 ──────────────────────────────────────────────────────────
// 오늘 자료가 모자라면(개장 전·주말) 어제 것으로 대신 채웁니다.
function buildDomesticPanel(items, today, todayRows, quotes, k, now, krEtfQuotes, kospi) {
  // 국내 정규장은 09:00 ~ 15:30입니다.
  const marketOpen = k.hour >= 9 && (k.hour < 15 || (k.hour === 15 && k.minute < 30));

  // ── ① 실제 증시값 기준 — 이게 1순위입니다 ──
  //    방향은 코스피가, 대표 테마는 ETF가 정합니다.
  const etf = rankKrEtf(krEtfQuotes, k.startOfDayMs);
  if (etf) {
    // 받아온 값이 어제 것이면(장 시작 직후 20분쯤), 장중이어도
    // "장중"이라고 쓰면 안 됩니다. 어제 값이라고 밝힙니다.
    const stale = etf.fresh === false;
    const live = marketOpen && !stale;
    const label = stale ? "어제 한국 (마감)" : marketOpen ? "지금 한국 (장중)" : "오늘 한국";
    const dayWord = stale ? "어제" : "오늘";
    const staleNote = stale ? " · 오늘 시세는 9시 20분쯤부터 반영됩니다" : "";

    // 코스피 등락률. 못 받아왔으면(null) 예전처럼 테마끼리 비교합니다.
    const kospiPct =
      kospi && typeof kospi.changePct === "number" && Number.isFinite(kospi.changePct)
        ? kospi.changePct
        : null;

    // ⓐ 코스피가 거의 안 움직인 날 — 조용했다고 씁니다.
    if (kospiPct !== null && Math.abs(kospiPct) < KOSPI_QUIET_PCT) {
      return {
        label,
        lead: { before: `${dayWord} 한국은 `, highlight: live ? "조용합니다" : "조용했습니다", after: "" },
        sub: `코스피 ${signed(kospiPct, 2)} · 테마 중 가장 큰 건 ${
          Math.abs(etf.best.changePct) >= Math.abs(etf.worst.changePct) ? etf.best.label : etf.worst.label
        } ${signed(
          Math.abs(etf.best.changePct) >= Math.abs(etf.worst.changePct) ? etf.best.changePct : etf.worst.changePct
        )}.${staleNote}`,
        up: kospiPct >= 0,
        theme: null,
        basis: "kospi",
      };
    }

    // ⓑ 방향을 정합니다.
    let up;
    let leader;
    if (kospiPct !== null) {
      up = kospiPct > 0;
      // 코스피가 오른 날이면 제일 많이 오른 테마, 내린 날이면 제일 많이 빠진 테마.
      leader = up ? etf.best : etf.worst;

      // 안전장치: 코스피는 올랐는데 테마가 전부 마이너스인 날이 드물게
      // 있습니다(코스피를 끌어올린 대형주가 이 13개 테마에 없는 경우).
      // 그때 "움직인 건 ○○ -0.3%"라고 쓰면 말이 안 되니, 이때만
      // 예전 방식(제일 크게 움직인 쪽)으로 돌아갑니다.
      if ((up && leader.changePct <= 0) || (!up && leader.changePct >= 0)) {
        const fallback = pickMover(etf.best, etf.worst);
        leader = fallback.leader;
        up = fallback.up;
      }
    } else {
      // 코스피를 못 받아온 경우 — 예전 방식.
      const picked = pickMover(etf.best, etf.worst);
      leader = picked.leader;
      up = picked.up;
    }

    const kospiNote = kospiPct !== null ? `코스피 ${signed(kospiPct, 2)} · ` : "";

    return {
      label,
      lead: {
        before: up
          ? `${dayWord} 한국을 움직${live ? "이는" : "인"} 건 `
          : `${dayWord} 한국을 끌어내${live ? "리는" : "린"} 건 `,
        highlight: leader.label,
        after: live ? "입니다" : pastSuffix(leader.label),
      },
      sub: `${kospiNote}${leader.label} ETF ${signed(leader.changePct)}${staleNote}`,
      up,
      theme: leader.koreanTheme || null,
      basis: "kospi",
    };
  }

  // ── ② ETF를 못 받아왔을 때만 — 예전처럼 뉴스에 걸린 종목 평균 ──

  let rows = todayRows;
  let ranked = rankDomestic(rows);
  let when = "오늘";
  let count = today.length;

  if (!ranked || today.length < MIN_NEWS_FOR_DOMESTIC) {
    const prev = yesterdaysItems(items, now);
    const prevRows = summarizeThemes(prev, quotes);
    const prevRanked = rankDomestic(prevRows);
    if (prevRanked) {
      rows = prevRows;
      ranked = prevRanked;
      when = "어제";
      count = prev.length;
    }
  }

  if (!ranked) {
    return {
      label: "한국",
      lead: { before: "오늘은 아직 ", highlight: "조용합니다", after: "" },
      sub:
        today.length > 0
          ? `오늘 들어온 속보는 ${today.length}건입니다.`
          : "새 속보가 들어오면 바로 올라옵니다.",
      up: true,
      theme: null,
    };
  }

  const live = when === "오늘" && marketOpen;
  const label = when === "오늘" ? (marketOpen ? "지금 한국 (장중)" : "오늘 한국") : "어제 한국";

  const up = ranked.best.avgChangePct >= 0;
  const leader = up ? ranked.best : ranked.worst;

  // 잠잠한 날 — 미국과 같은 이유입니다. 국내 테마주는 변동이 커서
  // 기준을 미국(1%)보다 높게 잡았습니다.
  if (Math.abs(leader.avgChangePct) < KOSPI_QUIET_PCT) {
    return {
      label,
      lead: { before: `${when} 한국은 `, highlight: live ? "조용합니다" : "조용했습니다", after: "" },
      sub: `테마별 평균 등락이 ±${KOSPI_QUIET_PCT}% 안쪽입니다. 가장 큰 건 ${ranked.best.theme} ${signed(ranked.best.avgChangePct)}.`,
      up: true,
      theme: null,
    };
  }

  return {
    label,
    lead: {
      before: up
        ? `${when} 한국을 움직${live ? "이는" : "인"} 건 `
        : `${when} 한국을 끌어내${live ? "리는" : "린"} 건 `,
      highlight: leader.theme,
      after: live ? "입니다" : pastSuffix(leader.theme),
    },
    sub: `${leader.theme} 종목 평균 ${signed(leader.avgChangePct)} · 속보 ${count}건 가운데 ${leader.news}건`,
    up,
    theme: leader.theme,
  };
}

// 홈 화면 맨 위 두 칸과 거기 붙는 숫자들을 한 번에 만들어 줍니다.
//
// 돌려주는 모양:
//   {
//     stamp: "10월 20일 (화) · 09:12 기준",
//     us:       { label, lead:{before,highlight,after}, sub, up, theme },
//     domestic: { label, lead, sub, up, theme },
//     themeRows: [...],   // 테마 히트맵용
//     newsCount: 38,
//   }
// kospi: 코스피 지수 시세 { changePct, asOf } — 한국 칸의 문장 방향을 정합니다.
export function buildTodayBrief({ items, quotes, etfQuotes, krEtfQuotes, kospi, now = new Date() }) {
  const k = kstNow(now);
  const today = todaysItems(items, now);
  const themeRows = summarizeThemes(today, quotes);

  return {
    stamp: formatKstStamp(now),
    newsCount: today.length,
    themeRows,
    us: buildUsPanel(etfQuotes, k),
    domestic: buildDomesticPanel(items, today, themeRows, quotes, k, now, krEtfQuotes, kospi),
  };
}
