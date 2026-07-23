import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";

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
        <h1>이용약관</h1>
        <p className="policy-updated">시행일: 2026년 7월 1일</p>

        <h2>제1조 (목적)</h2>
        <p>
          이 약관은 배움나눔(이하 &lsquo;서비스&rsquo;)의 이용 조건과 운영에
          관한 기본 사항을 정합니다. 서비스는 수업 중 질문·답변과 학습 기록을
          나누는 교육용 웹앱입니다.
        </p>

        <h2>제2조 (계정과 이용)</h2>
        <ul>
          <li>서비스는 수업 참여를 위해 교사가 안내한 학생과 교직원이 이용합니다.</li>
          <li>학생은 입장 코드를 통해 자신의 반(클래스)에 참여합니다.</li>
          <li>계정 정보는 본인이 관리하며, 타인에게 양도할 수 없습니다.</li>
        </ul>

        <h2>제3조 (게시물과 활동 기록)</h2>
        <ul>
          <li>질문·답변·카드 등 게시물의 저작권은 작성자에게 있습니다.</li>
          <li>게시물은 수업과 학습 공유 목적으로 반 구성원과 교사에게 표시됩니다.</li>
          <li>
            타인을 비방하거나 수업과 무관한 게시물, 개인정보가 포함된 게시물은
            교사가 삭제할 수 있습니다.
          </li>
        </ul>

        <h2>제4조 (금지 행위)</h2>
        <ul>
          <li>타인의 계정 사용, 사칭, 입장 코드의 무단 공유</li>
          <li>욕설·괴롭힘 등 학교 생활 규정에 어긋나는 행위</li>
          <li>서비스의 정상 운영을 방해하는 행위</li>
        </ul>

        <h2>제5조 (서비스 운영)</h2>
        <p>
          서비스는 교육 활동을 위해 무상으로 제공되며, 학사 일정과 운영상
          필요에 따라 기능이 변경되거나 중단될 수 있습니다.
        </p>

        <h2>제6조 (문의)</h2>
        <p>
          서비스 이용 관련 문의: <a href="mailto:iseoul72@gmail.com">iseoul72@gmail.com</a>
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
