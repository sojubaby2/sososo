// Cloudflare Workers Builds(깃허브 연동 자동배포)에서는 대시보드의
// "Variables and Secrets"에 저장해둔 값이 배포할 때마다 제대로 반영되지
// 않는 문제가 있어서, 이 스크립트가 대신 "진짜 Secret"으로 강제로 다시
// 심어줍니다.
//
// 원리: Cloudflare Workers Builds는 "Build variables and secrets"에
// 등록된 값들을 빌드/배포가 실행되는 동안에는 process.env로 넣어줍니다.
// 이 스크립트는 그 값을 읽어서 wrangler secret bulk 명령으로 Worker에
// "Secret" 타입으로 저장합니다. Secret은 --keep-vars 여부와 상관없이
// 재배포해도 절대 지워지지 않는다고 Cloudflare 공식 문서에 명시되어
// 있으므로, 한 번 성공하면 이후 배포에서는 계속 안전하게 유지됩니다.
//
// 그래서 아래 8개 이름은 Cloudflare 대시보드의 "Settings" ->
// "Build variables and secrets"에도 등록되어 있어야 합니다
// (Variables and Secrets, 즉 런타임 쪽이 아니라 빌드 쪽입니다).

import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync, existsSync } from "node:fs";

const NAMES = [
  "ANTHROPIC_API_KEY",
  "CRON_SECRET",
  "EXIM_API_KEY",
  "KRX_SERVICE_KEY",
  "KV_REST_API_TOKEN",
  "KV_REST_API_URL",
  "NAVER_CLIENT_ID",
  "NAVER_CLIENT_SECRET",
];

const secrets = {};
for (const name of NAMES) {
  const value = process.env[name];
  if (value) {
    secrets[name] = value;
  } else {
    console.log(`(건너뜀) ${name} — 이번 빌드 환경에 값이 없습니다.`);
  }
}

const foundCount = Object.keys(secrets).length;
if (foundCount === 0) {
  console.log(
    "push-secrets: 사용 가능한 값이 하나도 없어서 아무것도 하지 않았습니다."
  );
  process.exit(0);
}

const tmpFile = ".secrets-tmp.json";
writeFileSync(tmpFile, JSON.stringify(secrets));

try {
  console.log(`push-secrets: ${foundCount}개 값을 Secret으로 등록합니다...`);
  execSync(`npx wrangler secret bulk ${tmpFile}`, { stdio: "inherit" });
  console.log("push-secrets: 완료.");
} finally {
  if (existsSync(tmpFile)) unlinkSync(tmpFile);
}
