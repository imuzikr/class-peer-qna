"use client";

// =============================================================
// 상단바 왼쪽의 접속 사용자 프로필
// -------------------------------------------------------------
// - 동그라미 아바타(동물 이모지) + 익명 닉네임("다급한 달팽이" 형식)
// - 닉네임은 접속(세션)마다 랜덤으로 새로 만들어집니다
// - 서버 렌더링과 첫 화면이 달라지지 않도록(하이드레이션 오류 방지)
//   useEffect 이후에만 닉네임을 표시합니다
// =============================================================
import { useEffect, useState } from "react";
import { getAnonProfile } from "@/lib/user";

export default function UserProfile() {
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    setProfile(getAnonProfile());
  }, []);

  return (
    <div
      className="profile"
      title="이번 접속 동안 사용할 익명 이름이에요. 새로 접속하면 바뀝니다."
    >
      <span className="avatar" aria-hidden="true">
        {profile ? profile.emoji : "🙂"}
      </span>
      <span className="profile-text">
        <strong>{profile ? profile.name : "..."}</strong>
      </span>
    </div>
  );
}
