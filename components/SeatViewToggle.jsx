"use client";

// =============================================================
// 학생 보기 / 선생님 보기 토글 — 자리표가 나오는 화면들이 함께 씁니다
// -------------------------------------------------------------
// 글자가 '지금 어느 쪽에서 본 것인가'를 그대로 말합니다. 켜짐 색을 두지
// 않는 이유는, 옆에 서는 손바닥 뱃지처럼 '켜져 있으니 봐 달라'는 신호로
// 읽혀 눈길을 뺏기 때문입니다(같은 줄에 그 뱃지가 실제로 있습니다).
// =============================================================
export default function SeatViewToggle({ teacherView, onToggle, className = "" }) {
  return (
    <button
      type="button"
      className={`reward-seat-flip${className ? ` ${className}` : ""}`}
      onClick={onToggle}
      aria-pressed={teacherView}
      title={
        teacherView
          ? "교탁에서 본 배치예요. 누르면 학생 쪽에서 본 배치로 돌아갑니다."
          : "학생이 앉아 칠판을 보는 배치예요. 누르면 교탁에서 본 배치로 돌립니다."
      }
    >
      {teacherView ? "선생님 보기" : "학생 보기"}
    </button>
  );
}
