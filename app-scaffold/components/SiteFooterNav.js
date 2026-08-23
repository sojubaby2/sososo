import Link from "next/link";

export default function SiteFooterNav() {
  return (
    <nav className="footer-nav">
      <Link href="/about">소개</Link>
      <Link href="/contact">문의</Link>
      <Link href="/privacy">개인정보처리방침</Link>
      <Link href="/terms">이용약관</Link>
    </nav>
  );
}
