"use client";

// components/BriefingBand.js
//
// [2026-10-19 신설] 홈 화면 맨 위 남색 띠입니다.
// 예전 components/WorldMarketMap.js(지도 + 지수 카드)를 흡수했습니다.
//
// [2026-10-26 변경] 어두운 터미널 디자인으로 바꾸면서 띠를 낮게 줄였습니다.
//   · 세계지도는 띠 오른쪽에 은은한 배경으로만 깝니다(예전엔 지도 때문에
//     띠 높이가 400px 넘어서 속보가 첫 화면 아래로 밀렸습니다).
//     지도를 더 진하게/흐리게 하려면 globals.css의 .brief-map opacity 숫자만.
//   · "뉴스가 몰린 테마" 단추들은 속보 칸 머리 바로 아래로 옮겼습니다
//     (app/HomeClient.js의 theme-filter). 누르면 바로 아래 속보가 걸러지니
//     속보 옆에 있는 게 자연스럽습니다.
//   · 지수 탭과 지수 줄을 한 줄로 합쳤습니다(왼쪽 탭, 오른쪽 지수).
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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

// [2026-10-26 추가] 지수 줄이 화면보다 길면 양 끝에 화살표 단추를 띄웁니다.
// 재성님: "티커가 길어서 대만 뒤로 잘리는데 화살표를 만들어 주든가 해 줘"
//   · 더 볼 게 남은 쪽에만 화살표가 보입니다(끝까지 가면 그쪽 화살표는 사라짐).
//   · 누르면 보이는 폭의 80%만큼 부드럽게 넘어갑니다.
//   · 휴대폰은 예전처럼 손가락으로 밀어도 됩니다(화살표는 같이 나옴).
//   · 화살표 쪽 끝이 살짝 흐려져서 "뒤에 더 있다"는 게 보입니다.
function ScrollTicker({ children }) {
  const ref = useRef(null);
  const [edge, setEdge] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdge({ left: el.scrollLeft > 4, right: el.scrollLeft < max - 4 });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      ro.disconnect();
    };
  }, [measure, children]);

  const go = (dir) => {
    const el = ref.current;
    if (!el) return;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <div className={`brief-ticker-wrap ${edge.left ? "fade-l" : ""} ${edge.right ? "fade-r" : ""}`}>
      {edge.left && (
        <button type="button" className="brief-arrow left" onClick={() => go(-1)} aria-label="앞쪽 지수 보기">
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
      )}
      <div className="brief-ticker" ref={ref}>
        {children}
      </div>
      {edge.right && (
        <button type="button" className="brief-arrow right" onClick={() => go(1)} aria-label="뒤쪽 지수 더 보기">
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

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

  // (테마 단추는 2026-10-26부터 app/HomeClient.js에서 그립니다.)
  void activeTheme; void onThemeClick; void MAX_THEMES;

  return (
    <section className="brief-band">
      {/* [2026-10-26 되살림] 세계지도 — 재성님: "지도 배경은 좋지 않았나?"
          맞습니다. 나라별 핀이 그날 지수에 따라 빨강(상승)·파랑(하락)으로
          빛나서 "세계 증시가 지금 어떤지"를 한눈에 보여주는 데이터이기도
          합니다. 다만 띠 높이는 낮게 유지해야 해서(첫 화면에 속보가 보여야
          하므로) 띠 오른쪽에 은은하게만 깝니다. 휴대폰에서는 글자와 겹쳐서
          숨깁니다(globals.css의 .brief-mapwrap). */}
      <div className="brief-mapwrap" aria-hidden="true">
        <div className="brief-map">
          <img src="/world-map.jpg" alt="" width={MAP_WIDTH} height={MAP_HEIGHT} />
        </div>
        <div className="brief-pins">
          <svg viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}>
            {pins.map((it) => {
              const up = typeof it.changePct === "number" ? it.changePct >= 0 : true;
              const color = up ? "var(--up)" : "var(--down)";
              return (
                <g key={it.key}>
                  <circle cx={it.px} cy={it.py} r="20" fill={color} opacity="0.2" />
                  <circle cx={it.px} cy={it.py} r="6" fill={color} />
                </g>
              );
            })}
          </svg>
        </div>
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

        <div className="brief-strip">
          <div className="brief-tabs" role="group" aria-label="지수 종류">
            {TABS.map((t) => (
              <button key={t.key} type="button" aria-pressed={tab === t.key} onClick={() => setTab(t.key)}>
                {t.label}
              </button>
            ))}
          </div>
          {rows.length > 0 ? (
            <ScrollTicker key={tab}>
              {rows.map((r) => (
                <div className="brief-tk" key={r.key}>
                  <span className="c">{r.label}</span>
                  <span className="v mono">{num(r.close, r.suffix)}</span>
                  <span className={`p mono ${tone(r.changePct)}`}>{pct(r.changePct)}</span>
                </div>
              ))}
            </ScrollTicker>
          ) : (
            <div className="brief-ticker brief-ticker-empty">불러오는 중입니다.</div>
          )}
        </div>
      </div>
    </section>
  );
}
