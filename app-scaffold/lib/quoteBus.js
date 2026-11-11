// lib/quoteBus.js
//
// [2026-11-11 신설] 화면 안에서 "같은 종목은 어디서나 같은 숫자"가 되게 하는 작은 알림판(브라우저 전용).
//   재성님: "관심종목 +0.8%인데 눌러 보면 +5.67%. 누르기 전하고 누른 후가 똑같아야 할 거 아냐"
//   목록(관심종목·속보 칩)은 /api/live-quotes, 차트 창은 /api/candles에서 숫자를 받습니다.
//   둘 다 야후 값이지만 받은 시각이 서로 달라서(1분 간격 갱신 vs 누른 순간) 급등락 중인 종목은 숫자가 어긋납니다.
//   → 어느 쪽이든 숫자를 받으면 여기에 적어 두고, "더 나중 시각의 값"만 남깁니다.
//     · 차트 창을 열어 더 새 값을 받으면 → 목록 숫자도 그 값으로 바뀜
//     · 목록이 더 새 값을 갖고 있으면 → 차트 창 맨 위 숫자도 그 값으로 맞춤
//   서버·비용과 무관합니다(받은 숫자를 화면끼리 나눠 쓰는 것뿐).

import { useEffect, useState } from "react";

export const QUOTE_EVENT = "nm:quote";

const latest = new Map(); // 종목코드 → { price, changePct, asOf(ISO 글자) }

const ms = (asOf) => {
  const t = Date.parse(asOf || "");
  return Number.isFinite(t) ? t : 0;
};

export function getQuote(code) {
  return latest.get(String(code)) || null;
}

// 값을 적어 둡니다. 이미 있는 값보다 옛 시각이면 무시하고 false를 돌려줍니다.
export function putQuote(code, q, { silent = false } = {}) {
  if (typeof window === "undefined" || !code || !q) return false;
  if (typeof q.changePct !== "number" || !Number.isFinite(q.changePct)) return false;
  const key = String(code);
  const cur = latest.get(key);
  if (cur && ms(cur.asOf) > ms(q.asOf)) return false;
  if (cur && cur.price === q.price && cur.changePct === q.changePct && cur.asOf === q.asOf) return true;
  const next = { price: q.price ?? null, changePct: q.changePct, asOf: q.asOf || null };
  latest.set(key, next);
  if (!silent) {
    try {
      window.dispatchEvent(new CustomEvent(QUOTE_EVENT, { detail: { code: key, quote: next } }));
    } catch {
      // 아주 오래된 브라우저 — 알림만 건너뜀
    }
  }
  return true;
}

// 화면 부품에서 쓰는 도우미 — 알림판에 새 값이 적힐 때마다 다시 그리게 해 주고, 종목코드로 값을 꺼내는 함수를 돌려줍니다.
//   예) const liveOf = useQuoteBus();  const q = liveOf("005930");  // 없으면 null
export function useQuoteBus() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const on = () => setTick((n) => n + 1);
    window.addEventListener(QUOTE_EVENT, on);
    return () => window.removeEventListener(QUOTE_EVENT, on);
  }, []);
  return getQuote;
}
