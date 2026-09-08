// GET /api/daily-review/source-data?secret=...
//
// [2026-09-08 추가] "마감시황"(매 거래일 저녁 9시 예약 작업이 자동으로
// 쓰는 장 마감 후기)의 재료를 한 번에 모아주는 전용 엔드포인트. 예약
// 작업이 이거 하나만 호출해서 그날 주도했던 테마·종목·뉴스 화제성·패턴
// 신호를 전부 받아감 — 여러 엔드포인트를 따로따로 호출하면 그중 하나라도
// 실패하거나 캐시가 어긋날 위험이 있어서, 한 곳에서 조합해 하나의 일관된
// 스냅샷으로 내려줌.
//
// 데이터 출처:
//  - app/api/theme-momentum (오늘 등락률 기준 테마/종목 상승·하락 랭킹)
//  - app/api/patterns (오늘 전고점돌파/52주 신고가/골든크로스 등 패턴 신호)
//  - Redis "feed" 리스트 (오늘 자동 매칭된 뉴스에서 어떤 테마/종목이 많이
//    언급됐는지 — 등락률만으론 안 잡히는 "화제성" 보완용)
//
// 인증: 다른 관리/자동화 엔드포인트(app/api/debug-stock, app/api/poll 등)와
// 동일하게 CRON_SECRET을 재사용함.

import { getRedis } from "../../../../lib/redis";
import rawThemeData from "../../../../lib/themeData.json";
import { fetchBothIndexSummaries } from "../../../../lib/marketIndex";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function toBasDt(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${dd}`;
}

// 서버는 UTC로 돌아가므로, "오늘(한국시간 기준) 날짜"를 구하려면 KST(UTC+9)로
// 보정해야 함 — 뉴스 피드 항목의 savedAt(UTC ISO 문자열)이 오늘자인지
// 판단할 때 씀.
function toKstBasDt(date) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return toBasDt(kst);
}

async function fetchJson(origin, path) {
  const res = await fetch(`${origin}${path}`, { cache: "no-store" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${path} 요청 실패 (status ${res.status}): ${text.slice(0, 200)}`);
  }
  return res.json();
}

export async function GET(request) {
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams, origin } = new URL(request.url);
  if (cronSecret) {
    const provided = searchParams.get("secret") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (provided !== cronSecret) {
      return Response.json({ error: "인증되지 않은 요청입니다." }, { status: 401 });
    }
  }

  const redis = getRedis();
  if (!redis) {
    return Response.json({ error: "Redis(Upstash) 환경변수가 아직 설정되지 않았습니다." }, { status: 500 });
  }

  let themeMomentum;
  try {
    themeMomentum = await fetchJson(origin, "/api/theme-momentum");
  } catch (err) {
    return Response.json(
      { error: "테마/등락률 데이터를 가져오지 못했습니다: " + String(err.message || err) },
      { status: 502 }
    );
  }

  // 패턴 데이터는 best-effort — 없어도(예: 캐시가 아직 안 채워졌으면) 글은
  // 등락률·뉴스 자료만으로 충분히 쓸 수 있으므로 실패해도 전체를 막지 않음.
  let patternsData = null;
  try {
    patternsData = await fetchJson(origin, "/api/patterns");
  } catch {
    patternsData = null;
  }

  // [2026-09-08 추가] 재성님 질문 — "오늘 불장이었다가 장막판에 하락해서
  // 음전했는데, 이런 내용도 쓸 수 있나?" 답으로 추가함. 위의 themeMomentum은
  // 전부 "전일 대비 등락률"만 있고 코스피/코스닥 지수 자체의 하루 흐름(장중
  // 얼마나 올랐다가 얼마나 빠졌는지)은 없었어서, 지수 시가/고가/저가/종가와
  // 거기서 계산한 "고점 대비 종가 낙폭" 같은 걸 따로 가져옴 — 자세한 이유는
  // lib/marketIndex.js 주석 참고. 이것도 best-effort(실패해도 나머지 자료로
  // 글은 쓸 수 있어야 하므로 전체를 막지 않음).
  let indexSummaries = { kospi: null, kosdaq: null };
  try {
    indexSummaries = await fetchBothIndexSummaries();
  } catch (err) {
    console.error("daily-review/source-data: 지수 요약 조회 실패:", err.message || err);
  }

  // 원/달러 환율도 참고 자료로 같이 내려줌 — 장 후반 낙폭 확대의 배경으로
  // 자주 언급되는 변수라(환율 급등=원화 약세 흐름 등) 있으면 도움이 됨.
  // 이미 있는 /api/market-ticker를 그대로 재사용(중복 구현 안 함).
  let usdKrw = null;
  try {
    const ticker = await fetchJson(origin, "/api/market-ticker");
    usdKrw = typeof ticker?.usd === "number" ? ticker.usd : null;
  } catch {
    usdKrw = null;
  }

  const { themeChanges = [], dailyMovers = [], dailyLosers = [], recentBasDt } = themeMomentum;

  // 표본이 1~2개뿐인 테마는 우연히 한두 종목만 움직여도 테마 전체가
  // 급등/급락한 것처럼 보일 수 있어 노이즈로 취급 — 최소 3종목 이상만 씀.
  const meaningfulThemes = themeChanges.filter((t) => t.sampleSize1D >= 3 && typeof t.change1D === "number");
  const topThemesUp = [...meaningfulThemes].sort((a, b) => b.change1D - a.change1D).slice(0, 8);
  const topThemesDown = [...meaningfulThemes].sort((a, b) => a.change1D - b.change1D).slice(0, 8);

  // ---- 오늘 뉴스 화제성: feed에서 오늘(KST) 항목만 골라 종목/테마별 언급
  // 횟수를 셈. 등락률만으론 못 잡는 "왜 오늘 이 테마가 움직였는지"의 실마리.
  const codeToThemes = new Map();
  for (const row of rawThemeData) {
    if (!codeToThemes.has(row.code)) codeToThemes.set(row.code, new Set());
    codeToThemes.get(row.code).add(row.theme);
  }

  const todayBasDt = toKstBasDt(new Date());
  const feedRaw = await redis.lrange("feed", 0, 249).catch(() => []);
  const mentionCountByTheme = new Map();
  const mentionCountByStock = new Map(); // code -> { name, count }
  let todayNewsCount = 0;

  for (const raw of feedRaw) {
    let item;
    try {
      item = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      continue;
    }
    if (!item?.savedAt) continue;
    if (toKstBasDt(new Date(item.savedAt)) !== todayBasDt) continue;
    todayNewsCount++;
    for (const m of item.matches || []) {
      if (!m?.code) continue;
      if (!mentionCountByStock.has(m.code)) mentionCountByStock.set(m.code, { name: m.name, count: 0 });
      mentionCountByStock.get(m.code).count += 1;
      for (const theme of codeToThemes.get(m.code) || []) {
        mentionCountByTheme.set(theme, (mentionCountByTheme.get(theme) || 0) + 1);
      }
    }
  }

  const topMentionedThemes = [...mentionCountByTheme.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([theme, count]) => ({ theme, count }));
  const topMentionedStocks = [...mentionCountByStock.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([code, v]) => ({ code, name: v.name, count: v.count }));

  // ---- 패턴 신호 요약: 오늘 몇 종목이 신고가/골든크로스 등에 잡혔는지는
  // 시장 전체 분위기(강세/약세 폭)를 가늠하는 좋은 보조 지표.
  let patternHighlights = null;
  if (patternsData?.patterns) {
    const p = patternsData.patterns;
    const topNames = (arr) => (arr || []).slice(0, 5).map((s) => s.name);
    patternHighlights = {
      breakoutCount: p.breakout_prior_high?.length || 0,
      breakoutNames: topNames(p.breakout_prior_high),
      fiftyTwoWeekHighCount: p.fifty_two_week_high?.length || 0,
      fiftyTwoWeekLowCount: p.fifty_two_week_low?.length || 0,
      goldenCrossCount: p.golden_cross?.length || 0,
      goldenCrossNames: topNames(p.golden_cross),
      deadCrossCount: p.dead_cross?.length || 0,
    };
  }

  return Response.json({
    basDt: recentBasDt,
    todayNewsCount,
    topThemesUp,
    topThemesDown,
    topGainers: dailyMovers.slice(0, 10),
    topLosers: dailyLosers.slice(0, 10),
    topMentionedThemes,
    topMentionedStocks,
    patternHighlights,
    kospiIndex: indexSummaries.kospi,
    kosdaqIndex: indexSummaries.kosdaq,
    usdKrw,
  });
}
