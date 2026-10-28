// lib/investorFlow.js
//
// [2026-10-28 신설] 장 마감 정리에 "누가 사고 누가 팔았나"(투자자별 순매수)와 지수 마감을 넣기 위한 파일.
//   재성님: "장마감 정리 내용에 외국인, 기관 등 매수, 매도 이런내용도 들어갔음 좋을듯"
//
// 자료: 네이버 금융 공개 페이지 2개(인증키·요금 없음, lib/marketIndex.js와 같은 방식으로 표를 읽음)
//   · 투자자별 매매동향(일별): finance.naver.com/sise/investorDealTrendDay.naver?bizdate=YYYYMMDD&sosok=01(코스피)/02(코스닥)
//       표: 날짜 | 개인 | 외국인 | 기관계 | 금융투자 | 보험 | 투신 | 은행 | 기타금융 | 연기금등 | 기타법인   (단위: 억 원, 순매수)
//   · 지수 일별시세: finance.naver.com/sise/sise_index_day.naver?code=KOSPI/KOSDAQ
//
// 안전장치: 개인+외국인+기관+기타법인을 더하면 거의 0이 돼야 정상(누가 사면 누군가는 판 것).
//   이 검사에 안 맞으면(네이버가 표 모양을 바꿨다는 뜻) 잘못된 숫자를 보여 주지 않고 그 칸만 숨깁니다.
//
// 비용: 날짜 하나당 네이버 요청 몇 번. 결과는 저장해 두고 재사용(가장 최근 날짜 10분, 지난 날짜 7일).
//   네이버 수급 숫자는 장 마감 뒤에도 저녁까지 조금씩 바뀔 수 있어서 최근 날짜는 10분마다 새로 받습니다.

import { unstable_cache } from "next/cache";

const FLOW_URL = "https://finance.naver.com/sise/investorDealTrendDay.naver";
const INDEX_URL = "https://finance.naver.com/sise/sise_index_day.naver";
const UA = "Mozilla/5.0 (compatible; newsmeme-bot/1.0)";

const toNum = (s) => {
  const t = String(s || "").replace(/[,\s+]/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(t)) return undefined;
  return Number(t);
};

// "26.10.28" 또는 "2026.10.28" → "2026-10-28"
function normDate(s) {
  const t = String(s || "").trim();
  let m = t.match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{2})\.(\d{2})\.(\d{2})$/);
  if (m) return `20${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

function tableRows(html) {
  const out = [];
  for (const chunk of html.split(/<tr[\s>]/i).slice(1)) {
    const cells = [...chunk.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) =>
      m[1].replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()
    );
    if (cells.length >= 4) out.push(cells);
  }
  return out;
}

async function getHtml(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, cache: "no-store", signal: ctrl.signal });
    if (!res.ok) throw new Error(`네이버 요청 실패 (status ${res.status})`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

let loggedFlowSample = false;

// 한 시장(sosok 01=코스피, 02=코스닥)의 그날 투자자별 순매수(억 원). 그날 행이 없으면 null
async function fetchFlow(sosok, iso) {
  const bizdate = iso.replace(/-/g, "");
  const html = await getHtml(`${FLOW_URL}?bizdate=${bizdate}&sosok=${sosok}`);
  for (const c of tableRows(html)) {
    if (normDate(c[0]) !== iso) continue;
    const individual = toNum(c[1]);
    const foreign = toNum(c[2]);
    const institution = toNum(c[3]);
    const pension = toNum(c[9]);
    const corp = toNum(c[10]);
    const ok = [individual, foreign, institution].every((n) => typeof n === "number");
    // 합이 거의 0인지 확인(표 모양이 바뀌었으면 여기서 걸러짐)
    const sum = (individual || 0) + (foreign || 0) + (institution || 0) + (corp || 0);
    const scale = Math.abs(individual || 0) + Math.abs(foreign || 0) + Math.abs(institution || 0) + 1;
    if (!ok || Math.abs(sum) > scale * 0.15 + 50) {
      if (!loggedFlowSample) {
        loggedFlowSample = true;
        console.error("investorFlow: 네이버 표 모양이 예상과 다름. 원본 셀:", JSON.stringify(c));
      }
      return null;
    }
    return { individual, foreign, institution, pension: typeof pension === "number" ? pension : null };
  }
  return null;
}

// 지수 하나(KOSPI/KOSDAQ)의 그날 종가와 전일 대비. 최근 3페이지(약 18거래일) 안에서 찾음
async function fetchIndex(code, iso) {
  const rows = [];
  for (let page = 1; page <= 3; page++) {
    const html = await getHtml(`${INDEX_URL}?code=${code}&page=${page}`);
    for (const c of tableRows(html)) {
      const date = normDate(c[0]);
      const close = toNum(c[1]);
      if (date && typeof close === "number") rows.push({ date, close });
    }
    const i = rows.findIndex((r) => r.date === iso);
    if (i >= 0 && rows[i + 1]) {
      const prev = rows[i + 1].close;
      return { close: rows[i].close, chgPct: prev ? ((rows[i].close - prev) / prev) * 100 : null };
    }
    if (rows.length && rows[rows.length - 1].date < iso) break; // 이미 지나침
  }
  return null;
}

async function compute(iso) {
  const [kpFlow, kqFlow, kpIdx, kqIdx] = await Promise.all([
    fetchFlow("01", iso).catch(() => null),
    fetchFlow("02", iso).catch(() => null),
    fetchIndex("KOSPI", iso).catch(() => null),
    fetchIndex("KOSDAQ", iso).catch(() => null),
  ]);
  const result = {
    date: iso,
    "코스피": { flow: kpFlow, index: kpIdx },
    "코스닥": { flow: kqFlow, index: kqIdx },
  };
  // 하나도 못 받았으면 저장하지 않도록 오류로 던짐(잠시 네이버가 막혔을 때 빈 결과가 7일 동안 남지 않게)
  if (!kpFlow && !kqFlow && !kpIdx && !kqIdx) throw new Error("수급·지수 자료 없음");
  return result;
}

const cachedRecent = unstable_cache(compute, ["market-flow-recent-v1"], { revalidate: 600 });
const cachedPast = unstable_cache(compute, ["market-flow-past-v1"], { revalidate: 7 * 86400 });

// 날짜 "2026-10-28" → { 코스피:{flow,index}, 코스닥:{flow,index} } 또는 null
export async function getMarketFlow(iso, { latest = false } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  try {
    return await (latest ? cachedRecent(iso) : cachedPast(iso));
  } catch {
    return null;
  }
}

// 억 원 → "1조 709억 원" / "574억 원"
export function eokText(v) {
  const a = Math.abs(Math.round(v));
  const jo = Math.floor(a / 10000);
  const rest = a % 10000;
  if (jo && rest) return `${jo}조 ${rest.toLocaleString("ko-KR")}억 원`;
  if (jo) return `${jo}조 원`;
  return `${rest.toLocaleString("ko-KR")}억 원`;
}

// 사람이 읽는 문장 — 예) "코스피는 6,012.44(+6.63%)로 마감했습니다. 외국인 1조 709억 원, 기관 1조 1,444억 원 순매수, 개인 2조 1,997억 원 순매도."
export function describeFlow(flow) {
  if (!flow) return [];
  const lines = [];
  for (const mk of ["코스피", "코스닥"]) {
    const { flow: f, index: ix } = flow[mk] || {};
    const parts = [];
    if (ix && typeof ix.close === "number") {
      const c = ix.close.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const p = typeof ix.chgPct === "number" ? `(${ix.chgPct > 0 ? "+" : ""}${ix.chgPct.toFixed(2)}%)` : "";
      parts.push(`${mk}${mk === "코스닥" ? "은" : "는"} ${c}${p}로 마감했습니다.`);
    }
    if (f) {
      const who = [
        ["외국인", f.foreign],
        ["기관", f.institution],
        ["개인", f.individual],
      ].filter(([, v]) => typeof v === "number" && v !== 0);
      const buy = who.filter(([, v]) => v > 0).map(([n, v]) => `${n} ${eokText(v)}`);
      const sell = who.filter(([, v]) => v < 0).map(([n, v]) => `${n} ${eokText(v)}`);
      const s = [buy.length ? `${buy.join(", ")} 순매수` : "", sell.length ? `${sell.join(", ")} 순매도` : ""].filter(Boolean).join(", ");
      if (s) parts.push(`${parts.length ? "" : `${mk}에서는 `}${s}.`);
    }
    if (parts.length) lines.push(parts.join(" "));
  }
  return lines;
}
