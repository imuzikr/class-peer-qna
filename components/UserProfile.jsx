"use client";

// =============================================================
// 상단바 오른쪽의 접속 사용자 프로필 — 클릭하면 메뉴가 열립니다
// -------------------------------------------------------------
// - 동그라미 아바타(이모지) + 표시 이름 + ▾
// - 메뉴: [내 프로필](전원) / [관리자 설정 → 역할 관리](최고 관리자만) / [로그아웃]
//
// [로그아웃이 왜 여기인가]
// 예전에는 상단바 오른쪽 끝에 아이콘+글자 단추로 나와 있었습니다. 상단바에
// 전광판이 생기면서 그 폭(90px 남짓)이 아까워졌고, 로그아웃은 **하루에 한 번
// 누를까 말까 한 것**이라 늘 자리를 차지할 일이 아닙니다. 프로필 메뉴는
// '나에 관한 것'을 모아 둔 자리라 뜻으로도 여기가 맞습니다.
// 메뉴의 마지막에 선으로 갈라 둡니다 — 위 둘은 여는 것이고 이것은 나가는
// 것이라, 잘못 눌러 로그아웃되는 일을 줄입니다.
// - 학생: 본인 화면에서는 "본인 실명"을 표시(본인 확인용). 게시물·채팅에는
//   익명 닉네임으로만 노출됩니다.
// - 교사/관리자: 항상 '선생님'으로 표시 (getCurrentUser가 결정)
// =============================================================
import { useEffect, useRef, useState } from "react";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { isTeacher } from "@/lib/user";
import { IconTeacher, IconLogout } from "@/components/StatusIcons";
import ProfileModal from "./ProfileModal";

export default function UserProfile({ pendingCount = 0, onOpenRoleMgr = null, onLogout = null }) {
  const user = useCurrentUser();
  const teacherRole = isTeacher(user);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const wrapRef = useRef(null);

  // 메뉴 바깥 클릭/터치 시 닫기 (pointerdown — 마우스·터치 모두 처리)
  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e) {
      if (!wrapRef.current?.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [menuOpen]);

  // 학생은 본인 실명(없으면 익명 닉네임 폴백), 교사는 '선생님'
  const shownName = user
    ? teacherRole
      ? user.displayName
      : user.realName || user.displayName
    : "...";

  return (
    <div className="profile-wrap" ref={wrapRef}>
      <button
        type="button"
        className="profile profile-btn"
        onClick={() => setMenuOpen((v) => !v)}
        title="프로필 메뉴"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
      >
        <span className="avatar" aria-hidden="true">
          {teacherRole ? <IconTeacher size={20} /> : user ? user.emoji : "🙂"}
          {pendingCount > 0 && (
            <span className="profile-badge" aria-label={`승인 대기 ${pendingCount}건`}>
              {pendingCount}
            </span>
          )}
        </span>
        <span className="profile-text">
          <strong>{shownName}</strong>
        </span>
        <span className="profile-caret" aria-hidden="true">▾</span>
      </button>

      {menuOpen && user && (
        <div className="profile-menu" role="menu">
          <button
            type="button"
            className="profile-menu-item"
            role="menuitem"
            onClick={() => {
              setMenuOpen(false);
              setProfileOpen(true);
            }}
          >
            👤 내 프로필
          </button>
          {onOpenRoleMgr && (
            <button
              type="button"
              className="profile-menu-item"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                onOpenRoleMgr();
              }}
            >
              🛡️ 관리자 설정
              {pendingCount > 0 && <span className="role-badge">{pendingCount}</span>}
            </button>
          )}
          {onLogout && (
            <button
              type="button"
              className="profile-menu-item profile-menu-item--out"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                onLogout();
              }}
            >
              <IconLogout size={17} /> 로그아웃
            </button>
          )}
        </div>
      )}

      {profileOpen && user && (
        <ProfileModal user={user} onClose={() => setProfileOpen(false)} />
      )}
    </div>
  );
}
