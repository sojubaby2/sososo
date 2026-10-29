// components/MarketParts.js
//
// [2026-10-29 신설] 장 마감 정리 화면 두 곳(/market 목록, /market/날짜 리포트)이 같이 쓰는 조각들.
//   · 숫자 모양 함수(pct, pct1, tone, won, eok), 등락 색 칸(heat)
//   · IndexCard — 코스피/코스닥 지수 카드(지수·등락률, 오름/보합/내림 막대, 상한가·하한가, 거래대금)
// 서버에서 그려지는 조각이라 방문자 화면에 추가로 내려가는 코드가 없습니다.

export const pct = (v) => (typeof v === "number" ? `${v > 0 ? "+" : ""}${v.toFixed(2)}%` : "—");
export const pct1 = (v) => (typeof v === "number" ? `${v > 0 ? "+" : ""}${v.toFixed(1)}%` : "—");
export const tone = (v) => (v > 0 ? "up" : v < 0 ? "down" : "flat");
export const won = (v) => `${Math.round(v).toLocaleString("ko-KR")}`;
export function eok(v) {
  if (typeof v !== "number") return "—";
  const e = v / 1e8;
  return e >= 10000 ? `${(e / 10000).toFixed(1)}조` : `${Math.round(e).toLocaleString("ko-KR")}억`;
}
// 등락률 → 칸 색(빨강/파랑을 바탕색에 옅게 섞음, 많이 움직일수록 진하게). 글자는 늘 진한 기본색이라 잘 읽힘
export function heat(v, full = 8) {
  if (typeof v !== "number" || v === 0) return { background: "var(--surface-2)", color: "var(--ink)" };
  const p = Math.round(8 + Math.min(Math.abs(v) / full, 1) * 30);
  return {
    background: `color-mix(in oklab, var(${v > 0 ? "--up" : "--down"}) ${p}%, var(--surface))`,
    boxShadow: `inset 0 0 0 1px color-mix(in oklab, var(${v > 0 ? "--up" : "--down"}) ${p + 10}%, transparent)`,
    color: "var(--ink)",
  };
}

// ── 1. 지수 카드 ────────────────────────────────────────────────
export function IndexCard({ mk, b, ix }) {
  const total = (b?.up || 0) + (b?.flat || 0) + (b?.down || 0) || 1;
  return (
    <div className="mk2-idx">
      <div className="mk2-idx-top">
        <span className="mk2-idx-name">{mk}</span>
        {ix && <span className={`mk2-idx-chg mono ${tone(ix.chgPct)}`}>{pct(ix.chgPct)}</span>}
      </div>
      <div className="mk2-idx-val mono">
        {ix ? ix.close.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : b ? `평균 ${pct(b.avg)}` : "—"}
      </div>
      {b && (
        <>
          <div className="mk2-breadth" aria-label={`오름 ${b.up}, 보합 ${b.flat}, 내림 ${b.down}`}>
            <span className="up-bar" style={{ width: `${(b.up / total) * 100}%` }} />
            <span className="flat-bar" style={{ width: `${(b.flat / total) * 100}%` }} />
            <span className="down-bar" style={{ width: `${(b.down / total) * 100}%` }} />
          </div>
          <div className="mk2-breadth-legend">
            <span className="up">오름 {b.up.toLocaleString("ko-KR")}</span>
            <span className="muted">보합 {b.flat.toLocaleString("ko-KR")}</span>
            <span className="down">내림 {b.down.toLocaleString("ko-KR")}</span>
          </div>
          <div className="mk2-idx-foot">
            <span>
              상한가 <b className="up mono">{b.limitUp ?? 0}</b>
            </span>
            <span>
              하한가 <b className="down mono">{b.limitDown ?? 0}</b>
            </span>
            {typeof b.value === "number" && b.value > 0 && (
              <span>
                거래대금 약 <b className="mono">{eok(b.value)}</b>
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

