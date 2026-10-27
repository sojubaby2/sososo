// app/api/indexnow/route.js
//
// [2026-10-27 신설] IndexNow 제출 — 재성님 요청: "index now 제출"
//
// IndexNow란: 검색엔진(네이버·빙 등)에 "이 주소들이 새로 생겼거나 바뀌었다"고 바로 알려 주는 표준 방식.
// 검색 로봇이 우연히 찾아오기를 기다리지 않고 먼저 알려서, 새 페이지(종목·장 마감 정리)가
// 검색에 더 빨리 잡히게 합니다. 무료입니다.
//
// 쓰는 법: 브라우저에서 https://newsmeme.co.kr/api/indexnow 를 열면
//   사이트맵(app/sitemap.js)에 있는 주소 전체를 한 번에 제출하고 결과를 보여 줍니다.
//   · IndexNow 공용 창구(api.indexnow.org — 빙 등 참여 검색엔진에 나눠 줌)
//   · 네이버 서치어드바이저 창구(searchadvisor.naver.com/indexnow)
//
// 안전장치: 실제 제출은 1시간에 한 번만 합니다(성공했을 때만 — 실패하면 바로 다시 시도 가능). 1시간 안에 다시 열면 직전 결과를 그대로 보여 주고
//   다시 보내지 않습니다(같은 걸 계속 보내면 검색엔진이 무시하거나 막을 수 있어서).
//   그래서 비밀번호 없이 열어도 괜찮습니다.
//
// 열쇠(KEY): 사이트 주인임을 증명하는 문자열. public/ 폴더의 같은 이름 .txt 파일에 똑같이 들어 있고,
//   검색엔진이 https://newsmeme.co.kr/<열쇠>.txt 를 열어서 맞는지 확인합니다. 두 곳을 같이 바꿔야 합니다.

import { unstable_cache } from "next/cache";
import sitemap from "../../sitemap";

export const dynamic = "force-dynamic";

const HOST = "newsmeme.co.kr";
const KEY = "2e6b23254147184266eeb3d8b381b3ae";
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;
const ENDPOINTS = [
  { name: "IndexNow 공용(빙 등)", url: "https://api.indexnow.org/indexnow" },
  { name: "네이버 서치어드바이저", url: "https://searchadvisor.naver.com/indexnow" },
];
const MAX_URLS = 10000; // IndexNow 한 번에 보낼 수 있는 최대 개수

async function submitAll() {
  const entries = await sitemap();
  const urlList = [...new Set(entries.map((e) => e.url))].filter((u) => u.startsWith(`https://${HOST}`)).slice(0, MAX_URLS);
  const body = JSON.stringify({ host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList });
  const results = await Promise.all(
    ENDPOINTS.map(async (ep) => {
      try {
        const res = await fetch(ep.url, {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body,
          cache: "no-store",
        });
        const text = (await res.text().catch(() => "")).slice(0, 300);
        return { 창구: ep.name, 상태코드: res.status, 성공: res.status === 200 || res.status === 202, 응답: text };
      } catch (err) {
        return { 창구: ep.name, 상태코드: null, 성공: false, 응답: String(err?.message || err) };
      }
    })
  );
  const out = { 제출시각: new Date().toISOString(), 주소개수: urlList.length, 결과: results };
  // 전부 실패했으면 저장하지 않도록 오류로 던짐 → 바로 다시 열어서 재시도할 수 있음
  if (!results.some((r) => r.성공)) {
    const err = new Error("모든 창구에서 접수 실패");
    err.result = out;
    throw err;
  }
  return out;
}

// 1시간 단위 열쇠로 저장 → 같은 시간대에는 한 번만 실제로 보냄
function hourKey() {
  return new Date().toISOString().slice(0, 13); // "2026-10-27T01"
}

export async function GET() {
  const run = unstable_cache(submitAll, ["indexnow-submit", hourKey()], { revalidate: 3600 });
  let out;
  try {
    out = await run();
  } catch (err) {
    return Response.json(
      { ...(err.result || {}), 오류: String(err?.message || err), 안내: "접수되지 않았습니다. 잠시 뒤 다시 열어 보세요(실패한 결과는 저장하지 않습니다)." },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
  return Response.json(
    {
      ...out,
      안내: "상태코드 200·202면 정상 접수입니다. 1시간 안에 다시 열면 같은 결과를 보여 주고 다시 보내지 않습니다.",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
