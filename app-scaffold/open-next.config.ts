// open-next.config.ts — Next.js 사이트를 Cloudflare Workers에서 돌리기 위한 변환 설정
//
// [2026-10-27 다시 작성] Vercel → Cloudflare 이전.
//
// 이 사이트는 "N분마다 새로 만들기"(revalidate)와 자료 저장(unstable_cache)을 많이 씁니다.
// Vercel은 이걸 알아서 해 줬지만, Cloudflare에서는 저장 장소를 직접 정해 줘야 합니다.
//   · incrementalCache: R2 창고(newsmeme-cache, wrangler.jsonc) + 그 앞에 지역별 빠른 저장(regional cache)
//       → 같은 지역 방문자는 R2까지 가지 않고 바로 받아서 빠르고 R2 사용량도 줄어듭니다.
//   · queue: "새로 만들 때가 된 페이지"를 뒤에서 차례로 다시 만드는 일꾼(Durable Object).
//       같은 페이지를 여러 번 동시에 다시 만들지 않게 막아 줍니다.
//   · tagCache: 쓰지 않음(이 사이트는 revalidateTag/revalidatePath를 안 씀)
import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import { withRegionalCache } from "@opennextjs/cloudflare/overrides/incremental-cache/regional-cache";
import doQueue from "@opennextjs/cloudflare/overrides/queue/do-queue";

export default defineCloudflareConfig({
  incrementalCache: withRegionalCache(r2IncrementalCache, { mode: "long-lived" }),
  queue: doQueue,
});
