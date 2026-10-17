"use client";

// components/WorldMarketMap.js
//
// [2026-10-17 신설] 홈 화면 맨 위에 들어가는 "오늘의 세계증시" 영역입니다.
// [2026-10-17 수정] 직접 그렸던 SVG 지도를 재성님이 제공하신 세계지도
//                   그림(public/world-map.jpg)으로 교체했습니다.
//
// 구성은 두 층입니다.
//  ① 위쪽: 세계지도 위에 나라별 점을 찍고, 오르면 빨강 내리면 파랑으로
//     칠합니다(국내 증시 관행과 같은 색). 한눈에 "오늘 전 세계가 어느 쪽으로
//     움직였나"를 보여주는 용도입니다.
//  ② 아래쪽: 나라별 지수명·지수값·등락률 카드. 실제 숫자는 여기서 읽습니다.
//
// 왜 지도에 숫자를 안 쓰나: 한국·일본·중국·홍콩·대만이 지도 위에서 서로
// 겹칩니다. 숫자 상자를 올리면 모바일에서 뭉개집니다. 그래서 지도는 점으로만
// 두고, 숫자는 아래 카드에서 보도록 나눴습니다.
//
// 점 위치는 어떻게 정해지나 — 아래 MAP_CALIBRATION 참고.
// lib/worldIndices.js에는 나라마다 경도(lon)·위도(lat)만 적어두고, 실제 화면
// 좌표는 여기서 계산합니다. 그래서 지도 그림을 다른 것으로 바꾸더라도
// MAP_CALIBRATION 숫자 네 개만 고치면 핀이 전부 따라 움직입니다.
//
// 데이터는 서버(app/page.js)가 미리 받아서 넘겨줍니다. 그래서 검색엔진도
// 이 숫자들을 첫 HTML에서 바로 읽습니다.

import { useMemo, useState } from "react";

// 지도 그림의 원본 크기(픽셀). public/world-map.jpg 기준입니다.
const MAP_WIDTH = 1024;
const MAP_HEIGHT = 559;

// 경도·위도를 그림 안의 픽셀 위치로 바꾸는 기준값입니다.
//
// 이 그림은 경도가 가로로 고르게 펼쳐진 형태(-180도 ~ +180도)이고,
// 세로는 남극 대륙이 잘려 있어 위아래로 조금 늘어나 있습니다. 그래서
// 가로와 세로의 축척이 다릅니다 — 아래 숫자는 그림 속 대륙 위치를 재서
// 맞춘 값입니다.
//
// 핀이 실제 나라에서 어긋나 보이면 이 네 숫자만 조정하면 됩니다.
//  · pxPerLon  : 경도 1도당 가로 픽셀 수
//  · xAtLon0   : 경도 0도(영국 그리니치)의 가로 위치
//  · pxPerLat  : 위도 1도당 세로 픽셀 수
//  · yAtLat0   : 위도 0도(적도)의 세로 위치
const MAP_CALIBRATION = {
  pxPerLon: MAP_WIDTH / 360, // 2.844
  xAtLon0: MAP_WIDTH / 2, // 512
  pxPerLat: 3.116,
  yAtLat0: 84 + 83 * 3.116, // 342.6 — 그림 위쪽 육지 끝(북위 83도)이 y=84인 점을 기준으로 역산
};

function toX(lon) {
  return MAP_CALIBRATION.xAtLon0 + lon * MAP_CALIBRATION.pxPerLon;
}

function toY(lat) {
  return MAP_CALIBRATION.yAtLat0 - lat * MAP_CALIBRATION.pxPerLat;
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

  // 데이터를 하나도 못 받아온 경우에도 영역 자체는 보여주되, 숫자 자리에는
  // 안내를 띄웁니다(화면이 깨지는 것보다 낫습니다).
  const hasAny = allItems.some((it) => typeof it.close === "number");

  return (
    <section
      style={{
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: "18px 18px 16px",
        marginBottom: 24,
        background: "var(--surface, #fff)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 14,
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "var(--ink)" }}>오늘의 세계증시</h2>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {REGION_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setRegion(tab)}
              style={{
                padding: "4px 10px",
                fontSize: 12.5,
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
          고정하고 그 안에서 퍼센트로 위치를 잡습니다. */}
      <div
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: `${MAP_WIDTH} / ${MAP_HEIGHT}`,
          marginBottom: 16,
          borderRadius: 10,
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
          {allItems.map((it) => {
            const tone = toneOf(it.changePct);
            const dim = region !== "전체" && it.region !== region;
            const cx = toX(it.lon);
            const cy = toY(it.lat);
            return (
              <g key={it.key} opacity={dim ? 0.25 : 1}>
                <circle cx={cx} cy={cy} r="18" fill={COLOR[tone]} opacity="0.2" />
                <circle cx={cx} cy={cy} r="7" fill={COLOR[tone]} stroke="#fff" strokeWidth="2" />
              </g>
            );
          })}
        </svg>
      </div>

      {!hasAny && (
        <p style={{ fontSize: 13, color: "var(--ink-muted)", margin: "0 0 12px" }}>
          지수 데이터를 불러오지 못했습니다. 잠시 후 다시 확인해주세요.
        </p>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
          gap: 8,
        }}
      >
        {items.map((it) => {
          const tone = toneOf(it.changePct);
          return (
            <div
              key={it.key}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: "10px 12px",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>
                <span style={{ marginRight: 5 }}>{it.flag}</span>
                {it.label}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--ink-muted)", marginTop: 1 }}>{it.indexName}</div>
              <div className="mono" style={{ fontSize: 15, fontWeight: 700, marginTop: 6, color: COLOR[tone] }}>
                {formatPct(it.changePct)}
              </div>
              <div className="mono" style={{ fontSize: 12, color: "var(--ink-muted)", marginTop: 1 }}>
                {formatClose(it.close)}
              </div>
            </div>
          );
        })}
      </div>

      <p style={{ fontSize: 11.5, color: "var(--ink-muted)", marginTop: 12, lineHeight: 1.6 }}>
        해외 지수는 거래소 공식 실시간 시세가 아니라 약 15~20분 지연된 참고값이며, 5분마다 갱신됩니다. 상승은 빨강,
        하락은 파랑으로 표시합니다. 투자 판단의 근거로 삼기에는 충분하지 않으니 정확한 수치는 증권사 화면에서
        확인해주시기 바랍니다.
      </p>
    </section>
  );
}
