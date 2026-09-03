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

// onAward(uid, 바꿀개수, delta) — 세 번째 값이 핵심입니다. 여기 보이는
// `count`는 **방금 누른 결과가 아직 안 돌아왔을 수 있는** 값이라, 그것으로
// 만든 절대값(count+1)을 그대로 보내면 빨리 두 번 누를 때 두 번째가 같은
// 값이 되어 조용히 묻힙니다. delta를 함께 주면 서버가 트랜잭션 안에서
// 지금 값에 더하므로 한 번도 안 묻힙니다.
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
            {/* 과일 받은 흐름 — 주는 버튼 바로 위. 지금 몇 개인지는 자리표에
                이미 적혀 있고, 주기 직전에 알고 싶은 건 '요즘 어떤가'라
                여기서 펼쳐 볼 수 있게 둡니다.
                기본은 접힘 — 이 화면이 전자칠판에 비칩니다. */}
            <StudentRewardTrend
              studentUid={student.uid}
              classId={classId}
              bare
              headRight={
                // 지금 누적 몇 개인지 — 버튼만 있으면 눌렸는지 알 수 없어
                // 누른 결과를 이 자리에서 바로 보여 줍니다.
                // key={count}로 값이 바뀔 때마다 다시 그려져 애니메이션이
                // 새로 돕니다(눌렀다는 신호). aria-live로 소리로도 알립니다.
                <span className="attend-tools-total" aria-live="polite">
                  <span className="attend-tools-total-label">누적</span>
                  <span className="attend-tools-total-n" key={count}>🍎 {count}</span>
                </span>
              }
            />

            <div className="attend-tools-award">
              <button
                type="button"
                className="attend-award-btn attend-award-btn--minus"
                onClick={() => onAward(student.uid, count - 1, -1)}
                disabled={count <= 0}
                title="과일 하나 빼기"
              >
                🍎 <span>-1</span>
              </button>
              <button
                type="button"
                className="attend-award-btn attend-award-btn--plus"
                onClick={() => onAward(student.uid, count + 1, +1)}
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
