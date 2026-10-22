// lib/decodeEntities.js
//
// [2026-10-21 신설] 뉴스 제목에 &#039; 같은 글자가 그대로 보이는 문제를
// 고치는 곳입니다.
//
// 재성님이 보신 화면:
//   [단독] ... 中 AI 해킹도구 &#039;아르텍스&#039; 한국어판까지 등장
// 제대로 나와야 하는 모습:
//   [단독] ... 中 AI 해킹도구 '아르텍스' 한국어판까지 등장
//
// ── 왜 이런 일이 생기나 ───────────────────────────────────────────────
// 뉴스를 받아오는 통로(RSS)는 원래 문서 형식이라, 따옴표나 &, < > 같이
// 문서 구조와 헷갈릴 수 있는 글자를 "암호처럼" 바꿔서 보냅니다.
//   '  ->  &#039;
//   "  ->  &quot;
//   &  ->  &amp;
// 보통은 받는 쪽에서 원래 글자로 되돌려주는데, 우리 쪽에 그 되돌리는
// 단계가 아예 없었습니다. 그래서 암호 상태 그대로 화면에 찍혔습니다.
//
// 왜 지금까지 몰랐나: 따옴표가 들어간 제목이 드물어서입니다. 이번처럼
// 도구 이름을 '아르텍스' 로 감싼 제목이 와야 드러납니다.
//
// ── 왜 화면 쪽에서 고치나 ─────────────────────────────────────────────
// 뉴스를 받아 저장하는 단계에서 고치면 **앞으로 들어올 기사만** 깨끗해지고,
// 이미 쌓인 기사는 계속 깨진 채로 남습니다. 화면에 뿌리기 직전에 되돌리면
// 예전 기사까지 한 번에 정상으로 보입니다. 저장된 내용은 건드리지 않으니
// 되돌리기도 쉽습니다.
//
// ── 안전장치 ─────────────────────────────────────────────────────────
// 글자를 "되돌리는" 작업이라 위험해 보일 수 있지만, 아래는 정해진 목록에
// 있는 것과 숫자 코드만 바꿉니다. <script> 같은 태그를 만들어낼 수 있는
// &lt; &gt; 는 **일부러 되돌리지 않습니다.** 화면에 < > 가 필요한 제목은
// 사실상 없고, 되돌렸다가 나중에 누군가 그 글자를 그대로 쓰면 보안 구멍이
// 될 수 있기 때문입니다.

// 자주 오는 것들만 적어둡니다. 필요하면 여기에 한 줄씩 추가하면 됩니다.
const NAMED = {
  "&quot;": '"',
  "&apos;": "'",
  "&amp;": "&",
  "&nbsp;": " ",
  "&middot;": "·",
  "&hellip;": "…",
  "&ndash;": "–",
  "&mdash;": "—",
  "&lsquo;": "‘",
  "&rsquo;": "’",
  "&ldquo;": "“",
  "&rdquo;": "”",
};

// 되돌리면 안 되는 것 — 태그로 둔갑할 수 있는 글자입니다.
const BLOCKED = new Set([60, 62]); // < 와 >

function once(text) {
  return (
    text
      // &#039; (십진수) 와 &#x27; (십육진수) 둘 다 처리합니다.
      .replace(/&#(\d+);/g, (whole, digits) => {
        const code = Number(digits);
        if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return whole;
        if (BLOCKED.has(code)) return whole;
        return String.fromCodePoint(code);
      })
      .replace(/&#x([0-9a-fA-F]+);/g, (whole, hex) => {
        const code = parseInt(hex, 16);
        if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return whole;
        if (BLOCKED.has(code)) return whole;
        return String.fromCodePoint(code);
      })
      // 이름으로 된 것들.
      .replace(/&[a-zA-Z]+;/g, (whole) => NAMED[whole.toLowerCase()] ?? whole)
  );
}

// 글자를 원래대로 되돌립니다.
//
// 두 번 돌리는 이유: 뉴스 제공처가 가끔 두 겹으로 싸서 보냅니다
// (&amp;#039; -> 한 번 풀면 &#039; -> 두 번 풀어야 ' 가 됩니다).
// 두 번까지만 돌리고 멈춥니다 — 끝없이 돌면 느려지고, 실제로 세 겹인
// 경우는 없습니다.
export function decodeEntities(value) {
  if (typeof value !== "string" || value.indexOf("&") === -1) return value;
  const first = once(value);
  if (first.indexOf("&") === -1) return first;
  return once(first);
}

export default decodeEntities;
