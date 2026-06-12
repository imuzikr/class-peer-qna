"use client";

// =============================================================
// 메인 랜딩 페이지
//   - 전체 배경: public/landing.png (학생들이 질문하는 일러스트)
//   - 중앙 여백: 서비스 타이틀 + 상세 설명
//   - 오른쪽 상단: 로그인 / 회원가입 버튼 (클릭 시 모달)
// -------------------------------------------------------------
// [개발 단계] 실제 인증은 수행하지 않고, 어떤 값을 입력하든
// 테스트 유저(user_01)로 게시판에 입장합니다.
// [나중에] handleSubmit 안의 TODO 부분에 Firebase Authentication의
// signInWithEmailAndPassword / createUserWithEmailAndPassword 를
// 연결하면 됩니다.
// =============================================================
import { useState } from "react";
import { useRouter } from "next/navigation";
import { TEST_USER } from "@/lib/user";

export default function LandingPage() {
  const router = useRouter();
  const [authMode, setAuthMode] = useState(null); // null | 'login' | 'signup'
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    // TODO: Firebase Authentication 연동
    //  - 로그인:    signInWithEmailAndPassword(auth, email, password)
    //  - 회원가입:  createUserWithEmailAndPassword(auth, email, password)
    // 지금은 테스트 유저로 바로 입장합니다.
    router.push("/board");
  }

  return (
    <main className="landing">
      {/* ── 상단 바: 로고(왼쪽) + 로그인/회원가입(오른쪽) ── */}
      <header className="landing-top">
        <span className="landing-logo">📚 배움나눔</span>
        <div className="landing-actions">
          <button className="btn-outline" onClick={() => setAuthMode("login")}>
            로그인
          </button>
          <button className="btn-primary" onClick={() => setAuthMode("signup")}>
            회원가입
          </button>
        </div>
      </header>

      {/* ── 중앙 여백: 타이틀 + 상세 설명 (글래스 카드) ── */}
      <section className="hero">
        <div className="hero-glass">
          <h1>배움나눔</h1>
          <p className="hero-sub">함께 묻고 답하며 성장하는 우리들의 공부방</p>
          <p className="hero-desc">
            공부하다 막히는 부분이 있나요? 질문을 올리면 친구들이 답변을 달아
            줍니다. 과목 키워드로 질문을 분류하고, 채팅처럼 이어지는 대화
            속에서 서로의 생각을 나눠 보세요. 친구의 질문에 답하면서 내 실력도
            함께 자랍니다.
          </p>
        </div>
      </section>

      {/* ── 로그인 / 회원가입 모달 ── */}
      {authMode && (
        <div className="modal-backdrop" onClick={() => setAuthMode(null)}>
          <div
            className="modal modal-auth"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h3>{authMode === "login" ? "로그인" : "회원가입"}</h3>
              <button
                className="btn-close"
                onClick={() => setAuthMode(null)}
                aria-label="닫기"
              >
                ×
              </button>
            </div>

            <div className="tab-row">
              <button
                type="button"
                className={authMode === "login" ? "active" : ""}
                onClick={() => setAuthMode("login")}
              >
                로그인
              </button>
              <button
                type="button"
                className={authMode === "signup" ? "active" : ""}
                onClick={() => setAuthMode("signup")}
              >
                회원가입
              </button>
            </div>

            <form className="form-grid" onSubmit={handleSubmit}>
              {authMode === "signup" && (
                <input
                  type="text"
                  placeholder="이름 (예: 김하늘)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              )}
              <input
                type="email"
                placeholder="이메일"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <input
                type="password"
                placeholder="비밀번호"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button type="submit" className="btn-primary">
                {authMode === "login" ? "로그인" : "회원가입"}
              </button>

              <div className="dev-note">
                🔧 <strong>개발 모드</strong> — 아직 실제 인증 기능이 연결되지
                않았습니다. 버튼을 누르면 테스트 유저(
                <strong>{TEST_USER.uid}</strong>)로 자동 입장합니다.
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
