"use client";

// components/WorldMarketMap.js
//
// [2026-10-17 신설] 홈 화면 "오늘의 세계증시" 영역.
// [2026-10-17 수정 1] 직접 그린 SVG 지도를 재성님이 주신 세계지도 그림
//                     (public/world-map.jpg)으로 교체.
// [2026-10-17 수정 2] 핀이 왼쪽 위 구석에 뭉치던 문제 + 영역이 너무 큰 문제 수정.
// [2026-10-17 수정 3] 재성님 리포트 — "핀 위치가 이상한데".
//
//   무엇이 문제였나:
//   지금까지는 각 나라의 경도·위도를 수학 공식으로 그림 속 위치로 바꿔서
//   찍었습니다. 그 방식은 "지도 그림이 교과서처럼 정확하게 그려져 있다"는
//   전제가 있어야 맞습니다. 그런데 이 그림을 실제로 재어 보니 지역마다
//   오차가 있었습니다. 예를 들어 호주·뉴기니는 실제보다 동쪽으로 약 8도,
//   스리랑카는 약 5도 밀려 그려져 있습니다. 그래서 공식으로 계산한 자리와
//   그림 속 실제 나라 위치가 서로 어긋났습니다. 일본 핀이 바다에 뜨고,
//   인도 핀이 아라비아해에 찍힌 게 그 때문입니다.
//
//   어떻게 고쳤나:
//   공식을 버리고, 이 그림 한 장에 맞춰 나라별 위치를 직접 찍어서 표로
//   저장했습니다(아래 MAP_POINTS). 그림을 10배로 확대해 서울·도쿄·상하이·
//   홍콩·타이베이·뭄바이·런던·프랑크푸르트·뉴욕·상파울루 자리를 하나씩
//   확인한 값입니다.
//
//   주의 — 지도 그림을 다른 것으로 바꾸면 이 표도 다시 잡아야 합니다.
//   (그림이 바뀌면 그림 속 나라 위치도 같이 바뀌기 때문입니다.)
//   핀 하나가 조금 어긋나 보이면 그 줄의 숫자 두 개만 고치면 됩니다.
//   첫 번째가 가로, 두 번째가 세로이고, 기준은 원본 그림 1024 x 559 픽셀입니다.
//   가로 숫자를 키우면 오른쪽으로, 세로 숫자를 키우면 아래로 내려갑니다.

import { useMemo, useState } from "react";

// 지도 그림의 원본 크기(픽셀). public/world-map.jpg 기준입니다.
const MAP_WIDTH = 1024;
const MAP_HEIGHT = 559;

// 지도를 화면에서 최대 몇 픽셀 폭까지 키울지. 이 값이 세로 길이를 결정합니다
// (세로 = 폭 ÷ 1.83). 480이면 세로 약 262픽셀입니다. 화면이 좁으면 알아서
// 줄어듭니다.
const MAP_MAX_WIDTH = 480;

// 나라별 핀 위치. 원본 그림(1024 x 559) 기준 픽셀입니다.
// worldIndices.js의 key와 이름이 같아야 연결됩니다.
const MAP_POINTS = {
  kr: [813, 242], // 서울
  jp: [845, 250], // 도쿄
  cn: [791, 259], // 상하이
  hk: [781, 291], // 홍콩
  tw: [801, 285], // 타이베이
  in: [671, 296], // 뭄바이
  gb: [483, 205], // 런던
  de: [505, 208], // 프랑크푸르트
  // 다우와 나스닥은 둘 다 뉴욕이라 그대로 두면 완전히 겹칩니다.
  // 서로 조금 떨어뜨려 두 개가 보이게 했습니다(둘 다 미국 동부 안쪽입니다).
  "us-dow": [302, 234],
  "us-nasdaq": [288, 245],
  br: [361, 420], // 상파울루
};

const REGION_TABS = ["전체", "아시아", "북아메리카", "남아메리카", "유럽"];

function formatPct(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function formatClose(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
}

// 오르면 빨강, 내리면 파랑, 모르면 회색 — 국내 증시 표기 관행을 따릅니다.
function toneOf(changePct) {
  if (typeof changePct !== "number" || !Number.isFinite(changePct)) return "flat";
  if (changePct > 0) return "up";
  if (changePct < 0) return "down";
  return "flat";
}

const COLOR = {
  up: "var(--up)",
  down: "var(--down)",
  flat: "var(--ink-muted)",
};

export default function WorldMarketMap({ data = null }) {
  const [region, setRegion] = useState("전체");

  const allItems = Array.isArray(data?.items) ? data.items : [];

  const items = useMemo(() => {
    return region === "전체" ? allItems : allItems.filter((it) => it.region === region);
  }, [allItems, region]);

  // 위 표에 자리가 정해져 있는 나라만 지도에 찍습니다. 표에 없는 나라가
  // 들어와도 지도와 카드는 정상적으로 보이고, 그 핀만 생략됩니다.
  const pins = useMemo(
    () =>
      allItems
        .map((it) => {
          const point = MAP_POINTS[it.key];
          return point ? { ...it, px: point[0], py: point[1] } : null;
        })
        .filter(Boolean),
    [allItems]
  );

  const hasAny = allItems.some((it) => typeof it.close === "number");

  return (
    <section
      style={{
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: "14px 14px 12px",
        marginBottom: 20,
        background: "var(--surface, #fff)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
          marginBottom: 10,
        }}
      >
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: "var(--ink)" }}>오늘의 세계증시</h2>
        <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
          {REGION_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setRegion(tab)}
              style={{
                padding: "3px 9px",
                fontSize: 11.5,
                borderRadius: 999,
                border: "1px solid " + (region === tab ? "var(--amber)" : "var(--border)"),
                background: region === tab ? "var(--amber-tint)" : "transparent",
                color: region === tab ? "var(--amber-tint-ink)" : "var(--ink-muted)",
                cursor: "pointer",
                fontWeight: region === tab ? 700 : 400,
              }}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* 지도 그림 위에 점을 겹쳐 올립니다. 그림과 점이 같은 비율로 줄어들어야
          핀이 제자리에 남기 때문에, 바깥 상자의 가로세로 비율을 그림과 똑같이
          고정하고 그 안에서 좌표를 잡습니다. */}
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: MAP_MAX_WIDTH,
          margin: "0 auto 12px",
          aspectRatio: `${MAP_WIDTH} / ${MAP_HEIGHT}`,
          borderRadius: 8,
          overflow: "hidden",
          background: "var(--border)",
        }}
      >
        <img
          src="/world-map.jpg"
          alt="세계 지도"
          width={MAP_WIDTH}
          height={MAP_HEIGHT}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
        <svg
          viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
          role="img"
          aria-label="나라별 증시 등락 표시"
        >
          {pins.map((it) => {
            const tone = toneOf(it.changePct);
            const dim = region !== "전체" && it.region !== region;
            return (
              <g key={it.key} opacity={dim ? 0.25 : 1}>
                <circle cx={it.px} cy={it.py} r="16" fill={COLOR[tone]} opacity="0.2" />
                <circle cx={it.px} cy={it.py} r="7" fill={COLOR[tone]} stroke="#fff" strokeWidth="2.5" />
              </g>
            );
          })}
        </svg>
      </div>

      {!hasAny && (
        <p style={{ fontSize: 12.5, color: "var(--ink-muted)", margin: "0 0 10px" }}>
          지수 데이터를 불러오지 못했습니다. 잠시 후 다시 확인해주세요.
        </p>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(118px, 1fr))",
          gap: 6,
        }}
      >
        {items.map((it) => {
          const tone = toneOf(it.changePct);
          return (
            <div
              key={it.key}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "7px 9px",
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                <span style={{ marginRight: 4 }}>{it.flag}</span>
                {it.label}
              </div>
              <div style={{ fontSize: 10.5, color: "var(--ink-muted)" }}>{it.indexName}</div>
              <div className="mono" style={{ fontSize: 13.5, fontWeight: 700, marginTop: 4, color: COLOR[tone] }}>
                {formatPct(it.changePct)}
              </div>
              <div className="mono" style={{ fontSize: 11, color: "var(--ink-muted)" }}>
                {formatClose(it.close)}
              </div>
            </div>
          );
        })}
      </div>

      <p style={{ fontSize: 11, color: "var(--ink-muted)", marginTop: 9, lineHeight: 1.55 }}>
        해외 지수는 거래소 공식 실시간 시세가 아니라 지연된 참고값이며 5분마다 갱신됩니다. 상승은 빨강, 하락은
        파랑입니다. 정확한 수치는 증권사 화면에서 확인해주시기 바랍니다.
      </p>
    </section>
  );
}
