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

// ── [2026-10-29 추가] AI 비용 계량기 — 하루 단위로 "실제로 쓴 토큰"을 셈 ─────────────
// 재성님: "비용계산 잘해줘봐". 지금까지는 글자 수로 어림했는데, 이제 AI가 응답할 때마다 돌려주는
// 실제 사용량(usage: 입력·출력·캐시 저장·캐시 재사용 토큰)을 단계별로 더해 둡니다.
// /api/health 의 "AI 비용" 칸에 오늘·어제·최근 7일 원화 금액이 나옵니다.
// 가격: Claude Haiku 4.5 공식 가격(100만 토큰당 달러) — 입력 $1, 출력 $5, 캐시 저장(1시간) $2, 캐시 재사용 $0.10.
//   [2026-10-29] Haiku 5.5로 바꾼 뒤로는 단계 이름 끝에 "55"가 붙고 5.5 가격(입력 $0.10, 출력 $0.50, 캐시 저장 $0.20, 재사용 $0.01)으로 계산.
// 환율은 1달러 = 1,450원으로 계산(대략값). 비용: AI 호출 1번당 Redis 명령 1번(묶음 전송). 40일 뒤 자동 삭제.
const AI_COST_PREFIX = "status:aicost:";
const AI_COST_TTL_SECONDS = 60 * 60 * 24 * 40;
export const USD_KRW = 1450;
const PRICE_PER_MTOK = { in: 1, out: 5, cw: 2, cr: 0.1 }; // Haiku 4.5
// [2026-10-29 추가] Haiku 5.5 가격(프롬프트 10만 토큰 이하) — 단계 이름이 "55"로 끝나면 이 값으로 계산(lib/claude.js)
const PRICE_PER_MTOK_55 = { in: 0.1, out: 0.5, cw: 0.2, cr: 0.01 };
const BASE_LABELS = { filter: "재료성 판단", match: "종목 매칭", premarket: "장전 브리핑", outlook: "오늘의 전망", review: "마감시황 글", matchApi: "매칭 API" };
export const AI_STAGE_LABELS = Object.fromEntries(
  Object.entries(BASE_LABELS).flatMap(([k, v]) => [
    [`${k}55`, v],
    [k, `${v}(4.5 대체)`],
  ])
);

export async function recordAiUsage(redis, stage, usage) {
  if (!redis || !stage || !usage) return;
  try {
    const key = AI_COST_PREFIX + kstDayKey();
    const p = redis.pipeline();
    p.hincrby(key, `${stage}:n`, 1);
    p.hincrby(key, `${stage}:in`, Number(usage.input_tokens) || 0);
    p.hincrby(key, `${stage}:out`, Number(usage.output_tokens) || 0);
    p.hincrby(key, `${stage}:cw`, Number(usage.cache_creation_input_tokens) || 0);
    p.hincrby(key, `${stage}:cr`, Number(usage.cache_read_input_tokens) || 0);
    p.expire(key, AI_COST_TTL_SECONDS);
    await p.exec();
  } catch {
    // 계량 실패는 무시 — 본 작업을 막으면 안 됨.
  }
}

// 하루치 → { stages: { filter: { n, in, out, cw, cr, krw }, ... }, krw }
export async function readAiCost(redis, dayKey) {
  if (!redis) return null;
  try {
    const raw = (await redis.hgetall(AI_COST_PREFIX + dayKey)) || {};
    const stages = {};
    for (const [k, v] of Object.entries(raw)) {
      const [stage, f] = k.split(":");
      (stages[stage] ||= { n: 0, in: 0, out: 0, cw: 0, cr: 0 })[f] = Number(v) || 0;
    }
    let total = 0;
    for (const [name, s] of Object.entries(stages)) {
      const P = name.endsWith("55") ? PRICE_PER_MTOK_55 : PRICE_PER_MTOK;
      const usd = (s.in * P.in + s.out * P.out + s.cw * P.cw + s.cr * P.cr) / 1e6;
      s.krw = Math.round(usd * USD_KRW);
      total += usd;
    }
    return { stages, krw: Math.round(total * USD_KRW) };
  } catch {
    return null;
  }
}
