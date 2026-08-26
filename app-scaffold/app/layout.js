import "./globals.css";
import SiteFooterNav from "../components/SiteFooterNav";

export const metadata = {
  title: "뉴스매매",
  description: "뉴스와 자동으로 연결되는 한국 주식 테마·종목 정보",
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
