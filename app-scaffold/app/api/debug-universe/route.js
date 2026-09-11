// GET /api/debug-universe?secret=...
//
// [2026-09-11 임시 진단용 엔드포인트] 재성님 리포트 — 텔레그램 채널엔 뉴스가
// 계속 올라오고 HOT테마 패널도 정상인데, 사이트엔 어제부터 새 뉴스가 하나도
// 안 올라오고 있음. HOT테마(app/api/theme-momentum)는 KRX 정식 Open API를
// 쓰고, 텔레그램 뉴스 관련주 매칭(lib/newsPipeline.js의 getCachedUniverse)은
// 완전히 별개로 네이버 금융(finance.naver.com) 페이지를 직접 긁어오는 방식을
// 쓰고 있어서, 둘 중 하나만 막혀도(예: 네이버가 클라우드 트래픽을 새로
// 차단하기 시작했다면) HOT테마는 멀쩡한데 텔레그램 뉴스만 전부 조용히
// 실패할 수 있음 — 실제로 이 사이트는 그동안 공공데이터포털 → data.krx.co.kr
// → (지금) 네이버 스크래핑 순으로 이미 두 번이나 비슷하게 막힌 전적이 있음.
//
// 이 엔드포인트는 getCachedUniverse()를 직접 호출해서, 딱 그 부분(네이버
// 스크래핑)이 지금 살아있는지 죽어있는지만 빠르게 확인하기 위한 임시
// 진단 도구. 원인이 확인되고 나면 지워도 됨(운영에 필요한 기능 아님) —
// app/api/debug-stock/route.js와 같은 성격.
//
// 인증: 다른 진단/자동화 엔드포인트와 동일하게 CRON_SECRET을 재사용함.

import { getRedis } from "../../../lib/redis";
import { getCachedUniverse } from "../../../lib/newsPipeline";

export const maxDuration = 30;

export async function GET(request) {
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  if (cronSecret) {
    const provided =
      searchParams.get("secret") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (provided !== cronSecret) {
      return Response.json({ error: "인증되지 않은 요청입니다." }, { status: 401 });
    }
  }

  const redis = getRedis();
  if (!redis) {
    return Response.json({ error: "Redis(Upstash) 환경변수가 아직 설정되지 않았습니다." }, { status: 500 });
  }

  const startedAt = Date.now();
  try {
    const universe = await getCachedUniverse(redis);
    const elapsedMs = Date.now() - startedAt;
    if (!universe) {
      return Response.json({
        ok: false,
        elapsedMs,
        reason: "getCachedUniverse가 null을 반환함 — 네이버 시세 페이지에서 종목을 하나도 못 가져왔다는 뜻. 자세한 원인은 Vercel 함수 로그(console.error)에 샘플 행과 함께 남아있을 수 있음.",
      });
    }
    const lines = universe.companyList.split("\n").filter(Boolean);
    return Response.json({
      ok: true,
      elapsedMs,
      basDt: universe.basDt,
      totalStockCount: lines.length,
      sampleRows: lines.slice(0, 5),
      priceMapSize: universe.priceMap.size,
    });
  } catch (err) {
    return Response.json(
      {
        ok: false,
        elapsedMs: Date.now() - startedAt,
        error: String(err?.message || err),
      },
      { status: 500 }
    );
  }
}
