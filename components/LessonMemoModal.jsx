"use client";

// =============================================================
// 수업 메모 (교사 전용) — 수업 중에 짧게 적어 두는 곳
// -------------------------------------------------------------
// 누가기록(studentNotes)과 다릅니다. 그쪽은 '학생 한 명에 대한 기록'이라
// 학생을 먼저 고르고 들어가야 합니다. 수업 중에 떠오르는 것들은 대개
// 특정 학생의 일이 아니라 그 시간에 대한 것입니다 — "3번 활동 설명이
// 길었다", "다음엔 예시를 먼저" 같은 것들이요. 그걸 적을 자리가 없어
// 수업이 끝나면 사라졌습니다.
//
// 그래서 이 화면은 쓰는 칸이 먼저입니다. 지난 메모는 접어 두고(드롭다운),
// 펼쳐야 보입니다 — 수업 중에 여는 화면이라 쓰기까지 한 번에 닿아야 합니다.
//
// 학생은 이 메모를 읽지 못합니다(firestore.rules).
// =============================================================
import { useEffect, useRef, useState } from "react";
import { backdropClose } from "@/lib/modal";
import {
  subscribeLessonMemos,
  addLessonMemo,
  updateLessonMemo,
  deleteLessonMemo,
  formatTime,
} from "@/lib/store";

const MAX_LEN = 2000; // 규칙(firestore.rules)과 같은 값

export default function LessonMemoModal({ classId, className = "", user, onClose }) {
  const [text, setText] = useState("");
  const [memos, setMemos] = useState([]);
  const [busy, setBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [editing, setEditing] = useState(null); // { id, text }
  const [confirmDelete, setConfirmDelete] = useState(null); // memoId
  const fieldRef = useRef(null);

  useEffect(() => {
    if (!classId) { setMemos([]); return; }
    return subscribeLessonMemos(classId, setMemos);
  }, [classId]);

  // 열면 바로 쓸 수 있게 — 수업 중에 여는 화면입니다
  useEffect(() => {
    fieldRef.current?.focus();
  }, []);

  async function handleSave() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      await addLessonMemo(classId, user, body);
      setText("");
      // 방금 적은 것이 목록에 들어가는 것을 보여 줍니다 — 저장됐는지
      // 따로 확인하러 가지 않아도 되게.
      setHistoryOpen(true);
    } finally {
      setBusy(false);
    }
  }

  // Ctrl/⌘+Enter로 저장 — 앱의 다른 입력칸과 같은 약속입니다
  function handleKeyDown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSave();
    }
  }

  async function handleEditSave() {
    const body = editing?.text.trim();
    if (!body) return;
    await updateLessonMemo(classId, editing.id, body);
    setEditing(null);
  }

  async function handleDelete(memoId) {
    await deleteLessonMemo(classId, memoId);
    setConfirmDelete(null);
  }

  return (
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      <div
        className="modal modal-lesson-memo"
        role="dialog"
        aria-modal="true"
        aria-label="수업 메모"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3>
            🗒️ 수업 메모
            {className && <span className="notes-student">{className}</span>}
          </h3>
          <button className="btn-close" onClick={onClose} aria-label="닫기">×</button>
        </div>

        <textarea
          ref={fieldRef}
          className="memo-field"
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_LEN))}
          onKeyDown={handleKeyDown}
          rows={5}
          placeholder="수업 중 기억해 둘 것을 적어 주세요. 학생에게는 보이지 않아요."
        />

        <div className="memo-foot">
          <span className="memo-hint">Ctrl(⌘)+Enter로도 저장돼요</span>
          <button
            type="button"
            className="btn-primary memo-save"
            onClick={handleSave}
            disabled={busy || !text.trim()}
          >
            {busy ? "저장 중…" : "저장"}
          </button>
        </div>

        {/* 지난 메모 — 접어 둡니다. 수업 중에는 쓰는 일이 먼저입니다. */}
        <div className="memo-history">
          <button
            type="button"
            className="memo-history-toggle"
            onClick={() => setHistoryOpen((v) => !v)}
            aria-expanded={historyOpen}
          >
            <span className={`memo-caret${historyOpen ? " open" : ""}`} aria-hidden="true">›</span>
            지난 메모 {memos.length > 0 && <em>{memos.length}</em>}
          </button>

          {historyOpen && (
            memos.length === 0 ? (
              <p className="memo-empty">아직 적어 둔 메모가 없어요.</p>
            ) : (
              <ul className="memo-list">
                {memos.map((m) => (
                  <li key={m.id} className="memo-item">
                    {editing?.id === m.id ? (
                      <>
                        <textarea
                          className="memo-field memo-field--edit"
                          value={editing.text}
                          onChange={(e) =>
                            setEditing({ ...editing, text: e.target.value.slice(0, MAX_LEN) })
                          }
                          rows={3}
                        />
                        <div className="memo-item-actions">
                          <button type="button" className="btn-ghost" onClick={() => setEditing(null)}>
                            취소
                          </button>
                          <button
                            type="button"
                            className="btn-primary memo-save"
                            onClick={handleEditSave}
                            disabled={!editing.text.trim()}
                          >
                            저장
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="memo-item-head">
                          <span className="memo-item-time">{formatTime(m.createdAt)}</span>
                          <span className="memo-item-actions">
                            <button
                              type="button"
                              className="memo-mini-btn"
                              onClick={() => setEditing({ id: m.id, text: m.text })}
                            >
                              수정
                            </button>
                            {confirmDelete === m.id ? (
                              <>
                                <button
                                  type="button"
                                  className="memo-mini-btn danger"
                                  onClick={() => handleDelete(m.id)}
                                >
                                  정말 지울까요?
                                </button>
                                <button
                                  type="button"
                                  className="memo-mini-btn"
                                  onClick={() => setConfirmDelete(null)}
                                >
                                  취소
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                className="memo-mini-btn"
                                onClick={() => setConfirmDelete(m.id)}
                              >
                                삭제
                              </button>
                            )}
                          </span>
                        </div>
                        <p className="memo-item-text">{m.text}</p>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )
          )}
        </div>
      </div>
    </div>
  );
}
