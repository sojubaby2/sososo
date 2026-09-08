// lib/marketIndex.js
//
// [2026-09-08 추가] 재성님 질문 — "오늘 국장이 불장이었다가 장막판에
// 하락해서 음전했는데, 마감시황 쓸 때 이런 내용도 쓸 수 있나?" 답을 만들기
// 위해 추가한 파일. 기존 데이터(app/api/theme-momentum, priceHistory 등)는
// 전부 "개별 종목·테마의 전일 대비 등락률"만 있었고, 코스피/코스닥 지수
// 자체의 그날 하루 흐름(장중 얼마나 올랐다가 얼마나 빠졌는지)은 어디에도
// 없었음 — 이게 없으면 "장중 강세였다가 막판 하락 전환" 같은 문장은 근거
// 없이 지어내는 것밖에 안 됨.
//
// KRX 정식 Open API(data-dbg.krx.co.kr)는 지금 "종목별 일별매매정보"
// (stk_bydd_trd/ksq_bydd_trd)만 활용신청돼 있고, 지수 자체 시세는
// "지수정보" 카테고리로 별도 활용신청이 필요함(아직 안 돼 있음). 그래서
// 대신 이미 이 프로젝트에서 쓰고 있는 것과 같은 방식(lib/newsPipeline.js의
// 네이버금융 시가총액 페이지 스크래핑과 동일한 패턴)으로, 인증키가 필요
// 없는 네이버금융의 "코스피/코스닥 지수 일별시세" 공개 페이지를 가져와서
// 파싱함. 참고: 이 페이지는 그날그날의 "시가/고가/저가/종가"까지는 주지만
// 장중 몇 시에 고점을 찍었는지 같은 분 단위 흐름까지는 안 주기 때문에,
// "정확히 몇 시부터 빠졌다"까지는 알 수 없고 "그날 얼마나 올랐다가 얼마나
// 빠져서 마감했는지" 정도의 하루 단위 흐름만 파악 가능함.
const NAVER_INDEX_DAY_URL = "https://finance.naver.com/sise/sise_index_day.naver";

async function fetchIndexDayHtml(code, page = 1) {
  const qs = new URLSearchParams({ code, page: String(page) });
  const url = `${NAVER_INDEX_DAY_URL}?${qs.toString()}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; newsmeme-bot/1.0)" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`네이버 지수 일별시세 요청 실패 (status ${res.status})`);
  return res.text();
}

function toNum(s) {
  const n = Number(String(s || "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : undefined;
}

// "2026.09.08" -> "2026-09-08"
function normalizeDate(s) {
  const m = String(s || "").trim().match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

let loggedRowMismatchSample = false;

// 표 구조(왼쪽부터): 날짜, 체결가(종가), 전일비, 시가, 고가, 저가, 거래량,
// 거래대금. 정확한 클래스명에 의존하지 않고 <td> 내용만 순서대로 뽑아서
// 쓰는 방식(lib/newsPipeline.js의 parseMarketSumHtml과 동일한 접근) —
// 네이버가 스타일링용 클래스명을 바꿔도 안 깨지게.
function parseIndexDayHtml(html) {
  const rowChunks = html.split(/<tr[\s>]/i).slice(1);
  const rows = [];
  for (const chunk of rowChunks) {
    const cellMatches = [...chunk.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)];
    if (cellMatches.length < 6) continue; // 빈 구분 행(줄무늬 스페이서) 등은 건너뜀

    const textCells = cellMatches.map((m) =>
      m[1].replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()
    );

    const date = normalizeDate(textCells[0]);
    if (!date) continue; // 날짜 없는 행(헤더 등)은 데이터 행이 아님

    const close = toNum(textCells[1]);
    const open = toNum(textCells[3]);
    const high = toNum(textCells[4]);
    const low = toNum(textCells[5]);
    if (![close, open, high, low].every((n) => typeof n === "number")) {
      if (!loggedRowMismatchSample) {
        loggedRowMismatchSample = true;
        console.error("marketIndex: 네이버 지수 표 컬럼 구조가 예상과 다름. 원본 셀:", JSON.stringify(textCells));
      }
      continue;
    }
    rows.push({ date, open, high, low, close });
  }
  return rows;
}

// 최근 거래일 순으로 최대 5거래일치(오늘 + 직전 며칠) 반환 — 오늘 지수와
// 전일 종가를 비교해 "음전/양전"을 판단하는 데 전일 종가가 필요해서.
async function fetchIndexRecentDays(code) {
  const html = await fetchIndexDayHtml(code, 1);
  return parseIndexDayHtml(html).slice(0, 5);
}

// 오늘(가장 최근 거래일) 지수 하루 흐름 요약. rows[0]이 오늘, rows[1]이
// 전일. 여기서 미리 계산해두는 이유: 마감시황을 쓰는 예약 작업(별도 AI API
// 호출 없이 Claude가 직접 글을 씀)이 이 숫자를 그대로 문장으로 옮기기만
// 하면 되게 하기 위함 — 계산을 글 쓰는 쪽에 맡기면 실수할 여지가 있음.
export async function fetchIndexTodaySummary(code) {
  const rows = await fetchIndexRecentDays(code);
  if (rows.length === 0) return null;
  const today = rows[0];
  const prevClose = rows[1]?.close ?? null;

  const changeVsPrevClosePct =
    typeof prevClose === "number" && prevClose !== 0 ? ((today.close - prevClose) / prevClose) * 100 : null;
  const changeVsOpenPct = today.open ? ((today.close - today.open) / today.open) * 100 : null;
  // 고점 대비 종가가 얼마나 밀렸는지 — 마이너스로 클수록 "장중 강세였다가
  // 막판에 크게 빠졌다"는 뜻. 재성님이 물어본 "불장이었다가 장막판 하락"
  // 패턴을 바로 이 숫자로 판단함.
  const pullbackFromHighPct = today.high ? ((today.close - today.high) / today.high) * 100 : null;
  // 반대로 저점 대비 종가가 얼마나 반등했는지(장중 급락했다가 낙폭을 줄인
  // 경우)도 같이 계산해둠 — 하락장에서도 참고가 됨.
  const bounceFromLowPct = today.low ? ((today.close - today.low) / today.low) * 100 : null;

  return {
    date: today.date,
    open: today.open,
    high: today.high,
    low: today.low,
    close: today.close,
    prevClose,
    changeVsPrevClosePct,
    changeVsOpenPct,
    pullbackFromHighPct,
    bounceFromLowPct,
  };
}

// KOSPI/KOSDAQ 둘 다 한 번에 — 하나가 실패해도(네이버 페이지 구조 변경 등)
// 다른 하나는 살리기 위해 개별로 감싸서 처리.
export async function fetchBothIndexSummaries() {
  const [kospi, kosdaq] = await Promise.all([
    fetchIndexTodaySummary("KOSPI").catch((err) => {
      console.error("marketIndex: KOSPI 조회 실패:", err.message || err);
      return null;
    }),
    fetchIndexTodaySummary("KOSDAQ").catch((err) => {
      console.error("marketIndex: KOSDAQ 조회 실패:", err.message || err);
      return null;
    }),
  ]);
  return { kospi, kosdaq };
}
