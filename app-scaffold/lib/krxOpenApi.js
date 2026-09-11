// lib/krxOpenApi.js
//
// [2026-09-11 추가] KRX(한국거래소) 정식 Open API(openapi.krx.co.kr, 실제
// 호스트는 data-dbg.krx.co.kr)를 호출하는 공통 로직. 원래
// app/api/theme-momentum/route.js 안에만 있던 코드를 여기로 옮겨서,
// lib/newsPipeline.js(텔레그램 뉴스에 "관련주" 매칭할 때 쓰는 "전체 상장
// 종목" 목록)도 같이 쓸 수 있게 함.
//
// [2026-09-11 발견한 문제] 이 사이트는 theme-momentum(HOT테마 패널)은 이미
// 이 KRX 공식 API를 쓰고 있었는데, newsPipeline.js(텔레그램 뉴스 관련주
// 매칭)는 그걸 모르고 예전 방식(네이버 금융 페이지를 직접 긁어오는, 더
// 낡고 불안정한 방식)을 그대로 쓰고 있었음. 그러다 네이버 쪽이 갑자기
// 막히면서(정확한 이유는 확인 불가 — IP 차단, 페이지 구조 변경 등) 텔레그램
// 뉴스의 관련주 매칭만 전부 조용히 실패하는 사고가 있었음(HOT테마는 KRX
// API를 썼으므로 멀쩡했음 — 그래서 원인 파악이 헷갈렸었음). 이미 검증되고
// 안정적으로 잘 돌고 있던 KRX 공식 API 하나로 통일해서, 이런 종류의 문제가
// 다시 생기지 않게 함.
//
// 인증키는 Vercel 환경변수 KRX_OPENAPI_KEY(회원가입 + 인증키 발급 + 개별
// 서비스 활용신청 완료됨, 무료, 하루 10,000회 호출 한도).

export const KRX_OPENAPI_BASE_URL = "https://data-dbg.krx.co.kr/svc/apis";
export const KRX_OPENAPI_ENDPOINT = {
  STK: "sto/stk_bydd_trd", // 유가증권(코스피) 일별매매정보
  KSQ: "sto/ksq_bydd_trd", // 코스닥 일별매매정보
};

export function toBasDt(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${dd}`;
}

// "from" 날짜부터 거꾸로 평일만 골라서 끝없이 내놓는 제너레이터. 장 마감
// 후 저녁 시간대에도 "오늘"부터 후보에 포함되도록, 첫 후보로 from 자신도
// (평일이면) 내놓음 — fetchLatestAvailable이 빈 응답이면 알아서 하루씩
// 더 뒤로 넘어가므로 안전함.
export function* businessDaysBackFrom(from) {
  const d = new Date(from);
  const startDay = d.getDay();
  if (startDay !== 0 && startDay !== 6) yield toBasDt(d);
  while (true) {
    d.setDate(d.getDate() - 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) yield toBasDt(d);
  }
}

// 인증키를 헤더(AUTH_KEY)와 쿼리 파라미터 둘 다에 실어 보냄 — 참고한
// 자료마다 "헤더로 보낸다"는 곳과 "쿼리로 보낸다"는 곳이 서로 달라서,
// 어느 쪽을 보는 서버든 확실히 인증되게 둘 다 보내는 게 안전함.
async function fetchKrxOpenApi(mktId, trdDd) {
  const authKey = process.env.KRX_OPENAPI_KEY;
  if (!authKey) {
    throw new Error("KRX_OPENAPI_KEY 환경변수가 설정되지 않았습니다.");
  }
  const endpoint = KRX_OPENAPI_ENDPOINT[mktId];
  const qs = new URLSearchParams({ basDd: trdDd, AUTH_KEY: authKey });
  const url = `${KRX_OPENAPI_BASE_URL}/${endpoint}?${qs.toString()}`;
  const res = await fetch(url, {
    headers: { AUTH_KEY: authKey },
    cache: "no-store",
  });
  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    throw new Error(`KRX 정식 API 오류 (status ${res.status}): ${bodyText.slice(0, 300)}`);
  }
  const data = await res.json();
  return Array.isArray(data?.OutBlock_1) ? data.OutBlock_1 : [];
}

// data-dbg.krx.co.kr이 가끔 일시적으로 응답을 안 주는 경우를 대비해 한 번
// 실패하면 짧게 쉬었다가 한 번만 더 시도함.
async function fetchKrxOpenApiWithRetry(mktId, trdDd) {
  try {
    return await fetchKrxOpenApi(mktId, trdDd);
  } catch (err) {
    console.error(`krxOpenApi: 요청 실패, 0.5초 후 1회 재시도 (${trdDd}/${mktId}):`, err.message || err);
    await new Promise((resolve) => setTimeout(resolve, 500));
    return fetchKrxOpenApi(mktId, trdDd);
  }
}

function parseKrxNum(v) {
  if (v === undefined || v === null) return NaN;
  const cleaned = String(v).replace(/,/g, "").trim();
  if (cleaned === "" || cleaned === "-") return NaN;
  return Number(cleaned);
}

// KRX 정식 Open API의 실제 필드 이름이 정확히 뭔지 문서로 100% 확인은 못
// 했음(공개된 라이브러리 소스 기준 추정) — 있는 걸 골라 씀. 다 안 맞으면
// 마지막에 원본 행을 로그로 남겨서 다음에 바로 고칠 수 있게 해둠.
const FIELD_CANDIDATES = {
  code: ["ISU_SRT_CD", "ISU_CD", "SRTN_CD"],
  name: ["ISU_ABBRV", "ISU_NM", "ISU_ABBRV_NM"],
  close: ["TDD_CLSPRC", "CLSPRC"],
  fluctRate: ["FLUC_RT", "FLUC_RATE"],
  shares: ["LIST_SHRS", "LIST_SHRS_QTY"],
  volume: ["ACC_TRDVOL", "TRDVOL"],
};

function pickField(row, keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== "") return row[k];
  }
  return undefined;
}

let loggedFieldMismatchSample = false;

function normalizeOpenApiRow(row, marketLabel) {
  const code = pickField(row, FIELD_CANDIDATES.code);
  const name = pickField(row, FIELD_CANDIDATES.name);
  if (!code || !name) {
    if (!loggedFieldMismatchSample) {
      loggedFieldMismatchSample = true;
      console.error(
        "krxOpenApi: 응답에서 종목코드/종목명 필드를 못 찾음(필드명이 예상과 다를 수 있음). 원본 행 샘플:",
        JSON.stringify(row)
      );
    }
    return null;
  }
  return {
    srtnCd: code,
    itmsNm: name,
    mrktCtg: marketLabel,
    clpr: parseKrxNum(pickField(row, FIELD_CANDIDATES.close)),
    fltRt: parseKrxNum(pickField(row, FIELD_CANDIDATES.fluctRate)),
    lstgStCnt: parseKrxNum(pickField(row, FIELD_CANDIDATES.shares)),
    trqu: parseKrxNum(pickField(row, FIELD_CANDIDATES.volume)),
  };
}

async function fetchStockPage(trdDd) {
  const [stk, ksq] = await Promise.all([
    fetchKrxOpenApiWithRetry("STK", trdDd),
    fetchKrxOpenApiWithRetry("KSQ", trdDd),
  ]);
  const items = [
    ...stk.map((r) => normalizeOpenApiRow(r, "KOSPI")),
    ...ksq.map((r) => normalizeOpenApiRow(r, "KOSDAQ")),
  ].filter(Boolean);
  return items;
}

// startFrom부터 거꾸로 최대 6영업일까지 훑어서, 데이터가 있는 가장 최근
// 날짜를 찾아 반환. 반환값: { items, basDt } 또는(전부 실패 시) null.
// items의 각 원소: { srtnCd, itmsNm, mrktCtg("KOSPI"|"KOSDAQ"), clpr,
// fltRt, lstgStCnt, trqu }.
export async function fetchLatestAvailable(startFrom) {
  const gen = businessDaysBackFrom(startFrom);
  for (let i = 0; i < 6; i++) {
    const basDt = gen.next().value;
    let items;
    try {
      items = await fetchStockPage(basDt);
    } catch (err) {
      console.error(`krxOpenApi: 요청 실패 (${basDt}):`, err.message || err);
      continue;
    }
    if (items.length > 0) return { items, basDt };
  }
  return null;
}
