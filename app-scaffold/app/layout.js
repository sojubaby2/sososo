import "./globals.css";
import SiteFooterNav from "../components/SiteFooterNav";
// [2026-10-26 추가] 종목을 누르면 뜨는 일봉 차트 창 — 모든 페이지에서 쓰도록 여기 한 번만 달아 둠
import StockChartModal from "../components/StockChartModal";
import NoDrag from "../components/NoDrag";
// [2026-10-27 추가] 휴대폰 전용 맨 아래 탭 줄(속보·시장·관심·일정·전체). PC에서는 안 보임.
import MobileTabBar from "../components/MobileTabBar";
// [2026-10-28 추가] 구글 앵커 광고가 뜨면 탭 줄·머리띠를 비켜 줌
import AnchorAdSpacer from "../components/AnchorAdSpacer";
import VignetteGuard from "../components/VignetteGuard";
import SideAds from "../components/SideAds";
// [2026-10-29 추가] 종목 검색 창 — 위 메뉴줄 돋보기·홈 검색창·"/" 키로 열림(components/StockSearch.js)
import StockSearch from "../components/StockSearch";

const SITE_URL = "https://newsmeme.co.kr";
const TITLE = "뉴스매매 — 실시간 뉴스 속보와 관련주 매칭";
const DESCRIPTION = "실시간 주식 속보와 관련주를 한눈에 보고, 빠르게 시장에 대응하세요.";

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  manifest: "/manifest.json",
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: "뉴스매매",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "뉴스매매" }],
    locale: "ko_KR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/og-image.png"],
  },

  // [2026-10-04 추가] 네이버 검색 등록(서치어드바이저) 소유확인용 표시입니다.
  //
  // 네이버에 사이트를 등록하려면 "이 사이트가 정말 당신 것인지" 확인하는
  // 절차를 거쳐야 하는데, 그 방법 중 하나가 네이버가 준 문자열을 사이트
  // 페이지 안에 적어두는 것입니다. 네이버 로봇이 들어와서 이 문자열이
  // 보이면 소유자로 인정합니다.
  //
  // 아래 한 줄이 실제 페이지에서는 이렇게 나옵니다:
  //   <meta name="naver-site-verification" content="0ac4e1..." />
  //
  // 주의: 소유확인이 끝난 뒤에도 이 줄은 지우면 안 됩니다. 네이버가 주기적으로
  // 다시 확인하는데, 그때 없으면 등록이 풀립니다.
  //
  // 구글(서치콘솔)은 이 방식 대신 도메인 DNS에 TXT 레코드를 넣는 방식으로
  // 2026-10-04에 소유확인을 마쳤습니다(가비아 DNS 설정). 그래서 구글용
  // 문자열은 여기에 없습니다.
  verification: {
    other: {
      "naver-site-verification": "0ac4e1d1e04d729f4573b9f69a8e1b89b6b3fa4f",
    },
  },
};

// [2026-09-07 변경] width/initialScale이 빠져 있었음 — themeColor만 지정된
// viewport export가 Next.js의 기본 "width=device-width, initial-scale=1"
// 메타 태그를 밀어내면서, 모바일에서 실제 화면 폭 기준으로 반응형 CSS(작은
// 화면용 @media 규칙들)가 제대로 안 먹히고 화면 비율이 깨지는 원인이었음.
// 명시적으로 다시 넣어줌.
export const viewport = {
  width: "device-width",
  initialScale: 1,
  // [2026-10-19 변경] 휴대폰에서 브라우저 주소창 색입니다. 사이트 색을
  // 남색으로 바꾸면서 같이 맞췄습니다(주황으로 두면 주소창만 따로 놀았음).
  // [2026-10-26 변경] 어두운 터미널 디자인으로 바꾸면서 주소창 색도 거의 검정으로.
  themeColor: "#fbfbf9", // [2026-10-26] 기본 화면을 밝게 바꾸면서 휴대폰 주소창 색도 밝게
};

// [2026-10-26] 글꼴 교체: Noto Serif KR(제목)·Noto Sans KR(본문)·Roboto Mono(숫자)
// → IBM Plex Sans KR(제목·본문 하나로) + IBM Plex Mono(숫자).
// 어두운 터미널 화면에 맞는 단단한 글꼴이고, 숫자 자릿수가 딱딱 맞습니다.
export default function RootLayout({ children }) {
  return (
    // [2026-10-26 변경] 기본 화면을 밝은 화면으로 — 재성님: "밝은 화면이 더 나은 것 같다, 기본을 밝게 하자"
    //   처음부터 data-theme="light"를 붙여서 내보내고, 어두운 화면을 골라 둔 사람만
    //   아래 짧은 코드가 화면 뜨기 전에 떼어 냅니다.
    // suppressHydrationWarning: 그 짧은 코드가 data-theme을 바꿀 수 있으므로
    // "서버가 그린 것과 다르다"는 경고를 이 한 줄(html 태그)에 한해서만 끕니다.
    <html lang="ko" data-theme="light" suppressHydrationWarning>
      <head>
        {/* [2026-10-26 추가] 밝은/어두운 화면 기억값을 화면이 그려지기 "전에" 적용 —
            이게 없으면 어두운 화면을 고른 사람도 페이지를 열 때마다 잠깐 하얗게
            번쩍였다가 바뀝니다. (components/ThemeToggle.js 참고) */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('nm-theme')==='dark')document.documentElement.removeAttribute('data-theme')}catch(e){}",
          }}
        />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        {/* Google AdSense site verification / ad loader */}
        <script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1329092235174593"
          crossOrigin="anonymous"
        ></script>
      </head>
      <body>
        {children}
        <SiteFooterNav />
        <StockChartModal />
        {/* [2026-10-29] 종목 검색 창 (components/StockSearch.js) */}
        <StockSearch />
        {/* [2026-10-27] 드래그 방지 (components/NoDrag.js) */}
        <NoDrag />
        {/* [2026-10-27] 휴대폰 전용 맨 아래 탭 줄 (components/MobileTabBar.js) */}
        <MobileTabBar />
        {/* [2026-10-28] 앵커 광고와 겹치지 않게 (components/AnchorAdSpacer.js) */}
        <AnchorAdSpacer />
        {/* [2026-10-28] 전면 광고는 "테마별 종목정리" 메뉴에서만 (components/VignetteGuard.js) */}
        <VignetteGuard />
        {/* [2026-10-28] PC 화면 양옆 빈자리 광고 (components/SideAds.js) — 구글 자동 사이드 레일 대신 */}
        <SideAds />
      </body>
    </html>
  );
}
