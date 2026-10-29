// lib/investorFlow.js
//
// [2026-10-28 신설] 장 마감 정리에 "누가 사고 누가 팔았나"(투자자별 순매수)와 지수 마감을 넣기 위한 파일.
//   재성님: "장마감 정리 내용에 외국인, 기관 등 매수, 매도 이런내용도 들어갔음 좋을듯"
//
// [2026-10-29 변경] 재성님: "누가 사고, 누가 팔았나 안보이고"
//   → 사이트(Cloudflare)에서 네이버 금융 요청이 안 통하는 것으로 보여서(지수·수급 둘 다 비어 있었음):
//     · 지수 마감: 네이버 대신 야후(^KS11 코스피, ^KQ11 코스닥) — 사이트 위쪽 지수 띠가 이미 야후로 잘 받고 있음
//     · 수급: 네이버 요청에 평범한 브라우저 표시(User-Agent·Referer)를 붙여 다시 시도
//     · 왜 안 되는지 바로 볼 수 있게 /api/market-flow?date=YYYY-MM-DD&diag=1 진단 주소를 만듦(app/api/market-flow/route.js)
//   [2026-10-29 오전 진단 결과] 네이버 PC 수급 페이지가 사이트 서버에 "410(없어진 페이지, Npay 증권 안내)"을 돌려줌.
//     → 수급 자료를 받을 곳을 여러 군데 차례로 시도: ① 네이버 증권 모바일(m.stock.naver.com) ② 다음 금융 ③ 네이버 PC.
//       받은 모양이 무엇이든 "날짜 + 개인/외국인/기관" 칸을 찾아 읽고, 합이 0 근처인지(누가 사면 누군가는 판다) 검사해서 맞을 때만 씀.
//   [2026-10-29 두 번째 진단] · 네이버 PC 페이지는 상태 번호만 410이고 내용(수급 표)은 그대로 옴 → 상태 번호와 상관없이 표를 읽음
//     · 야후는 10/28 종가 칸이 비어 있음(야후 쪽 빈칸) → 지수는 네이버 증권 모바일 일별 시세를 먼저 쓰고, 야후는 예비로
//
// 자료:
//   · 투자자별 매매동향(일별): finance.naver.com/sise/investorDealTrendDay.naver?bizdate=YYYYMMDD&sosok=01(코스피)/02(코스닥)
//       표: 날짜 | 개인 | 외국인 | 기관계 | 금융투자 | 보험 | 투신 | 은행 | 기타금융 | 연기금등 | 기타법인   (단위: 억 원, 순매수)
//   · 지수 일별 종가: 야후 차트(무료)
//
// 안전장치: 개인+외국인+기관+기타법인을 더하면 거의 0이 돼야 정상(누가 사면 누군가는 판 것).
//   이 검사에 안 맞으면(네이버가 표 모양을 바꿨다는 뜻) 잘못된 숫자를 보여 주지 않고 그 칸만 숨깁니다.
//
// 비용: 날짜 하나당 바깥 요청 몇 번(무료). 결과는 저장해 두고 재사용(가장 최근 날짜 10분, 지난 날짜 7일).

import { unstable_cache } from "next/cache";

const FLOW_URL = "https://finance.naver.com/sise/investorDealTrendDay.naver";
const YAHOO_URL = "https://query1.finance.yahoo.com/v8/finance/chart";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

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

async function getText(url, headers = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
        ...headers,
      },
      cache: "no-store",
      signal: ctrl.signal,
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  } finally {
    clearTimeout(timer);
  }
}

let loggedFlowSample = false;

function flowUrl(sosok, iso) {
  return `${FLOW_URL}?bizdate=${iso.replace(/-/g, "")}&sosok=${sosok}`;
}
const NAVER_HEADERS = { Referer: "https://finance.naver.com/sise/sise_trans_style.naver" };

// 표에서 그날 행을 찾아 숫자로. 못 찾거나 모양이 이상하면 null
function parseFlow(html, iso) {
  for (const c of tableRows(html)) {
    if (normDate(c[0]) !== iso) continue;
    const individual = toNum(c[1]);
    const foreign = toNum(c[2]);
    const institution = toNum(c[3]);
    const pension = toNum(c[9]);
    const corp = toNum(c[10]);
    const ok = [individual, foreign, institution].every((n) => typeof n === "number");
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

// ── JSON 자료에서 수급 찾기(받는 곳마다 모양이 달라서 이름으로 찾음) ──
const isoOf = (v) => {
  const m = String(v ?? "").match(/^(\d{4})[-.]?(\d{2})[-.]?(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};
const numOf = (v) => (typeof v === "number" ? v : toNum(v));
function pickBy(obj, re) {
  for (const k of Object.keys(obj)) if (re.test(k)) { const n = numOf(obj[k]); if (typeof n === "number") return n; }
  return undefined;
}
// 단위 맞추기 → 억 원. (하루 순매수는 많아야 수조 원 = 수만 억)
function toEok(vals) {
  const mx = Math.max(...vals.map((v) => Math.abs(v || 0)));
  const div = mx > 1e9 ? 1e8 : mx > 2e5 ? 100 : 1; // 원 / 백만 원 / 억 원
  return vals.map((v) => (typeof v === "number" ? Math.round(v / div) : v));
}
function flowFromItem(it) {
  const individual = pickBy(it, /individual|personal|person|indv|retail/i);
  const foreign = pickBy(it, /foreign|frgn/i);
  const institution = pickBy(it, /institution|organ|inst/i);
  const pension = pickBy(it, /pension/i);
  if (![individual, foreign, institution].every((n) => typeof n === "number")) return null;
  const [a, b, c, d] = toEok([individual, foreign, institution, pension]);
  const scale = Math.abs(a) + Math.abs(b) + Math.abs(c) + 1;
  if (Math.abs(a + b + c) > scale * 0.35 + 100) return null; // 기타법인 몫을 생각해 넉넉히
  return { individual: a, foreign: b, institution: c, pension: typeof d === "number" ? d : null };
}
// 객체 안을 훑어 "날짜가 iso인 항목"에서 수급을 찾음
function findFlowInJson(root, iso) {
  const stack = [root];
  let seen = 0;
  while (stack.length && seen < 5000) {
    const v = stack.pop();
    seen += 1;
    if (Array.isArray(v)) { for (const x of v) stack.push(x); continue; }
    if (!v || typeof v !== "object") continue;
    const dKey = Object.keys(v).find((k) => /date|bizdate|dt|day/i.test(k) && isoOf(v[k]));
    if (dKey && isoOf(v[dKey]) === iso) {
      const f = flowFromItem(v);
      if (f) return f;
    }
    for (const k of Object.keys(v)) if (v[k] && typeof v[k] === "object") stack.push(v[k]);
  }
  return null;
}

const MK_CODE = { "01": "KOSPI", "02": "KOSDAQ" };
// 수급을 받을 곳들(앞에서부터 시도)
function flowSources(sosok, iso) {
  const mk = MK_CODE[sosok];
  return [
    {
      name: "네이버 증권 모바일",
      url: `https://m.stock.naver.com/api/index/${mk}/integration`,
      headers: { Referer: `https://m.stock.naver.com/domestic/index/${mk}/total`, Accept: "application/json,text/plain,*/*" },
      kind: "json",
    },
    {
      name: "다음 금융",
      url: `https://finance.daum.net/api/investor/days?page=1&perPage=30&market=${mk}&pagination=true`,
      headers: { Referer: "https://finance.daum.net/domestic/investors", Accept: "application/json,text/plain,*/*" },
      kind: "json",
    },
    { name: "네이버 PC", url: flowUrl(sosok, iso), headers: NAVER_HEADERS, kind: "html" },
  ];
}
async function trySource(src, iso) {
  const r = await getText(src.url, src.headers);
  // 네이버 PC는 410을 주면서도 표를 보내므로 html은 상태 번호와 상관없이 읽어 봄
  if (src.kind === "html") return { r, flow: parseFlow(r.text, iso) };
  if (!r.ok) return { r, flow: null };
  let data = null;
  try {
    data = JSON.parse(r.text);
  } catch {
    return { r, flow: null };
  }
  return { r, flow: findFlowInJson(data, iso) };
}

// 한 시장(sosok 01=코스피, 02=코스닥)의 그날 투자자별 순매수(억 원). 어디서도 못 받으면 null
async function fetchFlow(sosok, iso) {
  for (const src of flowSources(sosok, iso)) {
    try {
      const { flow } = await trySource(src, iso);
      if (flow) return { ...flow, source: src.name };
    } catch {
      // 다음 곳 시도
    }
  }
  return null;
}

// 지수 일별 시세 — 네이버 증권 모바일(1순위). 항목 모양: { localTradedAt, closePrice, fluctuationsRatio, ... }
function naverIndexUrl(mk) {
  return `https://m.stock.naver.com/api/index/${mk}/price?pageSize=30&page=1`;
}
function indexFromJson(root, iso) {
  const items = [];
  const stack = [root];
  while (stack.length && items.length < 500) {
    const v = stack.pop();
    if (Array.isArray(v)) { for (const x of v) stack.push(x); continue; }
    if (!v || typeof v !== "object") continue;
    const dKey = Object.keys(v).find((k) => /date|tradedat|dt|day/i.test(k) && isoOf(v[k]));
    const close = pickBy(v, /^closePrice$|^close$|closeprice/i);
    if (dKey && typeof close === "number") items.push({ date: isoOf(v[dKey]), close, ratio: pickBy(v, /fluctuationsRatio|changeRate|ratio/i) });
    for (const k of Object.keys(v)) if (v[k] && typeof v[k] === "object") stack.push(v[k]);
  }
  items.sort((a, b) => (a.date < b.date ? -1 : 1));
  const i = items.findIndex((x) => x.date === iso);
  if (i < 0) return null;
  const prev = i > 0 ? items[i - 1].close : null;
  const chgPct = prev ? ((items[i].close - prev) / prev) * 100 : typeof items[i].ratio === "number" ? items[i].ratio : null;
  return { close: Math.round(items[i].close * 100) / 100, chgPct };
}
async function fetchIndexNaver(mk, iso) {
  const r = await getText(naverIndexUrl(mk), { Referer: `https://m.stock.naver.com/domestic/index/${mk}/total`, Accept: "application/json,text/plain,*/*" });
  if (!r.ok) return null;
  return indexFromJson(JSON.parse(r.text), iso);
}

// 지수 하나(^KS11/^KQ11)의 그날 종가와 전일 대비 — 야후 일봉(최근 3달)에서 그 날짜를 찾음(예비)
async function fetchIndex(symbol, iso) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${YAHOO_URL}/${encodeURIComponent(symbol)}?range=3mo&interval=1d`, {
      headers: { "User-Agent": BROWSER_UA, Accept: "application/json,text/plain,*/*" },
      cache: "no-store",
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`야후 지수 요청 실패 (status ${res.status})`);
    const data = await res.json();
    const r = data?.chart?.result?.[0];
    const ts = r?.timestamp || [];
    const closes = r?.indicators?.quote?.[0]?.close || [];
    const rows = [];
    ts.forEach((t, i) => {
      const c = closes[i];
      if (typeof c !== "number" || !Number.isFinite(c)) return;
      rows.push({ date: new Date((t + 9 * 3600) * 1000).toISOString().slice(0, 10), close: c });
    });
    // 오늘 장중/장 마감 직후엔 마지막 봉이 비어 있을 수 있어 meta 값으로 보충
    const meta = r?.meta || {};
    if (typeof meta.regularMarketPrice === "number" && typeof meta.regularMarketTime === "number") {
      const d = new Date((meta.regularMarketTime + 9 * 3600) * 1000).toISOString().slice(0, 10);
      const last = rows[rows.length - 1];
      if (!last || last.date < d) rows.push({ date: d, close: meta.regularMarketPrice });
      else if (last.date === d) last.close = meta.regularMarketPrice;
    }
    const i = rows.findIndex((x) => x.date === iso);
    if (i <= 0) return null;
    const prev = rows[i - 1].close;
    return { close: Math.round(rows[i].close * 100) / 100, chgPct: prev ? ((rows[i].close - prev) / prev) * 100 : null };
  } finally {
    clearTimeout(timer);
  }
}

async function compute(iso) {
  const [kpFlow, kqFlow, kpIdx, kqIdx] = await Promise.all([
    fetchFlow("01", iso).catch(() => null),
    fetchFlow("02", iso).catch(() => null),
    fetchIndexNaver("KOSPI", iso).catch(() => null).then((x) => x || fetchIndex("^KS11", iso).catch(() => null)),
    fetchIndexNaver("KOSDAQ", iso).catch(() => null).then((x) => x || fetchIndex("^KQ11", iso).catch(() => null)),
  ]);
  const result = {
    date: iso,
    "코스피": { flow: kpFlow, index: kpIdx },
    "코스닥": { flow: kqFlow, index: kqIdx },
  };
  // 하나도 못 받았으면 저장하지 않도록 오류로 던짐(잠시 막혔을 때 빈 결과가 7일 동안 남지 않게)
  if (!kpFlow && !kqFlow && !kpIdx && !kqIdx) throw new Error("수급·지수 자료 없음");
  return result;
}

const cachedRecent = unstable_cache(compute, ["market-flow-recent-v4"], { revalidate: 600 });
const cachedPast = unstable_cache(compute, ["market-flow-past-v4"], { revalidate: 7 * 86400 });

// 날짜 "2026-10-28" → { 코스피:{flow,index}, 코스닥:{flow,index} } 또는 null
export async function getMarketFlow(iso, { latest = false } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  try {
    return await (latest ? cachedRecent(iso) : cachedPast(iso));
  } catch {
    return null;
  }
}

// [2026-10-29 추가] 진단 — 네이버가 무엇을 돌려주는지 그대로 보여 줌(저장 안 함)
export async function diagnoseFlow(iso) {
  const out = { date: iso, naver: {}, yahoo: {} };
  for (const [name, sosok] of [["코스피", "01"], ["코스닥", "02"]]) {
    out.naver[name] = [];
    for (const src of flowSources(sosok, iso)) {
      try {
        const { r, flow } = await trySource(src, iso);
        // 표/자료 구조를 보이게: html이면 표 앞 몇 줄, json이면 키 목록과 배열마다 첫 항목
        let shape = null;
        if (src.kind === "html") shape = tableRows(r.text).slice(0, 3);
        else {
          try {
            const j = JSON.parse(r.text);
            shape = {};
            for (const k of Object.keys(j || {})) {
              const v = j[k];
              shape[k] = Array.isArray(v) ? { len: v.length, first: JSON.stringify(v[0] ?? null).slice(0, 500) } : typeof v === "object" && v ? `{${Object.keys(v).slice(0, 15).join(",")}}` : String(v).slice(0, 60);
            }
          } catch {
            shape = null;
          }
        }
        out.naver[name].push({
          source: src.name,
          url: src.url,
          status: r.status,
          length: r.text.length,
          shape,
          parsed: flow,
        });
      } catch (e) {
        out.naver[name].push({ source: src.name, error: String(e?.message || e) });
      }
    }
  }
  for (const [name, sym] of [["코스피", "^KS11"], ["코스닥", "^KQ11"]]) {
    try {
      const raw = await getText(`${YAHOO_URL}/${encodeURIComponent(sym)}?range=3mo&interval=1d`, { Accept: "application/json,text/plain,*/*" });
      let tail = null;
      try {
        const j = JSON.parse(raw.text);
        const rr = j?.chart?.result?.[0];
        tail = {
          ts: (rr?.timestamp || []).slice(-4),
          close: (rr?.indicators?.quote?.[0]?.close || []).slice(-4),
          meta: rr?.meta ? { t: rr.meta.regularMarketTime, p: rr.meta.regularMarketPrice, gmt: rr.meta.gmtoffset } : null,
          err: j?.chart?.error || null,
        };
      } catch {
        tail = raw.text.slice(0, 200);
      }
      const mk = name === "코스피" ? "KOSPI" : "KOSDAQ";
      const nv = await getText(naverIndexUrl(mk), { Accept: "application/json,text/plain,*/*" }).catch((e) => ({ status: 0, text: String(e) }));
      let naverParsed = null;
      try {
        naverParsed = indexFromJson(JSON.parse(nv.text), iso);
      } catch {
        naverParsed = null;
      }
      out.yahoo[name] = {
        status: raw.status,
        tail,
        parsed: await fetchIndex(sym, iso).catch((e) => String(e?.message || e)),
        naverIndex: { status: nv.status, head: String(nv.text).slice(0, 400), parsed: naverParsed },
      };
    } catch (e) {
      out.yahoo[name] = { error: String(e?.message || e) };
    }
  }
  return out;
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
