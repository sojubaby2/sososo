"use client";

// components/WorldMarketMap.js
//
// [2026-10-17 신설] 홈 화면 맨 위 "오늘의 세계증시" 영역.
// [2026-10-17 수정 1] 직접 그린 SVG 지도를 재성님이 주신 세계지도 그림
//                     (public/world-map.jpg)으로 교체.
// [2026-10-17 수정 2] 재성님 리포트 — "핀 없고 UI가 너무 크다". 두 가지를 고침:
//
//   ① 핀이 왼쪽 위 구석에 뭉쳐 있던 문제
//      경도·위도 값이 없는 항목(옛 형식의 데이터가 캐시에 남아 있는 경우)이
//      들어오면 계산 결과가 숫자가 아니게 되고, 브라우저가 그걸 0으로 처리해서
//      모든 점이 (0,0) 즉 지도 왼쪽 위 모서리에 겹쳐 찍혔습니다. 이제는 경도·
//      위도가 제대로 된 숫자일 때만 점을 그립니다. 값이 없으면 그 점만 건너뛰고
//      지도와 카드는 정상적으로 보입니다.
//
//   ② 영역이 너무 컸던 문제
//      지도 그림이 가로:세로 약 1.8:1이라 화면 폭을 다 쓰면 세로로 너무 길어집니다.
//      지도 최대 폭을 MAP_MAX_WIDTH로 묶어 가운데 정렬하고, 제목·카드·여백을
//      전반적으로 줄였습니다. 더 작게/크게 하고 싶으면 그 숫자 하나만 고치면 됩니다.

import { useMemo, useState } from "react";

// 지도 그림의 원본 크기(픽셀). public/world-map.jpg 기준입니다.
const MAP_WIDTH = 1024;
const MAP_HEIGHT = 559;

// 지도를 화면에서 최대 몇 픽셀 폭까지 키울지. 이 값이 세로 길이를 결정합니다
// (세로 = 폭 ÷ 1.83). 480이면 세로 약 262픽셀입니다. 화면이 좁으면 알아서
// 줄어듭니다.
const MAP_MAX_WIDTH = 480;

// 경도·위도를 그림 안의 픽셀 위치로 바꾸는 기준값입니다.
//
// 이 그림은 경도가 가로로 고르게 펼쳐진 형태(-180도 ~ +180도)이고, 세로는
// 남극이 잘려 있어 위아래로 조금 늘어나 있습니다. 그래서 가로·세로 축척이
// 다릅니다. 아래 값은 그림 속 대륙 위치를 재서 맞춘 것입니다.
//
// 핀이 실제 나라에서 어긋나 보이면 이 네 숫자만 조정하면 됩니다.
const MAP_CALIBRATION = {
  pxPerLon: MAP_WIDTH / 360, // 경도 1도당 가로 픽셀
  xAtLon0: MAP_WIDTH / 2, // 경도 0도(영국)의 가로 위치
  pxPerLat: 3.116, // 위도 1도당 세로 픽셀
  yAtLat0: 84 + 83 * 3.116, // 적도의 세로 위치
};

function toX(lon) {
  return MAP_CALIBRATION.xAtLon0 + lon * MAP_CALIBRATION.pxPerLon;
}

function toY(lat) {
  return MAP_CALIBRATION.yAtLat0 - lat * MAP_CALIBRATION.pxPerLat;
}

// 경도·위도가 제대로 된 숫자인지 확인합니다. 이게 핀이 구석에 몰리던 문제를
// 막아주는 장치입니다.
function hasPosition(item) {
  return (
    typeof item?.lon === "number" &&
    Number.isFinite(item.lon) &&
    typeof item?.lat === "number" &&
    Number.isFinite(item.lat)
  );
}

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

  // 지도에 찍을 수 있는 항목만 추립니다(경도·위도가 있는 것).
  const pins = useMemo(() => allItems.filter(hasPosition), [allItems]);

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
          고정하고 그 안에서 좌표를 잡습니다. MAP_MAX_WIDTH로 폭을 묶어 세로가
          지나치게 길어지지 않게 했습니다. */}
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
            const cx = toX(it.lon);
            const cy = toY(it.lat);
            return (
              <g key={it.key} opacity={dim ? 0.25 : 1}>
                <circle cx={cx} cy={cy} r="20" fill={COLOR[tone]} opacity="0.22" />
                <circle cx={cx} cy={cy} r="9" fill={COLOR[tone]} stroke="#fff" strokeWidth="3" />
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
