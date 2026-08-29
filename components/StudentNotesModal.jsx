"use client";

// =============================================================
// 누가기록 모달 — 보상 패널의 말풍선 버튼으로 열립니다 (교사 전용)
// =============================================================
import { backdropClose } from "@/lib/modal";
import StudentNotesThread from "./StudentNotesThread";

// onBack — 과일 주기 모달에서 넘어온 경우, 왔던 화면으로 돌아가는 화살표를
// 왼쪽에 답니다. 기록을 남기고 나서 과일도 주려면 지금까지는 모달을 닫고
// 자리를 다시 눌러야 했습니다.
export default function StudentNotesModal({ student, classId = null, onBack = null, onClose }) {
  return (
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      <div className="modal modal-notes" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>
            {onBack && (
              <button
                type="button"
                className="modal-back"
                onClick={onBack}
                aria-label="뒤로"
                title="뒤로"
              >
                ‹
              </button>
            )}
            📝 누가기록
            <span className="notes-student">
              {student.emoji} {student.name}
            </span>
          </h3>
          <button className="btn-close" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>
        <StudentNotesThread studentUid={student.uid} classId={classId} />
      </div>
    </div>
  );
}
