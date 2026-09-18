"use client";

// 공부방과 책방에서 공유하는 교사 전용 공부 기록 메뉴.
import { useState } from "react";
import ClassNotesManagerModal from "./ClassNotesManagerModal";

export default function ClassNotesTools({ classId, className = "", roster = [], user }) {
  const [notesOpen, setNotesOpen] = useState(false);

  if (!classId) return null;

  return (
    <>
      <button
        type="button"
        className="btn-ghost class-notes-btn"
        onClick={() => setNotesOpen(true)}
        title="누가기록, 수업 노트, 선생님 메모를 함께 확인합니다"
      >
        공부 기록
      </button>
      {notesOpen && (
        <ClassNotesManagerModal
          classId={classId}
          className={className}
          roster={roster}
          user={user}
          onClose={() => setNotesOpen(false)}
        />
      )}
    </>
  );
}
