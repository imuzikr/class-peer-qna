"use client";

// =============================================================
// 공통 상단 내비게이션
// -------------------------------------------------------------
// 왼쪽: 배움나눔 로고 ｜ 공부방 ｜ 파이썬 실행기 ｜ (학습 리포트|관리자 대시보드)
// 오른쪽: 역할 전환(개발용) ｜ 사용자 프로필 ｜ 로그아웃
//
// 파이썬 실행기는 게시판 페이지의 슬라이드 패널입니다.
//  - 게시판에서는 onPython으로 패널을 직접 토글합니다.
//  - 다른 페이지에서는 /board?py=1 로 이동해 패널을 엽니다.
// =============================================================
import { useRouter } from "next/navigation";
import { isAdmin } from "@/lib/user";
import { useCurrentUser } from "@/lib/useCurrentUser";
import UserProfile from "./UserProfile";
import RoleSwitcher from "./RoleSwitcher";

export default function TopNav({ active, onPython, pyActive = false }) {
  const router = useRouter();
  const user = useCurrentUser();
  const admin = user ? isAdmin(user) : false;

  function handlePython() {
    if (onPython) onPython();
    else router.push("/board?py=1");
  }

  return (
    <header className="topbar">
      {/* 왼쪽: 로고 + 주요 메뉴 */}
      <div className="topbar-left">
        <button className="logo logo-button" onClick={() => router.push("/board")}>
          📚 배움나눔
        </button>
        <span className="topbar-divider" aria-hidden="true" />
        <nav className="topnav-menu">
          <button
            className={`btn-ghost ${active === "study" ? "nav-active" : ""}`}
            onClick={() => router.push("/study")}
          >
            🧩 공부방
          </button>
          <button
            className={`btn-ghost ${pyActive ? "py-btn-active" : ""}`}
            onClick={handlePython}
          >
            🐍 파이썬 실행기
          </button>
          {admin ? (
            <button
              className={`btn-ghost ${active === "admin" ? "nav-active" : ""}`}
              onClick={() => router.push("/admin")}
            >
              📊 관리자 대시보드
            </button>
          ) : (
            <button
              className={`btn-ghost ${active === "report" ? "nav-active" : ""}`}
              onClick={() => router.push("/report")}
            >
              📈 학습 리포트
            </button>
          )}
        </nav>
      </div>

      {/* 오른쪽: 역할 전환 + 프로필 + 로그아웃 */}
      <div className="user-area">
        <RoleSwitcher />
        <UserProfile />
        <button className="btn-ghost" onClick={() => router.push("/")}>
          로그아웃
        </button>
      </div>
    </header>
  );
}
