"use client";

// =============================================================
// 누가기록 관리 · 수업 메모 (교사 전용) — 화면 머리말에 끼워 넣는 두 버튼
// -------------------------------------------------------------
// 공부방에만 있던 두 기능입니다. 그런데 이 둘은 '지금 어느 화면을 보고
// 있는가'와 상관이 없습니다 — 수업 중에 학생을 관찰하다 떠오른 것을 적는
// 자리라, 책방에서 활동을 하다가도 그대로 필요합니다. 화면을 옮겨 다니지
// 않게 버튼과 모달을 한 덩어리로 묶어 어느 머리말에나 끼울 수 있게 했습니다.
//
// 쓰는 곳
//   · 책방 목록 — 반 고르는 곳 오른쪽
//   · 책방의 모아보기 화면들 — 제목 끝(제목이 flex라 그 안에 그대로 들어갑니다)
//   · 공부방 제목 줄 — 원래 있던 자리
//
// 교사 전용입니다. classId가 없으면(반을 아직 안 고름) 아무것도 그리지 않습니다.
// =============================================================
import { useState } from "react";
import ClassNotesManagerModal from "./ClassNotesManagerModal";
import LessonMemoModal from "./LessonMemoModal";

export default function ClassNotesTools({ classId, className = "", roster = [], user }) {
  const [notesOpen, setNotesOpen] = useState(false);
  const [memoOpen, setMemoOpen] = useState(false);

  if (!classId) return null;

  return (
    <>
      <button
        type="button"
        className="btn-ghost class-notes-btn"
        onClick={() => setNotesOpen(true)}
        title="누가기록과 학생 수업 노트 — 누가 남겼고 누가 아직인지 한눈에"
      >
        기록 관리
      </button>
      <button
        type="button"
        className="btn-ghost class-notes-btn"
        onClick={() => setMemoOpen(true)}
        title="수업 중 짧게 적어 두기 (학생에게는 보이지 않음)"
      >
        수업 메모
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
      {memoOpen && (
        <LessonMemoModal
          classId={classId}
          className={className}
          user={user}
          onClose={() => setMemoOpen(false)}
        />
      )}
    </>
  );
}
