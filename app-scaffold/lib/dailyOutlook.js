// lib/dailyOutlook.js
//
// [2026-09-08 추가] 재성님 요청 — 홈페이지 맨 위에 매일 아침(평일 07:50)
// "나스닥 기반 국장 예측" 짧은 배너를 띄우기 위한 데이터 수집 + AI 요약
// 로직. 두 단계로 나뉨:
//   1) Alpha Vantage(무료 시세/뉴스 API)에서 미국 시장 상위 상승 종목과
//      관련 뉴스(젠슨 황·일론 머스크·트럼프·팀 쿡 등 영향력 있는 인물
//      발언이 섞여 있을 수 있는 기술/실적 뉴스)를 가져오고,
//   2) 그 원재료를 기존에 쓰던 것과 같은 Claude API 호출(lib/newsPipeline.js
//      의 isMarketMovingHeadline/matchStocks와 동일한 방식)로 한국어 한
//      문장짜리 "오늘의 국장 예측" 문구로 요약함.
//
// app/api/daily-outlook/refresh/route.js(cron-job.org가 매일 아침 호출)가
// 이 모듈을 써서 결과를 Redis에 저장하고, app/api/daily-outlook/route.js
// (홈페이지가 읽는 쪽)는 그 저장된 값을 그대로 돌려주기만 함 — 방문자가
// 몰려도 Alpha Vantage/Claude API를 매번 다시 호출하지 않도록 하기 위함
// (기존 KRX universe 캐싱과 같은 이유).
//
// Alpha Vantage 무료 키는 하루 호출 한도가 넉넉하지 않아서(하루 약 25회),
// 이 기능은 하루에 딱 한 번만(cron-job.org 스케줄) 호출하도록 설계함 —
// 절대로 홈페이지 방문마다 직접 호출하면 안 됨. 그래서 아래 두 fetch 함수는
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

// 미국 시장(나스닥 상장 종목 다수 포함) 상위 상승 종목 상위 N개.
async function fetchTopGainers(limit = 8) {
  const data = await fetchAlphaVantage({ function: "TOP_GAINERS_LOSERS" });
  const gainers = Array.isArray(data?.top_gainers) ? data.top_gainers : [];
  return gainers.slice(0, limit).map((g) => ({
    ticker: g.ticker,
    changePct: g.change_percentage,
    price: g.price,
  }));
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

너한테는 미국 증시(나스닥 포함) 상위 상승 종목 목록과 최근 기술/실적 관련 뉴스 제목·요약 목록이 주어져. 이 정보를 바탕으로, 오늘 한국 증시에서 강세가 예상되는 테마 또는 종목을 딱 한 문장으로 예측해줘.

**작성 규칙**:
- 반드시 아래 형식을 따르는 한 문장: "(근거: 나스닥 상승 종목 또는 뉴스 또는 유명 인사 발언)에 따라, 국내 (테마명 또는 종목명) 강세 예상"
- 젠슨 황, 일론 머스크, 트럼프, 팀 쿡처럼 영향력 있는 인물의 발언이 뉴스에 있으면 최우선으로 활용해. 없으면 상승 종목이나 뉴스 재료를 근거로 써.
- 실제로 주어진 자료에 있는 내용만 근거로 써. 지어내지 마 — 특히 인물 발언은 뉴스 제목/요약에 실제로 나온 것만 인용해.
- 여러 후보가 있으면, 한국 증시에 실제로 영향을 줄 만한(반도체, 2차전지, AI, 방산 등 한국에도 관련 상장사가 많은 산업) 걸 우선으로 골라.
- 문장은 60자 이내로 짧게. 존댓말 쓰지 말고 개조식으로(예: "~예상", "~전망").
- 확신이 안 서면 억지로 특정 종목명을 넣지 말고 테마명 정도로만 말해도 돼. 정말 근거가 하나도 없으면 summary를 null로 둬.

응답은 반드시 아래 JSON 형식 하나만, 다른 텍스트 없이:
{"summary":"엔비디아 급등과 젠슨 황 'AI 수요 여전히 견조' 발언에 따라, 국내 반도체 테마 강세 예상"}`;

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

async function synthesizeOutlook(gainers, news) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.");

  const gainersBlock = gainers.map((g) => `${g.ticker}: ${g.changePct}`).join("\n") || "(데이터 없음)";
  const newsBlock =
    news.map((n) => `- ${n.title}\n  ${n.summary}`).join("\n") || "(데이터 없음)";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      system: SYNTH_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `[나스닥 등 미국 상위 상승 종목]\n${gainersBlock}\n\n[최근 기술/실적 뉴스]\n${newsBlock}`,
        },
        { role: "assistant", content: "{" },
      ],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error("Claude API 오류: " + JSON.stringify(data));
  const continuation = data?.content?.find((c) => c.type === "text")?.text || '"summary":null}';
  try {
    const parsed = JSON.parse(extractJsonObject("{" + continuation));
    return typeof parsed.summary === "string" ? parsed.summary : null;
  } catch {
    return null;
  }
}

const OUTLOOK_REDIS_KEY = "dailyOutlook:latest";

// 실제로 새로 계산해서 Redis에 저장 — cron-job.org가 매일 아침 호출하는
// /api/daily-outlook/refresh 전용. 홈페이지 쪽에서는 절대 이걸 직접
// 부르면 안 됨(항상 저장된 값만 읽어야 함 — 위 파일 설명 참고).
export async function refreshDailyOutlook(redis) {
  const [gainers, news] = await Promise.all([fetchTopGainers(), fetchTechNews()]);
  const summary = await synthesizeOutlook(gainers, news);
  if (!summary) throw new Error("AI 요약 생성 실패(근거 부족 또는 파싱 실패)");

  const now = new Date();
  const record = {
    dateLabel: toKoreanDateLabel(now),
    summary,
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
