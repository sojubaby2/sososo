"use client";

// components/BriefingBand.js
//
// [2026-10-19 신설] 홈 화면 맨 위 남색 띠입니다.
// 예전 components/WorldMarketMap.js(지도 + 지수 카드)를 흡수했습니다.
//
// [2026-10-20 변경] 두 가지를 바꿨습니다(재성님 요청).
//   ① 오늘을 한 문장으로 → 왼쪽 미국 / 오른쪽 한국 두 문장으로
//      시간대에 따라 둘 중 하나만 보여주던 걸 항상 나란히 띄웁니다.
//      말투는 장중이냐 마감이냐에 따라 바뀝니다(lib/todayBrief.js).
//   ② 지수 띠에 탭 추가 → 세계 증시 / 환율·금리 / 원자재
//
// 여기에 들어가는 것:
//   · 오늘 한 줄 두 개 (미국 / 한국)
//   · 뉴스가 몰린 테마 — 크기로 순위를 보여주고, 누르면 아래 속보가 걸러짐
//   · 지수 띠 (탭 3개)
//   · 세계지도 — 네모난 위젯이 아니라 배경으로 깔고 핀만 빛나게
//
// 지도 핀 위치에 대해:
// 경도·위도를 공식으로 바꾸는 방식을 쓰다가 핀이 엉뚱한 데 찍혀서, 이 그림
// 한 장에 맞춰 나라별 위치를 직접 재서 표로 넣었습니다. 그림을 10배로 확대해
// 서울·도쿄·상하이…를 하나씩 확인한 값입니다.
//
// ★ 지도 그림(public/world-map.jpg)을 다른 것으로 바꾸면 이 표도 다시
//   잡아야 합니다. 핀 하나가 어긋나면 그 줄의 숫자 두 개만 고치면 됩니다.
//   앞이 가로, 뒤가 세로이고 기준은 원본 그림 1024 x 559 픽셀입니다.
//   표에 없는 나라는 핀만 생략되고 아래 띠에는 정상으로 나옵니다.

import { useMemo, useState } from "react";

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

const TABS = [
  { key: "world", label: "세계 증시" },
  { key: "fx", label: "환율 · 금리" },
  { key: "commodity", label: "원자재" },
];

function pct(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function num(value, suffix = "") {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  // 1 미만(환율 중 엔/원 원본 등)은 소수점을 더 보여줘야 의미가 있습니다.
  const digits = Math.abs(value) >= 1000 ? 2 : Math.abs(value) >= 1 ? 2 : 4;
  return value.toLocaleString("ko-KR", { maximumFractionDigits: digits }) + suffix;
}

function tone(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  return value > 0 ? "up" : value < 0 ? "down" : "";
}

// 왼쪽/오른쪽 한 칸 — 미국 또는 한국.
function BriefColumn({ panel }) {
  if (!panel) return null;
  const lead = panel.lead || { before: "", highlight: "", after: "" };
  return (
    <div className="brief-col">
      <div className="brief-col-label">{panel.label}</div>
      <h2 className="brief-lead">
        {lead.before}
        <em>{lead.highlight}</em>
        {lead.after}
      </h2>
      {panel.sub && <p className="brief-sub">{panel.sub}</p>}
    </div>
  );
}

export default function BriefingBand({ brief, worldIndices, strip, activeTheme, onThemeClick }) {
  const [tab, setTab] = useState("world");

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

  // 탭에 따라 띠에 뿌릴 줄을 고릅니다.
  const rows = useMemo(() => {
    if (tab === "fx") return strip?.fx || [];
    if (tab === "commodity") return strip?.commodity || [];
    return indices.map((it) => ({
      key: it.key,
      label: it.label,
      close: it.close,
      changePct: it.changePct,
      suffix: "",
    }));
  }, [tab, indices, strip]);

  const themes = (brief?.themeRows || []).slice(0, MAX_THEMES);

  return (
    <section className="brief-band">
      {/* 지도는 장식 겸 데이터입니다. 원본이 "연한 바탕 + 어두운 선"이라
          그대로 얹으면 남색에 묻혀 사라집니다. 그래서 색을 뒤집어
          밝은 선으로 만들어 띄웁니다(globals.css의 .brief-map). */}
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

        <div className="brief-cols">
          <BriefColumn panel={brief?.us} />
          <BriefColumn panel={brief?.domestic} />
        </div>

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

        <div className="brief-tabs">
          {TABS.map((t) => (
            <button key={t.key} type="button" aria-pressed={tab === t.key} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        {rows.length > 0 ? (
          <div className="brief-ticker">
            {rows.map((r) => (
              <div className="brief-tk" key={r.key}>
                <span className="c">{r.label}</span>
                <span className="v mono">{num(r.close, r.suffix)}</span>
                <span className={`p mono ${tone(r.changePct)}`}>{pct(r.changePct)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="brief-ticker brief-ticker-empty">불러오는 중입니다.</div>
        )}
      </div>
    </section>
  );
}
