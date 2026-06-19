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
import { getCurrentUser } from "@/lib/user";

export default function MeTooButton({ question }) {
  const user = getCurrentUser();
  const ids = question.meTooIds ?? [];
  const clicked = ids.includes(user.uid);

  function handleClick(e) {
    e.stopPropagation(); // 카드 클릭(모달 열기)으로 번지지 않도록
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
      🙋<span className="metoo-label"> 나도 궁금해요</span>
      <span className="metoo-count">{ids.length}</span>
    </button>
  );
}
