"use client";

// =============================================================
// 상단바 왼쪽의 접속 사용자 프로필
// -------------------------------------------------------------
// - 동그라미 아바타(이모지) + 표시 이름
// - 학생: 본인 화면에서는 "본인 실명"을 표시(본인 확인용). 게시물·채팅에는
//   실명이 저장되지 않고 익명 닉네임으로만 노출되므로, 이 실명은 각자
//   자기 기기에서 자기 자신에게만 보입니다.
// - 교사/관리자: 항상 '선생님'으로 표시 (getCurrentUser가 결정)
// - 서버 렌더링과 첫 화면이 달라지지 않도록(하이드레이션 오류 방지)
//   useEffect 이후에만 이름을 표시합니다
// =============================================================
import { useCurrentUser } from "@/lib/useCurrentUser";
import { IconTeacher } from "@/components/StatusIcons";

export default function UserProfile() {
  const user = useCurrentUser();
  const isTeacher = user?.role === "admin" || user?.role === "teacher";
  // 학생은 본인 실명(없으면 익명 닉네임 폴백), 교사는 '선생님'
  const shownName = user
    ? isTeacher
      ? user.displayName
      : user.realName || user.displayName
    : "...";

  return (
    <div
      className="profile"
      title={
        isTeacher
          ? "교사 계정입니다."
          : "본인 확인용 실명이에요. 게시물·채팅에는 익명 닉네임으로 표시됩니다."
      }
    >
      <span className="avatar" aria-hidden="true">
        {isTeacher ? <IconTeacher size={20} /> : user ? user.emoji : "🙂"}
      </span>
      <span className="profile-text">
        <strong>{shownName}</strong>
      </span>
    </div>
  );
}
