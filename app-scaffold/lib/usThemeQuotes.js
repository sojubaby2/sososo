// lib/usThemeQuotes.js
//
// [2026-11-18 신설] 미국 주식 테마(91개 테마 · 약 690종목)의 "밤사이 등락률" — 재성님: "미국 주식도 테마별로 싹 정리",
//   "지금 화면에 자연스럽게 미국주식도 녹이는 방법 … 조잡해지지 않고 깔끔하게" → 새 메뉴를 만들지 않고
//   ① 내일 장 미리 보기(/overnight)에 "밤사이 미국 테마" 칸, ② 테마 화면(/themes)에 한국|미국 전환 단추로 넣음.
//
// 테마·종목 표: lib/usThemeData.json (티커는 2026-11-18 나스닥·NYSE 상장 목록과 대조한 것만)
//   한 줄 = { group 분야, theme 테마 이름, desc 설명, etf ETF 묶음 여부, kr 연결되는 한국 테마 이름들, stocks [[티커, 한글 이름], …] }
//   kr에 적는 이름은 lib/themeData.json에 실제로 있는 테마 이름이어야 화면에서 눌러 넘어갑니다.
//
// 시세는 어디서 — 비용 0원:
//   미국 전 종목의 전일 종가·등락률이 하루 한 번(미국 장 마감 뒤) 올라오는 공개 목록 3개
//   (나스닥·NYSE·아멕스, github.com/rreichel3/US-Stock-Symbols — 나스닥 공식 종목표를 그대로 옮긴 것)를 받아
//   우리 표에 있는 종목만 추립니다. 종목마다 따로 묻지 않으므로 요청은 3번뿐입니다.
//   ETF 묶음(레버리지·지수 ETF)은 그 목록에 없어서 기존 해외 시세 함수(lib/quotes.js)로 따로 받습니다.
//
// 저장: 서버 메모리 10분 → Redis 30분. 목록을 못 받으면 마지막으로 저장해 둔 값(최대 5일)을 내줍니다.
//   자료가 하루 한 번 바뀌는 "전일 종가"이므로 장중 실시간이 아닙니다(화면에도 그렇게 적음).

import raw from "./usThemeData.json";
import { memo } from "./memoCache";
import { getRedis } from "./redis";
import { fetchEtfQuotes } from "./quotes";

const KEY = "us:themes:v1";
const FRESH_MS = 30 * 60 * 1000;
const SRC = "https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main";
const FILES = ["nasdaq/nasdaq_full_tickers.json", "nyse/nyse_full_tickers.json", "amex/amex_full_tickers.json"];

const num = (v) => {
  const n = parseFloat(String(v ?? "").replace(/[$,%\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};

async function fetchList(path) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 12000);
  try {
    const res = await fetch(`${SRC}/${path}`, { signal: ctl.signal, cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function collect() {
  const need = new Set();
  const etfSyms = new Set();
  for (const t of raw) for (const [sym] of t.stocks) (t.etf ? etfSyms : need).add(sym);

  const lists = await Promise.all(FILES.map(fetchList));
  const quotes = {};
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const r of list) {
      const sym = String(r?.symbol || "").trim();
      if (!need.has(sym) || quotes[sym]) continue;
      const price = num(r.lastsale);
      const pct = num(r.pctchange);
      if (price === null) continue;
      quotes[sym] = { p: price, c: pct };
    }
  }
  // 종목 대부분을 못 받았으면(목록이 비었거나 형식이 바뀜) 실패로 처리 → 마지막 저장값 사용
  if (Object.keys(quotes).length < need.size * 0.6) return null;

  try {
    const etf = await fetchEtfQuotes([...etfSyms]);
    for (const [sym, q] of etf) {
      if (typeof q?.price === "number") quotes[sym] = { p: q.price, c: typeof q.changePct === "number" ? q.changePct : null };
    }
  } catch {
    // ETF 시세는 없어도 됨
  }

  const themes = raw.map((t) => {
    const stocks = t.stocks.map(([sym, name]) => ({ t: sym, n: name, p: quotes[sym]?.p ?? null, c: quotes[sym]?.c ?? null }));
    const vals = stocks.map((s) => s.c).filter((v) => typeof v === "number");
    // 테마 등락률 = 종목 등락률 단순 평균(3종목 이상 있을 때만). ETF 묶음은 순위에서 제외.
    const change = !t.etf && vals.length >= 3 ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : null;
    stocks.sort((a, b) => (b.c ?? -999) - (a.c ?? -999));
    return { group: t.group, theme: t.theme, desc: t.desc, etf: !!t.etf, kr: t.kr, change, stocks };
  });
  return { savedAt: new Date().toISOString(), themes };
}

async function load() {
  const redis = getRedis();
  let last = null;
  if (redis) {
    try {
      const v = await redis.get(KEY);
      last = typeof v === "string" ? JSON.parse(v) : v;
    } catch {
      last = null;
    }
  }
  if (last?.themes && Date.now() - Date.parse(last.savedAt || 0) < FRESH_MS) return last;
  let fresh = null;
  try {
    fresh = await collect();
  } catch {
    fresh = null;
  }
  if (fresh) {
    if (redis) await redis.set(KEY, fresh, { ex: 5 * 86400 }).catch(() => {});
    return fresh;
  }
  if (last?.themes) return { ...last, stale: true };
  throw new Error("us-themes: 자료 없음");
}

export function getUsThemes() {
  return memo("us-themes", 10 * 60 * 1000, load);
}

// 시세 없이 표만(시세를 못 받았을 때 화면이 비지 않게)
export function getUsThemesBare() {
  return {
    savedAt: null,
    bare: true,
    themes: raw.map((t) => ({ group: t.group, theme: t.theme, desc: t.desc, etf: !!t.etf, kr: t.kr, change: null, stocks: t.stocks.map(([sym, name]) => ({ t: sym, n: name, p: null, c: null })) })),
  };
}
