// lib/earnings.js
//
// [2026-11-15 신설] 실적 캘린더(app/earnings)에 쓰는 자료 — 이번 분기에 실적을 발표한 회사와 그 숫자
//   재성님: (다른 서비스의 실적 캘린더 영상을 보여 주며) "이거도 만들어"
//
//   자료(전부 금융감독원 DART 공식 API, 무료 — 공시 일정 페이지와 같은 열쇠 DART_API_KEY를 씀):
//     ① 누가 언제 발표했나: 공정공시 목록에서 제목이 "영업(잠정)실적"인 공시
//     ② 숫자(매출·영업이익·순이익, 전년 같은 분기와 비교): "다중회사 주요계정" API
//        ★ 이 숫자는 분기·사업보고서가 제출된 뒤에 나옵니다. 잠정실적만 낸 직후에는 날짜만 보이고
//          숫자는 "보고서 제출 뒤 표시"로 나옵니다(잠정실적 문서 자체를 읽는 것은 다음 단계 과제).
//   없는 것: 증권사 예상치(컨센서스)는 무료 공식 자료가 없어 넣지 않았습니다 — "예상 대비"가 아니라 "전년 같은 분기 대비"로 보여 줍니다.
//
//   저장: 공시 일정(lib/disclosures.js)과 같은 방식 — Redis에 마지막 성공본을 두고 1시간마다 새로 받음.
//         Cloudflare에서는 DART 접속이 막히는 일이 있어 Vercel 쪽 같은 주소를 먼저 불러 봅니다.

import { getRedis } from "./redis";
import { memo } from "./memoCache";
import { dartGet, fetchList, mapLimit, kstTodayIso } from "./disclosures";

const FRESH_MS = 60 * 60 * 1000; // 1시간
const LAST_GOOD_KEY = "earnings:last-good:v1";
const MAX_PAGES = 60;
const WINDOW_DAYS = 85; // DART 목록은 회사 지정 없이 3개월까지만 조회 가능

function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// 오늘 날짜 → 지금 발표 철인 분기
//   1~3월: 전년 4분기(사업보고서 11011) / 4~6월: 1분기(11013) / 7~9월: 2분기(반기 11012) / 10~12월: 3분기(11014)
export function seasonOf(todayIso) {
  const y = Number(todayIso.slice(0, 4));
  const m = Number(todayIso.slice(5, 7));
  if (m <= 3) return { year: y - 1, quarter: 4, reprt: "11011", label: `${y - 1}년 4분기`, from: `${y}-01-01`, annual: true };
  if (m <= 6) return { year: y, quarter: 1, reprt: "11013", label: `${y}년 1분기`, from: `${y}-04-01`, annual: false };
  if (m <= 9) return { year: y, quarter: 2, reprt: "11012", label: `${y}년 2분기`, from: `${y}-07-01`, annual: false };
  return { year: y, quarter: 3, reprt: "11014", label: `${y}년 3분기`, from: `${y}-10-01`, annual: false };
}

const num = (v) => {
  const s = String(v ?? "").replace(/,/g, "").trim();
  if (!s || s === "-") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

// 계정 이름 → 우리가 쓰는 세 가지
function accountKey(nm) {
  const n = String(nm || "").replace(/\s/g, "");
  if (/^(매출액|수익\(매출액\)|영업수익|매출)$/.test(n)) return "rev";
  if (/^영업이익(\(손실\))?$/.test(n)) return "op";
  if (/^(당기순이익(\(손실\))?|분기순이익(\(손실\))?|반기순이익(\(손실\))?)$/.test(n)) return "ni";
  return null;
}

// 다중회사 주요계정 응답 → { 종목코드: { rev:{cur,prev}, op:{…}, ni:{…}, cfs } }
export function parseAccounts(list) {
  const out = {};
  for (const r of list || []) {
    if (r.sj_div && r.sj_div !== "IS" && r.sj_div !== "CIS") continue;
    const key = accountKey(r.account_nm);
    const code = String(r.stock_code || "").trim();
    if (!key || !code) continue;
    const cfs = r.fs_div === "CFS";
    const cur = num(r.thstrm_amount);
    const prev = num(r.frmtrm_amount);
    if (cur === null) continue;
    const slot = (out[code] ||= { cfs: false });
    // 연결(CFS)이 있으면 연결을 우선
    if (slot[key] && slot[key].cfs && !cfs) continue;
    slot[key] = { cur, prev, cfs };
    if (cfs) slot.cfs = true;
  }
  for (const v of Object.values(out)) for (const k of ["rev", "op", "ni"]) if (v[k]) delete v[k].cfs;
  return out;
}

// 전년 같은 분기와 비교한 상태 계산은 화면(브라우저)에서도 쓰므로 따로 둠 → lib/earningsCompare.js
export { compare } from "./earningsCompare";

async function collect() {
  const today = kstTodayIso();
  const season = seasonOf(today);
  const minFrom = addDays(today, -WINDOW_DAYS);
  const from = season.from > minFrom ? season.from : minFrom;

  // ① 누가 언제 — 공정공시(I002) 중 영업(잠정)실적
  const list = await fetchList("I", from, today, { pblntf_detail_ty: "I002" }, MAX_PAGES);
  const byCode = new Map();
  for (const it of list) {
    const t = it.title.replace(/\s/g, "");
    if (!/영업\(잠정\)실적/.test(t) || /자회사/.test(t)) continue;
    const prev = byCode.get(it.code);
    const row = {
      code: it.code,
      name: it.name,
      market: it.market,
      corpCode: it.corpCode,
      date: prev ? (prev.date < it.date ? prev.date : it.date) : it.date, // 처음 발표한 날
      rceptNo: !prev || prev.rceptNo < it.rceptNo ? it.rceptNo : prev.rceptNo, // 가장 최근 문서(정정 포함)
      consolidated: /연결/.test(t) || Boolean(prev?.consolidated),
      fix: /정정/.test(t) || Boolean(prev?.fix),
    };
    byCode.set(it.code, row);
  }
  const rows = [...byCode.values()];
  if (!rows.length) return { updatedAt: new Date().toISOString(), today, season, items: [] };

  // ② 숫자 — 다중회사 주요계정(한 번에 100개 회사까지)
  const chunks = [];
  for (let i = 0; i < rows.length; i += 100) chunks.push(rows.slice(i, i + 100));
  const parts = await mapLimit(chunks, 3, async (chunk) => {
    const j = await dartGet(
      "fnlttMultiAcnt.json",
      { corp_code: chunk.map((r) => r.corpCode).join(","), bsns_year: String(season.year), reprt_code: season.reprt },
      3600
    );
    return j?.status === "000" ? parseAccounts(j.list) : {};
  });
  const acc = Object.assign({}, ...parts);

  const items = rows
    .map((r) => {
      const a = acc[r.code] || {};
      return { code: r.code, name: r.name, market: r.market, date: r.date, rceptNo: r.rceptNo, consolidated: r.consolidated, fix: r.fix, rev: a.rev || null, op: a.op || null, ni: a.ni || null };
    })
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.name.localeCompare(b.name, "ko")));

  return { updatedAt: new Date().toISOString(), today, season, items };
}

const hasData = (d) => Boolean(d && Array.isArray(d.items) && d.items.length);

async function fromVercel() {
  if (process.env.VERCEL) return null;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 12000); // [2026-11-17] 30초 → 12초
  try {
    const res = await fetch("https://sososo-xi.vercel.app/api/earnings", { signal: ctl.signal, cache: "no-store" });
    if (!res.ok) return null;
    const j = await res.json();
    return hasData(j) ? { ...j, via: "vercel" } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// [2026-11-17 변경] 같은 서버 조각 안에서는 5분 동안 결과를 기억(자료가 비어 있는 결과도) —
//   실적 자료를 못 받는 날에 부를 때마다 8초씩 다시 시도하던 것을 막음.
export function getEarningsData() {
  return memo("earnings-data", 5 * 60 * 1000, getEarningsDataFresh);
}

async function getEarningsDataFresh() {
  const redis = getRedis();
  let last = null;
  if (redis) {
    try {
      const raw = await redis.get(LAST_GOOD_KEY);
      last = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      last = null;
    }
  }
  const savedMs = last?.savedAt ? Date.parse(last.savedAt) : NaN;
  if (hasData(last) && Date.now() - savedMs < FRESH_MS) return last;

  let fresh = await fromVercel();
  if (!fresh) {
    try {
      fresh = await collect();
    } catch {
      fresh = null;
    }
  }
  if (hasData(fresh)) {
    fresh = { ...fresh, savedAt: new Date().toISOString() };
    if (redis) await redis.set(LAST_GOOD_KEY, fresh, { ex: 14 * 86400 }).catch(() => {});
    return fresh;
  }
  // 새로 못 받았으면 마지막 성공본이라도(오래됐다는 표시와 함께)
  if (hasData(last)) return { ...last, stale: true };
  return fresh; // 발표가 아직 없는 철 초반: items가 빈 채로
}
