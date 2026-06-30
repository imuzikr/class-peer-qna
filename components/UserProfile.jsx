"use client";

// =============================================================
// 상단바 왼쪽의 접속 사용자 프로필
// -------------------------------------------------------------
// - 동그라미 아바타(이모지) + 표시 이름
// - 학생: 익명 닉네임("다급한 달팽이" 형식) — 접속(세션)마다 랜덤
// - 교사/관리자: 항상 '선생님'으로 표시 (getCurrentUser가 결정)
// - 서버 렌더링과 첫 화면이 달라지지 않도록(하이드레이션 오류 방지)
//   useEffect 이후에만 이름을 표시합니다
// =============================================================
import { useCurrentUser } from "@/lib/useCurrentUser";
import { IconTeacher } from "@/components/StatusIcons";

export default function UserProfile() {
  const user = useCurrentUser();
  const isTeacher = user?.role === "admin" || user?.role === "teacher";

  return (
    <div
      className="profile"
      title={
        isTeacher
          ? "교사 계정입니다."
          : "이번 접속 동안 사용할 익명 이름이에요. 새로 접속하면 바뀝니다."
      }
    >
      <span className="avatar" aria-hidden="true">
        {isTeacher ? <IconTeacher size={20} /> : user ? user.emoji : "🙂"}
      </span>
      <span className="profile-text">
        <strong>{user ? user.displayName : "..."}</strong>
      </span>
    </div>
  );
}
