import "./globals.css";
import SiteFooterNav from "../components/SiteFooterNav";

const SITE_URL = "https://newsmeme.co.kr";
const TITLE = "뉴스매매 — 실시간 뉴스 속보와 관련주 매칭";
const DESCRIPTION = "실시간 경제 뉴스를 자동으로 수집하고, AI가 관련 종목을 즉시 매칭해서 보여드려요.";

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

export const viewport = {
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
