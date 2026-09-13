/** @type {import('next').NextConfig} */
//
// [2026-09-11 정리] 예전에는 이 파일 맨 위에서 Cloudflare 전용 도구
// (@opennextjs/cloudflare)의 initOpenNextCloudflareForDev()를 불러왔었음.
// Cloudflare Pages로 옮기려다 중단하고 계속 Vercel에서 서비스하기로
// 정리했으므로, 그 도구와 관련 설정 파일(wrangler.jsonc, open-next.config.ts,
// scripts/push-secrets.mjs)을 전부 걷어냄 — 안 쓰는 패키지를 설치하느라
// 배포할 때마다 시간이 더 걸리고, 나중에 보면 "이 사이트가 Cloudflare에서
// 돌아가나?" 하고 헷갈리게 만드는 원인이었음.
const nextConfig = {};

export default nextConfig;
