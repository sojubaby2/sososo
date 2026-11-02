// lib/sessionWord.js
//
// [2026-11-02 신설] "어제"라는 말 바로잡기 — 재성님: "월요일 또는 휴장 이후의 경우, 어제라는 표현은 안 맞으니까 수정"
//   직전 거래일이 정말 어제(하루 전)일 때만 "어제", 2~6일 전이면 "지난 금요일"처럼 요일로,
//   그보다 오래됐으면 "전 거래일"이라고 씁니다. 장전 브리핑·홈 화면 맨 위 문장이 함께 씁니다.

const WD = ["일", "월", "화", "수", "목", "금", "토"];

// "2026-10-30" → UTC 자정 기준 밀리초(날짜 차이 계산용)
function isoToMs(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : NaN;
}

// 한국 시간 기준 오늘 날짜 "YYYY-MM-DD"
export function kstTodayIso(now = new Date()) {
  return new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

// 직전 거래일을 부르는 말: "어제" / "지난 금요일" / "전 거래일"
export function sessionWord(prevIso, todayIso = kstTodayIso()) {
  const a = isoToMs(prevIso);
  const b = isoToMs(todayIso);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return "전 거래일";
  const days = Math.round((b - a) / 86400000);
  if (days === 1) return "어제";
  if (days >= 2 && days <= 6) return `지난 ${WD[new Date(a).getUTCDay()]}요일`;
  return "전 거래일";
}

// "지난 금요일(10/30)"처럼 날짜까지 붙인 말
export function sessionWordWithDate(prevIso, todayIso = kstTodayIso()) {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(String(prevIso || ""));
  const word = sessionWord(prevIso, todayIso);
  return m ? `${word}(${Number(m[1])}/${Number(m[2])})` : word;
}

// 직전 거래일과 오늘 사이에 쉬는 날이 끼었는지(주말·휴장) — "밤사이" 대신 "주말 사이"·"연휴 사이"를 쓸 때
export function gapWord(prevIso, todayIso = kstTodayIso()) {
  const a = isoToMs(prevIso);
  const b = isoToMs(todayIso);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return "밤사이";
  const days = Math.round((b - a) / 86400000);
  if (days <= 1) return "밤사이";
  const prevWd = new Date(a).getUTCDay();
  const todayWd = new Date(b).getUTCDay();
  if (days <= 3 && prevWd === 5 && todayWd === 1) return "주말 사이";
  return "연휴 사이";
}
