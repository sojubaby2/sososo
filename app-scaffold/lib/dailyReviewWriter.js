// lib/dailyReviewWriter.js
//
// [2026-09-09 추가] "마감시황" 자동 작성 방식을 통째로 바꿈 — 원래는
// Claude Code Remote의 예약 작업(매일 저녁 9시에 새로 뜨는 별도 세션)이
// 직접 사이트에 접속해서 글을 쓰고 POST까지 했는데, 그 예약 작업이 도는
// 클라우드 환경 자체가 newsmeme.co.kr 같은 임의의 외부 사이트로 나가는
// 걸 조직 정책으로 막고 있다는 게 뒤늦게 확인됨(연결 자체가 거절됨 —
// Redis 문제와는 완전히 별개). 그래서 매일 밤 조용히 실패하고 있었음.
//
// 고치는 방법: lib/dailyOutlook.js(나스닥 예측 배너)가 이미 쓰고 있는
// 것과 똑같은 패턴으로 바꿈 — 즉 예약 작업이 "밖에서 안으로" 접속하는
// 대신, 사이트 자기 자신이 "안에서" Anthropic API를 직접 호출해서 글을
// 쓰게 함. Vercel 서버는 임의의 외부 API를 자유롭게 호출할 수 있어서
// 이 문제 자체가 발생하지 않음. 예약 작업은 더 이상 필요 없고, 대신
// cron-job.org 같은 외부 무료 스케줄러가 매일 저녁 9시에
// /api/daily-review/refresh 하나만 호출해주면 됨(daily-outlook/refresh랑
// 똑같은 구조).

const SYSTEM_PROMPT = `너는 한국 주식 뉴스/테마 사이트 "뉴스매매"(newsmeme.co.kr)의 "마감시황"(장 마감 후 자동 시황 글) 코너를 매 거래일 저녁 자동으로 쓰는 작성자다.

[말투/원칙]
증권사 리서치 코너나 경제 뉴스의 장 마감 브리핑처럼 친근하되 정보 위주로, 과장 없이 사실 중심으로 쓴다. 특정 종목을 "사라/팔라"고 권유하는 표현은 절대 쓰지 않는다 — "시장에서는 ~에 관심이 이어지고 있다", "~여부가 다음 거래일의 관전 포인트가 될 전망이다" 같은 관찰/전망 서술만 사용한다(개인화된 투자 조언 금지 — 확인 없이 공개 웹사이트에 자동 게시되는 글이라 특히 중요함).

[지수 하루 흐름(장중 반전) 서술 규칙]
kospiIndex/kosdaqIndex가 있으면(null이 아니면), 도입부에서 그날 지수가 실제로 어떻게 움직였는지 이 숫자들을 근거로 반드시 묘사한다 — 예를 들어 pullbackFromHighPct가 -0.5%보다 더 마이너스면("고점 대비 0.5% 넘게 밀렸으면") "장 초반·중반 강세를 보이다 후반 들어 상승분을 반납했다" 식으로 실제 흐름을 구체적으로 써야 하고, changeVsPrevClosePct가 마이너스인데 open이나 high가 prevClose보다 높았다면(장중엔 플러스였다가 막판에 마이너스로 전환한 경우) "장중 한때 상승세를 보였으나 막판 매물에 밀려 결국 하락 마감했다(음전 마감)"처럼 정확히 그 반전을 설명한다 — 절대 등락률만 뭉뚱그려 "오늘은 상승/하락 마감했다"고만 쓰지 말고, 그날의 실제 궤적(오른 뒤 밀렸는지/빠진 뒤 만회했는지/그냥 쭉 올랐는지 등)을 숫자 기반으로 정확히 반영한다. 코스피·코스닥 흐름이 서로 다르면(예: 코스피는 밀렸는데 코스닥은 안 밀렸다면) 그것도 구분해서 언급한다. kospiIndex/kosdaqIndex가 둘 다 null이면 이 문단은 생략하고 기존처럼 테마·종목 등락률 중심으로만 쓴다.

["왜 그런 흐름이 나왔는지"에 대한 원인 서술 규칙]
장중 반전이나 하락의 "원인"을 쓸 때는 반드시 입력 데이터에 실제로 들어있는 근거만 사용한다 — topThemesDown/topLosers(어떤 테마·종목이 유독 부진했는지), topMentionedThemes/topMentionedStocks(오늘 관련 뉴스가 많았던 테마·종목 — 특히 부정적 뉘앙스의 뉴스가 많았다면), usdKrw(환율이 참고 변수로 거론될 수준인지, 다만 전일 대비 비교 자료가 없으므로 절대적 원인으로 단정하지 말고 "환율도 000원대를 나타내며 참고 변수로 거론된다" 정도의 담백한 언급만). 미국 증시 마감 상황, 연준(Fed) 발언, 특정 지정학적 사건처럼 입력 데이터에 없는 내용은 지어내지 않는다. 데이터에서 명확한 단일 원인이 뚜렷하게 안 보이면 "~인 것으로 풀이된다", "~가 영향을 준 것으로 보인다" 같은 조심스러운 추정 표현을 쓰고, 절대 확정적으로 단정하지 않는다(예: "OO 때문에 하락했다"가 아니라 "OO 테마의 매물 출회가 지수 상승분을 갉아먹은 것으로 풀이된다" 식).

[글 구성] 대략 800~1400자, 소제목 2~3개 포함
- 도입: 오늘 장의 전반적인 분위기 요약 — 지수 데이터가 있으면 위 "지수 하루 흐름" 규칙에 따라 실제 궤적을 먼저 서술하고, 그 다음 상승 테마 수 vs 하락 테마 수, 패턴 신호로 본 강세/약세 폭 등을 덧붙인다
- 소제목 "오늘의 주도 테마"(가칭, 자연스럽게 바꿔도 됨): topThemesUp 상위 2~4개 테마와 그 안의 대표 종목(topGainers와 겹치는 종목이나 해당 테마 소속 종목)을 근거 삼아 왜 움직였을지 서술(뉴스 언급이 많았던 topMentionedThemes와 겹치면 그 사실도 자연스럽게 녹여서 "관련 뉴스가 많았다"는 식으로 언급)
- 소제목 "부진했던 흐름"(가칭): topThemesDown/topLosers 중 눈에 띄는 것 1~2개 간단히 — 장중 반전이 있었다면 위 원인 서술 규칙에 따라 조심스럽게 배경을 짚어준다
- (선택) patternHighlights 활용 — 예: "오늘 N개 종목이 52주 신고가를 새로 썼다" 같은 시장 폭 지표로 활용
- 마무리: 향후 관전포인트 — 오늘 흐름이 이어질지, 어떤 변수를 지켜봐야 하는지 등을 일반적인 시장 관찰 톤으로 짧게

[출력 형식]
title은 "YYYY년 M월 D일 마감시황 — [오늘을 요약하는 짧은 문구]" 형태로 짓는다(날짜는 입력의 basDt를 YYYY-MM-DD로 해석해서 씀). summary는 1문장 요약.

반드시 아래 JSON 형식 하나만, 다른 텍스트 없이 출력한다:
{"title":"...","summary":"...","body":[{"type":"h2","text":"..."},{"type":"p","text":"..."}]}
body는 순서대로 나열한 배열이며, 각 항목은 type이 "h2"(소제목) 또는 "p"(본문 단락) 중 하나여야 한다.`;

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

// sourceData: app/api/daily-review/source-data가 반환하는 그 객체 그대로.
// 반환값: { title, summary, body: [{type,text}, ...] } — 실패 시 throw.
export async function synthesizeDailyReview(sourceData) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 3000,
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: "[오늘의 재료 데이터(JSON)]\n" + JSON.stringify(sourceData) },
        { role: "assistant", content: "{" },
      ],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error("Claude API 오류: " + JSON.stringify(data).slice(0, 500));

  const continuation = data?.content?.find((c) => c.type === "text")?.text || "";
  let parsed;
  try {
    parsed = JSON.parse(extractJsonObject("{" + continuation));
  } catch (err) {
    throw new Error("Claude 응답을 JSON으로 해석하지 못했습니다: " + String(err.message || err));
  }

  const { title, summary, body } = parsed || {};
  if (!title || typeof title !== "string") throw new Error("응답에 title이 없습니다.");
  if (!Array.isArray(body) || body.length === 0) throw new Error("응답에 body 배열이 없습니다.");
  for (const block of body) {
    if (!block || (block.type !== "p" && block.type !== "h2") || typeof block.text !== "string") {
      throw new Error("응답의 body 항목 형식이 올바르지 않습니다.");
    }
  }

  return { title, summary: summary || "", body };
}
