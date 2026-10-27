import Link from "next/link";
import { FOOTER_LINKS } from "../lib/siteMenu";

// components/SiteFooterNav.js
//
// [2026-10-17 변경] 새로 만든 문서 페이지 세 개를 푸터 메뉴에 추가했습니다.
// 용어사전 · 자주 묻는 질문 · 면책조항 — 셋 다 2026-10-14에 만들어두고
// 링크만 안 걸려 있던 페이지입니다.
//
// 순서는 "읽을거리 → 안내 → 법적 고지" 흐름으로 정리했습니다. 광고 심사에서
// 이런 문서 페이지의 존재와 접근성을 함께 보기 때문에, 어느 화면에서든 한
// 번에 닿을 수 있게 푸터에 두는 것이 좋습니다.
//
// [2026-10-27 변경] 링크 목록을 lib/siteMenu.js(FOOTER_LINKS)로 옮겼습니다.
//   휴대폰 "전체" 창 아래쪽에도 같은 링크가 나와서, 한 곳만 고치면 둘 다 바뀌게 했습니다.

export default function SiteFooterNav() {
  return (
    <nav className="footer-nav">
      {FOOTER_LINKS.map((l) => (
        <Link key={l.href} href={l.href}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
