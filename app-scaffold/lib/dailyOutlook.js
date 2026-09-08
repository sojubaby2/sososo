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

// 기술/실적 관련 최신 뉴스 — 젠슨 황·일론 머스크·트럼프·팀 쿡 등 유명 인사
// 발언이 섞여 있을 만한 소스. 관련도(relevance)·감성(sentiment) 점수도
// 같이 오지만, 실제로 어떤 걸 쓸지 최종 판단은 아래 synthesizeOutlook에서
// Claude에게 맡기고 여기서는 제목/요약만 추림.
async function fetchTechNews(limit = 15) {
  const data = await fetchAlphaVantage({
    function: "NEWS_SENTIMENT",
    topics: "technology,earnings",
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

function toKoreanDateLabel(d) {
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

const SYNTH_SYSTEM_PROMPT = `너는 한국 개인 투자자를 위한 아침 시황 브리핑을 짧게 써주는 애널리스트야.

너한테는 미국 증시(나스닥 포함) 상위 상승 종목·상위 하락 종목 목록과 최근 기술/실적 관련 뉴스 제목·요약 목록이 주어져. 이 정보를 바탕으로, 오늘 한국 증시에서 강세 또는 약세가 예상되는 테마·종목을 최대 3개까지 짧게 예측해줘.

**작성 규칙**:
- 나스닥이 전반적으로 강세면 강세(up) 예측 위주로, 전반적으로 약세면 약세(down) 예측 위주로 만들어도 되지만, 테마별로 방향이 명확히 갈리면(예: 반도체는 호재, 원전은 악재) 억지로 방향을 통일시키지 말고 각각 따로 만들어. 상승·하락이 섞여 나와도 전혀 문제 없어 — 오히려 더 정확해.
- 각 예측 항목은 세 가지: theme(테마 또는 종목명, 10자 이내 — 예: "반도체", "원전", "2차전지"), direction("up" 또는 "down" 중 하나), reason(그 방향으로 예상하는 구체적 근거).
- 근거(reason)는 나스닥 상승/하락 종목, 뉴스 재료, 또는 젠슨 황·일론 머스크·트럼프·팀 쿡처럼 영향력 있는 인물의 발언 중에서 실제로 주어진 자료에 있는 내용만 써. 지어내지 마.
- 최대 3개까지만, 우선순위 높은 순서로. 확신이 안 서면 1~2개만 내도 되고, 정말 근거가 하나도 없으면 picks를 빈 배열로 둬 — 억지로 채우지 마.
- reason은 40자 이내로 짧게. 존댓말 쓰지 말고 개조식으로 사실만(예: "~발언", "~급등", "~부진"). "강세 예상"/"하락 예상" 같은 결론 문구는 reason에 넣지 마 — 그건 direction 필드로 이미 표현되니까, reason에는 순수 근거만.

응답은 반드시 아래 JSON 형식 하나만, 다른 텍스트 없이:
{"picks":[{"theme":"반도체","direction":"up","reason":"엔비디아 급등과 젠슨 황 'AI 수요 견조' 발언"},{"theme":"원전","direction":"down","reason":"관련 종목 실적 부진 우려"}]}`;

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

async function synthesizeOutlook(gainers, losers, news) {
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
      system: SYNTH_SYSTEM_PROMPT,
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

  let parsed;
  try {
    parsed = JSON.parse(extractJsonObject("{" + continuation));
  } catch {
    return [];
  }

  const rawPicks = Array.isArray(parsed.picks) ? parsed.picks : [];
  return rawPicks
    .filter(
      (p) =>
        p &&
        typeof p.theme === "string" &&
        p.theme.trim() &&
        (p.direction === "up" || p.direction === "down") &&
        typeof p.reason === "string" &&
        p.reason.trim()
    )
    .slice(0, 3)
    .map((p) => ({ theme: p.theme.trim(), direction: p.direction, reason: p.reason.trim() }));
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
  const movers = await fetchTopMovers();
  await new Promise((resolve) => setTimeout(resolve, 1200));
  const news = await fetchTechNews();
  const picks = await synthesizeOutlook(movers.gainers, movers.losers, news);
  if (picks.length === 0) throw new Error("AI 요약 생성 실패(근거 부족 또는 파싱 실패)");

  const now = new Date();
  const record = {
    dateLabel: toKoreanDateLabel(now),
    picks,
    generatedAt: now.toISOString(),
  };
  await redis.set(OUTLOOK_REDIS_KEY, record, { ex: 60 * 60 * 36 }); // 36시간 — 다음날 갱신 전까지 여유
  return record;
}

// 홈페이지가 읽는 쪽 — Redis만 보고 끝냄(Alpha Vantage/Claude 재호출 없음).
export async function getCachedDailyOutlook(redis) {
  const cached = await redis.get(OUTLOOK_REDIS_KEY);
  if (!cached) return null;
  return typeof cached === "string" ? JSON.parse(cached) : cached;
}
