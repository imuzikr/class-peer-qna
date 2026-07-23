import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";
import TermsContent from "@/components/policies/TermsContent";

export const metadata = { title: "이용약관 — 배움나눔" };

// =============================================================
// 이용약관 — 교실용 학습 서비스에 맞춘 기본 약관.
// 학교·기관 정책에 맞게 내용을 검토·보완해 사용하세요.
// =============================================================
export default function TermsPage() {
  return (
    <div className="policy-shell">
      <header className="policy-top">
        <Link href="/" className="policy-home">📚 배움나눔</Link>
      </header>
      <main className="policy-body">
        <TermsContent />
      </main>
      <SiteFooter />
    </div>
  );
}
