/** @type {import('next').NextConfig} */
//
// [2026-09-11 정리] 예전에는 이 파일 맨 위에서 Cloudflare 전용 도구
// (@opennextjs/cloudflare)의 initOpenNextCloudflareForDev()를 불러왔었음.
// Cloudflare Pages로 옮기려다 중단하고 계속 Vercel에서 서비스하기로
// 정리했으므로, 그 도구와 관련 설정 파일(wrangler.jsonc, open-next.config.ts,
// scripts/push-secrets.mjs)을 전부 걷어냄 — 안 쓰는 패키지를 설치하느라
// 배포할 때마다 시간이 더 걸리고, 나중에 보면 "이 사이트가 Cloudflare에서
// 돌아가나?" 하고 헷갈리게 만드는 원인이었음.
//
// [2026-10-27 다시] Vercel → Cloudflare Workers(유료)로 옮깁니다. 이번에는 끝까지 갑니다.
//   설정 파일: wrangler.jsonc(배포 설정), open-next.config.ts(저장 방식). 변환 도구: @opennextjs/cloudflare
//   (위 9월 기록의 "걷어냄"은 그때 이야기 — 이 두 파일이 다시 필요해서 새로 썼습니다)
//
// [2026-10-27 추가] 공유 미리보기 그림(opengraph-image)이 쓰는 한글 글꼴 파일을
// 배포 묶음에 같이 싣도록 알려 줍니다. 이 설정이 없으면 Vercel에 올라갈 때
// 글꼴 파일이 빠져서 미리보기 그림이 만들어지지 않습니다(lib/ogImage.js 참고).
const OG_FONT = ["./lib/fonts/og-font-subset.ttf"];

const nextConfig = {
  experimental: {
    outputFileTracingIncludes: {
      "/blog/[slug]/opengraph-image": OG_FONT,
      "/stock/[code]/opengraph-image": OG_FONT,
      "/market/[date]/opengraph-image": OG_FONT,
      "/disclosure/opengraph-image": OG_FONT,
      "/ipo/opengraph-image": OG_FONT,
      "/og/home": OG_FONT,
    },
  },
};

export default nextConfig;
