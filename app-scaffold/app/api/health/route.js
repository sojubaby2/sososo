// GET /api/health
// GET /api/health?secret=<CRON_SECRET>   (환경변수 설정 여부까지 같이 봄)
//
// [2026-09-11 추가] 사이트의 "건강검진표". 자동으로 돌아야 하는 것들이
// 지금 실제로 돌고 있는지를 한 번에 모아서 보여줌.
//
// 만든 이유: 2026-09-11 점검에서 뉴스 피드(하루 멈춤) / 패턴검색 결과
// (나흘 멈춤) / 마감시황(글 0건)이 동시에 문제였는데, 각각을 따로따로
// 열어보고 시각을 비교해봐야만 알 수 있었음. 앞으로는 /health 주소 한 번만
// 열면 어디가 멈췄는지 바로 보이게 함.
//
// 여기서는 "값을 읽기만" 함 — 어떤 것도 새로 계산하거나 갱신하지 않으므로
// 아무 때나 마음 놓고 열어봐도 됨(무거운 작업 없음, Redis 읽기 몇 번뿐).
//
// 보안: 환경변수(API 키 등)가 "설정돼 있는지 아닌지"는 남한테 굳이 보여줄
// 정보가 아니라서, ?secret=CRON_SECRET 을 붙였을 때만 env 항목을 포함함.
// 키 값 자체는 어떤 경우에도 절대 내보내지 않음(설정됨/안됨만).

import { getRedis } from "../../../lib/redis";
import { getStoredDayCount, getStoredDatesAscending, HISTORY_LOOKBACK_DAYS } from "../../../lib/priceHistory";
import { RESULTS_CACHE_KEY } from "../../../lib/patternsScan";
import { listDailyReviewDates } from "../../../lib/dailyReview";
import { getCachedDailyOutlook } from "../../../lib/dailyOutlook";
import { readRun, RUN_POLL, RUN_TELEGRAM, RUN_DAILY_REVIEW, RUN_DAILY_OUTLOOK } from "../../../lib/runStatus";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// 어떤 시각이 "몇 분 전"인지 계산. 시각이 없거나 이상하면 null.
function minutesAgo(iso) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.round((Date.now() - t) / 60000);
}

// 신호등 판정 — okMax분 이내면 초록, warnMax분 이내면 노랑, 그 뒤는 빨강.
// 값 자체가 없으면 빨강("아예 안 돌고 있음"이 가장 흔한 원인이라서).
function level(mins, okMax, warnMax) {
  if (mins === null) return "red";
  if (mins <= okMax) return "ok";
  if (mins <= warnMax) return "warn";
  return "red";
}

// KST 기준 "지금이 평일 장중~장마감 직후인지" — 주말·새벽에 "뉴스가 안
// 들어온다"고 빨간불을 켜는 건 오해를 부르므로, 그런 시간대에는 판정을
// 한 단계 느슨하게 함.
function kstNow() {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return { day: d.getUTCDay(), hour: d.getUTCHours() };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const cronSecret = process.env.CRON_SECRET;
  const showEnv = !!cronSecret && searchParams.get("secret") === cronSecret;

  const redis = getRedis();
  if (!redis) {
    return Response.json(
      {
        generatedAt: new Date().toISOString(),
        fatal: "Redis(Upstash) 환경변수가 설정되지 않았습니다 — 사이트의 거의 모든 기능이 동작하지 않습니다.",
      },
      { status: 500 }
    );
  }

  const report = { generatedAt: new Date().toISOString(), checks: [] };
  const { day: kstDay, hour: kstHour } = kstNow();
  const isWeekend = kstDay === 0 || kstDay === 6;
  const isQuietHours = kstHour < 7 || kstHour >= 23; // 새벽·심야엔 뉴스가 원래 거의 없음

  // ── 1) 뉴스 피드 ────────────────────────────────────────────────
  try {
    const [count, head] = await Promise.all([
      redis.llen("feed"),
      redis.lrange("feed", 0, 0),
    ]);
    let latest = null;
    if (head && head.length > 0) {
      const item = typeof head[0] === "string" ? JSON.parse(head[0]) : head[0];
      latest = item?.pubDate || item?.publishedAt || null;
    }
    const mins = minutesAgo(latest);
    // 평일 낮이면 3시간 넘게 새 글이 없는 건 이상함. 주말·심야엔 훨씬 느슨하게.
    const okMax = isWeekend || isQuietHours ? 60 * 24 * 3 : 180;
    const warnMax = isWeekend || isQuietHours ? 60 * 24 * 4 : 60 * 8;
    report.checks.push({
      key: "feed",
      label: "뉴스 피드",
      level: level(mins, okMax, warnMax),
      latestAt: latest,
      minutesAgo: mins,
      count,
      hint: "새 글이 안 들어오면 오라클 서버의 텔레그램 수집 프로그램(telegram-listener)을 먼저 확인하세요.",
    });
  } catch (err) {
    report.checks.push({ key: "feed", label: "뉴스 피드", level: "red", error: String(err?.message || err) });
  }

  // ── 2) 텔레그램 수집 (마지막으로 메시지가 도착한 시각) ──────────
  try {
    const run = await readRun(redis, RUN_TELEGRAM);
    const mins = minutesAgo(run?.at);
    const okMax = isWeekend || isQuietHours ? 60 * 24 * 3 : 180;
    const warnMax = isWeekend || isQuietHours ? 60 * 24 * 4 : 60 * 8;
    report.checks.push({
      key: "telegram",
      label: "텔레그램 수집",
      level: level(mins, okMax, warnMax),
      latestAt: run?.at || null,
      minutesAgo: mins,
      detail: run || null,
      hint: "여기 시각이 안 움직이면 사이트가 아니라 오라클 서버 쪽 문제입니다. (이 기록은 2026-09-11 이후 배포분부터 쌓입니다)",
    });
  } catch (err) {
    report.checks.push({ key: "telegram", label: "텔레그램 수집", level: "red", error: String(err?.message || err) });
  }

  // ── 3) 30분 자동 작업(/api/poll) ────────────────────────────────
  try {
    const run = await readRun(redis, RUN_POLL);
    const mins = minutesAgo(run?.at);
    report.checks.push({
      key: "poll",
      label: "30분 자동작업 (시세저장·패턴스캔)",
      level: level(mins, 70, 180), // 30분 주기 → 70분 넘으면 노랑
      latestAt: run?.at || null,
      minutesAgo: mins,
      detail: run || null,
      hint: "시각이 안 움직이면 cron-job.org에 등록된 /api/poll 작업이 꺼져 있거나 실패하고 있습니다. (이 기록은 2026-09-11 이후 배포분부터 쌓입니다)",
    });
  } catch (err) {
    report.checks.push({ key: "poll", label: "30분 자동작업", level: "red", error: String(err?.message || err) });
  }

  // ── 4) 패턴검색 결과 캐시 ───────────────────────────────────────
  try {
    const [cached, ttl] = await Promise.all([
      redis.get(RESULTS_CACHE_KEY),
      redis.ttl(RESULTS_CACHE_KEY).catch(() => null),
    ]);
    const data = typeof cached === "string" ? JSON.parse(cached) : cached;
    const generatedAt = data?.generatedAt || null;
    const mins = minutesAgo(generatedAt);
    report.checks.push({
      key: "patterns",
      label: "패턴검색 결과",
      level: level(mins, 60 * 6, 60 * 24),
      latestAt: generatedAt,
      minutesAgo: mins,
      cacheKey: RESULTS_CACHE_KEY,
      ttlSeconds: typeof ttl === "number" ? ttl : null,
      patternCount: data?.patterns ? Object.keys(data.patterns).length : 0,
      hint: "30분 자동작업(/api/poll)이 이 값을 갱신합니다. 여기가 오래됐으면 위 3번을 먼저 보세요.",
    });
  } catch (err) {
    report.checks.push({ key: "patterns", label: "패턴검색 결과", level: "red", error: String(err?.message || err) });
  }

  // ── 5) 시세 히스토리(일봉) 쌓인 정도 ────────────────────────────
  try {
    const [days, newestList] = await Promise.all([
      getStoredDayCount(redis).catch(() => 0),
      getStoredDatesAscending(redis, HISTORY_LOOKBACK_DAYS).catch(() => []),
    ]);
    const newest = newestList.length ? newestList[newestList.length - 1] : null;
    report.checks.push({
      key: "history",
      label: "시세 히스토리",
      level: days > 0 ? "ok" : "red",
      storedDays: days,
      targetDays: HISTORY_LOOKBACK_DAYS,
      newestBasDt: newest,
      hint: "목표치까지는 30분 자동작업이 조금씩 채웁니다. 일수가 며칠째 그대로면 백필이 멈춘 것입니다.",
    });
  } catch (err) {
    report.checks.push({ key: "history", label: "시세 히스토리", level: "red", error: String(err?.message || err) });
  }

  // ── 6) 마감시황 ─────────────────────────────────────────────────
  try {
    const [dates, run] = await Promise.all([
      listDailyReviewDates(redis, 999).catch(() => []),
      readRun(redis, RUN_DAILY_REVIEW),
    ]);
    report.checks.push({
      key: "dailyReview",
      label: "마감시황",
      level: dates.length > 0 ? "ok" : "red",
      postCount: dates.length,
      latestDate: dates[0] || null,
      lastRun: run || null,
      hint: "글이 0건이면 cron-job.org의 /api/daily-review/refresh 작업(평일 저녁 9시)이 등록 안 됐거나 실패하고 있습니다.",
    });
  } catch (err) {
    report.checks.push({ key: "dailyReview", label: "마감시황", level: "red", error: String(err?.message || err) });
  }

  // ── 7) 오늘의 전망 ──────────────────────────────────────────────
  try {
    const [outlook, run] = await Promise.all([
      getCachedDailyOutlook(redis).catch(() => null),
      readRun(redis, RUN_DAILY_OUTLOOK),
    ]);
    const mins = minutesAgo(outlook?.generatedAt);
    report.checks.push({
      key: "dailyOutlook",
      label: "오늘의 전망",
      level: level(mins, 60 * 30, 60 * 48), // 하루 한 번 갱신 → 30시간까지는 정상
      latestAt: outlook?.generatedAt || null,
      minutesAgo: mins,
      dateLabel: outlook?.dateLabel || null,
      lastRun: run || null,
      hint: "cron-job.org의 /api/daily-outlook/refresh 작업(평일 아침 7시 50분)이 갱신합니다.",
    });
  } catch (err) {
    report.checks.push({ key: "dailyOutlook", label: "오늘의 전망", level: "red", error: String(err?.message || err) });
  }

  // ── 8) 환경변수 (secret을 붙였을 때만) ──────────────────────────
  if (showEnv) {
    const names = [
      "KV_REST_API_URL",
      "KV_REST_API_TOKEN",
      "UPSTASH_REDIS_REST_URL",
      "UPSTASH_REDIS_REST_TOKEN",
      "ANTHROPIC_API_KEY",
      "KRX_OPENAPI_KEY",
      "CRON_SECRET",
      "TELEGRAM_INGEST_SECRET",
      "FRED_API_KEY",
      "ALPHA_VANTAGE_API_KEY",
    ];
    report.env = {};
    for (const n of names) report.env[n] = process.env[n] ? "설정됨" : "없음";
  } else {
    report.envNote = "환경변수 설정 여부까지 보려면 주소 뒤에 ?secret=<CRON_SECRET> 을 붙이세요.";
  }

  const worst = report.checks.some((c) => c.level === "red")
    ? "red"
    : report.checks.some((c) => c.level === "warn")
      ? "warn"
      : "ok";
  report.overall = worst;

  return Response.json(report, {
    headers: { "Cache-Control": "no-store" },
  });
}
