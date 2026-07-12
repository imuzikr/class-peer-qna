"use client";

// =============================================================
// 공통 상단 내비게이션
// -------------------------------------------------------------
// 왼쪽: 배움나눔 로고 ｜ 학습 공간 드롭다운(공부방·질문게시판) ｜ 파이썬 실행기 ｜ (리포트|관리자)
// 오른쪽: 역할 전환(개발용) ｜ 사용자 프로필 ｜ 로그아웃
// =============================================================
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { isAdmin, isTeacher } from "@/lib/user";
import { isFirebaseConfigured } from "@/lib/firebase";
import { signOutUser } from "@/lib/auth";
import { subscribeUserDirectory } from "@/lib/store";
import { useCurrentUser } from "@/lib/useCurrentUser";
import UserProfile from "./UserProfile";
import RoleSwitcher from "./RoleSwitcher";
import RoleManagerModal from "./RoleManagerModal";
import { IconReport, IconPythonRunner, IconLogo, IconAnswer, IconSchool, IconBlackboard, IconTeacher, IconLogout } from "./StatusIcons";

export default function TopNav({ active, onPython, pyActive = false }) {
  const router = useRouter();
  const user = useCurrentUser();
  const admin = user ? isTeacher(user) : false;      // 교사+관리자 (대시보드 접근)
  const isStrictAdmin = user ? isAdmin(user) : false; // 최고 관리자만 (역할 관리)
  const [navOpen, setNavOpen] = useState(false);
  const [roleMgrOpen, setRoleMgrOpen] = useState(false);
  const [directory, setDirectory] = useState([]);
  const dropRef = useRef(null);

  // 관리자만 사용자 디렉터리를 구독(역할 관리·승인 대기 표시용)
  useEffect(() => {
    if (!isFirebaseConfigured || !isStrictAdmin) return;
    return subscribeUserDirectory(setDirectory);
  }, [isStrictAdmin]);

  const pendingTeacherCount = directory.filter(
    (u) => u.requestedRole === "teacher" && u.role !== "teacher" && u.role !== "admin"
  ).length;

  // 이동 가능성이 높은 라우트를 미리 프리페치 → 클릭 시 즉시 전환
  useEffect(() => {
    router.prefetch("/board");
    router.prefetch("/study");
    router.prefetch(admin ? "/admin" : "/report");
  }, [admin, router]);

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

  async function handleLogout() {
    if (isFirebaseConfigured) {
      try {
        await signOutUser();
      } catch {
        /* 무시하고 랜딩으로 */
      }
    }
    router.push("/");
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
              <IconSchool size={20} /> <span className="nav-label">학습 공간</span>
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
            data-py-toggle
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
              title={isStrictAdmin ? "관리자 대시보드" : "선생님 대시보드"}
            >
              <IconTeacher size={20} />{" "}
              <span className="nav-label">
                {isStrictAdmin ? "관리자 대시보드" : "선생님 대시보드"}
              </span>
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

          {/* 역할 관리 — 관리자만. 대시보드 버튼 오른쪽에 위치 */}
          {isStrictAdmin && (
            <button
              className="btn-ghost topnav-role-btn"
              onClick={() => setRoleMgrOpen(true)}
              title="역할 관리"
            >
              🛡️ <span className="nav-label">역할 관리</span>
              {pendingTeacherCount > 0 && (
                <span className="role-badge">{pendingTeacherCount}</span>
              )}
            </button>
          )}
        </nav>
      </div>

      {roleMgrOpen && (
        <RoleManagerModal
          directory={directory}
          onClose={() => setRoleMgrOpen(false)}
        />
      )}

      {/* 오른쪽: 역할 전환(데모 전용) + 프로필 + 로그아웃 */}
      <div className="user-area">
        {!isFirebaseConfigured && <RoleSwitcher />}
        <UserProfile />
        <button className="btn-ghost btn-logout" onClick={handleLogout} title="로그아웃">
          <IconLogout size={18} /> <span className="nav-label">로그아웃</span>
        </button>
      </div>
    </header>
  );
}
