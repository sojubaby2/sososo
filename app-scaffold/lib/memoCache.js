// lib/memoCache.js
//
// [2026-11-06 신설] 서버 안에 잠깐(몇십 초~몇 분) 결과를 기억해 두는 아주 작은 저장소.
//   재성님: "대표 종목 칸이 왜 이 시간(오후 2시)에도 해외 시세야?"
//   확인해 보니 /api/flagships가 전날 저녁 7시 47분에 만든 결과를 18시간째 그대로 주고 있었습니다.
//   원인: "N분마다 새로 만들기"(revalidate)·unstable_cache가 Cloudflare 저장소에서 제때 새로 만들어지지 않고
//         옛 저장본(STALE)을 계속 내주는 일이 있음(오늘 /api/index-spark도 4시간 넘게 멈춰 있었음).
//   → 몇 분 단위로 꼭 새로워야 하는 자료는 이 저장소를 씁니다.
//     · 서버(Cloudflare)의 같은 일꾼이 받은 요청끼리 결과를 나눠 씀 → 바깥(야후) 요청은 정해 둔 시간에 한 번꼴
//     · 시간이 지나면 다음 요청 때 바로 새로 받음(옛 값을 몇 시간씩 주는 일 없음)
//     · 새로 받다가 실패하면, 직전 값이 있으면 그걸 대신 줌(화면이 비지 않게)
//   비용: 0원(외부 저장소를 쓰지 않음).

const store = new Map(); // key → { t: 저장 시각, v: 값 }
const inflight = new Map(); // key → 진행 중인 요청(같은 순간 여러 요청이 와도 바깥엔 한 번만 물어봄)

export async function memo(key, ttlMs, fn) {
  const hit = store.get(key);
  if (hit && Date.now() - hit.t < ttlMs) return hit.v;
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    try {
      const v = await fn();
      store.set(key, { t: Date.now(), v });
      return v;
    } catch (err) {
      if (hit) return hit.v; // 실패하면 직전 값으로 버팀
      throw err;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}
