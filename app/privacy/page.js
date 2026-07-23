import Link from "next/link";
import SiteFooter from "@/components/SiteFooter";

export const metadata = { title: "개인정보처리방침 — 배움나눔" };

// =============================================================
// 개인정보처리방침 — 앱의 실제 데이터 취급 방식을 반영한 안내.
// 학교·기관 정책에 맞게 내용을 검토·보완해 사용하세요.
// =============================================================
export default function PrivacyPage() {
  return (
    <div className="policy-shell">
      <header className="policy-top">
        <Link href="/" className="policy-home">📚 배움나눔</Link>
      </header>
      <main className="policy-body">
        <h1>개인정보처리방침</h1>
        <p className="policy-updated">시행일: 2026년 7월 1일</p>

        <h2>1. 수집하는 개인정보와 수집 방법</h2>
        <p>
          배움나눔(이하 &lsquo;서비스&rsquo;)은 회원가입과 수업 참여에 필요한
          최소한의 정보만 수집합니다.
        </p>
        <ul>
          <li>계정 정보: 이메일 주소(구글 로그인 포함), 실명, 학번</li>
          <li>활동 기록: 질문·답변·공부방 카드·KWL 기록 등 학습 활동 내용</li>
          <li>자동 생성 정보: 익명 닉네임과 아바타(게시물 표시용)</li>
        </ul>

        <h2>2. 개인정보의 이용 목적</h2>
        <ul>
          <li>수업 중 질문·답변과 학습 기록의 공유(교육 목적)</li>
          <li>교사의 학습 현황 확인과 피드백(참여 격려, 학습 리포트)</li>
          <li>본인 확인과 반(클래스) 소속 관리</li>
        </ul>

        <h2>3. 익명성 보호</h2>
        <p>
          게시물·답변·채팅에는 실명 대신 <strong>익명 닉네임만 표시</strong>됩니다.
          실명·이메일·학번은 별도로 보호된 저장소에만 보관되며, 본인과 담당
          교사만 확인할 수 있습니다. 공부방의 모둠 활동·참여 격려(멋진 순간)
          등 실명 기반 기능은 같은 반 구성원에게만 표시됩니다.
        </p>

        <h2>4. 보관 및 파기</h2>
        <p>
          개인정보는 Google Firebase(Firestore)에 암호화 전송으로 저장됩니다.
          계정 탈퇴 처리 시 프로필(실명·이메일·학번)과 작성한 게시물·활동
          기록은 지체 없이 삭제됩니다.
        </p>

        <h2>5. 제3자 제공</h2>
        <p>
          법령에 근거한 경우를 제외하고 개인정보를 외부에 제공하지 않습니다.
        </p>

        <h2>6. 이용자의 권리</h2>
        <p>
          학생과 보호자는 언제든지 자신의 개인정보 열람·정정·삭제(탈퇴)를
          담당 교사 또는 아래 문의처를 통해 요청할 수 있습니다.
        </p>

        <h2>7. 문의처</h2>
        <p>
          개인정보 관련 문의: <a href="mailto:iseoul72@gmail.com">iseoul72@gmail.com</a>
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
