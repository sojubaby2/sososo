"use client";

// lib/watchlist.js
//
// [2026-10-27 신설] 관심종목 — 별표(☆)를 누르면 담기는 종목 목록입니다.
// 로그인 없이 "그 기기의 그 브라우저"에만 저장됩니다(localStorage, 비용 0).
// 다른 기기에서는 따로 담아야 합니다.
//
// 저장 모양: [{ code, name, market }, ...]  최대 MAX_WATCH개, 최근에 담은 것이 앞.
// 어느 화면에서 바꾸든 WATCH_EVENT 신호를 보내서 다른 화면(홈 속보, 차트 창 별표)이
// 바로 따라 바뀝니다.

import { useCallback, useEffect, useState } from "react";

const KEY = "nm-watchlist";
export const WATCH_EVENT = "newsmeme:watchlist";
const MAX_WATCH = 40;

export function readWatchlist() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(raw) ? raw.filter((s) => s && /^[0-9A-Z]{6}$/.test(s.code)) : [];
  } catch {
    return [];
  }
}

function writeWatchlist(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_WATCH)));
  } catch {
    // 저장이 막힌 환경(사생활 보호 창 등) — 이번 화면에서만 유지
  }
  window.dispatchEvent(new CustomEvent(WATCH_EVENT, { detail: list }));
}

export function toggleWatch(stock) {
  if (!stock?.code) return false;
  const list = readWatchlist();
  const i = list.findIndex((s) => s.code === stock.code);
  if (i >= 0) {
    list.splice(i, 1);
    writeWatchlist(list);
    return false;
  }
  writeWatchlist([{ code: stock.code, name: stock.name || stock.code, market: stock.market || "" }, ...list]);
  return true;
}

// 화면에서 쓰는 훅. 처음 그릴 때는 빈 목록(서버와 똑같이) → 화면이 뜬 뒤 저장된 값으로 바뀜.
export function useWatchlist() {
  const [list, setList] = useState([]);
  useEffect(() => {
    setList(readWatchlist());
    const onChange = (e) => setList(Array.isArray(e.detail) ? e.detail : readWatchlist());
    const onStorage = (e) => e.key === KEY && setList(readWatchlist());
    window.addEventListener(WATCH_EVENT, onChange);
    window.addEventListener("storage", onStorage); // 다른 탭에서 바꾼 것도 반영
    return () => {
      window.removeEventListener(WATCH_EVENT, onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  const has = useCallback((code) => list.some((s) => s.code === code), [list]);
  return { list, has, toggle: toggleWatch };
}
