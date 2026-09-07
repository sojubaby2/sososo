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
