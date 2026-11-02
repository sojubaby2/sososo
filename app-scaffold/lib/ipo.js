// lib/ipo.js
//
// [2026-10-26 신설] 공모주 일정 — 금융감독원 DART(전자공시) 공식 무료 통로에서 자동으로 받아옵니다.
//
// 재성님 요청: "공모주 정보를 외부 사이트로 연결되게 해놨는데, 그냥 내 사이트에 만들고
//              지속 업데이트 되도록 하는 방법은 없어?"
//
// ── 어떻게 찾나 ───────────────────────────────────────────────────────
//   1단계(목록): 최근 90일 동안 DART에 올라온 "증권신고서(지분증권)" 중
//         아직 상장 안 된 회사(법인구분 E = 기타)만 고릅니다.
//         → 새로 상장하려는 회사 = 공모주입니다. (이미 상장된 회사의 유상증자는
//           법인구분이 Y·K라서 자동으로 빠집니다.)
//   2단계(자세히): 회사마다 "증권신고서 주요정보(지분증권)"를 한 번씩 불러서
//         청약일·납입일·공모가·공모 총액·주식 수·주관 증권사를 꺼냅니다.
//         정정신고서가 있으면 가장 최근 것(접수번호가 가장 큰 것)을 씁니다.
//         → 수요예측 뒤 확정 공모가로 정정되면 그 값이 자동으로 반영됩니다.
//
// ── 얼마나 자주 ───────────────────────────────────────────────────────
//   3시간에 한 번만 DART에 물어봅니다(Next.js 저장 기능). 한 번에 보통 20~40회 호출,
//   하루 300회 정도 — DART 무료 한도(하루 20,000회)에 비하면 아주 적습니다.
//
// ── 비용 ─────────────────────────────────────────────────────────────
//   0원. DART 무료, AI·Redis 안 씀.
//
// ── 필요한 것 ────────────────────────────────────────────────────────
//   Vercel 환경변수 DART_API_KEY (opendart.fss.or.kr 에서 무료 발급, 재성님이 2026-10-26 등록)
//
// ── 문제가 생겼을 때 ─────────────────────────────────────────────────
//   브라우저에서 https://newsmeme.co.kr/api/ipo 를 열면 받아온 그대로 보입니다.
//   error 칸에 이유가 적힙니다(예: "DART_API_KEY 없음", "DART 응답 코드 020" 등).
//   DART 응답 코드: 000 정상 / 013 자료 없음 / 010·011 키 문제 / 020 하루 한도 초과

import { getRedis } from "./redis";

const DART = "https://opendart.fss.or.kr/api";
const REVALIDATE_SECONDS = 3 * 3600; // 3시간
const LOOKBACK_DAYS = 89; // DART 목록 검색은 회사 지정 없이 최대 3개월
const MAX_COMPANIES = 40;
const CONCURRENCY = 5;
const TIMEOUT_MS = 8000;

// 한국시간 날짜 "20261026"
function kstYmd(date) {
  return new Date(date.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, "");
}
// 한국시간 오늘 "2026-10-26"
export function kstTodayIso(now = new Date()) {
  return new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

async function dartGet(path, params, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const qs = new URLSearchParams({ crtfc_key: process.env.DART_API_KEY || "", ...params });
    const res = await fetch(`${DART}/${path}?${qs}`, {
      signal: controller.signal,
      // [2026-11-02] 호출마다 저장소(R2)를 따로 읽고 쓰지 않게 함 — 페이지 자체가 3시간 저장되므로 충분하고,
      //   Cloudflare 한 번 실행에 허용되는 바깥 요청 수를 덜 씀(실패 원인 줄이기)
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`DART HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// "2026년 11월 03일 ~ 2026년 11월 04일", "2026.11.03~11.04", "2026-11-03" 등에서 날짜를 모두 뽑습니다.
// 연도가 생략된 뒤쪽 날짜("~ 11.04")는 앞 날짜의 연도를 이어 씁니다.
export function parseDates(text) {
  if (!text || typeof text !== "string") return [];
  const out = [];
  const re = /(?:(\d{4})\s*[년.\-/]\s*)?(\d{1,2})\s*[월.\-/]\s*(\d{1,2})\s*일?/g;
  let m;
  let lastYear = null;
  while ((m = re.exec(text))) {
    const y = m[1] ? Number(m[1]) : lastYear;
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) continue;
    lastYear = y;
    out.push(`${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  // "2026년 11월 03일 ~ 04일"처럼 뒤쪽에 '일'만 적힌 경우
  if (out.length === 1) {
    const tail = /~\s*(\d{1,2})\s*일/.exec(text);
    if (tail) {
      const [y, mo] = out[0].split("-");
      const d = Number(tail[1]);
      if (d >= 1 && d <= 31) out.push(`${y}-${mo}-${String(d).padStart(2, "0")}`);
    }
  }
  return out;
}

// "108,038" → 108038, "-" → null
export function parseNum(v) {
  if (v === null || v === undefined) return null;
  const n = Number(String(v).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// DART 여러 묶음 응답 { group: [{ title, list: [...] }] } → { 제목: [...] }
function groupsOf(json) {
  const out = {};
  for (const g of json?.group || []) {
    if (g?.title) out[g.title.replace(/\s/g, "")] = Array.isArray(g.list) ? g.list : [];
  }
  return out;
}

// 회사 하나의 증권신고서 주요정보 → 화면에 쓸 한 줄
function buildItem(base, json) {
  const g = groupsOf(json);
  const general = g["일반사항"] || [];
  if (!general.length) return null;

  // 가장 최근 신고서(정정 포함)
  const latest = [...general].sort((a, b) => String(b.rcept_no).localeCompare(String(a.rcept_no)))[0];
  const rceptNo = String(latest.rcept_no || base.rceptNo);
  const sameDoc = (r) => String(r.rcept_no) === rceptNo;

  const kinds = (g["증권의종류"] || []).filter(sameDoc);
  const common = kinds.find((k) => /보통주/.test(k.stksen || "")) || kinds[0] || {};

  const underwriters = (g["인수인정보"] || []).filter(sameDoc);
  const leads = [...new Set(underwriters.filter((u) => /대표/.test(u.actsen || "")).map((u) => u.actnmn).filter(Boolean))];
  const others = [...new Set(underwriters.map((u) => u.actnmn).filter(Boolean))].filter((n) => !leads.includes(n));

  const subDates = parseDates(latest.sbd);
  const payDates = parseDates(latest.pymd);

  return {
    corpName: base.corpName,
    corpCode: base.corpCode,
    rceptNo,
    reportName: base.reportName,
    isSpac: /스팩|기업인수목적/.test(base.corpName),
    subStart: subDates[0] || null,
    subEnd: subDates[subDates.length - 1] || null,
    subText: latest.sbd || "",
    payDate: payDates[0] || null,
    price: parseNum(common.slprc),
    totalAmount: parseNum(common.slta),
    shares: parseNum(common.stkcnt),
    method: common.slmthn || "",
    leadManagers: leads,
    coManagers: others,
    dartUrl: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${rceptNo}`,
  };
}

// 청약 상태: 청약 중 / 청약 예정 / 청약 마감 / 일정 미정
export function statusOf(item, todayIso) {
  if (!item.subStart) return "미정";
  if (todayIso < item.subStart) return "예정";
  if (item.subEnd && todayIso <= item.subEnd) return "진행";
  return "마감";
}

async function mapLimited(arr, limit, fn) {
  const out = new Array(arr.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, arr.length) }, async () => {
    while (i < arr.length) {
      const idx = i++;
      try {
        out[idx] = await fn(arr[idx]);
      } catch {
        out[idx] = null;
      }
    }
  });
  await Promise.all(workers);
  return out;
}

async function fetchIpoScheduleRaw(now = new Date()) {
  if (!process.env.DART_API_KEY) {
    return { items: [], fetchedAt: now.toISOString(), error: "DART_API_KEY 없음 (Vercel 환경변수 확인)" };
  }
  const end = kstYmd(now);
  const begin = kstYmd(new Date(now.getTime() - LOOKBACK_DAYS * 86400000));

  // 1단계: 목록 (최대 3쪽 = 300건)
  const filings = [];
  for (let page = 1; page <= 3; page++) {
    // [2026-11-02] 목록 조회(최근 89일)는 DART 쪽 응답이 느릴 때가 있어 기다리는 시간을 25초로 늘림
    const j = await dartGet("list.json", {
      bgn_de: begin,
      end_de: end,
      pblntf_ty: "C",
      pblntf_detail_ty: "C001",
      corp_cls: "E",
      last_reprt_at: "Y",
      page_no: String(page),
      page_count: "100",
    }, 25000);
    if (j?.status === "013") break; // 자료 없음
    if (j?.status !== "000") {
      return { items: [], fetchedAt: now.toISOString(), error: `DART 응답 코드 ${j?.status}: ${j?.message || ""}` };
    }
    filings.push(...(j.list || []));
    if (!j.total_page || page >= Number(j.total_page)) break;
  }

  // 회사별 하나로(가장 최근 신고서), 철회된 건은 뺌
  const byCorp = new Map();
  for (const f of filings) {
    if (!f?.corp_code) continue;
    if (/철/.test(f.rm || "") || /철회/.test(f.report_nm || "")) continue;
    const prev = byCorp.get(f.corp_code);
    if (!prev || String(f.rcept_no) > String(prev.rceptNo)) {
      byCorp.set(f.corp_code, {
        corpCode: f.corp_code,
        corpName: f.corp_name,
        reportName: f.report_nm,
        rceptNo: String(f.rcept_no),
        rceptDate: f.rcept_dt,
      });
    }
  }
  const bases = [...byCorp.values()]
    .sort((a, b) => String(b.rceptNo).localeCompare(String(a.rceptNo)))
    .slice(0, MAX_COMPANIES);

  // 2단계: 회사마다 자세히
  const detailed = await mapLimited(bases, CONCURRENCY, async (base) => {
    const j = await dartGet("estkRs.json", { corp_code: base.corpCode, bgn_de: begin, end_de: end });
    if (j?.status !== "000") return null;
    return buildItem(base, j);
  });

  const items = detailed.filter(Boolean);
  return { items, fetchedAt: now.toISOString(), checked: bases.length };
}

// [2026-11-02 추가] 재성님: "PC로 보면 공모주가 보이는데 모바일로 보면 '공모주 일정을 불러오지 못했습니다'가 뜬다"
//   원인: 3시간마다 새로 받을 때 DART 호출(회사마다 1번, 최대 40여 번)이 한 번이라도 통째로 실패하면,
//         그 "실패한 화면"이 다음 3시간 동안 저장돼 그대로 보였습니다(먼저 저장된 곳에 따라 PC·휴대폰이 다르게 보임).
//   해결: 제대로 받은 결과는 Redis에 "마지막 정상본"으로 보관해 두고, 이번에 못 받으면 그 정상본을 대신 보여 줍니다.
//         (정상본은 7일 보관 — 7일 넘게 계속 실패할 때만 안내 문구가 나옴)
const LAST_GOOD_KEY = "ipo:last-good";
// [2026-11-02 추가] 3시간 안에 받아 둔 정상본이 있으면 DART에 다시 묻지 않고 바로 씀 — 공모주 화면이
//   열릴 때마다 DART·Vercel을 기다리느라 10초 넘게 걸리던 문제 수정(재성님 리포트).
const FRESH_MS = 3 * 3600 * 1000;
export async function fetchIpoSchedule(now = new Date()) {
  const redisFirst = getRedis();
  if (redisFirst) {
    try {
      const raw = await redisFirst.get(LAST_GOOD_KEY);
      const last = typeof raw === "string" ? JSON.parse(raw) : raw;
      const savedMs = last?.savedAt ? Date.parse(last.savedAt) : NaN;
      if (last?.items?.length && now.getTime() - savedMs < FRESH_MS) return last;
    } catch {
      // 못 읽으면 아래에서 새로 받음
    }
  }
  let fresh = null;
  try {
    fresh = await fetchIpoScheduleRaw(now);
  } catch (err) {
    fresh = { items: [], fetchedAt: now.toISOString(), error: String(err?.message || err) };
  }
  const redis = getRedis();
  // [2026-11-02 추가] Cloudflare에서 DART 목록 조회가 시간 초과로 실패할 때가 있어(같은 코드가 Vercel에선 정상),
  //   예전 Vercel 주소(sososo-xi.vercel.app)의 /api/ipo에서 한 번 더 받아 봄. Vercel 안에서 돌 때는 건너뜀(자기 자신 호출 방지).
  if (!fresh?.items?.length && !process.env.VERCEL) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 15000);
    try {
      const res = await fetch("https://sososo-xi.vercel.app/api/ipo", { signal: ctl.signal, cache: "no-store" });
      const j = res.ok ? await res.json() : null;
      if (j?.items?.length) fresh = { ...j, via: "vercel" };
    } catch {
      // 대체 경로도 실패 — 아래 정상본으로
    } finally {
      clearTimeout(t);
    }
  }
  if (fresh?.items?.length) {
    fresh = { ...fresh, savedAt: now.toISOString() };
    if (redis) await redis.set(LAST_GOOD_KEY, fresh, { ex: 7 * 86400 }).catch(() => {});
    return fresh;
  }
  if (redis) {
    try {
      const raw = await redis.get(LAST_GOOD_KEY);
      const last = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (last?.items?.length) return { ...last, stale: true, staleReason: fresh?.error || "빈 응답" };
    } catch {
      // 정상본도 못 읽으면 아래로
    }
  }
  return fresh;
}
