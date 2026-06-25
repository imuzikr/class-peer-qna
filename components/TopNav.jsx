"use client";

// =============================================================
// 공통 상단 내비게이션
// -------------------------------------------------------------
// 왼쪽: 배움나눔 로고 ｜ 학습 공간 드롭다운(공부방·질문게시판) ｜ 파이썬 실행기 ｜ (리포트|관리자)
// 오른쪽: 역할 전환(개발용) ｜ 사용자 프로필 ｜ 로그아웃
// =============================================================
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { isAdmin } from "@/lib/user";
import { useCurrentUser } from "@/lib/useCurrentUser";
import UserProfile from "./UserProfile";
import RoleSwitcher from "./RoleSwitcher";
import { IconReport, IconPythonRunner, IconLogo, IconAnswer, IconSchool, IconBlackboard, IconTeacher } from "./StatusIcons";

export default function TopNav({ active, onPython, pyActive = false }) {
  const router = useRouter();
  const user = useCurrentUser();
  const admin = user ? isAdmin(user) : false;
  const [navOpen, setNavOpen] = useState(false);
  const dropRef = useRef(null);

  // 드롭다운 바깥 클릭 시 닫기
  useEffect(() => {
    if (!navOpen) return;
    function onDown(e) {
      if (!dropRef.current?.contains(e.target)) setNavOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [navOpen]);

  function handlePython() {
    if (onPython) onPython();
    else router.push("/board?py=1");
  }

  function go(path) {
    setNavOpen(false);
    router.push(path);
  }

  return (
    <header className="topbar">
      {/* 왼쪽: 로고 + 주요 메뉴 */}
      <div className="topbar-left">
        <button className="logo logo-button" onClick={() => go("/board")}>
          <IconLogo size={30} /> 배움나눔
        </button>
        <span className="topbar-divider" aria-hidden="true" />
        <nav className="topnav-menu">

          {/* 학습 공간 드롭다운 — 공부방 · 질문게시판 */}
          <div className="topnav-drop-wrap" ref={dropRef}>
            <button
              className={`btn-ghost topnav-drop-btn ${active === "board" || active === "study" ? "nav-active" : ""}`}
              onClick={() => setNavOpen((v) => !v)}
            >
              <IconSchool size={20} /> 학습 공간
              <span className="topnav-drop-chevron">{navOpen ? "▴" : "▾"}</span>
            </button>

            {navOpen && (
              <div className="topnav-dropdown">
                <button
                  className={`topnav-drop-item ${active === "board" ? "active" : ""}`}
                  onClick={() => go("/board")}
                >
                  <IconAnswer size={18} /> 질문방
                </button>
                <button
                  className={`topnav-drop-item ${active === "study" ? "active" : ""}`}
                  onClick={() => go("/study")}
                >
                  <IconBlackboard size={18} /> 공부방
                </button>
              </div>
            )}
          </div>

          <button
            className={`btn-ghost ${pyActive ? "py-btn-active" : ""}`}
            onClick={handlePython}
            title="파이썬 실행기"
          >
            <IconPythonRunner size={20} /> <span className="nav-label">파이썬 실행기</span>
          </button>
          {admin ? (
            <button
              className={`btn-ghost ${active === "admin" ? "nav-active" : ""}`}
              onClick={() => go("/admin")}
              title="관리자 대시보드"
            >
              <IconTeacher size={20} /> <span className="nav-label">관리자 대시보드</span>
            </button>
          ) : (
            <button
              className={`btn-ghost ${active === "report" ? "nav-active" : ""}`}
              onClick={() => go("/report")}
              title="학습 리포트"
            >
              <IconReport size={20} /> <span className="nav-label">학습 리포트</span>
            </button>
          )}
        </nav>
      </div>

      {/* 오른쪽: 역할 전환 + 프로필 + 로그아웃 */}
      <div className="user-area">
        <RoleSwitcher />
        <UserProfile />
        <button className="btn-ghost" onClick={() => go("/")}>
          로그아웃
        </button>
      </div>
    </header>
  );
}
