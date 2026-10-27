// lib/stockDirectory.js
//
// [2026-10-27 신설] "종목 사전" — 종목별 페이지(/stock/코드)와 장 마감 정리(/market/날짜)가
// 함께 쓰는 종목 목록입니다. 따로 저장하는 곳 없이 테마 자료(lib/themeData.json)에서 만듭니다.
//
//   · STOCKS: 종목코드 → { code, name, market, themes: [테마 이름들] }
//   · themeMembers(테마): 그 테마에 속한 종목들
//   · peersOf(코드): 같은 테마에 속한 다른 종목들(종목 페이지의 "같은 테마 종목")
//
// 비용: 0원. 파일을 읽어 메모리에서 계산할 뿐입니다.

import rawThemeData from "./themeData.json";

const byCode = new Map();
const byTheme = new Map();

for (const row of rawThemeData) {
  const code = String(row.code || "").trim();
  if (!/^[0-9A-Z]{6}$/.test(code)) continue;
  if (!byCode.has(code)) byCode.set(code, { code, name: row.name, market: row.market || "", themes: [] });
  const s = byCode.get(code);
  if (!s.themes.includes(row.theme)) s.themes.push(row.theme);
  if (!byTheme.has(row.theme)) byTheme.set(row.theme, []);
  const list = byTheme.get(row.theme);
  if (!list.some((m) => m.code === code)) list.push({ code, name: row.name, market: row.market || "" });
}

export const STOCKS = byCode;

export function getStock(code) {
  return byCode.get(String(code || "").toUpperCase()) || null;
}

export function allStockCodes() {
  return [...byCode.keys()];
}

export function themeMembers(theme) {
  return byTheme.get(theme) || [];
}

export function allThemes() {
  return [...byTheme.keys()];
}

// 같은 테마 종목 — 테마마다 몇 개씩 골고루, 중복 없이 최대 max개.
export function peersOf(code, max = 12) {
  const me = getStock(code);
  if (!me) return [];
  const out = [];
  const seen = new Set([me.code]);
  const lists = me.themes.map((t) => themeMembers(t).map((m) => ({ ...m, theme: t })));
  for (let round = 0; out.length < max && round < 12; round++) {
    let added = false;
    for (const list of lists) {
      const m = list[round];
      if (!m || seen.has(m.code)) continue;
      seen.add(m.code);
      out.push(m);
      added = true;
      if (out.length >= max) break;
    }
    if (!added && lists.every((l) => round >= l.length)) break;
  }
  return out;
}
