// lib/marketReport.js
//
// [2026-10-29 신설] 장 마감 정리 "리포트" 문장 만들기 — 재성님: "화면이 단조로운거같어 혁신적으로 바꿔봐 영양가도 좀 올려주고"
//
// AI를 부르지 않고(비용 0) 숫자만 보고 정해진 규칙으로 문장을 만듭니다.
//   · marketHeadline(d, flow) — 맨 위 큰 제목 한 줄 (예: "코스피 6.63% 폭등, 6,000선 돌파 — 사이버 보안·6G 강세")
//   · marketPoints(d, flow)   — "오늘의 포인트" 3~5줄 (수급, 시장 온도, 주도 테마, 거래대금 쏠림, 상한가)
// 재료: lib/marketDay.js 계산 결과(d) + lib/investorFlow.js 지수·수급(flow, 못 받으면 null)

import { eokText } from "./investorFlow";

const sign = (v) => (v > 0 ? "+" : "");
const p2 = (v) => `${sign(v)}${v.toFixed(2)}%`;
const p1 = (v) => `${sign(v)}${v.toFixed(1)}%`;

function moveWord(chg) {
  if (chg >= 3) return "폭등";
  if (chg >= 1.5) return "급등";
  if (chg >= 0.5) return "상승";
  if (chg > 0.1) return "강보합";
  if (chg >= -0.1) return "보합";
  if (chg > -0.5) return "약보합";
  if (chg > -1.5) return "하락";
  if (chg > -3) return "급락";
  return "폭락";
}

// 원 → "1.2조 원" / "3,450억 원"
export function wonText(v) {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  const eok = v / 1e8;
  if (eok >= 10000) return `${(eok / 10000).toFixed(1)}조 원`;
  return `${Math.round(eok).toLocaleString("ko-KR")}억 원`;
}

// 지수가 500단위(코스피)·50단위(코스닥) 고비를 넘었는지
function milestone(ix, step) {
  if (!ix || typeof ix.close !== "number" || typeof ix.chgPct !== "number") return "";
  const prev = ix.close / (1 + ix.chgPct / 100);
  const a = Math.floor(prev / step);
  const b = Math.floor(ix.close / step);
  if (b > a) return `${(b * step).toLocaleString("ko-KR")}선 돌파`;
  if (b < a) return `${(a * step).toLocaleString("ko-KR")}선 아래로`;
  return "";
}

export function marketHeadline(d, flow) {
  if (!d) return "";
  const kp = flow?.["코스피"]?.index;
  const kq = flow?.["코스닥"]?.index;
  let lead;
  if (kp && typeof kp.chgPct === "number") {
    const m = milestone(kp, 500);
    lead = `코스피 ${p2(kp.chgPct)} ${moveWord(kp.chgPct)}${m ? `, ${m}` : ""}`;
    if (kq && typeof kq.chgPct === "number" && Math.sign(kq.chgPct) !== Math.sign(kp.chgPct) && Math.abs(kq.chgPct) >= 0.5) {
      lead += ` · 코스닥은 ${moveWord(kq.chgPct)}`;
    }
  } else {
    const kb = d.breadth?.["코스피"];
    lead = kb ? `코스피 ${kb.up.toLocaleString("ko-KR")}종목 상승 · ${kb.down.toLocaleString("ko-KR")}종목 하락` : "오늘의 장 마감";
  }
  const up = (d.themesUp || []).filter((t) => t.avg > 0).slice(0, 2);
  const down = (d.themesDown || []).filter((t) => t.avg < 0).slice(0, 2);
  const marketUp = kp ? kp.chgPct >= 0 : (d.breadth?.["코스피"]?.up || 0) >= (d.breadth?.["코스피"]?.down || 0);
  const tail = marketUp
    ? up.length
      ? `${up.map((t) => t.theme).join("·")} 강세`
      : ""
    : down.length
    ? `${down.map((t) => t.theme).join("·")} 약세`
    : up.length
    ? `${up[0].theme} 홀로 강세`
    : "";
  return tail ? `${lead} — ${tail}` : lead;
}

export function marketPoints(d, flow) {
  if (!d) return [];
  const pts = [];

  // 1) 수급 — 코스피 기준
  const f = flow?.["코스피"]?.flow;
  if (f) {
    const who = [
      ["외국인", f.foreign],
      ["기관", f.institution],
      ["개인", f.individual],
    ].filter(([, v]) => typeof v === "number" && v !== 0);
    const buy = who.filter(([, v]) => v > 0);
    const sell = who.filter(([, v]) => v < 0);
    if (buy.length && sell.length) {
      const both = buy.length === 2 && buy.every(([n]) => n !== "개인");
      const buySum = buy.reduce((s, [, v]) => s + v, 0);
      const head = both
        ? `외국인·기관이 코스피에서 ${eokText(buySum)} 쌍끌이 순매수`
        : `코스피에서 ${buy.map(([n, v]) => `${n} ${eokText(v)}`).join(", ")} 순매수`;
      pts.push({ k: "수급", t: `${head}, ${sell.map(([n, v]) => `${n}은 ${eokText(v)}`).join(", ")} 순매도했습니다.` });
    }
  }

  // 2) 시장 온도 — 전 종목 중 몇 %가 올랐나
  const kp = d.breadth?.["코스피"];
  const kq = d.breadth?.["코스닥"];
  if (kp && kq) {
    const up = kp.up + kq.up;
    const down = kp.down + kq.down;
    const all = up + down + kp.flat + kq.flat;
    if (all > 0) {
      const r = Math.round((up / all) * 100);
      const mood = r >= 70 ? "거의 모든 종목이 함께 오른 날" : r >= 55 ? "오른 종목이 더 많은 날" : r >= 45 ? "오른 종목과 내린 종목이 비슷한 날" : r >= 30 ? "내린 종목이 더 많은 날" : "대부분 종목이 함께 내린 날";
      pts.push({ k: "시장 온도", t: `전체 ${all.toLocaleString("ko-KR")}종목 중 ${r}%가 올랐습니다. ${mood}이었습니다.` });
    }
  }

  // 3) 주도 테마
  const top = (d.themesUp || [])[0];
  if (top && top.avg > 0) {
    const lead = top.best?.[0];
    pts.push({
      k: "주도 테마",
      t: `${top.theme} 테마가 평균 ${p1(top.avg)}로 가장 강했습니다.${lead ? ` 대장주는 ${lead.name}(${p1(lead.chg)})입니다.` : ""}`,
    });
  }
  const worst = (d.themesDown || [])[0];
  if (worst && worst.avg < -1) {
    pts.push({ k: "약한 테마", t: `반대로 ${worst.theme} 테마는 평균 ${p1(worst.avg)}로 가장 약했습니다.` });
  }

  // 4) 거래대금 쏠림
  const v1 = (d.byValue || [])[0];
  if (v1) {
    pts.push({
      k: "돈이 몰린 곳",
      t: `거래대금 1위는 ${v1.name}(${wonText(v1.value)})입니다.${
        typeof d.top10Share === "number" ? ` 상위 10종목이 전체 거래대금의 ${d.top10Share.toFixed(0)}%를 차지했습니다.` : ""
      }`,
    });
  }

  // 5) 상한가
  const lu = d.limitUps || [];
  if (lu.length) {
    pts.push({ k: "상한가", t: `상한가 ${lu.length}종목 — ${lu.slice(0, 4).map((s) => s.name).join(", ")}${lu.length > 4 ? " 등" : ""}.` });
  }
  return pts.slice(0, 6);
}
