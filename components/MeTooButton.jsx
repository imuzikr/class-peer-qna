"use client";

// =============================================================
// "🙋 나도 궁금해요" 버튼
// -------------------------------------------------------------
// - 질문 카드(오른쪽 아래)와 상세 모달(왼쪽 하단) 양쪽에서 사용
// - 클릭한 사용자 수를 함께 표시
// - meTooIds 배열에 uid를 저장하므로 1인 1회만 집계되고,
//   이미 누른 사람이 다시 누르면 취소됩니다.
// =============================================================
import { setMeToo } from "@/lib/store";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { IconAsk } from "./StatusIcons";

export default function MeTooButton({ question }) {
  const user = useCurrentUser();
  const ids = question.meTooIds ?? [];
  const clicked = user ? ids.includes(user.uid) : false;

  function handleClick(e) {
    e.stopPropagation();
    if (!user) return;
    setMeToo(user, question.id, !clicked);
  }

  return (
    <button
      type="button"
      className={`metoo-btn ${clicked ? "on" : ""}`}
      onClick={handleClick}
      aria-pressed={clicked}
      title={
        clicked
          ? "이미 눌렀어요 — 다시 누르면 취소됩니다 (1인 1회)"
          : "나도 궁금하면 눌러 보세요 (1인 1회)"
      }
    >
      <IconAsk size={16} /> 나도 궁금해요
      <span className="metoo-count">{ids.length}</span>
    </button>
  );
}
