import "./globals.css";
import SiteFooterNav from "../components/SiteFooterNav";

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
};

// [2026-09-07 변경] width/initialScale이 빠져 있었음 — themeColor만 지정된
// viewport export가 Next.js의 기본 "width=device-width, initial-scale=1"
// 메타 태그를 밀어내면서, 모바일에서 실제 화면 폭 기준으로 반응형 CSS(작은
// 화면용 @media 규칙들)가 제대로 안 먹히고 화면 비율이 깨지는 원인이었음.
// 명시적으로 다시 넣어줌.
export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#c6862b",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@600;700&family=Noto+Sans+KR:wght@400;500;600;700&family=Roboto+Mono:wght@500;700&display=swap"
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
      </body>
    </html>
  );
}
