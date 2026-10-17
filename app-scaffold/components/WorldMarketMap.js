"use client";

// components/WorldMarketMap.js
//
// [2026-10-17 신설] 홈 화면 맨 위에 들어가는 "오늘의 세계증시" 영역입니다.
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
// 지도 그림에 대해: 네이버 등 다른 사이트의 지도 이미지를 가져다 쓰지 않고,
// 대륙 윤곽을 단순화해 직접 그린 SVG입니다. 저작권 문제가 없고 파일도
// 가볍습니다. 정밀한 지도가 아니라 "어느 대륙쯤"을 보여주는 배경입니다.
// 혹시 이 배경이 마음에 안 들면 아래 SHOW_MAP을 false로 바꾸면 카드만 남습니다.
//
// 데이터는 서버(app/page.js)가 미리 받아서 넘겨줍니다. 그래서 검색엔진도
// 이 숫자들을 첫 HTML에서 바로 읽습니다.

import { useMemo, useState } from "react";

const SHOW_MAP = true;

const REGION_TABS = ["전체", "아시아", "북아메리카", "남아메리카", "유럽"];

// 대륙 윤곽(단순화). viewBox는 가로 1000, 세로 500이고 위도·경도를 그대로
// 펼친 방식이라, lib/worldIndices.js의 x/y 좌표와 자리가 맞습니다.
const CONTINENTS = [
  // 북아메리카
  "M150 95 L250 70 L320 85 L330 120 L300 150 L285 175 L300 200 L270 225 L250 205 L225 175 L195 160 L165 130 Z",
  // 중앙아메리카
  "M270 225 L300 235 L320 255 L300 262 L278 245 Z",
  // 남아메리카
  "M320 262 L360 255 L390 280 L395 320 L375 365 L350 400 L335 380 L330 330 L312 295 Z",
  // 유럽
  "M470 95 L545 88 L570 105 L560 135 L525 155 L490 150 L468 125 Z",
  // 아프리카
  "M490 165 L575 160 L600 190 L585 245 L560 300 L535 330 L515 300 L500 245 L488 200 Z",
  // 아시아
  "M570 85 L740 70 L860 90 L900 120 L880 150 L845 165 L800 180 L760 200 L720 215 L690 205 L660 185 L620 165 L588 140 L572 110 Z",
  // 인도 반도
  "M680 190 L720 188 L715 220 L698 235 L684 212 Z",
  // 동남아시아 제도
  "M790 215 L840 212 L855 232 L820 245 L792 236 Z",
  // 오스트레일리아
  "M835 290 L900 285 L915 320 L885 350 L845 340 L828 312 Z",
  // 일본 열도
  "M875 135 L895 128 L900 155 L882 168 Z",
  // 영국
  "M468 100 L482 96 L484 115 L470 118 Z",
];

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

  const items = useMemo(() => {
    const all = Array.isArray(data?.items) ? data.items : [];
    return region === "전체" ? all : all.filter((it) => it.region === region);
  }, [data, region]);

  const allItems = Array.isArray(data?.items) ? data.items : [];

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

      {SHOW_MAP && (
        <div style={{ marginBottom: 16 }}>
          <svg viewBox="0 0 1000 500" style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label="세계 증시 지도">
            <rect x="0" y="0" width="1000" height="500" rx="10" fill="var(--amber-tint)" opacity="0.35" />
            {CONTINENTS.map((d, i) => (
              <path key={i} d={d} fill="var(--border)" opacity="0.9" />
            ))}
            {allItems.map((it) => {
              const tone = toneOf(it.changePct);
              const dim = region !== "전체" && it.region !== region;
              return (
                <g key={it.key} opacity={dim ? 0.25 : 1}>
                  <circle cx={it.x} cy={it.y} r="16" fill={COLOR[tone]} opacity="0.18" />
                  <circle cx={it.x} cy={it.y} r="6.5" fill={COLOR[tone]} />
                </g>
              );
            })}
          </svg>
        </div>
      )}

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
