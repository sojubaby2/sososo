// lib/disclosures.js
//
// [2026-10-27 신설] "공시 일정" — 금융감독원 DART에서 주요 공시와 일정을 모읍니다.
// 재성님 요청: "주요공시 일정 같은것도 정보 가져와서 게시가능?" → "한방에 다해줘"
//
// 만드는 것
//   1. 최근 주요 공시 목록(최근 7일) — 코스피·코스닥 상장사의 공시 중 주가에 영향이 큰 종류만
//      골라 분류합니다(실적, 수주·계약, 증자, 감자, 자사주, 사채 발행, 최대주주 변경, 배당, 합병·분할, IR, 소송, 거래 주의).
//   2. 일정 — 공시 안에 적힌 날짜를 꺼냅니다.
//      · 무상증자: 신주배정기준일, 권리락일(기준일 바로 전 영업일 — 계산값), 신주 상장 예정일
//      · 감자: 매매거래 정지 기간, 신주 상장 예정일
//      · 자사주 취득: 취득 기간 시작·끝
//      · 정기보고서 제출 마감일(분기·반기·사업보고서 — 법으로 정해진 날짜, 공휴일은 따로 계산하지 않음)
//   3. 종목별 최근 공시 — 종목 페이지(/stock/코드)에서 씀
//
// 어디서: DART 공개 API(공모주와 같은 DART_API_KEY, 무료·하루 2만 건 한도)
//   · list.json(공시 목록), fricDecsn·pifricDecsn·crDecsn·tsstkAqDecsn(주요사항보고서 세부 내용)
//
// 비용·호출 수: 0원. 모은 결과를 30분 동안 저장해서 페이지 여러 개(공시 일정·종목 페이지 1,000여 개)가 같이 씁니다.
//   새로 모을 때 DART 호출은 대략 목록 20~40번 + 세부 내용 수십 번이고, 세부 내용은 한 번 받으면 하루 동안 다시 안 받습니다.

import { unstable_cache } from "next/cache";
import { parseDates } from "./ipo";

const DART = "https://opendart.fss.or.kr/api";
const TIMEOUT_MS = 8000;
const LIST_REVALIDATE = 1800; // 공시 목록: 30분
const DETAIL_REVALIDATE = 86400; // 세부 내용(한 번 낸 공시는 안 바뀜): 하루
const RECENT_DAYS = 7; // 주요 공시 목록에 보여줄 기간
const SCHEDULE_DAYS = 75; // 일정을 찾을 공시 기간(이 기간에 나온 결정 공시의 날짜를 꺼냄)
const MAX_PAGES_B = 25; // 주요사항보고서(B001)만 — 75일이면 보통 이 안에 다 들어옴
const MAX_PAGES_I = 40; // 거래소공시 — 하루 수백 건이라 7일치를 받으려면 넉넉히
const CONCURRENCY = 4;

// ── 분류 규칙 ── 공시 이름(report_nm)에 이 말이 들어 있으면 그 종류로 봅니다. 위에 있는 것이 먼저.
export const CATEGORIES = [
  { key: "warn", label: "거래 주의", re: /상장폐지|관리종목|매매거래정지|불성실공시법인|투자주의환기|감사의견|회생절차|파산/ },
  { key: "earn", label: "실적", re: /영업\(잠정\)실적|영업실적등에대한전망|매출액또는손익구조|결산실적공시예고/ },
  { key: "deal", label: "수주·계약", re: /단일판매.?공급계약|공급계약체결/ },
  { key: "free", label: "무상증자", re: /무상증자결정|유무상증자결정/ },
  { key: "paid", label: "유상증자", re: /유상증자결정/ },
  { key: "cut", label: "감자", re: /감자결정/ },
  { key: "buyback", label: "자사주", re: /자기주식취득|자기주식처분|주식소각결정|자기주식.*신탁계약/ },
  { key: "bond", label: "사채 발행", re: /전환사채권발행결정|신주인수권부사채권발행결정|교환사채권발행결정/ },
  { key: "owner", label: "최대주주 변경", re: /최대주주변경|최대주주인수인계|경영권변경/ },
  { key: "div", label: "배당", re: /배당결정/ },
  { key: "ma", label: "합병·분할", re: /회사합병결정|회사분할결정|분할합병결정|영업양수결정|영업양도결정|주식교환/ },
  { key: "ir", label: "IR", re: /기업설명회\(IR\)개최/ },
  { key: "suit", label: "소송", re: /소송등의제기|소송등의판결/ },
];

export function categoryOf(reportNm) {
  const n = String(reportNm || "").replace(/\s/g, "");
  for (const c of CATEGORIES) if (c.re.test(n)) return c.key;
  return null;
}

export function categoryLabel(key) {
  return CATEGORIES.find((c) => c.key === key)?.label || "";
}

// ── 날짜 도우미 (한국시간) ──
function kstNow() {
  return new Date(Date.now() + 9 * 3600 * 1000);
}
export function kstTodayIso() {
  return kstNow().toISOString().slice(0, 10);
}
function ymdOf(iso) {
  return iso.replace(/-/g, "");
}
function isoOf(ymd) {
  const s = String(ymd || "");
  return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null;
}
function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function isWeekend(iso) {
  const wd = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return wd === 0 || wd === 6;
}
// 바로 전 영업일(주말만 건너뜀 — 공휴일은 계산하지 않음)
function prevBusinessDay(iso) {
  let d = addDays(iso, -1);
  while (isWeekend(d)) d = addDays(d, -1);
  return d;
}
function nextBusinessDayOrSame(iso) {
  let d = iso;
  while (isWeekend(d)) d = addDays(d, 1);
  return d;
}
// 세부 내용에 적힌 날짜 한 개("2026년 11월 10일", "2026-11-10", "2026.11.10") → "2026-11-10"
function oneDate(text) {
  const s = String(text || "").trim();
  if (!s || s === "-") return null;
  const m = /^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return parseDates(s)[0] || null;
}

// ── DART 호출 ──
async function dartGet(path, params, revalidate) {
  const key = process.env.DART_API_KEY;
  if (!key) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const qs = new URLSearchParams({ crtfc_key: key, ...params });
    const res = await fetch(`${DART}/${path}?${qs}`, { signal: controller.signal, next: { revalidate } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k], k);
    }
  });
  await Promise.all(workers);
  return out;
}

// 공시 목록(한 종류) — 상장사(코스피 Y·코스닥 K)만, 필요한 칸만 남겨서
async function fetchList(pblntfTy, bgnIso, endIso, extra = {}, maxPages = MAX_PAGES_B) {
  const base = { bgn_de: ymdOf(bgnIso), end_de: ymdOf(endIso), pblntf_ty: pblntfTy, page_count: "100", ...extra };
  const first = await dartGet("list.json", { ...base, page_no: "1" }, LIST_REVALIDATE);
  if (!first || first.status !== "000") return [];
  const totalPage = Math.min(Number(first.total_page) || 1, maxPages);
  const pages = [first];
  if (totalPage > 1) {
    const rest = await mapLimit(
      Array.from({ length: totalPage - 1 }, (_, k) => k + 2),
      CONCURRENCY,
      (p) => dartGet("list.json", { ...base, page_no: String(p) }, LIST_REVALIDATE)
    );
    pages.push(...rest.filter((r) => r?.status === "000"));
  }
  const out = [];
  for (const pg of pages) {
    for (const r of pg.list || []) {
      if (r.corp_cls !== "Y" && r.corp_cls !== "K") continue;
      if (!/^[0-9A-Z]{6}$/.test(String(r.stock_code || "").trim())) continue;
      out.push({
        rceptNo: String(r.rcept_no),
        date: isoOf(r.rcept_dt),
        corpCode: String(r.corp_code),
        name: String(r.corp_name || "").trim(),
        code: String(r.stock_code).trim(),
        market: r.corp_cls === "Y" ? "코스피" : "코스닥",
        title: String(r.report_nm || "").replace(/\s+/g, " ").trim(),
        filer: String(r.flr_nm || "").trim(),
        rm: String(r.rm || ""),
      });
    }
  }
  return out;
}

// ── 세부 내용 → 일정 ──
const DETAIL_API = {
  free: "fricDecsn.json",
  freepaid: "pifricDecsn.json",
  cut: "crDecsn.json",
  buyback: "tsstkAqDecsn.json",
};

async function fetchDetail(api, it) {
  const ymd = ymdOf(it.date);
  const j = await dartGet(api, { corp_code: it.corpCode, bgn_de: ymd, end_de: ymd }, DETAIL_REVALIDATE);
  if (!j || j.status !== "000" || !Array.isArray(j.list)) return null;
  return j.list.find((r) => String(r.rcept_no) === it.rceptNo) || j.list[0] || null;
}

function eventsFrom(it, kind, d) {
  const ev = [];
  const base = { rceptNo: it.rceptNo, name: it.name, code: it.code, market: it.market, filedOn: it.date };
  const add = (date, type, label) => date && ev.push({ ...base, date, type, label });
  if (kind === "free" || kind === "freepaid") {
    const p = kind === "freepaid" ? "fric_" : "";
    const asstd = oneDate(d[`${p}nstk_asstd`]);
    add(asstd, "free-record", "무상증자 신주배정기준일");
    if (asstd) add(prevBusinessDay(asstd), "free-ex", "무상증자 권리락(예상)");
    add(oneDate(d[`${p}nstk_lstprd`]), "free-list", "무상증자 신주 상장");
  } else if (kind === "cut") {
    const s = oneDate(d.crsc_trspprpd_bgd);
    const e = oneDate(d.crsc_trspprpd_edd);
    add(s, "cut-halt", "감자 매매거래 정지 시작");
    if (e && e !== s) add(e, "cut-halt-end", "감자 매매거래 정지 끝");
    add(oneDate(d.crsc_nstklstprd), "cut-list", "감자 신주 상장");
  } else if (kind === "buyback") {
    const s = oneDate(d.aqexpd_bgd);
    const e = oneDate(d.aqexpd_edd);
    add(s, "buyback-start", "자사주 매입 시작");
    if (e) add(e, "buyback-end", "자사주 매입 기간 끝");
  }
  return ev;
}

// 정기보고서 제출 마감일(법정 기한: 분기·반기 45일, 사업보고서 90일). 주말이면 다음 영업일.
function filingDeadlines(fromIso, toIso) {
  const out = [];
  const y0 = Number(fromIso.slice(0, 4));
  for (const y of [y0 - 1, y0, y0 + 1]) {
    const list = [
      [`${y}-03-31`, `${y - 1}년 사업보고서 제출 마감`],
      [`${y}-05-15`, `${y}년 1분기 보고서 제출 마감`],
      [`${y}-08-14`, `${y}년 반기 보고서 제출 마감`],
      [`${y}-11-14`, `${y}년 3분기 보고서 제출 마감`],
    ];
    for (const [d, label] of list) {
      const due = nextBusinessDayOrSame(d);
      if (due >= fromIso && due <= toIso) out.push({ date: due, type: "deadline", label, name: "", code: "" });
    }
  }
  return out;
}

async function collect() {
  const today = kstTodayIso();
  const recentFrom = addDays(today, -RECENT_DAYS);
  const scheduleFrom = addDays(today, -SCHEDULE_DAYS);

  // B = 주요사항보고(증자·감자·자사주·사채 결정 등), I = 거래소공시(실적·공급계약·IR 등)
  //   B는 그중 "주요사항보고서"(B001)만 — 증자·감자·자사주·사채 결정이 여기 다 들어 있습니다.
  const [bList, iList] = await Promise.all([
    fetchList("B", scheduleFrom, today, { pblntf_detail_ty: "B001" }, MAX_PAGES_B),
    fetchList("I", recentFrom, today, {}, MAX_PAGES_I),
  ]);
  if (!bList.length && !iList.length) return null;

  // 1) 최근 주요 공시
  const seen = new Set();
  const recent = [];
  for (const it of [...iList, ...bList.filter((x) => x.date >= recentFrom)]) {
    if (seen.has(it.rceptNo)) continue;
    seen.add(it.rceptNo);
    const cat = categoryOf(it.title);
    if (!cat) continue;
    recent.push({ ...it, cat, fix: /정정/.test(it.title) });
  }
  recent.sort((a, b) => (a.rceptNo < b.rceptNo ? 1 : -1)); // 접수번호가 클수록 최신

  // 2) 일정 — 결정 공시의 세부 내용에서 날짜 꺼내기(정정 공시가 있으면 그것이 최신이므로 회사별 마지막 것만)
  const latestByKey = new Map();
  for (const it of bList) {
    const n = it.title.replace(/\s/g, "");
    const kind = /유무상증자결정/.test(n)
      ? "freepaid"
      : /무상증자결정/.test(n)
      ? "free"
      : /감자결정/.test(n)
      ? "cut"
      : /자기주식취득결정/.test(n)
      ? "buyback"
      : null;
    if (!kind) continue;
    const k = `${it.corpCode}:${kind}`;
    const prev = latestByKey.get(k);
    if (!prev || prev.it.rceptNo < it.rceptNo) latestByKey.set(k, { it, kind });
  }
  const targets = [...latestByKey.values()];
  const details = await mapLimit(targets, CONCURRENCY, ({ it, kind }) => fetchDetail(DETAIL_API[kind], it));
  const events = [];
  targets.forEach(({ it, kind }, i) => {
    if (details[i]) events.push(...eventsFrom(it, kind, details[i]));
  });
  events.push(...filingDeadlines(addDays(today, -30), addDays(today, 120)));
  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return { updatedAt: new Date().toISOString(), today, recentFrom, recent, events };
}

// 30분 저장본 — 공시 일정 페이지와 종목 페이지 1,000여 개가 같이 씁니다.
export const getDisclosureData = unstable_cache(
  async () => {
    try {
      return await collect();
    } catch {
      return null;
    }
  },
  ["disclosures-v1"],
  { revalidate: LIST_REVALIDATE }
);

// 종목 하나의 최근 공시(최근 7일 주요 공시 + 75일 안의 결정 공시 일정)
export async function disclosuresForStock(code, max = 8) {
  const data = await getDisclosureData().catch(() => null);
  if (!data) return { recent: [], events: [] };
  return {
    recent: data.recent.filter((x) => x.code === code).slice(0, max),
    events: data.events.filter((x) => x.code === code),
  };
}

export function dartViewerUrl(rceptNo) {
  return `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${rceptNo}`;
}
