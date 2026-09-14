// lib/dailyOutlook.js
//
// [2026-09-08 추가] 재성님 요청 — 홈페이지 맨 위에 매일 아침(평일 07:50)
// "나스닥 기반 국장 예측" 짧은 배너를 띄우기 위한 데이터 수집 + AI 요약
// 로직. 두 단계로 나뉨:
//   1) Alpha Vantage(무료 시세/뉴스 API)에서 미국 시장 상위 상승·하락
//      종목과 관련 뉴스(젠슨 황·일론 머스크·트럼프·팀 쿡 등 영향력 있는
//      인물 발언이 섞여 있을 수 있는 기술/실적 뉴스)를 가져오고,
//   2) 그 원재료를 기존에 쓰던 것과 같은 Claude API 호출(lib/newsPipeline.js
//      의 isMarketMovingHeadline/matchStocks와 동일한 방식)로 "테마별 강세/
//      약세 예측" 목록(최대 3개)으로 요약함.
//
// [2026-09-08 수정] 처음엔 "오늘의 국장 예측" 한 문장(항상 강세 톤)이었는데,
// 재성님 요청으로 상승뿐 아니라 하락 예측도 나오게 하고, 테마별로 방향이
// 갈리는 경우(예: 반도체는 강세, 원전은 약세)에는 여러 줄로 각각 보여주도록
// 바꿈. 그래서 이제 결과가 summary 문자열 하나가 아니라 picks 배열
// ([{theme, direction, reason}, ...])로 바뀜 — 프론트(components/
// DailyOutlookBanner.js)에서 각 pick을 방향에 맞는 색(상승=붉은색,
// 하락=파란색)과 아이콘으로 한 줄씩 렌더링함.
//
// [2026-09-08 수정(2차)] 재성님 요청으로 최대 개수를 3개 → 10개로 늘림
// (쓸 근거가 많으면 10개까지, 적으면 그만큼만 — 억지로 채우지 않음).
// 다만 화면에는 첫 줄 하나만 기본으로 보이고 "펼치기" 버튼을 눌러야
// 나머지가 보이도록 프론트에서 처리함(아래 DailyOutlookBanner.js 참고).
//
// app/api/daily-outlook/refresh/route.js(cron-job.org가 매일 아침 호출)가
// 이 모듈을 써서 결과를 Redis에 저장하고, app/api/daily-outlook/route.js
// (홈페이지가 읽는 쪽)는 그 저장된 값을 그대로 돌려주기만 함 — 방문자가
// 몰려도 Alpha Vantage/Claude API를 매번 다시 호출하지 않도록 하기 위함
// (기존 KRX universe 캐싱과 같은 이유).
//
// Alpha Vantage 무료 키는 하루 호출 한도가 넉넉하지 않아서(하루 약 25회),
// 이 기능은 하루에 딱 한 번만(cron-job.org 스케줄) 호출하도록 설계함 —
// 절대로 홈페이지 방문마다 직접 호출하면 안 됨. 그래서 아래 fetch 함수들은
// refreshDailyOutlook 안에서만 쓰이고, 읽기 전용 getCachedDailyOutlook은
// Redis만 보고 끝냄.
//
// [2026-09-08 수정(3차)] 재성님 질문 — "이 배너에 관련주 매칭 되나?" — 답은
// "지금은 안 됨"이었음. 이유: Claude가 theme을 완전히 자유롭게 만들어내서
// ("AI 인프라", "클라우드/소프트웨어" 처럼) /themes 페이지가 아는 154개
// 정식 테마명(lib/themeData.js)과 문자열이 안 맞음. 그래서 재성님이 고른
// 방식(관련주 칩 대신 "테마별 종목정리" 페이지로 연결)이 실제로 작동하려면
// theme 이름 자체가 정식 테마명과 정확히 일치해야 함 — 그래서 아래
// ALLOWED_THEME_NAMES 목록을 만들어 프롬프트에 통째로 넣고, Claude가 반드시
// 이 목록 중에서만 theme을 고르도록 강제함(응답 파싱 후에도 한 번 더
// 필터링 — 혹시 목록에 없는 이름을 냈으면 그 pick은 버림).
import { getAllThemeNames } from "./themeData";

const ALLOWED_THEME_NAMES = getAllThemeNames();
const ALLOWED_THEME_SET = new Set(ALLOWED_THEME_NAMES);

const ALPHA_VANTAGE_BASE = "https://www.alphavantage.co/query";

async function fetchAlphaVantage(params) {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) throw new Error("ALPHA_VANTAGE_API_KEY 환경변수가 설정되지 않았습니다.");
  const qs = new URLSearchParams({ ...params, apikey: apiKey });
  const res = await fetch(`${ALPHA_VANTAGE_BASE}?${qs.toString()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Alpha Vantage 오류 (status ${res.status})`);
  const data = await res.json();
  // Alpha Vantage는 호출 한도를 넘겨도 HTTP 상태코드는 200으로 주고, 대신
  // 본문에 "Note"나 "Information" 필드로 알려주는 방식이라 여기서 걸러줘야
  // 진짜 실패를 놓치지 않음.
  if (data?.Note || data?.Information) {
    throw new Error("Alpha Vantage 호출 한도 초과 또는 오류: " + (data.Note || data.Information));
  }
  return data;
}

// 미국 시장(나스닥 상장 종목 다수 포함) 상위 상승·하락 종목 상위 N개씩.
// 하락장에도 "하락 예상" 판단을 내릴 수 있어야 해서 top_losers도 같이 씀.
async function fetchTopMovers(limit = 8) {
  const data = await fetchAlphaVantage({ function: "TOP_GAINERS_LOSERS" });
  const toRows = (arr) =>
    (Array.isArray(arr) ? arr : []).slice(0, limit).map((g) => ({
      ticker: g.ticker,
      changePct: g.change_percentage,
      price: g.price,
    }));
  return { gainers: toRows(data?.top_gainers), losers: toRows(data?.top_losers) };
}

// [2026-09-13 추가] 주말(토·일)인지 판정 — 한국 시간 기준.
// 왜 필요한가: 재성님 리포트 — 금요일 저녁부터 월요일 아침까지 홈 화면의
// 전망 배너가 통째로 비어 있었음. 원인은 두 가지가 겹친 것이었는데,
// ① 예약 호출이 평일에만 돌아서 주말엔 갱신 자체가 없었고,
// ② 주말에 수동으로 돌려봐도 미국장이 쉬는 바람에 "technology,earnings"
//    뉴스가 거의 안 나와서 AI가 근거 없음 → 빈 결과를 냈음.
// 재성님 요청: "주말에는 꼭 주식 뉴스가 아니더라도 미국의 굵직한 뉴스
// (경제지표 발표, 전쟁 상황 등)를 가져와서 배치해달라." 그래서 주말에는
// 뉴스 수집 범위를 거시경제·정책·에너지·지정학 쪽까지 넓히고, 프롬프트도
// "오늘 장"이 아니라 "다음 거래일"을 예측하도록 바꿈.
// [2026-09-14 수정 — 월요일 아침이 계속 실패하던 문제]
// 처음엔 "한국 날짜가 토·일인가"로 판단했는데, 실제로 막힌 건 월요일이었음.
// 2026-09-14(월) 아침 7시 50분 실행이 근거를 하나도 못 찾고 빈 결과를 냈는데
// (/health 기록: newsCount 15, rawPickCount 0), 이유가 분명함 — 한국 시간
// 월요일 아침 7시 50분은 세계표준시로는 아직 "일요일 밤"이라, 미국 증시는
// 금요일 마감 이후 이틀 넘게 쉬는 중이고 기술·실적 뉴스도 주말 내내 거의
// 안 나온 상태임. 즉 재료가 없는 게 정상인 시간대인데 평일 모드로 좁게
// 뒤지고 있었던 것.
//
// 그래서 기준을 한국 요일이 아니라 세계표준시 요일로 바꿈. 이러면
// "미국 시장이 최근에 거래를 했는가"와 정확히 맞아떨어짐:
//   · 한국 월요일 07:50 -> UTC 일요일  -> 조용함(주말 모드) ← 이번에 고친 경우
//   · 한국 일요일 07:50 -> UTC 토요일  -> 조용함(주말 모드)
//   · 한국 토요일 07:50 -> UTC 금요일  -> 평일 모드(금요일 장이 막 끝나 재료가 있음)
//   · 한국 화~금 07:50 -> UTC 월~목   -> 평일 모드
function isUsMarketQuiet(d = new Date()) {
  const day = d.getUTCDay(); // 0=일, 6=토 (세계표준시 기준)
  return day === 0 || day === 6;
}

// 평일: 기술·실적 위주(원래대로). 주말: 거시경제·정책·금융시장·에너지까지
// 넓혀서, 장이 쉬어도 "굵직한 재료"는 잡히게 함.
const NEWS_TOPICS_WEEKDAY = "technology,earnings";
const NEWS_TOPICS_WEEKEND =
  "economy_macro,economy_monetary,economy_fiscal,financial_markets,energy_transportation,technology,manufacturing";

// 기술/실적 관련 최신 뉴스 — 젠슨 황·일론 머스크·트럼프·팀 쿡 등 유명 인사
// 발언이 섞여 있을 만한 소스. 관련도(relevance)·감성(sentiment) 점수도
// 같이 오지만, 실제로 어떤 걸 쓸지 최종 판단은 아래 synthesizeOutlook에서
// Claude에게 맡기고 여기서는 제목/요약만 추림.
//
// [2026-09-13 변경] 주말에는 limit을 늘려서(장이 쉬는 대신 뉴스 한 건
// 한 건의 밀도가 낮으므로) 더 많이 훑어봄.
async function fetchTechNews(limit = 15, topics = NEWS_TOPICS_WEEKDAY) {
  const data = await fetchAlphaVantage({
    function: "NEWS_SENTIMENT",
    topics,
    sort: "LATEST",
    limit: String(limit),
  });
  const feed = Array.isArray(data?.feed) ? data.feed : [];
  return feed.slice(0, limit).map((a) => ({
    title: a.title,
    summary: a.summary,
    sentiment: a.overall_sentiment_label,
  }));
}

// [2026-09-10 수정] 재성님 리포트 — 배너 날짜가 9월 8일에서 며칠째 안
// 바뀜. 원인: Vercel 서버는 UTC로 돌아가는데, 여기선 그냥 new Date()의
// 날짜(getMonth/getDate)를 그대로 썼음. cron-job.org가 한국시간(KST)
// 아침 7시 50분에 호출하면, 그 시각은 UTC로는 "전날 밤 10시 50분"이라서
// getDate()가 하루 전 날짜를 돌려줌 — 그래서 매일 한국 날짜보다 하루
// 늦게 표시됨(lib/dailyReviewWriter.js 쪽 마감시황에서도 똑같은 종류의
// 착오를 이미 한 번 겪고 고친 적이 있음). 지금부터는 UTC 시각에 9시간을
// 더해서 "한국 시간 기준 벽시계 날짜"를 구한 뒤 그 날짜를 씀.
function toKoreanDateLabel(d) {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일`;
}

// [2026-09-13 변경] 평일용/주말용 두 가지로 갈라짐 — 주말에는 미국장이
// 쉬어서 "상위 상승 종목" 자료가 사실상 금요일 것 하나뿐이고 기술·실적
// 뉴스도 거의 안 올라오기 때문에, 거시경제·정책·지정학 뉴스를 근거로
// "다음 거래일"을 내다보게 지시함.
function buildSynthSystemPrompt(weekend) {
  const intro = weekend
    ? `너는 한국 개인 투자자를 위한 주말 브리핑을 짧게 써주는 애널리스트야.

지금은 주말이라 미국·한국 증시 모두 쉬는 중이야. 너한테는 직전 거래일(금요일) 미국 증시 상위 상승·하락 종목 목록과, 주말 사이에 나온 해외 뉴스(경제지표 발표, 통화·재정 정책, 지정학·전쟁 상황, 에너지·원자재, 기술·산업 등) 제목·요약 목록이 주어져. 이 정보를 바탕으로, **다음 거래일** 한국 증시에서 강세 또는 약세가 예상되는 테마를 최대 10개까지 짧게 예측해줘.`
    : `너는 한국 개인 투자자를 위한 아침 시황 브리핑을 짧게 써주는 애널리스트야.

너한테는 미국 증시(나스닥 포함) 상위 상승 종목·상위 하락 종목 목록과 최근 기술/실적 관련 뉴스 제목·요약 목록이 주어져. 이 정보를 바탕으로, 오늘 한국 증시에서 강세 또는 약세가 예상되는 테마를 최대 10개까지 짧게 예측해줘.`;

  const weekendExtraRule = weekend
    ? `
- 지금은 주말이라 주식 시장 뉴스 자체는 적을 수 있어. 그래도 주어진 뉴스 중에 굵직한 재료(금리·물가·고용 지표, 관세·규제 정책, 전쟁·분쟁, 유가·원자재 급변, 대형 기업 이슈 등)가 하나라도 있으면 그걸 근거로 **최소 1개 이상**은 만들어줘. 주식 전문 뉴스가 아니어도 괜찮아 — 국내 증시 테마에 영향을 줄 만한 내용이면 근거로 써도 돼.`
    : "";

  return `${intro}

**작성 규칙**:${weekendExtraRule}
- 나스닥이 전반적으로 강세면 강세(up) 예측 위주로, 전반적으로 약세면 약세(down) 예측 위주로 만들어도 되지만, 테마별로 방향이 명확히 갈리면(예: 반도체는 호재, 원전은 악재) 억지로 방향을 통일시키지 말고 각각 따로 만들어. 상승·하락이 섞여 나와도 전혀 문제 없어 — 오히려 더 정확해.
- theme은 반드시 아래 [허용된 테마 목록]에 있는 이름 중 하나를 토씨 하나 안 틀리고 그대로 써야 해. 목록에 없는 이름을 새로 만들어내지 마 — 나스닥 뉴스가 이 목록의 여러 테마와 관련될 수 있으니, 그중 가장 관련 있는 걸 골라 써(예: 엔비디아·AI 반도체 관련 뉴스면 "반도체" 또는 "반도체 제품(비메모리)", 데이터센터 뉴스면 "데이터 센터", 오픈AI 등 AI 서비스 뉴스면 "인공지능(AI)"). 이 목록과 관련된 근거가 하나도 없는 뉴스는 그냥 씀.
- 각 예측 항목은 세 가지: theme([허용된 테마 목록] 중 정확히 하나), direction("up" 또는 "down" 중 하나), reason(그 방향으로 예상하는 구체적 근거).
- 근거(reason)는 나스닥 상승/하락 종목, 뉴스 재료, 또는 젠슨 황·일론 머스크·트럼프·팀 쿡처럼 영향력 있는 인물의 발언 중에서 실제로 주어진 자료에 있는 내용만 써. 지어내지 마.
- 근거가 충분하면 최대 10개까지, 우선순위(확신 높은 순서) 높은 것부터 채워. 억지로 10개를 채우려 하지는 말고, 근거가 그만큼 없으면 있는 만큼만(1~2개도 괜찮음) 내면 돼. 정말 근거가 하나도 없으면 picks를 빈 배열로 둬.
- reason은 40자 이내로 짧게. 존댓말 쓰지 말고 개조식으로 사실만(예: "~발언", "~급등", "~부진"). "강세 예상"/"하락 예상" 같은 결론 문구는 reason에 넣지 마 — 그건 direction 필드로 이미 표현되니까, reason에는 순수 근거만.

[허용된 테마 목록] (반드시 이 중에서만 골라 theme에 써):
${ALLOWED_THEME_NAMES.join(", ")}

응답은 반드시 아래 JSON 형식 하나만, 다른 텍스트 없이:
{"picks":[{"theme":"반도체","direction":"up","reason":"엔비디아 급등과 젠슨 황 'AI 수요 견조' 발언"},{"theme":"원자력발전(SMR)","direction":"down","reason":"관련 종목 실적 부진 우려"}]}`;
}

function extractJsonObject(text) {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) return text.slice(0, i + 1);
    }
  }
  return text;
}

// [2026-09-13 변경] 반환값이 picks 배열 하나에서 { picks, debug }로 바뀜.
// 이유: 재성님이 수동으로 돌려봤을 때 `AI 요약 생성 실패(근거 부족 또는
// 파싱 실패)` 라는 메시지만 나와서, 셋 중 무엇이 원인인지(AI가 애초에 빈
// 결과를 냈는지 / JSON 파싱이 깨졌는지 / 테마명이 정식 목록에 없어서
// 전부 걸러졌는지) 전혀 알 수 없었음. 이제 원인을 debug에 담아서
// /api/daily-outlook/refresh?debug=1 로 바로 확인할 수 있게 함.
async function synthesizeOutlook(gainers, losers, news, weekend) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.");

  const rowsBlock = (rows) => rows.map((g) => `${g.ticker}: ${g.changePct}`).join("\n") || "(데이터 없음)";
  const gainersBlock = rowsBlock(gainers);
  const losersBlock = rowsBlock(losers);
  const newsBlock = news.map((n) => `- ${n.title}\n  ${n.summary}`).join("\n") || "(데이터 없음)";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      system: buildSynthSystemPrompt(weekend),
      messages: [
        {
          role: "user",
          content: `[나스닥 등 미국 상위 상승 종목]\n${gainersBlock}\n\n[나스닥 등 미국 상위 하락 종목]\n${losersBlock}\n\n[최근 기술/실적 뉴스]\n${newsBlock}`,
        },
        { role: "assistant", content: "{" },
      ],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error("Claude API 오류: " + JSON.stringify(data));
  const continuation = data?.content?.find((c) => c.type === "text")?.text || '"picks":[]}';

  const debug = {
    weekend: !!weekend,
    gainerCount: gainers.length,
    loserCount: losers.length,
    newsCount: news.length,
    responsePreview: ("{" + continuation).slice(0, 400),
    parseFailed: false,
    rawPickCount: 0,
    rejected: [],
  };

  let parsed;
  try {
    parsed = JSON.parse(extractJsonObject("{" + continuation));
  } catch {
    debug.parseFailed = true;
    return { picks: [], debug };
  }

  const rawPicks = Array.isArray(parsed.picks) ? parsed.picks : [];
  debug.rawPickCount = rawPicks.length;

  const picks = rawPicks
    .filter((p) => {
      if (!p || typeof p.theme !== "string" || !p.theme.trim()) {
        debug.rejected.push({ theme: null, why: "theme 없음" });
        return false;
      }
      // [2026-09-08 추가] theme이 /themes 페이지가 아는 정식 테마명이
      // 아니면(프롬프트로 강제했지만 모델이 가끔 벗어날 수 있음) 링크가
      // 깨지므로 통째로 버림 — 어설프게 보여주느니 그 pick만 빼는 게 나음.
      if (!ALLOWED_THEME_SET.has(p.theme.trim())) {
        debug.rejected.push({ theme: p.theme.trim(), why: "정식 테마명 목록에 없음" });
        return false;
      }
      if (p.direction !== "up" && p.direction !== "down") {
        debug.rejected.push({ theme: p.theme.trim(), why: "direction이 up/down이 아님" });
        return false;
      }
      if (typeof p.reason !== "string" || !p.reason.trim()) {
        debug.rejected.push({ theme: p.theme.trim(), why: "reason 없음" });
        return false;
      }
      return true;
    })
    .slice(0, 10)
    .map((p) => ({ theme: p.theme.trim(), direction: p.direction, reason: p.reason.trim() }));

  return { picks, debug };
}

const OUTLOOK_REDIS_KEY = "dailyOutlook:latest";

// 실제로 새로 계산해서 Redis에 저장 — cron-job.org가 매일 아침 호출하는
// /api/daily-outlook/refresh 전용. 홈페이지 쪽에서는 절대 이걸 직접
// 부르면 안 됨(항상 저장된 값만 읽어야 함 — 위 파일 설명 참고).
export async function refreshDailyOutlook(redis) {
  // [2026-09-08 수정] 처음엔 Promise.all로 Alpha Vantage 호출들을 동시에
  // 보냈는데, 실제로 재성님이 테스트해보니 "1 request per second" 에러가
  // 남 — Alpha Vantage 무료 키는 같은 순간에 여러 요청이 들어오는 걸
  // 허용 안 하는 초당 호출 제한이 있어서(하루 25회 한도와는 별개 문제).
  // 그래서 동시 호출 대신 순서대로 호출하고, 사이에 1.2초씩 쉬어감.
  const weekend = isUsMarketQuiet();

  const movers = await fetchTopMovers();
  await new Promise((resolve) => setTimeout(resolve, 1200));
  const news = await fetchTechNews(weekend ? 30 : 15, weekend ? NEWS_TOPICS_WEEKEND : NEWS_TOPICS_WEEKDAY);
  let { picks, debug } = await synthesizeOutlook(movers.gainers, movers.losers, news, weekend);

  // [2026-09-14 추가] 평일 모드로 돌렸는데 근거를 하나도 못 찾은 경우,
  // 포기하기 전에 딱 한 번만 넓은 범위(거시경제·정책·에너지 등)로 다시
  // 시도함. 미국 공휴일이나 재료가 유난히 없는 날에도 배너가 비지 않게
  // 하려는 안전장치. 실패했을 때만 도는 경로라 평소 비용은 그대로이고,
  // 하루 최대 한 번 더(Alpha Vantage 1회 + AI 1회)만 늘어남.
  if (picks.length === 0 && !weekend) {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const wideNews = await fetchTechNews(30, NEWS_TOPICS_WEEKEND);
    const retry = await synthesizeOutlook(movers.gainers, movers.losers, wideNews, true);
    if (retry.picks.length > 0) {
      picks = retry.picks;
      debug = { ...retry.debug, retriedWithWideTopics: true, firstAttempt: debug };
    } else {
      debug = { ...debug, retriedWithWideTopics: true, retryDebug: retry.debug };
    }
  }

  // [2026-09-13 변경] 예전엔 여기서 throw를 던졌는데, 그러면 이번 회차만
  // 실패하는 게 아니라 "기존에 저장돼 있던 멀쩡한 예측을 새 걸로 못 바꾼
  // 채 시간이 흘러 만료" → 배너가 통째로 사라지는 결과가 됐음. 이제는
  // 에러를 던지지 않고 "이번엔 갱신 안 함(skipped)"으로 조용히 끝냄 —
  // 저장돼 있던 직전 예측은 아래 늘어난 유효기간 덕분에 계속 보임.
  if (picks.length === 0) {
    return { ok: false, skipped: true, reason: "AI가 근거를 찾지 못해 예측을 만들지 못했습니다.", debug };
  }

  const now = new Date();
  const record = {
    dateLabel: toKoreanDateLabel(now),
    // [2026-09-13 추가] 배너 제목 문구. 주말에는 "나스닥 기반 국장 예측"이
    // 말이 안 되므로(장이 쉬는 중) 다르게 씀. 이 필드가 없는 옛날 기록도
    // 있을 수 있어서, 프론트(components/DailyOutlookBanner.js)는 이게
    // 없으면 예전 문구를 그대로 쓰도록 해둠.
    heading: weekend
      ? `${toKoreanDateLabel(now)} 주말 해외뉴스 기반 다음 거래일 전망`
      : `${toKoreanDateLabel(now)} 나스닥 기반 국장 예측`,
    weekend,
    picks,
    generatedAt: now.toISOString(),
  };

  // [2026-09-13 변경] 36시간 → 4일. 36시간이면 금요일 아침에 만든 예측이
  // 토요일 낮에 만료돼서, 주말 내내 홈 화면 배너가 빈칸이 됐음(재성님
  // 리포트). 4일이면 연휴가 끼어도 직전 예측이 남아 있음 — 갱신이 정상
  // 동작하는 한 어차피 매일 새 값으로 덮어써지므로 길게 잡아도 손해가 없음.
  await redis.set(OUTLOOK_REDIS_KEY, record, { ex: 60 * 60 * 24 * 4 });
  return { ok: true, record, debug };
}

// 홈페이지가 읽는 쪽 — Redis만 보고 끝냄(Alpha Vantage/Claude 재호출 없음).
export async function getCachedDailyOutlook(redis) {
  const cached = await redis.get(OUTLOOK_REDIS_KEY);
  if (!cached) return null;
  return typeof cached === "string" ? JSON.parse(cached) : cached;
}
