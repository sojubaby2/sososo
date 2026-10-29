// components/PageSkeleton.js
//
// [2026-10-29 신설] "불러오는 중" 화면 — 재성님: "장마감 정리를 누르면 다른메뉴보다 반응이 너무 느린거같은데"
//
// 장 마감 정리·장전 브리핑은 누를 때마다 서버가 저장소(Redis)에서 자료를 읽어 새로 그리는 화면이라,
// 미리 만들어 둔 다른 메뉴(테마별 종목·차트 가이드 등)보다 0.5~1.5초 늦게 열렸습니다.
// 그동안 화면이 그대로 멈춰 있어서 "눌렸나?" 싶었던 것 — 이제 메뉴를 누르는 즉시 이 화면(머리띠 + 반짝이는 빈 칸)이 먼저
// 나오고, 자료가 오면 바로 진짜 화면으로 바뀝니다. (Next.js의 loading.js 규칙: 같은 폴더에 loading.js가 있으면 자동으로 씀)

import Header from "./Header";

export default function PageSkeleton({ title = "불러오는 중" }) {
  return (
    <div>
      <Header />
      <main className="stock-page market-page mk2 page-skel" aria-busy="true" aria-label={`${title} 불러오는 중`}>
        <div className="page-skel-hero">
          <span className="page-skel-kicker">{title}</span>
          <span className="sk sk-h1" />
          <span className="sk sk-line" />
          <span className="sk sk-line short" />
          <div className="page-skel-grid">
            <span className="sk sk-card" />
            <span className="sk sk-card" />
          </div>
        </div>
        <div className="page-skel-panel">
          <span className="sk sk-line" />
          <span className="sk sk-block" />
        </div>
      </main>
    </div>
  );
}
