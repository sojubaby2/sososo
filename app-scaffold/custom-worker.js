// custom-worker.js — Cloudflare에서 실제로 실행되는 입구 파일
//
// [2026-10-28 신설] 기본 입구(.open-next/worker.js, 빌드할 때 자동으로 만들어짐)를 그대로 쓰면서,
// "예약 실행"(정해진 시각에 저절로 도는 일) 하나를 덧붙였습니다.
//
//   예약 실행 → /api/market-close (장 마감 직후 잠정 장 마감 정리 모으기, lib/marketClose.js)
//            → /api/premarket/refresh (매일 아침 장전 브리핑, lib/premarket.js) [2026-10-29 추가]
//   언제: wrangler.jsonc의 "triggers" — 평일 한국 시간 15시~17시 사이 3분마다 + 월~토 아침 07:40
//
// 바깥 인터넷을 거치지 않고 사이트 안에서 바로 부르므로 추가 요금·지연이 없습니다.
// 아래 맨 끝 줄(export { DOQueueHandler ... })은 "N분마다 새로 만들기" 일꾼을 Cloudflare에 알려 주는 것이라 지우면 안 됩니다.

// @ts-ignore — 빌드할 때 만들어지는 파일
import { default as handler } from "./.open-next/worker.js";

// [2026-10-29 추가] 예약 실행이 두 가지가 됐습니다(wrangler.jsonc의 crons). 어느 시각에 깨어났는지(event.cron)로 나눕니다.
//   "40 22 * * SUN-FRI" → 장전 브리핑(한국 시간 월~토 07:40, lib/premarket.js)
//   그 밖("*/3 6-8 * * MON-FRI") → 장 마감 정리 자료 모으기(평일 15~17시 3분마다)
// [2026-10-30 수정] 요일 표기를 바꿔도 안 어긋나게 "40 22"로 시작하는지만 봅니다.
const isPremarketCron = (cron) => String(cron || "").startsWith("40 22 ");

// [2026-11-03 추가] 패턴검색 결과를 매시간 새로 계산시키는 예약 실행("15 * * * *" = 매시 15분).
//   이 계산은 너무 무거워 Cloudflare 안에서는 못 돌리고, 예전 Vercel 주소에서 계산해 같은 저장소(Redis)에 넣습니다.
//   원래 cron-job.org가 매시간 부르던 일인데 몇 시간씩 실패해 패턴검색이 "0종목"으로 비는 일이 반복돼서,
//   Cloudflare가 직접 부르게 했습니다(추가 요금 없음 — 하루 24번 호출).
const isPatternsCron = (cron) => String(cron || "").startsWith("15 * ");
const PATTERNS_REFRESH_URL = "https://sososo-xi.vercel.app/api/patterns?refresh=1";

export default {
  fetch: handler.fetch,
  async scheduled(event, env, ctx) {
    if (isPatternsCron(event.cron)) {
      ctx.waitUntil(fetch(PATTERNS_REFRESH_URL).then((r) => r.text()).catch(() => null));
      return;
    }
    const secret = encodeURIComponent(env.CRON_SECRET || "");
    const path = isPremarketCron(event.cron) ? "/api/premarket/refresh" : "/api/market-close";
    const req = new Request(`https://newsmeme.co.kr${path}?secret=${secret}`);
    ctx.waitUntil(handler.fetch(req, env, ctx));
  },
};

// @ts-ignore
export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "./.open-next/worker.js";
