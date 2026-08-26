import Header from "../../components/Header";
import { Mail } from "lucide-react";

export const metadata = {
  title: "문의 | 뉴스매매",
  description: "뉴스매매에 문의하는 방법입니다.",
};

// Contact email for the site.
const CONTACT_EMAIL = "sojubaby2@naver.com";

export default function ContactPage() {
  return (
    <div>
      <Header />
      <main className="legal-page">
        <h1>문의</h1>
        <p>
          서비스 이용 중 궁금한 점, 오류 제보, 개인정보 관련 문의, 저작권 관련 문의(뉴스 원문 표시 방식 등)는 아래
          이메일로 연락해주시면 확인 후 답변드리겠습니다.
        </p>

        <div className="legal-note" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Mail size={16} />
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </div>
      </main>
    </div>
  );
}
