// app/page.js  (홈 화면 — 서버 쪽)
//
// [2026-10-14 전면 변경] 애드센스 "가치 없는 콘텐츠" 거절의 실제 원인을
// 잡기 위한 작업입니다.
//
// 무슨 일이 있었나:
// 이 파일은 원래 "use client"로 시작하는 파일 하나였습니다. 즉 브라우저가
// 페이지를 받은 "뒤에" 자바스크립트로 /api/feed를 불러와 뉴스를 채우는
// 구조였습니다. 사람 눈에는 잠깐 뒤에 채워지니 멀쩡해 보이지만, 구글
// 크롤러와 애드센스 심사 로봇은 그 "잠깐"을 기다려주지 않습니다. 처음 받은
// HTML만 보고 판단합니다. 그래서 그들 눈에 이 사이트의 첫 화면은
// "메뉴 + 불러오는 중..." 이 전부인 빈 페이지였습니다.
//
// 어떻게 바꿨나:
// 파일을 둘로 나눴습니다.
//   · app/page.js (이 파일)  = 서버에서 먼저 데이터를 가져오는 부분
//   · app/HomeClient.js      = 화면 코드(알림음·실시간 갱신 등)
//
// ---------------------------------------------------------------------------
// [2026-10-19 추가] 디자인 개편 — 서버가 챙겨야 할 것이 세 가지 늘었습니다.
//
//   ③ 오늘 뉴스에 걸린 종목들의 "지금 시세"
//      뉴스 카드에 붙는 등락률은 기사가 올라온 그 순간에 찍힌 값이라,
//      아침 기사를 오후에 보면 그때 숫자가 그대로 남아 있었습니다.
//      여기서 한 번 더 받아와 최신 값으로 덮어씁니다.
//
//   ④ 미국 테마 ETF 시세
//      새벽에 들어온 방문자에게 보여줄 "밤사이 미국을 움직인 건 ○○" 문장용.
//
//   ⑤ 위 둘을 가지고 만든 오늘의 한 문장 + 테마 집계 (lib/todayBrief.js)
//
// 비용: 전부 아래 revalidate(저장 시간) 안에서 돕니다. 방문자가 몇 명이든
// 바깥으로 나가는 요청 횟수는 똑같습니다. 종목 시세도 "홈 화면에 실제로
// 보이는 종목"만 조회합니다(전 종목이 아닙니다).
// ---------------------------------------------------------------------------

import HomeClient from "./HomeClient";
import { fetchDomesticQuotes, fetchEtfQuotes } from "../lib/quotes";
import { US_ETF_SYMBOLS } from "../lib/usThemes";
import { KR_ETF_SYMBOLS, KR_THEME_MEMBER_CODES } from "../lib/krThemes";
import { getKospiCapTable, computeThemeContributions, pickTopContributor, contributionText } from "../lib/indexContribution";
import { FX_RATES, COMMODITIES, STRIP_SYMBOLS, toStripRows } from "../lib/marketStrip";
import { buildTodayBrief, todaysItems } from "../lib/todayBrief";

// 이 페이지의 HTML을 60초 동안 재사용합니다(그 사이 방문자는 저장된 걸 받음).
export const revalidate = 60;

// [2026-10-27 추가] 메인 홈 링크를 카카오톡 등에 공유할 때 — 재성님: "메인홈페이지 링크공유시도 좀 바꿔줘"
// 그림: 방금 들어온 속보 3개가 보이는 /og/home(app/og/home/route.js). 다른 페이지는 기존 공용 그림 그대로.
export const metadata = {
  openGraph: {
    title: "속보 뜨는 순간, 관련주까지 한 번에 — 뉴스매매",
    description: "실시간 주식 속보마다 움직일 관련주를 자동으로 찾아 붙여 줍니다. 오늘 강한 테마·종목 차트·공시 일정까지 무료로.",
    url: "/",
    siteName: "뉴스매매",
    locale: "ko_KR",
    type: "website",
    images: [{ url: "/og/home", width: 1200, height: 630, alt: "뉴스매매 — 방금 들어온 속보와 관련주" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "속보 뜨는 순간, 관련주까지 한 번에 — 뉴스매매",
    description: "실시간 주식 속보마다 움직일 관련주를 자동으로 찾아 붙여 줍니다.",
    images: ["/og/home"],
  },
};

const SITE_URL = "https://newsmeme.co.kr";

// 서버가 HTML을 만들 때 미리 가져올 기사 개수.
const INITIAL_FEED_COUNT = 60;

// 시세를 조회할 종목 수 상한. 오늘 뉴스에 걸린 종목이 아무리 많아도 이만큼만
// 봅니다 — 화면에 보이지도 않는 종목까지 조회하면 요청만 늘고 얻는 게 없습니다.
const MAX_QUOTE_STOCKS = 60;

// 코스피 지수의 야후 기호입니다(lib/worldIndices.js의 "한국"과 같은 값).
const KOSPI_SYMBOL = "^KS11";

async function getInitialFeed() {
  try {
    const res = await fetch(`${SITE_URL}/api/feed?limit=${INITIAL_FEED_COUNT}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.items) ? data.items : [];
  } catch {
    // 못 가져와도 페이지는 떠야 합니다 — 빈 배열로 넘기면 브라우저가 불러옵니다.
    return [];
  }
}

// 세계 지수 — 브리핑 밴드의 지도 핀과 아래 띠에 씁니다.
// 실패해도 null을 넘기면 지도는 뜨고 숫자 자리만 "—"가 됩니다.
// ?v=숫자 는 "저장된 걸 버리고 새로 받아오라"는 표시입니다.
// 지수 목록(lib/worldIndices.js)을 바꾸면 이 숫자를 1 올려야 배포 직후
// 바로 바뀐 목록이 보입니다. 안 올리면 최대 5분 동안 예전 목록이 그대로
// 나옵니다(아래 revalidate: 300 때문입니다).
//   v=3 -> v=4 : 2026-10-22, 코스피200을 빼고 코스닥을 넣으면서
async function getWorldIndices() {
  try {
    const res = await fetch(`${SITE_URL}/api/world-indices?v=4`, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// 오늘 뉴스에 걸린 종목 목록을 추립니다(중복 제거).
function collectStocks(items) {
  const seen = new Map();
  for (const item of items) {
    for (const m of item?.matches || []) {
      if (!m?.code || seen.has(m.code)) continue;
      seen.set(m.code, { code: m.code, market: m.market });
      if (seen.size >= MAX_QUOTE_STOCKS) return [...seen.values()];
    }
  }
  return [...seen.values()];
}

export default async function HomePage() {
  // 피드와 세계 지수를 동시에 받아옵니다 — 순서대로 기다리면 첫 화면이 늦어집니다.
  const [initialItems, worldIndices] = await Promise.all([getInitialFeed(), getWorldIndices()]);

  // 오늘 올라온 것만 가지고 시세를 조회합니다. 어제 기사에 걸린 종목까지
  // 전부 조회하면 요청만 늘고, 그 숫자는 어차피 오늘의 한 문장과 무관합니다.
  const today = todaysItems(initialItems);
  const stocks = collectStocks(today);

  // [2026-10-20 추가] stripQuotes — 지수 띠의 "환율·금리", "원자재" 탭에
  // 쓰는 값입니다. fetchEtfQuotes는 야후 기호면 뭐든 받아오는 함수라
  // 그대로 재사용합니다(ETF 전용이 아닙니다).
  const [quotes, etfQuotes, krEtfQuotes, stripQuotes, kospiQuotes, memberQuotes, capTable] = await Promise.all([
    fetchDomesticQuotes(stocks).catch(() => new Map()),
    fetchEtfQuotes(US_ETF_SYMBOLS).catch(() => new Map()),
    // [2026-10-20 추가] 국내 테마 ETF — 한국 칸을 실제 증시값으로 뽑는 데 씁니다.
    fetchEtfQuotes(KR_ETF_SYMBOLS).catch(() => new Map()),
    fetchEtfQuotes(STRIP_SYMBOLS).catch(() => new Map()),
    // [2026-10-21 추가] 코스피 지수 — 한국 칸 문장의 방향(올랐다/내렸다/
    // 조용했다)을 정하는 기준입니다. fetchEtfQuotes는 야후 기호면 뭐든
    // 받아오는 함수라 지수에도 그대로 씁니다.
    fetchEtfQuotes([KOSPI_SYMBOL]).catch(() => new Map()),
    // [2026-10-26 추가] "지수 기여 1위" 계산용 — 테마별 코스피 대형주의 오늘 등락률(야후)과
    // 시가총액(파일에 적어 둔 2026-10-22 기준 값 — 바깥 호출 없음). lib/indexContribution.js 참고. 비용 0.
    fetchDomesticQuotes(KR_THEME_MEMBER_CODES.map((code) => ({ code, market: "코스피" }))).catch(() => new Map()),
    getKospiCapTable().catch(() => null),
  ]);

  const kospi = kospiQuotes.get(KOSPI_SYMBOL) || null;
  const contribTop = pickTopContributor(
    computeThemeContributions(capTable, memberQuotes),
    typeof kospi?.changePct === "number" ? kospi.changePct : null
  );

  const brief = buildTodayBrief({
    items: initialItems,
    quotes,
    etfQuotes,
    krEtfQuotes,
    kospi,
    contribText: contributionText(contribTop),
  });

  // Map은 그대로 화면 쪽으로 넘길 수 없습니다(서버에서 브라우저로 건너갈 때
  // 평범한 객체만 넘어갑니다). 종목코드를 열쇠로 하는 객체로 바꿔서 보냅니다.
  const liveQuotes = {};
  for (const [code, q] of quotes) {
    if (typeof q.changePct === "number") liveQuotes[code] = { price: q.price, changePct: q.changePct };
  }

  // 지수 띠에 바로 뿌릴 수 있는 모양으로 바꿔서 넘깁니다.
  // 못 받아온 기호는 toStripRows가 알아서 빼줍니다.
  const strip = {
    fx: toStripRows(FX_RATES, stripQuotes),
    commodity: toStripRows(COMMODITIES, stripQuotes),
  };

  return (
    <HomeClient
      initialItems={initialItems}
      worldIndices={worldIndices}
      brief={brief}
      liveQuotes={liveQuotes}
      strip={strip}
    />
  );
}
