"use client";

// components/ThemeRadar.js
//
// [2026-10-28 신설] 휴대폰 "테마" 탭 맨 위 — B. 테마 레이더.
//   재성님: "모바일 화면 맘에안드는데 다시 바꾸자 — 훨씬 혁신적인 모바일 화면" → 시안 A+B 선택.
//
// 무엇을 보여 주나:
//   · 오늘 속보에 많이 나온 테마일수록 큰 동그라미. 관련 종목이 평균적으로 올랐으면 빨강, 내렸으면 파랑(진할수록 많이).
//   · 동그라미를 누르면 아래 칸이 그 테마로 바뀝니다: 관련주(누르면 차트) + 최근 속보.
//   · "이 테마 속보 넘겨보기"를 누르면 속보 탭(숏폼)으로 가서 그 테마 속보만 넘겨 봅니다.
//
// 자료: 홈 화면이 이미 받아 둔 속보 목록만으로 계산합니다(서버 요청 추가 0, 비용 0).
// ★ PC 화면에서는 보이지 않습니다(globals.css .m-radar-wrap).

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, AlertTriangle } from "lucide-react";
import { openStockChart } from "../lib/openStockChart";
import { themeStats, todaysOf, heatClass, pct, tone, isNum, hhmm, kstParts, splitTags } from "./MobileFeed";

const MAX_BUBBLES = 9;
const FIELD_H = 300;
const GAP = 6;

// 동그라미 놓기: 큰 것부터 가운데에 두고, 나머지는 가운데에서 바깥으로 빙빙 돌며 안 겹치는 첫 자리에.
// 다 안 들어가면 전체를 조금 줄여서 다시. (항상 같은 자료면 같은 모양 — 화면이 덜컹이지 않게)
function packBubbles(stats, W, H) {
  if (!stats.length || W <= 0) return [];
  const maxC = Math.max(...stats.map((s) => s.count));
  let scale = 1;
  for (let attempt = 0; attempt < 8; attempt++) {
    const placed = [];
    let ok = true;
    for (let i = 0; i < stats.length; i++) {
      const r = Math.round((26 + 46 * Math.sqrt(stats[i].count / maxC)) * scale);
      let spot = null;
      for (let d = 0; d < Math.max(W, H) && !spot; d += 3) {
        const steps = d === 0 ? 1 : 28;
        for (let k = 0; k < steps; k++) {
          const a = (k / steps) * Math.PI * 2 + i * 0.7;
          const x = W / 2 + Math.cos(a) * d * 1.25; // 화면이 가로로 넓어서 가로로 더 퍼지게
          const y = H / 2 + Math.sin(a) * d * 0.85;
          if (x - r < 2 || x + r > W - 2 || y - r < 2 || y + r > H - 2) continue;
          if (placed.every((p) => Math.hypot(p.x - x, p.y - y) >= p.r + r + GAP)) {
            spot = { x, y };
            break;
          }
        }
      }
      if (!spot) {
        ok = false;
        break;
      }
      placed.push({ ...stats[i], r, x: spot.x, y: spot.y });
    }
    if (ok) return placed;
    scale *= 0.9;
  }
  return [];
}

export default function ThemeRadar({ items, onOpen }) {
  const today = useMemo(() => todaysOf(items), [items]);
  const stats = useMemo(() => themeStats(today).slice(0, MAX_BUBBLES), [today]);
  const fieldRef = useRef(null);
  const [W, setW] = useState(0);
  const [pick, setPick] = useState(null);

  useEffect(() => {
    const el = fieldRef.current;
    if (!el) return;
    const update = () => setW(el.clientWidth);
    update();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [stats.length >= 3]);

  const bubbles = useMemo(() => packBubbles(stats, W, FIELD_H), [stats, W]);
  const selected = stats.find((s) => s.theme === pick) || stats[0] || null;

  // 고른 테마의 관련주(많이 나온 순 → 많이 오른 순)와 최근 속보
  const detail = useMemo(() => {
    if (!selected) return null;
    const news = today.filter((n) => n.themes?.includes(selected.theme));
    const by = new Map();
    for (const n of news) {
      for (const s of n.stocks || []) {
        const row = by.get(s.code);
        if (row) row.hits += 1;
        else by.set(s.code, { ...s, hits: 1 });
      }
    }
    const stocks = [...by.values()]
      .sort((a, b) => b.hits - a.hits || (isNum(b.change) ? b.change : -99) - (isNum(a.change) ? a.change : -99))
      .slice(0, 6);
    return { news, stocks };
  }, [selected, today]);

  if (stats.length < 3) return null;

  return (
    <section className="tr m-only" aria-label="테마 레이더">
      <div className="tr-head">
        <h2>테마 레이더</h2>
        <p>오늘 속보가 많이 나온 테마일수록 크게 · 오늘 속보 {today.length}건 기준</p>
      </div>

      <div className="tr-field" ref={fieldRef} style={{ height: FIELD_H }}>
        <span className="tr-ring tr-ring1" aria-hidden="true" />
        <span className="tr-ring tr-ring2" aria-hidden="true" />
        {bubbles.map((b, i) => {
          const on = selected?.theme === b.theme;
          const size = b.r * 2;
          return (
            <button
              type="button"
              key={b.theme}
              className={`tr-b ${heatClass(b.avg)} ${on ? "on" : ""} ${b.r >= 52 ? "lg" : b.r >= 40 ? "md" : "sm"}`}
              style={{ left: b.x - b.r, top: b.y - b.r, width: size, height: size, animationDelay: `${i * 40}ms` }}
              aria-pressed={on}
              aria-label={`${b.theme}, 속보 ${b.count}건, 관련주 평균 ${pct(b.avg)}`}
              onClick={() => setPick(b.theme)}
            >
              <b>{b.theme}</b>
              {isNum(b.avg) && <span className="mono">{pct(b.avg)}</span>}
              {b.r >= 52 && <small>속보 {b.count}</small>}
            </button>
          );
        })}
      </div>
      <p className="tr-legend">빨강 = 관련주 평균 오름 · 파랑 = 내림 · 진할수록 많이</p>

      {selected && detail && (
        <div className="tr-sheet">
          <div className="tr-sheet-head">
            <h3>{selected.theme}</h3>
            <span>속보 {selected.count}건</span>
            {isNum(selected.avg) && (
              <span className="tr-avg">
                관련주 평균 <b className={`mono ${tone(selected.avg)}`}>{pct(selected.avg)}</b>
              </span>
            )}
          </div>
          {detail.stocks.length > 0 && (
            <div className="tr-stocks">
              {detail.stocks.map((s) => (
                <button
                  type="button"
                  key={s.code}
                  className="tr-stock"
                  onClick={() => openStockChart({ code: s.code, name: s.name, market: s.market })}
                  title={`${s.name} 차트 보기`}
                >
                  <span className="tr-stock-nm">
                    {s.catalyst && <AlertTriangle size={11} aria-label="악재" />}
                    {s.name}
                  </span>
                  <span className={`mono ${tone(s.change)}`}>{pct(s.change)}</span>
                </button>
              ))}
            </div>
          )}
          <ul className="tr-news">
            {detail.news.slice(0, 3).map((n) => (
              <li key={n.id}>
                <button type="button" onClick={() => onOpen?.(selected.theme, n.id)}>
                  <span className="mono">{hhmm(kstParts(n.ts))}</span>
                  <span className="tr-news-t">{splitTags(n.headline).text}</span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="tr-go" onClick={() => onOpen?.(selected.theme, null)}>
            {selected.theme} 속보 {selected.count}건 넘겨보기
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </section>
  );
}
