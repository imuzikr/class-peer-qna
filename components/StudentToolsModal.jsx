"use client";

// =============================================================
// 학생 카드를 누르면 뜨는 선택 모달 — 과일 주기 / 누가기록 열기
// -------------------------------------------------------------
// 참여 전광판(AttendanceBoard)과 손들기 자리 확인(QuestionSeatModal)
// 양쪽에서 같은 모달을 씁니다. 두 화면에서 학생을 누르는 동작이
// 똑같아야 해서 컴포넌트를 공유합니다.
//
// 과일 칸과 누가기록 칸은 그리드(grid-auto-rows: 1fr)로 묶어 높이를
// 같게 맞춥니다 — 예전엔 과일 칸만 내용이 많아 두 칸의 크기가 눈에
// 띄게 어긋나 보였습니다.
// =============================================================
import { backdropClose } from "@/lib/modal";
import { REWARD_MAX } from "@/lib/store";
import StudentRewardTrend from "./StudentRewardTrend";

export default function StudentToolsModal({
  student,
  classId = null,
  onAward,
  onOpenNotes,
  onClose,
}) {
  const count = student.count ?? 0;
  const maxed = count >= REWARD_MAX;

  return (
    <div className="modal-backdrop attend-tools-backdrop" {...backdropClose(onClose)}>
      <div
        className="modal attend-tools-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`${student.name} 과일 주기·누가기록`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3>
            {student.emoji ?? "🙂"} {student.name}
            {student.studentId && (
              <span className="attend-tools-no">{student.studentId}</span>
            )}
          </h3>
          <button className="btn-close" onClick={onClose} aria-label="닫기">×</button>
        </div>

        <div className="attend-tools-cards">
          <section className="attend-tools-section">
            <div className="attend-tools-row">
              <span className="attend-tools-label">🍎 과일</span>
              <strong className="attend-tools-count">{count}</strong>
              <span className="attend-tools-hint">눌러서 여러 개 줄 수 있어요</span>
            </div>
            {/* 과일 받은 흐름 — 주는 버튼 바로 위. 지금 몇 개인지(위 숫자)만
                보고 주면 '요즘 조용한 아이'와 '초반에 몰아 받은 아이'가
                구분되지 않아, 주기 직전에 흐름을 펼쳐 볼 수 있게 둡니다.
                기본은 접힘 — 이 화면이 전자칠판에 비칩니다. */}
            <StudentRewardTrend studentUid={student.uid} classId={classId} />

            <div className="attend-tools-award">
              <button
                type="button"
                className="attend-award-btn attend-award-btn--minus"
                onClick={() => onAward(student.uid, count - 1)}
                disabled={count <= 0}
                title="과일 하나 빼기"
              >
                🍎 <span>-1</span>
              </button>
              <button
                type="button"
                className="attend-award-btn attend-award-btn--plus"
                onClick={() => onAward(student.uid, count + 1)}
                disabled={maxed}
                title={maxed ? "과일이 가득 찼어요" : "과일 하나 주기"}
              >
                🍎 <span>+1</span>
              </button>
            </div>
            {maxed && <p className="attend-tools-maxed">과일이 가득 찼어요 (최대 {REWARD_MAX}개)</p>}
          </section>

          <button
            type="button"
            className="attend-tools-notes"
            onClick={() => onOpenNotes(student)}
          >
            📝 누가기록 열기
          </button>
        </div>
      </div>
    </div>
  );
}
