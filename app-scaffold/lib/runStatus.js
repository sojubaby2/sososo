// lib/runStatus.js
//
// [2026-09-11 추가] 자동 작업(cron·텔레그램 수집)이 "마지막으로 언제, 어떤
// 결과로 돌았는지"를 Redis에 한 줄씩 남겨두는 아주 작은 기록 장치.
//
// 왜 만들었나: 2026-09-11 점검에서 ① 뉴스 피드가 하루 동안 멈춰 있었고
// ② 패턴검색 결과가 9월 7일자에서 안 바뀌고 있었으며 ③ 마감시황 글이 한
// 건도 없었음. 그런데 "왜 멈췄는지"를 알 방법이 전혀 없었음 — 자동 작업들이
// 전부 "돌고 나면 아무 흔적도 안 남기고" 끝나기 때문. cron-job.org가 호출을
// 아예 안 하고 있는 건지, 호출은 되는데 에러가 나는 건지, 성공은 하는데
// 저장이 안 되는 건지 구분이 안 됨.
//
// 그래서 각 자동 작업이 끝날 때 여기에 "언제 / 성공인지 / 결과 요약"을
// 남기고, app/api/health/route.js(+ /health 화면)가 그걸 모아서 한 화면에
// 보여줌. 다음에 또 뭔가 멈추면 /health 한 번만 열어보면 어디가 멈췄는지
// 바로 알 수 있음.
//
// 설계 원칙: 이 기록은 어디까지나 "참고용 메모"라서, 기록에 실패하더라도
// 원래 작업(뉴스 게재, 시세 저장 등)을 절대 방해하면 안 됨 — 그래서 모든
// 함수가 try/catch로 감싸여 있고 실패하면 조용히 넘어감.

const KEY_PREFIX = "status:run:";

// 14일 — 2주 넘게 안 돈 작업이면 "기록 없음"으로 뜨는 게 오히려 정확함.
const TTL_SECONDS = 60 * 60 * 24 * 14;

// 작업 이름(=Redis 키 이름) 상수. 오타로 다른 키에 쓰는 걸 막으려고 모아둠.
export const RUN_POLL = "poll";
export const RUN_TELEGRAM = "telegram";
export const RUN_DAILY_OUTLOOK = "daily-outlook";

// [2026-09-22] 마감시황(RUN_DAILY_REVIEW)은 기능 자체를 없애면서 같이 뺐습니다.
export const ALL_RUN_NAMES = [RUN_POLL, RUN_TELEGRAM, RUN_DAILY_OUTLOOK];

// name: 위 상수 중 하나. detail: 자유로운 객체(결과 요약, 에러 메시지 등).
// 항상 현재 시각(at)을 같이 넣어줌.
export async function recordRun(redis, name, detail = {}) {
  if (!redis) return;
  try {
    await redis.set(
      KEY_PREFIX + name,
      { at: new Date().toISOString(), ...detail },
      { ex: TTL_SECONDS }
    );
  } catch {
    // 기록 실패는 무시 — 본 작업을 막으면 안 됨.
  }
}

export async function readRun(redis, name) {
  if (!redis) return null;
  try {
    const raw = await redis.get(KEY_PREFIX + name);
    if (!raw) return null;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

// ── [2026-10-28 추가] 텔레그램 메시지 "단계별 개수" 하루치 집계 ──────────────
// 재성님: "텔레그램 뉴스는 엄청 많이 발생되는데 내 사이트에는 너무 적게 올라와"
// 예전엔 "마지막 메시지 1건의 결과"만 남아서, 하루에 몇 건이 들어와 어느 단계에서 몇 건이
// 빠지는지 알 수 없었습니다. 이제 메시지마다 결과 이름(게재 / 재료성 부족 / 후보 종목 없음 …)별로
// 하루 개수를 셉니다. /health 화면 "텔레그램 수집" 칸에 오늘·어제 숫자가 나옵니다.
// 비용: 메시지 1건당 Redis 명령 1번(+ 하루에 이름별로 첫 1번만 만료 시간 설정). 8일 뒤 자동 삭제.
const TG_COUNT_PREFIX = "status:tgcount:";
const TG_COUNT_TTL_SECONDS = 60 * 60 * 24 * 8;

export function kstDayKey(date = new Date()) {
  const k = new Date(date.getTime() + 9 * 3600 * 1000);
  return `${k.getUTCFullYear()}${String(k.getUTCMonth() + 1).padStart(2, "0")}${String(k.getUTCDate()).padStart(2, "0")}`;
}

export async function countIngest(redis, label) {
  if (!redis || !label) return;
  try {
    const key = TG_COUNT_PREFIX + kstDayKey();
    const n = await redis.hincrby(key, String(label).slice(0, 40), 1);
    if (n === 1) await redis.expire(key, TG_COUNT_TTL_SECONDS);
  } catch {
    // 집계 실패는 무시 — 본 작업을 막으면 안 됨.
  }
}

export async function readIngestCounts(redis, dayKey) {
  if (!redis) return null;
  try {
    const raw = await redis.hgetall(TG_COUNT_PREFIX + dayKey);
    if (!raw) return null;
    const out = {};
    for (const [k, v] of Object.entries(raw)) out[k] = Number(v) || 0;
    return out;
  } catch {
    return null;
  }
}

// ── [2026-10-29 추가] 최근에 "제외"된 텔레그램 기사 제목 60건 ──────────────
// 재성님: "뉴스 필터링이 너무 강한거같은데 좀 풀까?" — 개수만으로는 "어떤 기사가 왜 빠졌는지" 몰라서
// 필터를 어디까지 풀지 판단하기 어려웠습니다. 이제 빠진 기사 제목과 이유를 최근 60건만 남깁니다.
// /api/health 의 "telegram" 칸 recentRejected 에 나옵니다. 비용: 빠진 기사 1건당 Redis 명령 2번. 3일 뒤 자동 삭제.
const TG_REJECTED_KEY = "status:tgrejected";

export async function logRejected(redis, entry) {
  if (!redis || !entry?.title) return;
  try {
    await redis.lpush(TG_REJECTED_KEY, JSON.stringify({ at: new Date().toISOString(), ...entry }));
    await redis.ltrim(TG_REJECTED_KEY, 0, 59);
    await redis.expire(TG_REJECTED_KEY, 60 * 60 * 24 * 3);
  } catch {
    // 기록 실패는 무시 — 본 작업을 막으면 안 됨.
  }
}

export async function readRejected(redis) {
  if (!redis) return [];
  try {
    const raw = await redis.lrange(TG_REJECTED_KEY, 0, 59);
    return (raw || []).map((x) => (typeof x === "string" ? JSON.parse(x) : x));
  } catch {
    return [];
  }
}
