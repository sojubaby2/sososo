// components/BlogThumbnail.js
//
// 칼럼 글마다 어울리는 작은 아이콘 삽화를 자동으로 붙여줌 — 사진을 따로
// 구할 필요 없이(저작권 문제도 피하고) 사이트 색상(--amber 등)에 맞춘
// 순수 SVG 라인아트라 어떤 화면 크기에서도 깨끗하게 보이고, 로딩도
// 빠름. app/globals.css에 이미 있던 데모 애니메이션 클래스(demo-fade-in,
// demo-dot-pop)를 그대로 재사용해서 살짝 등장하는 느낌만 줌.
//
// 새 글을 추가할 때 이 파일의 THUMBNAILS 객체에 slug를 키로 하는 SVG를
// 하나 추가하면 됨. 없는 slug면 기본 아이콘(DEFAULT)으로 대체됨.

function BigMacIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none">
      <path className="demo-fade-in" d="M13 27 Q32 10 51 27" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" style={{ animationDelay: "0ms" }} />
      <path className="demo-dot-pop" d="M12 31 Q20 27 27 31 Q34 27 41 31 Q48 27 52 31" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animationDelay: "120ms" }} />
      <rect className="demo-dot-pop" x="11" y="34" width="42" height="6" rx="3" fill="currentColor" opacity="0.85" style={{ animationDelay: "220ms" }} />
      <rect className="demo-dot-pop" x="11" y="43" width="42" height="9" rx="4.5" fill="currentColor" style={{ animationDelay: "320ms" }} />
    </svg>
  );
}

function TulipIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none">
      <path
        className="demo-dot-pop"
        d="M32 12c-6 0-10 5-8 11-4-2-9 0-9 5 0 7 8 12 17 12s17-5 17-12c0-5-5-7-9-5 2-6-2-11-8-11z"
        fill="currentColor"
      />
      <line className="demo-draw-line" x1="32" y1="40" x2="32" y2="53" stroke="currentColor" strokeWidth="3" strokeLinecap="round" style={{ animationDelay: "150ms" }} />
      <path className="demo-fade-in" d="M10 48 L24 36 L34 44 L54 22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="3 4" opacity="0.55" style={{ animationDelay: "300ms" }} />
    </svg>
  );
}

function HyperinflationIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none">
      <rect className="demo-fade-in" x="8" y="19" width="48" height="28" rx="4" stroke="currentColor" strokeWidth="3" />
      <circle className="demo-dot-pop" cx="24" cy="33" r="6.5" stroke="currentColor" strokeWidth="2.5" style={{ animationDelay: "120ms" }} />
      <circle className="demo-dot-pop" cx="38" cy="33" r="6.5" stroke="currentColor" strokeWidth="2.5" style={{ animationDelay: "220ms" }} />
      <path className="demo-draw-line" d="M46 30 L50 30 L50 16 L54 16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none" style={{ animationDelay: "340ms" }} />
    </svg>
  );
}

function ShipBubbleIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none">
      <circle className="demo-fade-in" cx="32" cy="30" r="21" stroke="currentColor" strokeWidth="2" strokeDasharray="4 5" opacity="0.6" />
      <path className="demo-dot-pop" d="M20 38 L44 38 L40 46 L24 46 Z" fill="currentColor" style={{ animationDelay: "150ms" }} />
      <path className="demo-dot-pop" d="M32 20 L32 38" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animationDelay: "220ms" }} />
      <path className="demo-dot-pop" d="M32 20 L44 32 L32 34 Z" fill="currentColor" style={{ animationDelay: "280ms" }} />
      <path className="demo-dot-pop" d="M32 24 L23 32 L32 34 Z" fill="currentColor" opacity="0.7" style={{ animationDelay: "340ms" }} />
    </svg>
  );
}

function ScrollIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none">
      <rect className="demo-fade-in" x="14" y="14" width="36" height="36" rx="3" stroke="currentColor" strokeWidth="3" />
      <line className="demo-dot-pop" x1="20" y1="24" x2="44" y2="24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animationDelay: "140ms" }} />
      <line className="demo-dot-pop" x1="20" y1="31" x2="44" y2="31" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animationDelay: "220ms" }} />
      <line className="demo-dot-pop" x1="20" y1="38" x2="34" y2="38" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animationDelay: "300ms" }} />
      <circle className="demo-dot-pop" cx="44" cy="44" r="6" fill="currentColor" style={{ animationDelay: "380ms" }} />
    </svg>
  );
}

function DefaultIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none">
      <circle className="demo-fade-in" cx="32" cy="32" r="18" stroke="currentColor" strokeWidth="3" />
      <path className="demo-dot-pop" d="M26 32 L32 38 L40 26" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ animationDelay: "150ms" }} />
    </svg>
  );
}

function SubmarineIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none">
      <ellipse className="demo-fade-in" cx="30" cy="34" rx="20" ry="8" stroke="currentColor" strokeWidth="3" />
      <path className="demo-dot-pop" d="M30 26 L30 16 M25 16 L35 16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animationDelay: "140ms" }} />
      <circle className="demo-dot-pop" cx="20" cy="34" r="2.4" fill="currentColor" style={{ animationDelay: "220ms" }} />
      <circle className="demo-dot-pop" cx="30" cy="34" r="2.4" fill="currentColor" style={{ animationDelay: "280ms" }} />
      <circle className="demo-dot-pop" cx="40" cy="34" r="2.4" fill="currentColor" style={{ animationDelay: "340ms" }} />
      <path className="demo-draw-line" d="M8 48 Q16 44 24 48 Q32 44 40 48 Q48 44 56 48" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.55" style={{ animationDelay: "420ms" }} />
    </svg>
  );
}

function WheelbarrowIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none">
      <circle className="demo-fade-in" cx="18" cy="46" r="6" stroke="currentColor" strokeWidth="3" />
      <path className="demo-dot-pop" d="M24 46 L46 46 L52 28 L30 28 Z" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" style={{ animationDelay: "120ms" }} />
      <line className="demo-dot-pop" x1="30" y1="28" x2="24" y2="46" stroke="currentColor" strokeWidth="2.5" style={{ animationDelay: "200ms" }} />
      <path className="demo-draw-line" d="M35 34 L45 34 M35 39 L45 39" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.7" style={{ animationDelay: "300ms" }} />
    </svg>
  );
}

function CompassIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none">
      <circle className="demo-fade-in" cx="32" cy="32" r="20" stroke="currentColor" strokeWidth="3" />
      <path className="demo-dot-pop" d="M32 20 L37 30 L32 44 L27 30 Z" fill="currentColor" style={{ animationDelay: "150ms" }} />
      <circle className="demo-dot-pop" cx="32" cy="32" r="2.5" fill="currentColor" style={{ animationDelay: "260ms" }} />
    </svg>
  );
}

function WaveHouseIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none">
      <path className="demo-dot-pop" d="M18 34 L32 20 L46 34 L46 48 L18 48 Z" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" style={{ animationDelay: "100ms" }} />
      <line className="demo-fade-in" x1="32" y1="20" x2="32" y2="12" stroke="currentColor" strokeWidth="2" />
      <path className="demo-draw-line" d="M8 52 Q16 46 24 52 Q32 46 40 52 Q48 46 56 52" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animationDelay: "260ms" }} />
    </svg>
  );
}

function PyramidIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none">
      <path className="demo-fade-in" d="M32 12 L54 48 L10 48 Z" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      <line className="demo-dot-pop" x1="18" y1="36" x2="46" y2="36" stroke="currentColor" strokeWidth="2" style={{ animationDelay: "140ms" }} />
      <line className="demo-dot-pop" x1="24" y1="24" x2="40" y2="24" stroke="currentColor" strokeWidth="2" style={{ animationDelay: "220ms" }} />
      <circle className="demo-dot-pop" cx="32" cy="18" r="2.5" fill="currentColor" style={{ animationDelay: "300ms" }} />
    </svg>
  );
}

function SnakeIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none">
      <path className="demo-draw-line" d="M14 46 Q14 28 26 28 Q38 28 38 40 Q38 50 26 50" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" fill="none" />
      <path className="demo-dot-pop" d="M38 24 Q47 21 51 30 Q46 33 41 30 Z" fill="currentColor" style={{ animationDelay: "220ms" }} />
      <circle className="demo-dot-pop" cx="46" cy="27" r="1.6" fill="var(--surface)" style={{ animationDelay: "320ms" }} />
    </svg>
  );
}

function GlassPaneIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none">
      <rect className="demo-fade-in" x="14" y="12" width="36" height="40" rx="2" stroke="currentColor" strokeWidth="3" />
      <line className="demo-dot-pop" x1="14" y1="32" x2="50" y2="32" stroke="currentColor" strokeWidth="2" style={{ animationDelay: "140ms" }} />
      <line className="demo-dot-pop" x1="32" y1="12" x2="32" y2="52" stroke="currentColor" strokeWidth="2" style={{ animationDelay: "220ms" }} />
      <path className="demo-draw-line" d="M20 20 L26 26" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.6" style={{ animationDelay: "320ms" }} />
    </svg>
  );
}

function FootprintsIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none">
      <ellipse className="demo-dot-pop" cx="20" cy="20" rx="5" ry="8" fill="currentColor" />
      <ellipse className="demo-dot-pop" cx="38" cy="34" rx="5" ry="8" fill="currentColor" style={{ animationDelay: "140ms" }} />
      <ellipse className="demo-dot-pop" cx="22" cy="48" rx="5" ry="8" fill="currentColor" style={{ animationDelay: "280ms" }} />
      <path className="demo-draw-line" d="M14 8 Q32 4 50 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.5" style={{ animationDelay: "400ms" }} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// [2026-09-14 추가] "현대편" 칼럼 10편(lib/blogPostsModern.js)용 아이콘.
// 위 아이콘들과 같은 규칙 — viewBox 64x64, currentColor만 사용, 기존 애니메이션
// 클래스(demo-fade-in / demo-dot-pop / demo-draw-line) 재사용.
// ---------------------------------------------------------------------------

// 드비어스 다이아몬드 — 잘린 보석
function DiamondIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none">
      <path className="demo-fade-in" d="M14 14 H50 L58 26 L32 55 L6 26 Z" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      <line className="demo-dot-pop" x1="6" y1="26" x2="58" y2="26" stroke="currentColor" strokeWidth="2.5" style={{ animationDelay: "140ms" }} />
      <line className="demo-dot-pop" x1="22" y1="26" x2="32" y2="55" stroke="currentColor" strokeWidth="2.5" style={{ animationDelay: "220ms" }} />
      <line className="demo-dot-pop" x1="42" y1="26" x2="32" y2="55" stroke="currentColor" strokeWidth="2.5" style={{ animationDelay: "300ms" }} />
      <line className="demo-dot-pop" x1="14" y1="14" x2="22" y2="26" stroke="currentColor" strokeWidth="2.5" opacity="0.6" style={{ animationDelay: "380ms" }} />
      <line className="demo-dot-pop" x1="50" y1="14" x2="42" y2="26" stroke="currentColor" strokeWidth="2.5" opacity="0.6" style={{ animationDelay: "440ms" }} />
    </svg>
  );
}

// 리먼 브라더스 — 기둥이 무너지는 은행 건물
function CollapsingBankIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none">
      <path className="demo-fade-in" d="M10 22 L32 11 L54 22" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <line className="demo-dot-pop" x1="18" y1="27" x2="18" y2="45" stroke="currentColor" strokeWidth="3" strokeLinecap="round" style={{ animationDelay: "120ms" }} />
      <line className="demo-dot-pop" x1="30" y1="27" x2="30" y2="45" stroke="currentColor" strokeWidth="3" strokeLinecap="round" style={{ animationDelay: "200ms" }} />
      <line className="demo-dot-pop" x1="42" y1="28" x2="47" y2="44" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.55" style={{ animationDelay: "280ms" }} />
      <rect className="demo-dot-pop" x="9" y="47" width="46" height="6" rx="3" fill="currentColor" style={{ animationDelay: "360ms" }} />
    </svg>
  );
}

// 닷컴 버블 — 커서가 찍힌 비눗방울
function DotcomBubbleIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none">
      <circle className="demo-fade-in" cx="28" cy="28" r="17" stroke="currentColor" strokeWidth="3" />
      <path className="demo-dot-pop" d="M21 20 Q25 16 30 16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.6" style={{ animationDelay: "140ms" }} />
      <circle className="demo-dot-pop" cx="48" cy="15" r="4" stroke="currentColor" strokeWidth="2" style={{ animationDelay: "220ms" }} />
      <circle className="demo-dot-pop" cx="12" cy="50" r="3" stroke="currentColor" strokeWidth="2" opacity="0.7" style={{ animationDelay: "300ms" }} />
      <path className="demo-dot-pop" d="M36 36 L52 44 L44 47 L48 55 L44 57 L40 49 L34 53 Z" fill="currentColor" style={{ animationDelay: "380ms" }} />
    </svg>
  );
}

// 엔론 — 뒤집힌 장부(가려진 숫자)
function CookedBooksIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none">
      <path className="demo-fade-in" d="M12 14 h26 a6 6 0 0 1 6 6 v30 h-26 a6 6 0 0 1 -6 -6 Z" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      <line className="demo-dot-pop" x1="19" y1="24" x2="37" y2="24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animationDelay: "140ms" }} />
      <line className="demo-dot-pop" x1="19" y1="31" x2="37" y2="31" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.55" style={{ animationDelay: "220ms" }} />
      <line className="demo-dot-pop" x1="19" y1="38" x2="30" y2="38" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.35" style={{ animationDelay: "300ms" }} />
      <path className="demo-draw-line" d="M40 18 L56 52" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" style={{ animationDelay: "400ms" }} />
    </svg>
  );
}

// 베어링스 / 닉 리슨 — 숨긴 서랍
function HiddenDrawerIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none">
      <rect className="demo-fade-in" x="11" y="13" width="42" height="38" rx="4" stroke="currentColor" strokeWidth="3" />
      <line className="demo-dot-pop" x1="11" y1="26" x2="53" y2="26" stroke="currentColor" strokeWidth="2.5" style={{ animationDelay: "140ms" }} />
      <circle className="demo-dot-pop" cx="32" cy="20" r="2.4" fill="currentColor" style={{ animationDelay: "200ms" }} />
      <rect className="demo-dot-pop" x="16" y="31" width="36" height="15" rx="3" fill="currentColor" opacity="0.9" style={{ animationDelay: "300ms" }} />
      <line className="demo-dot-pop" x1="27" y1="38" x2="41" y2="38" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.25" style={{ animationDelay: "400ms" }} />
    </svg>
  );
}

// LTCM — 매끄러운 곡선이 한 점에서 꺾이는 모형
function BrokenModelIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none">
      <path className="demo-fade-in" d="M8 46 Q20 40 30 34 Q38 29 44 26" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path className="demo-draw-line" d="M44 26 L50 54" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" style={{ animationDelay: "240ms" }} />
      <circle className="demo-dot-pop" cx="44" cy="26" r="4.5" fill="currentColor" style={{ animationDelay: "360ms" }} />
      <path className="demo-fade-in" d="M8 14 L8 56 L56 56" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.35" style={{ animationDelay: "120ms" }} />
      <path className="demo-dot-pop" d="M44 26 Q50 22 56 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="3 4" opacity="0.5" style={{ animationDelay: "440ms" }} />
    </svg>
  );
}

// 폭스바겐 숏스퀴즈 — 위로 솟구치는 막대 + 눌린 화살표
function SqueezeIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none">
      <rect className="demo-dot-pop" x="13" y="42" width="8" height="12" rx="2" fill="currentColor" opacity="0.45" />
      <rect className="demo-dot-pop" x="26" y="34" width="8" height="20" rx="2" fill="currentColor" opacity="0.65" style={{ animationDelay: "120ms" }} />
      <rect className="demo-dot-pop" x="39" y="10" width="9" height="44" rx="3" fill="currentColor" style={{ animationDelay: "260ms" }} />
      <path className="demo-draw-line" d="M55 26 L55 14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animationDelay: "380ms" }} />
      <path className="demo-dot-pop" d="M51 18 L55 12 L59 18 Z" fill="currentColor" style={{ animationDelay: "440ms" }} />
    </svg>
  );
}

// 나이트 캐피털 — 45분을 가리키는 시계
function StopwatchIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none">
      <circle className="demo-fade-in" cx="32" cy="36" r="18" stroke="currentColor" strokeWidth="3" />
      <line className="demo-dot-pop" x1="26" y1="11" x2="38" y2="11" stroke="currentColor" strokeWidth="3" strokeLinecap="round" style={{ animationDelay: "120ms" }} />
      <line className="demo-dot-pop" x1="32" y1="11" x2="32" y2="18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" style={{ animationDelay: "180ms" }} />
      <line className="demo-draw-line" x1="32" y1="36" x2="32" y2="24" stroke="currentColor" strokeWidth="3" strokeLinecap="round" style={{ animationDelay: "280ms" }} />
      <line className="demo-draw-line" x1="32" y1="36" x2="21" y2="36" stroke="currentColor" strokeWidth="3" strokeLinecap="round" style={{ animationDelay: "380ms" }} />
      <circle className="demo-dot-pop" cx="32" cy="36" r="3" fill="currentColor" style={{ animationDelay: "460ms" }} />
    </svg>
  );
}

// 비트코인 피자데이 — 한 조각 빠진 피자
function PizzaSliceIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none">
      <circle className="demo-fade-in" cx="32" cy="32" r="20" stroke="currentColor" strokeWidth="3" />
      <path className="demo-dot-pop" d="M32 32 L52 32 A20 20 0 0 0 44 15 Z" fill="currentColor" opacity="0.9" style={{ animationDelay: "180ms" }} />
      <circle className="demo-dot-pop" cx="24" cy="26" r="2.8" fill="currentColor" style={{ animationDelay: "260ms" }} />
      <circle className="demo-dot-pop" cx="22" cy="39" r="2.8" fill="currentColor" style={{ animationDelay: "330ms" }} />
      <circle className="demo-dot-pop" cx="35" cy="43" r="2.8" fill="currentColor" style={{ animationDelay: "400ms" }} />
      <path className="demo-draw-line" d="M32 6 L32 12 M32 52 L32 58" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.5" style={{ animationDelay: "460ms" }} />
    </svg>
  );
}

// 블랙 먼데이 — 절벽처럼 떨어지는 선
function CliffDropIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none">
      <path className="demo-fade-in" d="M8 12 L8 54 L56 54" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.35" />
      <path className="demo-draw-line" d="M12 24 L20 20 L28 23 L34 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path className="demo-draw-line" d="M34 18 L38 48" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" style={{ animationDelay: "280ms" }} />
      <path className="demo-dot-pop" d="M33 42 L38 52 L43 42 Z" fill="currentColor" style={{ animationDelay: "420ms" }} />
      <path className="demo-dot-pop" d="M44 46 L52 44" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.5" style={{ animationDelay: "480ms" }} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// [2026-09-18 추가] 현대·근현대편 2차 10편용 아이콘.
// ---------------------------------------------------------------------------

// IMF 외환위기 — 바닥을 드러낸 금고
function EmptyVaultIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none">
      <rect className="demo-fade-in" x="10" y="14" width="44" height="38" rx="4" stroke="currentColor" strokeWidth="3" />
      <circle className="demo-dot-pop" cx="32" cy="31" r="9" stroke="currentColor" strokeWidth="2.5" style={{ animationDelay: "140ms" }} />
      <line className="demo-dot-pop" x1="32" y1="31" x2="32" y2="23" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animationDelay: "220ms" }} />
      <line className="demo-dot-pop" x1="32" y1="31" x2="39" y2="36" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animationDelay: "290ms" }} />
      <path className="demo-draw-line" d="M16 46 L28 46" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.4" style={{ animationDelay: "380ms" }} />
    </svg>
  );
}

// 사토시 — 물음표가 들어간 사람 실루엣
function AnonymousIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none">
      <circle className="demo-fade-in" cx="32" cy="23" r="11" stroke="currentColor" strokeWidth="3" />
      <path className="demo-dot-pop" d="M13 52 C13 41 21 36 32 36 C43 36 51 41 51 52" stroke="currentColor" strokeWidth="3" strokeLinecap="round" style={{ animationDelay: "160ms" }} />
      <path className="demo-dot-pop" d="M28 20 Q28 15 32 15 Q36 15 36 19 Q36 22 32 24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animationDelay: "300ms" }} />
      <circle className="demo-dot-pop" cx="32" cy="28" r="1.8" fill="currentColor" style={{ animationDelay: "400ms" }} />
    </svg>
  );
}

// 동인도회사 — 돛을 올린 범선
function TallShipIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none">
      <path className="demo-dot-pop" d="M12 44 L52 44 L46 53 L18 53 Z" fill="currentColor" />
      <line className="demo-fade-in" x1="32" y1="10" x2="32" y2="44" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path className="demo-dot-pop" d="M34 13 L48 24 L34 27 Z" fill="currentColor" style={{ animationDelay: "160ms" }} />
      <path className="demo-dot-pop" d="M34 30 L46 38 L34 40 Z" fill="currentColor" opacity="0.8" style={{ animationDelay: "240ms" }} />
      <path className="demo-dot-pop" d="M30 16 L19 26 L30 28 Z" fill="currentColor" opacity="0.6" style={{ animationDelay: "320ms" }} />
    </svg>
  );
}

// 워털루 전설 — 소문이 퍼지는 모양(말풍선 + 물음표)
function RumorIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none">
      <path className="demo-fade-in" d="M10 16 h38 a4 4 0 0 1 4 4 v18 a4 4 0 0 1 -4 4 h-20 l-10 8 v-8 h-8 a4 4 0 0 1 -4 -4 v-18 a4 4 0 0 1 4 -4 z" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      <path className="demo-dot-pop" d="M25 25 Q25 21 29 21 Q33 21 33 25 Q33 28 29 29" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animationDelay: "200ms" }} />
      <circle className="demo-dot-pop" cx="29" cy="34" r="1.8" fill="currentColor" style={{ animationDelay: "300ms" }} />
      <circle className="demo-dot-pop" cx="55" cy="49" r="3" stroke="currentColor" strokeWidth="2" opacity="0.6" style={{ animationDelay: "380ms" }} />
    </svg>
  );
}

// 신용카드 — 카드 한 장
function CreditCardIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none">
      <rect className="demo-fade-in" x="7" y="17" width="50" height="31" rx="4" stroke="currentColor" strokeWidth="3" />
      <rect className="demo-dot-pop" x="7" y="24" width="50" height="7" fill="currentColor" style={{ animationDelay: "150ms" }} />
      <rect className="demo-dot-pop" x="14" y="36" width="14" height="6" rx="1.5" stroke="currentColor" strokeWidth="2" style={{ animationDelay: "260ms" }} />
      <line className="demo-dot-pop" x1="35" y1="42" x2="50" y2="42" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.6" style={{ animationDelay: "340ms" }} />
    </svg>
  );
}

// 조개 화폐 — 조개껍데기
function SeashellIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none">
      <path className="demo-fade-in" d="M32 50 C16 50 8 38 8 27 C8 18 14 12 20 12 C25 12 28 16 32 16 C36 16 39 12 44 12 C50 12 56 18 56 27 C56 38 48 50 32 50 Z" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      <path className="demo-draw-line" d="M32 18 L32 49" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.6" style={{ animationDelay: "200ms" }} />
      <path className="demo-draw-line" d="M22 16 L17 44" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.45" style={{ animationDelay: "290ms" }} />
      <path className="demo-draw-line" d="M42 16 L47 44" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.45" style={{ animationDelay: "380ms" }} />
    </svg>
  );
}

// 연준 탄생 — 기둥 있는 관청 건물 + 자물쇠
function CentralBankIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none">
      <path className="demo-fade-in" d="M8 23 L32 11 L56 23" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <line className="demo-dot-pop" x1="17" y1="28" x2="17" y2="44" stroke="currentColor" strokeWidth="3" strokeLinecap="round" style={{ animationDelay: "130ms" }} />
      <line className="demo-dot-pop" x1="32" y1="28" x2="32" y2="44" stroke="currentColor" strokeWidth="3" strokeLinecap="round" style={{ animationDelay: "210ms" }} />
      <line className="demo-dot-pop" x1="47" y1="28" x2="47" y2="44" stroke="currentColor" strokeWidth="3" strokeLinecap="round" style={{ animationDelay: "290ms" }} />
      <rect className="demo-dot-pop" x="8" y="47" width="48" height="6" rx="3" fill="currentColor" style={{ animationDelay: "370ms" }} />
    </svg>
  );
}

// 케인스 vs 하이에크 — 마주 보는 두 화살표
function DebateIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none">
      <circle className="demo-fade-in" cx="18" cy="22" r="8" stroke="currentColor" strokeWidth="3" />
      <circle className="demo-fade-in" cx="46" cy="22" r="8" stroke="currentColor" strokeWidth="3" style={{ animationDelay: "120ms" }} />
      <path className="demo-draw-line" d="M14 44 L30 44" stroke="currentColor" strokeWidth="3" strokeLinecap="round" style={{ animationDelay: "240ms" }} />
      <path className="demo-dot-pop" d="M26 40 L32 44 L26 48 Z" fill="currentColor" style={{ animationDelay: "320ms" }} />
      <path className="demo-draw-line" d="M50 52 L34 52" stroke="currentColor" strokeWidth="3" strokeLinecap="round" style={{ animationDelay: "400ms" }} />
      <path className="demo-dot-pop" d="M38 48 L32 52 L38 56 Z" fill="currentColor" style={{ animationDelay: "470ms" }} />
    </svg>
  );
}

// 그리스 위기 — 금 간 그리스 기둥
function CrackedColumnIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none">
      <rect className="demo-fade-in" x="16" y="10" width="32" height="6" rx="2" stroke="currentColor" strokeWidth="3" />
      <rect className="demo-dot-pop" x="14" y="48" width="36" height="6" rx="2" fill="currentColor" style={{ animationDelay: "320ms" }} />
      <line className="demo-dot-pop" x1="23" y1="18" x2="23" y2="46" stroke="currentColor" strokeWidth="3" strokeLinecap="round" style={{ animationDelay: "140ms" }} />
      <line className="demo-dot-pop" x1="41" y1="18" x2="41" y2="46" stroke="currentColor" strokeWidth="3" strokeLinecap="round" style={{ animationDelay: "220ms" }} />
      <path className="demo-draw-line" d="M32 18 L28 28 L36 34 L31 46" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animationDelay: "420ms" }} />
    </svg>
  );
}

// 그레셤의 법칙 — 좋은 동전과 나쁜 동전
function TwoCoinsIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none">
      <circle className="demo-fade-in" cx="23" cy="28" r="14" stroke="currentColor" strokeWidth="3" />
      <circle className="demo-dot-pop" cx="23" cy="28" r="6" fill="currentColor" style={{ animationDelay: "160ms" }} />
      <circle className="demo-dot-pop" cx="42" cy="39" r="14" stroke="currentColor" strokeWidth="3" strokeDasharray="5 4" opacity="0.65" style={{ animationDelay: "280ms" }} />
      <path className="demo-dot-pop" d="M37 39 L47 39" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.65" style={{ animationDelay: "400ms" }} />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// [2026-09-20 추가] 3차 10편 + 그동안 기본 아이콘으로 뜨던 기존 10편용 그림.
// (blogPosts.js 상단 메모에 "이 5개는 전용 아이콘이 없어 기본 아이콘으로
//  표시됨 — 필요하면 나중에 추가 가능"이라고 적혀 있던 건들을 이번에 전부
//  채웠습니다. 이제 43+10편 모두 자기 그림을 갖습니다.)
// ---------------------------------------------------------------------------

// 서브프라임 등급 — 쓰레기 더미 위에 붙은 A등급 딱지
function RatingStampIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none">
      <path className="demo-fade-in" d="M10 48 L32 26 L54 48 Z" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      <circle className="demo-dot-pop" cx="44" cy="18" r="12" stroke="currentColor" strokeWidth="3" style={{ animationDelay: "180ms" }} />
      <path className="demo-dot-pop" d="M40 23 L44 12 L48 23 M41.5 19.5 H46.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ animationDelay: "300ms" }} />
      <rect className="demo-dot-pop" x="9" y="50" width="46" height="5" rx="2.5" fill="currentColor" style={{ animationDelay: "400ms" }} />
    </svg>
  );
}

// 일본 버블 — 솟았다 꺼진 봉우리 + 토리이 느낌의 기둥
function BubblePeakIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none">
      <path className="demo-fade-in" d="M6 52 L6 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.35" />
      <path className="demo-draw-line" d="M8 48 L20 40 L30 12 L40 44 L56 46" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle className="demo-dot-pop" cx="30" cy="12" r="4" fill="currentColor" style={{ animationDelay: "320ms" }} />
      <path className="demo-dot-pop" d="M8 54 L56 54" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.35" style={{ animationDelay: "400ms" }} />
    </svg>
  );
}

// 마셜 플랜 — 손에서 손으로 건네는 상자
function AidBoxIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none">
      <rect className="demo-fade-in" x="17" y="20" width="30" height="24" rx="3" stroke="currentColor" strokeWidth="3" />
      <line className="demo-dot-pop" x1="32" y1="20" x2="32" y2="44" stroke="currentColor" strokeWidth="2.5" style={{ animationDelay: "150ms" }} />
      <line className="demo-dot-pop" x1="17" y1="29" x2="47" y2="29" stroke="currentColor" strokeWidth="2.5" style={{ animationDelay: "230ms" }} />
      <path className="demo-draw-line" d="M8 50 Q14 46 20 50" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animationDelay: "330ms" }} />
      <path className="demo-draw-line" d="M44 50 Q50 46 56 50" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animationDelay: "410ms" }} />
    </svg>
  );
}

// GDP의 탄생 — 자로 재는 막대그래프
function MeasureChartIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none">
      <rect className="demo-dot-pop" x="12" y="36" width="9" height="16" rx="2" fill="currentColor" opacity="0.55" />
      <rect className="demo-dot-pop" x="26" y="26" width="9" height="26" rx="2" fill="currentColor" opacity="0.75" style={{ animationDelay: "130ms" }} />
      <rect className="demo-dot-pop" x="40" y="17" width="9" height="35" rx="2" fill="currentColor" style={{ animationDelay: "260ms" }} />
      <path className="demo-fade-in" d="M8 10 L56 10 M14 10 L14 15 M24 10 L24 15 M34 10 L34 15 M44 10 L44 15" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" opacity="0.6" style={{ animationDelay: "360ms" }} />
    </svg>
  );
}

// 최저임금 — 바닥선 위의 동전
function WageFloorIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none">
      <circle className="demo-fade-in" cx="32" cy="26" r="13" stroke="currentColor" strokeWidth="3" />
      <path className="demo-dot-pop" d="M28 21 H34 M28 26 H34 M31 21 V33" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" style={{ animationDelay: "180ms" }} />
      <rect className="demo-dot-pop" x="8" y="45" width="48" height="6" rx="3" fill="currentColor" style={{ animationDelay: "300ms" }} />
      <path className="demo-draw-line" d="M14 56 L20 51 M26 56 L32 51 M38 56 L44 51" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.45" style={{ animationDelay: "400ms" }} />
    </svg>
  );
}

// 주 15시간 — 시계의 작은 조각
function ClockSliceIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none">
      <circle className="demo-fade-in" cx="32" cy="32" r="21" stroke="currentColor" strokeWidth="3" />
      <path className="demo-dot-pop" d="M32 32 L32 11 A21 21 0 0 1 48 20 Z" fill="currentColor" opacity="0.85" style={{ animationDelay: "200ms" }} />
      <line className="demo-draw-line" x1="32" y1="32" x2="32" y2="18" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" style={{ animationDelay: "320ms" }} />
      <line className="demo-draw-line" x1="32" y1="32" x2="43" y2="38" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" style={{ animationDelay: "400ms" }} />
      <circle className="demo-dot-pop" cx="32" cy="32" r="2.6" fill="currentColor" style={{ animationDelay: "470ms" }} />
    </svg>
  );
}

// 버핏의 내기 — 악수
function HandshakeIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none">
      <path className="demo-fade-in" d="M6 28 L18 24 L32 32 L46 24 L58 28" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path className="demo-dot-pop" d="M20 32 L28 40 L36 40 L44 32" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ animationDelay: "200ms" }} />
      <rect className="demo-dot-pop" x="24" y="44" width="16" height="8" rx="2" fill="currentColor" style={{ animationDelay: "340ms" }} />
    </svg>
  );
}

// 플래시 크래시 — 번개처럼 꺾인 선
function LightningDropIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none">
      <path className="demo-fade-in" d="M6 14 L6 52 L58 52" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.3" />
      <path className="demo-draw-line" d="M10 22 L22 20 L28 44 L36 22 L44 26 L56 24" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path className="demo-dot-pop" d="M34 8 L27 22 L33 22 L26 34 L40 18 L33 18 L39 8 Z" fill="currentColor" opacity="0.5" style={{ animationDelay: "380ms" }} />
    </svg>
  );
}

// 블록버스터 vs 넷플릭스 — 비디오 테이프
function VideoTapeIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none">
      <rect className="demo-fade-in" x="7" y="18" width="50" height="30" rx="4" stroke="currentColor" strokeWidth="3" />
      <circle className="demo-dot-pop" cx="24" cy="33" r="6" stroke="currentColor" strokeWidth="2.5" style={{ animationDelay: "160ms" }} />
      <circle className="demo-dot-pop" cx="42" cy="33" r="6" stroke="currentColor" strokeWidth="2.5" style={{ animationDelay: "240ms" }} />
      <line className="demo-dot-pop" x1="24" y1="33" x2="42" y2="33" stroke="currentColor" strokeWidth="2.5" style={{ animationDelay: "320ms" }} />
      <line className="demo-dot-pop" x1="14" y1="43" x2="50" y2="43" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.4" style={{ animationDelay: "400ms" }} />
    </svg>
  );
}

// SVB — 흔들리는 은행 + 빠져나가는 화살표
function BankRunIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none">
      <path className="demo-fade-in" d="M8 24 L30 12 L52 24" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <line className="demo-dot-pop" x1="16" y1="28" x2="16" y2="42" stroke="currentColor" strokeWidth="3" strokeLinecap="round" style={{ animationDelay: "130ms" }} />
      <line className="demo-dot-pop" x1="30" y1="28" x2="30" y2="42" stroke="currentColor" strokeWidth="3" strokeLinecap="round" style={{ animationDelay: "210ms" }} />
      <rect className="demo-dot-pop" x="7" y="45" width="46" height="5" rx="2.5" fill="currentColor" style={{ animationDelay: "300ms" }} />
      <path className="demo-draw-line" d="M44 34 L58 34" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" style={{ animationDelay: "400ms" }} />
      <path className="demo-dot-pop" d="M53 29 L59 34 L53 39 Z" fill="currentColor" style={{ animationDelay: "470ms" }} />
    </svg>
  );
}

// ── 그동안 기본 아이콘으로 뜨던 기존 글 10편 ──

// 브레튼우즈 — 회의 탁자
function ConferenceTableIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none">
      <ellipse className="demo-fade-in" cx="32" cy="36" rx="22" ry="10" stroke="currentColor" strokeWidth="3" />
      <circle className="demo-dot-pop" cx="14" cy="24" r="4" fill="currentColor" style={{ animationDelay: "140ms" }} />
      <circle className="demo-dot-pop" cx="32" cy="19" r="4" fill="currentColor" style={{ animationDelay: "220ms" }} />
      <circle className="demo-dot-pop" cx="50" cy="24" r="4" fill="currentColor" style={{ animationDelay: "300ms" }} />
      <line className="demo-dot-pop" x1="32" y1="46" x2="32" y2="52" stroke="currentColor" strokeWidth="3" strokeLinecap="round" style={{ animationDelay: "380ms" }} />
    </svg>
  );
}

// 검은 목요일 1929 — 꺾여 떨어지는 선과 모자
function CrashLineIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none">
      <path className="demo-fade-in" d="M8 12 L8 52 L56 52" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.3" />
      <path className="demo-draw-line" d="M12 20 L22 17 L30 24 L38 20" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path className="demo-draw-line" d="M38 20 L50 48" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" style={{ animationDelay: "280ms" }} />
      <path className="demo-dot-pop" d="M44 42 L50 52 L56 42 Z" fill="currentColor" style={{ animationDelay: "420ms" }} />
    </svg>
  );
}

// 오일쇼크 — 유가 펌프 노즐
function OilDropIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none">
      <path className="demo-fade-in" d="M32 8 C32 8 18 27 18 36 a14 14 0 0 0 28 0 C46 27 32 8 32 8 Z" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      <path className="demo-dot-pop" d="M26 37 a6 6 0 0 0 6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.6" style={{ animationDelay: "200ms" }} />
      <path className="demo-draw-line" d="M14 54 L50 54" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animationDelay: "330ms" }} />
      <path className="demo-dot-pop" d="M44 20 L52 12 M48 12 L52 12 L52 16" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ animationDelay: "420ms" }} />
    </svg>
  );
}

// 닉슨 쇼크 — 금과 달러를 끊는 가위
function GoldDollarCutIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none">
      <circle className="demo-fade-in" cx="20" cy="32" r="11" stroke="currentColor" strokeWidth="3" />
      <circle className="demo-fade-in" cx="46" cy="32" r="11" stroke="currentColor" strokeWidth="3" style={{ animationDelay: "120ms" }} />
      <path className="demo-dot-pop" d="M17 27 H23 M17 32 H23 M20 27 V38" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" style={{ animationDelay: "230ms" }} />
      <path className="demo-dot-pop" d="M41 36 L46 25 L51 36 M43 32 H49" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ animationDelay: "310ms" }} />
      <path className="demo-draw-line" d="M33 12 L33 52" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="5 5" style={{ animationDelay: "400ms" }} />
    </svg>
  );
}

// 플라자 합의 — 저울
function ScalesIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none">
      <line className="demo-fade-in" x1="32" y1="12" x2="32" y2="50" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <line className="demo-dot-pop" x1="12" y1="20" x2="52" y2="20" stroke="currentColor" strokeWidth="3" strokeLinecap="round" style={{ animationDelay: "140ms" }} />
      <path className="demo-dot-pop" d="M5 22 a7 7 0 0 0 14 0 Z" fill="currentColor" style={{ animationDelay: "240ms" }} />
      <path className="demo-dot-pop" d="M45 22 a7 7 0 0 0 14 0 Z" fill="currentColor" opacity="0.6" style={{ animationDelay: "320ms" }} />
      <rect className="demo-dot-pop" x="22" y="50" width="20" height="5" rx="2.5" fill="currentColor" style={{ animationDelay: "400ms" }} />
    </svg>
  );
}

// 게임스탑 — 게임 컨트롤러 위로 치솟는 화살표
function GameControllerIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none">
      <rect className="demo-fade-in" x="8" y="30" width="48" height="22" rx="11" stroke="currentColor" strokeWidth="3" />
      <line className="demo-dot-pop" x1="18" y1="41" x2="26" y2="41" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animationDelay: "120ms" }} />
      <line className="demo-dot-pop" x1="22" y1="37" x2="22" y2="45" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animationDelay: "180ms" }} />
      <circle className="demo-dot-pop" cx="42" cy="38" r="2.6" fill="currentColor" style={{ animationDelay: "240ms" }} />
      <circle className="demo-dot-pop" cx="47" cy="44" r="2.6" fill="currentColor" style={{ animationDelay: "300ms" }} />
      <path className="demo-draw-line" d="M14 24 L26 24 L34 14 L48 8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animationDelay: "360ms" }} />
      <path className="demo-dot-pop" d="M42 8 L50 7 L49 15 Z" fill="currentColor" style={{ animationDelay: "460ms" }} />
    </svg>
  );
}

// 머스크 트윗 — 말풍선 안의 새
function TweetIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none">
      <path className="demo-fade-in" d="M8 14 h48 a4 4 0 0 1 4 4 v22 a4 4 0 0 1 -4 4 h-26 l-12 9 v-9 h-10 a4 4 0 0 1 -4 -4 v-22 a4 4 0 0 1 4 -4 z" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      <line className="demo-dot-pop" x1="17" y1="24" x2="47" y2="24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animationDelay: "170ms" }} />
      <line className="demo-dot-pop" x1="17" y1="32" x2="38" y2="32" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.6" style={{ animationDelay: "260ms" }} />
      <circle className="demo-dot-pop" cx="46" cy="32" r="2.6" fill="currentColor" style={{ animationDelay: "350ms" }} />
    </svg>
  );
}

// 헌트 형제 은 매점 — 은괴 더미
function SilverBarsIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none">
      <path className="demo-dot-pop" d="M10 46 L16 38 L36 38 L42 46 Z" stroke="currentColor" strokeWidth="2.8" strokeLinejoin="round" />
      <path className="demo-dot-pop" d="M24 34 L30 26 L50 26 L56 34 Z" stroke="currentColor" strokeWidth="2.8" strokeLinejoin="round" style={{ animationDelay: "170ms" }} />
      <path className="demo-dot-pop" d="M22 46 L28 38 L48 38 L54 46 Z" fill="currentColor" opacity="0.85" style={{ animationDelay: "300ms" }} />
      <path className="demo-draw-line" d="M8 53 L56 53" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" opacity="0.4" style={{ animationDelay: "400ms" }} />
    </svg>
  );
}

// 도지코인 — 동전 위의 강아지 귀
function DogeCoinIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none">
      <circle className="demo-fade-in" cx="32" cy="34" r="18" stroke="currentColor" strokeWidth="3" />
      <path className="demo-dot-pop" d="M20 22 L17 11 L27 16 Z" fill="currentColor" style={{ animationDelay: "160ms" }} />
      <path className="demo-dot-pop" d="M44 22 L47 11 L37 16 Z" fill="currentColor" style={{ animationDelay: "240ms" }} />
      <circle className="demo-dot-pop" cx="26" cy="32" r="2.4" fill="currentColor" style={{ animationDelay: "320ms" }} />
      <circle className="demo-dot-pop" cx="38" cy="32" r="2.4" fill="currentColor" style={{ animationDelay: "380ms" }} />
      <path className="demo-draw-line" d="M26 41 Q32 46 38 41" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animationDelay: "450ms" }} />
    </svg>
  );
}

// 버크셔 액면분할 미실시 — 쪼개지지 않는 한 장
function UnsplitShareIcon() {
  return (
    <svg viewBox="0 0 64 64" fill="none">
      <rect className="demo-fade-in" x="12" y="14" width="40" height="36" rx="4" stroke="currentColor" strokeWidth="3" />
      <line className="demo-dot-pop" x1="20" y1="24" x2="44" y2="24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animationDelay: "150ms" }} />
      <line className="demo-dot-pop" x1="20" y1="31" x2="44" y2="31" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.6" style={{ animationDelay: "230ms" }} />
      <path className="demo-draw-line" d="M32 12 L32 52" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeDasharray="4 5" opacity="0.5" style={{ animationDelay: "330ms" }} />
      <path className="demo-dot-pop" d="M24 40 L40 40" stroke="currentColor" strokeWidth="3" strokeLinecap="round" style={{ animationDelay: "430ms" }} />
    </svg>
  );
}

// slug -> { Icon, tone } — tone은 배경색 톤(사이트 기존 색상 토큰 재사용).
const THUMBNAILS = {
  "big-mac-index": { Icon: BigMacIcon, tone: "amber" },
  "tulip-mania": { Icon: TulipIcon, tone: "up" },
  "zimbabwe-hyperinflation": { Icon: HyperinflationIcon, tone: "bad" },
  "south-sea-bubble": { Icon: ShipBubbleIcon, tone: "down" },
  "worlds-first-paper-money": { Icon: ScrollIcon, tone: "green" },
  "pepsi-soviet-navy": { Icon: SubmarineIcon, tone: "down" },
  "weimar-hyperinflation": { Icon: WheelbarrowIcon, tone: "bad" },
  "mississippi-bubble": { Icon: CompassIcon, tone: "amber" },
  "florida-land-boom": { Icon: WaveHouseIcon, tone: "down" },
  "ponzi-scheme": { Icon: PyramidIcon, tone: "bad" },
  "cobra-effect": { Icon: SnakeIcon, tone: "green" },
  "soviet-glass-quota": { Icon: GlassPaneIcon, tone: "amber" },
  "gandhi-salt-march": { Icon: FootprintsIcon, tone: "green" },

  // [2026-09-14 추가] 현대편 10편 (lib/blogPostsModern.js)
  "de-beers-diamond": { Icon: DiamondIcon, tone: "amber" },
  "lehman-brothers": { Icon: CollapsingBankIcon, tone: "bad" },
  "dotcom-bubble": { Icon: DotcomBubbleIcon, tone: "down" },
  "enron-scandal": { Icon: CookedBooksIcon, tone: "bad" },
  "nick-leeson-barings": { Icon: HiddenDrawerIcon, tone: "amber" },
  "ltcm-collapse": { Icon: BrokenModelIcon, tone: "down" },
  "volkswagen-short-squeeze": { Icon: SqueezeIcon, tone: "up" },
  "knight-capital-45-minutes": { Icon: StopwatchIcon, tone: "amber" },
  "bitcoin-pizza-day": { Icon: PizzaSliceIcon, tone: "green" },
  "black-monday-1987": { Icon: CliffDropIcon, tone: "bad" },

  // [2026-09-18 추가] 현대·근현대편 2차 10편
  "asian-financial-crisis-imf": { Icon: EmptyVaultIcon, tone: "bad" },
  "satoshi-nakamoto": { Icon: AnonymousIcon, tone: "amber" },
  "dutch-east-india-company": { Icon: TallShipIcon, tone: "green" },
  "rothschild-waterloo": { Icon: RumorIcon, tone: "amber" },
  "diners-club-credit-card": { Icon: CreditCardIcon, tone: "up" },
  "shell-money": { Icon: SeashellIcon, tone: "green" },
  "federal-reserve-jekyll-island": { Icon: CentralBankIcon, tone: "amber" },
  "keynes-vs-hayek": { Icon: DebateIcon, tone: "down" },
  "greece-debt-crisis": { Icon: CrackedColumnIcon, tone: "bad" },
  "greshams-law": { Icon: TwoCoinsIcon, tone: "down" },

  // [2026-09-20 추가] 3차 10편
  "subprime-aaa-rating": { Icon: RatingStampIcon, tone: "bad" },
  "japan-bubble-lost-decades": { Icon: BubblePeakIcon, tone: "down" },
  "marshall-plan": { Icon: AidBoxIcon, tone: "green" },
  "gdp-invention": { Icon: MeasureChartIcon, tone: "amber" },
  "minimum-wage-origin": { Icon: WageFloorIcon, tone: "green" },
  "keynes-15-hour-week": { Icon: ClockSliceIcon, tone: "amber" },
  "buffett-million-dollar-bet": { Icon: HandshakeIcon, tone: "up" },
  "flash-crash-2010": { Icon: LightningDropIcon, tone: "down" },
  "blockbuster-netflix": { Icon: VideoTapeIcon, tone: "amber" },
  "svb-collapse-2023": { Icon: BankRunIcon, tone: "bad" },

  // [2026-09-20 추가] 그동안 기본 아이콘으로 뜨던 기존 글 10편
  "bretton-woods": { Icon: ConferenceTableIcon, tone: "green" },
  "black-thursday-1929": { Icon: CrashLineIcon, tone: "bad" },
  "1970s-oil-shock": { Icon: OilDropIcon, tone: "down" },
  "nixon-shock": { Icon: GoldDollarCutIcon, tone: "amber" },
  "plaza-accord": { Icon: ScalesIcon, tone: "green" },
  "gamestop-short-squeeze": { Icon: GameControllerIcon, tone: "up" },
  "funding-secured-tweet": { Icon: TweetIcon, tone: "amber" },
  "hunt-brothers-silver-thursday": { Icon: SilverBarsIcon, tone: "down" },
  "dogecoin-was-a-joke": { Icon: DogeCoinIcon, tone: "up" },
  "berkshire-hathaway-no-stock-split": { Icon: UnsplitShareIcon, tone: "green" },
};

export default function BlogThumbnail({ slug, size = "small" }) {
  const entry = THUMBNAILS[slug] || { Icon: DefaultIcon, tone: "amber" };
  const Icon = entry.Icon;
  return (
    <div className={`blog-thumb blog-thumb-${size} blog-thumb-${entry.tone}`}>
      <Icon />
    </div>
  );
}
