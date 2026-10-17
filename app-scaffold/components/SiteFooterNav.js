import Link from "next/link";

// components/SiteFooterNav.js
//
// [2026-10-17 변경] 새로 만든 문서 페이지 세 개를 푸터 메뉴에 추가했습니다.
// 용어사전 · 자주 묻는 질문 · 면책조항 — 셋 다 2026-10-14에 만들어두고
// 링크만 안 걸려 있던 페이지입니다.
//
// 순서는 "읽을거리 → 안내 → 법적 고지" 흐름으로 정리했습니다. 광고 심사에서
// 이런 문서 페이지의 존재와 접근성을 함께 보기 때문에, 어느 화면에서든 한
// 번에 닿을 수 있게 푸터에 두는 것이 좋습니다.

export default function SiteFooterNav() {
  return (
    <nav className="footer-nav">
      <Link href="/about">소개</Link>
      <Link href="/blog">칼럼</Link>
      <Link href="/glossary">용어사전</Link>
      <Link href="/faq">자주 묻는 질문</Link>
      <Link href="/contact">문의</Link>
      <Link href="/disclaimer">면책조항</Link>
      <Link href="/privacy">개인정보처리방침</Link>
      <Link href="/terms">이용약관</Link>
    </nav>
  );
}
