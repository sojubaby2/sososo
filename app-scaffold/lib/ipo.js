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

async function dartGet(path, params) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const qs = new URLSearchParams({ crtfc_key: process.env.DART_API_KEY || "", ...params });
    const res = await fetch(`${DART}/${path}?${qs}`, {
      signal: controller.signal,
      next: { revalidate: REVALIDATE_SECONDS },
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

export async function fetchIpoSchedule(now = new Date()) {
  if (!process.env.DART_API_KEY) {
    return { items: [], fetchedAt: now.toISOString(), error: "DART_API_KEY 없음 (Vercel 환경변수 확인)" };
  }
  const end = kstYmd(now);
  const begin = kstYmd(new Date(now.getTime() - LOOKBACK_DAYS * 86400000));

  // 1단계: 목록 (최대 3쪽 = 300건)
  const filings = [];
  for (let page = 1; page <= 3; page++) {
    const j = await dartGet("list.json", {
      bgn_de: begin,
      end_de: end,
      pblntf_ty: "C",
      pblntf_detail_ty: "C001",
      corp_cls: "E",
      last_reprt_at: "Y",
      page_no: String(page),
      page_count: "100",
    });
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
