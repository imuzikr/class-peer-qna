"use client";

// =============================================================
// 누가기록 스레드 — 학생 한 명의 관찰 기록 목록 + 작성 (교사 전용)
// -------------------------------------------------------------
// 보상 패널의 말풍선 버튼(모달), 참여 전광판의 슬라이드 패널,
// 관리자 대시보드에서 함께 사용합니다.
//
// 기록마다 '날짜'를 교사가 직접 적습니다 — 지난 수업에 있었던 일을
// 뒤늦게 남기는 경우가 많아, 작성 시각(createdAt)만으로는 언제 있었던
// 일인지 알 수 없기 때문입니다. 목록은 이 날짜 기준 최신순입니다.
// Ctrl/⌘+Enter로 빠르게 저장합니다.
// =============================================================
import { useEffect, useState } from "react";
import {
  subscribeStudentNotes,
  addStudentNote,
  updateStudentNote,
  deleteStudentNote,
  todayDateKey,
} from "@/lib/store";
import { getCurrentUser } from "@/lib/user";
import StudentRewardTrend from "./StudentRewardTrend";

export default function StudentNotesThread({
  studentUid,
  classId = null,
  readOnly = false,
  // 과일 주기 모달에서 넘어온 누가기록은 거기서 이미 흐름을 볼 수 있어 끕니다.
  showRewardTrend = true,
}) {
  const [notes, setNotes] = useState([]);
  const [text, setText] = useState("");
  const [date, setDate] = useState(() => todayDateKey());
  const [saving, setSaving] = useState(false);
  // 편집 중인 기록 — { id, text, date } | null
  const [editing, setEditing] = useState(null);
  const me = getCurrentUser();

  useEffect(() => {
    if (!studentUid) return;
    return subscribeStudentNotes(studentUid, setNotes);
  }, [studentUid]);

  // 다른 학생으로 바꾸면 쓰다 만 입력·편집 상태가 따라오지 않게 정리합니다.
  useEffect(() => {
    setText("");
    setDate(todayDateKey());
    setEditing(null);
  }, [studentUid]);

  async function handleAdd(e) {
    e?.preventDefault?.();
    const t = text.trim();
    if (!t || saving) return;
    setSaving(true);
    try {
      await addStudentNote(me, studentUid, { text: t, classId, date });
      setText("");
      setDate(todayDateKey());
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEdit(e) {
    e?.preventDefault?.();
    const t = editing?.text.trim();
    if (!t || saving) return;
    setSaving(true);
    try {
      await updateStudentNote(editing.id, studentUid, { text: t, date: editing.date });
      setEditing(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(noteId) {
    if (!confirm("이 기록을 삭제할까요? 되돌릴 수 없어요.")) return;
    if (editing?.id === noteId) setEditing(null);
    await deleteStudentNote(noteId, studentUid);
  }

  return (
    <div className="notes-thread">
      {/* 과일 받은 흐름 — 무슨 일이 있었나(기록)와 얼마나 받았나(수치)를
          나란히 놓아, 기록을 쓰면서 그 학생의 변화를 함께 보게 합니다.
          아직 한 번도 못 받은 학생에게는 아무것도 그리지 않습니다. */}
      {showRewardTrend && <StudentRewardTrend studentUid={studentUid} classId={classId} />}

      {/* 읽기 전용(대시보드)에서는 입력창을 숨기고 기록만 보여 줍니다 */}
      {!readOnly && (
        <form className="notes-compose" onSubmit={handleAdd}>
          <label className="notes-date-row">
            <span>날짜</span>
            <input
              type="date"
              className="notes-date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              max={todayDateKey()}
            />
          </label>
          <textarea
            className="notes-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="이 학생의 순간을 기록해 보세요. (예: 친구의 질문에 먼저 답해 줬어요) — Ctrl+Enter로 저장"
            rows={3}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleAdd(e);
            }}
          />
          <button
            type="submit"
            className="btn-primary notes-add-btn"
            disabled={saving || !text.trim()}
          >
            {saving ? "저장 중…" : "저장"}
          </button>
        </form>
      )}

      {notes.length === 0 ? (
        <p className="notes-empty">아직 남긴 기록이 없어요.</p>
      ) : (
        <ul className="notes-list">
          {notes.map((n) =>
            editing?.id === n.id ? (
              // ── 편집 중 — 같은 자리에서 날짜·내용을 고칩니다 ──
              <li key={n.id} className="notes-item notes-item--editing">
                <form className="notes-compose" onSubmit={handleSaveEdit}>
                  <label className="notes-date-row">
                    <span>날짜</span>
                    <input
                      type="date"
                      className="notes-date"
                      value={editing.date}
                      onChange={(e) => setEditing({ ...editing, date: e.target.value })}
                      max={todayDateKey()}
                    />
                  </label>
                  <textarea
                    className="notes-input"
                    value={editing.text}
                    onChange={(e) => setEditing({ ...editing, text: e.target.value })}
                    rows={3}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSaveEdit(e);
                      if (e.key === "Escape") setEditing(null);
                    }}
                  />
                  <div className="notes-edit-actions">
                    <button
                      type="button"
                      className="btn-ghost notes-cancel-btn"
                      onClick={() => setEditing(null)}
                    >
                      취소
                    </button>
                    <button
                      type="submit"
                      className="btn-primary notes-add-btn"
                      disabled={saving || !editing.text.trim()}
                    >
                      {saving ? "저장 중…" : "저장"}
                    </button>
                  </div>
                </form>
              </li>
            ) : (
              <li key={n.id} className="notes-item">
                <p className="notes-text">{n.text}</p>
                <div className="notes-meta">
                  <time>{n.date || "날짜 없음"}</time>
                  {!readOnly && (
                    <span className="notes-item-actions">
                      <button
                        type="button"
                        className="notes-edit"
                        onClick={() =>
                          setEditing({ id: n.id, text: n.text, date: n.date || todayDateKey() })
                        }
                      >
                        편집
                      </button>
                      <button
                        type="button"
                        className="notes-del"
                        onClick={() => handleDelete(n.id)}
                      >
                        삭제
                      </button>
                    </span>
                  )}
                </div>
              </li>
            )
          )}
        </ul>
      )}
    </div>
  );
}
