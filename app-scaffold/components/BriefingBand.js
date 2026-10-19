"use client";

// components/BriefingBand.js
//
// [2026-10-19 신설] 홈 화면 맨 위 남색 띠입니다.
// 예전 components/WorldMarketMap.js(지도 + 지수 카드)를 흡수했습니다.
//
// 여기에 들어가는 것:
//   ① 오늘을 한 문장으로 — "오늘 시장을 움직인 건 해운이었습니다"
//      (문장을 만드는 규칙은 lib/todayBrief.js에 있습니다)
//   ② 뉴스가 몰린 테마 — 크기로 순위를 보여주고, 누르면 아래 속보가 걸러집니다
//   ③ 세계 지수 — 옛날엔 카드였는데 가로로 흐르는 띠로 바꿨습니다
//   ④ 세계지도 — 네모난 위젯이 아니라 배경으로 깔고 핀만 빛나게 했습니다
//
// 지도 핀 위치에 대해:
// 경도·위도를 공식으로 바꾸는 방식을 쓰다가 핀이 엉뚱한 데 찍혀서, 이 그림
// 한 장에 맞춰 나라별 위치를 직접 재서 표로 넣었습니다. 그림을 10배로 확대해
// 서울·도쿄·상하이…를 하나씩 확인한 값입니다.
//
// ★ 지도 그림(public/world-map.jpg)을 다른 것으로 바꾸면 이 표도 다시
//   잡아야 합니다. 핀 하나가 어긋나면 그 줄의 숫자 두 개만 고치면 됩니다.
//   앞이 가로, 뒤가 세로이고 기준은 원본 그림 1024 x 559 픽셀입니다.

import { useMemo } from "react";

const MAP_WIDTH = 1024;
const MAP_HEIGHT = 559;

const MAP_POINTS = {
  kr: [813, 242], // 서울
  jp: [845, 250], // 도쿄
  cn: [791, 259], // 상하이
  hk: [781, 291], // 홍콩
  tw: [801, 285], // 타이베이
  in: [671, 296], // 뭄바이
  gb: [483, 205], // 런던
  de: [505, 208], // 프랑크푸르트
  // 다우와 나스닥은 둘 다 뉴욕이라 겹칩니다. 조금 떨어뜨려 둘 다 보이게 했습니다.
  "us-dow": [302, 234],
  "us-nasdaq": [288, 245],
  br: [361, 420], // 상파울루
};

// 히트맵에 보여줄 테마 최대 개수. 너무 많으면 띠가 두 줄 세 줄로 늘어납니다.
const MAX_THEMES = 8;

function pct(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function close(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
}

export default function BriefingBand({ brief, worldIndices, activeTheme, onThemeClick }) {
  const indices = Array.isArray(worldIndices?.items) ? worldIndices.items : [];

  const pins = useMemo(
    () =>
      indices
        .map((it) => {
          const p = MAP_POINTS[it.key];
          return p ? { ...it, px: p[0], py: p[1] } : null;
        })
        .filter(Boolean),
    [indices]
  );

  const themes = (brief?.themeRows || []).slice(0, MAX_THEMES);
  const lead = brief?.lead || { before: "", highlight: "", after: "" };

  return (
    <section className="brief-band">
      {/* 지도는 장식 겸 데이터입니다. 글을 읽는 데 방해되지 않도록 왼쪽으로
          갈수록 서서히 사라지게 하고, 핀만 또렷하게 남깁니다. */}
      <div className="brief-map" aria-hidden="true">
        <img src="/world-map.jpg" alt="" width={MAP_WIDTH} height={MAP_HEIGHT} />
      </div>
      <div className="brief-pins" aria-hidden="true">
        <svg viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}>
          {pins.map((it) => {
            const up = typeof it.changePct === "number" ? it.changePct >= 0 : true;
            const color = up ? "var(--up)" : "var(--down)";
            return (
              <g key={it.key}>
                <circle cx={it.px} cy={it.py} r="22" fill={color} opacity="0.22" />
                <circle cx={it.px} cy={it.py} r="7" fill={color} />
              </g>
            );
          })}
        </svg>
      </div>

      <div className="container-wide brief-inner">
        <span className="brief-eyebrow">
          <span className="brief-dot" />
          {brief?.stamp || ""} · 15분 지연
        </span>

        <h2 className="brief-lead">
          {lead.before}
          <em>{lead.highlight}</em>
          {lead.after}
        </h2>

        {brief?.sub && <p className="brief-sub">{brief.sub}</p>}

        {themes.length > 0 && (
          <>
            <div className="brief-label">뉴스가 몰린 테마 · 눌러서 거르기</div>
            <div className="brief-heat">
              {themes.map((t, i) => (
                <button
                  key={t.theme}
                  type="button"
                  data-rank={i < 3 ? i + 1 : 4}
                  aria-pressed={activeTheme === t.theme}
                  onClick={() => onThemeClick?.(t.theme)}
                >
                  <span className="t">{t.theme}</span>
                  <span className="n">{t.news}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {indices.length > 0 && (
          <div className="brief-ticker">
            {indices.map((it) => {
              const tone =
                typeof it.changePct === "number" ? (it.changePct > 0 ? "up" : it.changePct < 0 ? "down" : "") : "";
              return (
                <div className="brief-tk" key={it.key}>
                  <span className="c">{it.label}</span>
                  <span className="v mono">{close(it.close)}</span>
                  <span className={`p mono ${tone}`}>{pct(it.changePct)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
