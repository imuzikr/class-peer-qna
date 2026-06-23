"use client";

// =============================================================
// 키워드 관리 모달 (교사 전용)
// -------------------------------------------------------------
// · 기존 키워드 이름 변경 / 삭제
// · 새 키워드 추가
// · lib/store.js 의 addKeyword / renameKeyword / deleteKeyword 사용
// =============================================================
import { useState } from "react";
import { addKeyword, renameKeyword, deleteKeyword } from "@/lib/store";
import { IconTrash } from "./StatusIcons";

export default function KeywordManager({ keywords, onClose }) {
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  async function handleAdd(e) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    try {
      await addKeyword(name);
      setNewName("");
    } finally {
      setAdding(false);
    }
  }

  function startEdit(kw) {
    setEditingId(kw.id);
    setEditName(kw.name);
    setConfirmDeleteId(null);
  }

  async function handleRename(id) {
    const name = editName.trim();
    if (!name) return;
    await renameKeyword(id, name);
    setEditingId(null);
    setEditName("");
  }

  async function handleDelete(id) {
    await deleteKeyword(id);
    setConfirmDeleteId(null);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal modal-keyword-mgr"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3>🏷 키워드 관리</h3>
          <button className="btn-close" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        <p className="keyword-mgr-desc">
          질문 게시판과 공부방 보드에서 사용할 주제 키워드를 관리합니다.
          기존 질문의 키워드 값은 변경되지 않습니다.
        </p>

        <ul className="keyword-mgr-list">
          {keywords.map((kw) => (
            <li key={kw.id} className="keyword-mgr-item">
              {editingId === kw.id ? (
                <div className="keyword-mgr-edit-row">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRename(kw.id);
                      if (e.key === "Escape") {
                        setEditingId(null);
                        setEditName("");
                      }
                    }}
                    autoFocus
                    className="keyword-mgr-input"
                  />
                  <button
                    className="btn-primary keyword-mgr-btn"
                    onClick={() => handleRename(kw.id)}
                    disabled={!editName.trim()}
                  >
                    저장
                  </button>
                  <button
                    className="btn-ghost keyword-mgr-btn"
                    onClick={() => {
                      setEditingId(null);
                      setEditName("");
                    }}
                  >
                    취소
                  </button>
                </div>
              ) : confirmDeleteId === kw.id ? (
                <div className="keyword-mgr-confirm-row">
                  <span className="keyword-mgr-name"># {kw.name}</span>
                  <span className="keyword-mgr-warn">삭제할까요?</span>
                  <button
                    className="study-chip danger"
                    onClick={() => handleDelete(kw.id)}
                  >
                    삭제
                  </button>
                  <button
                    className="study-chip ghost"
                    onClick={() => setConfirmDeleteId(null)}
                  >
                    취소
                  </button>
                </div>
              ) : (
                <>
                  <span className="keyword-mgr-name"># {kw.name}</span>
                  <div className="keyword-mgr-actions">
                    <button
                      className="keyword-mgr-action-btn"
                      title="이름 변경"
                      onClick={() => startEdit(kw)}
                    >
                      ✏️
                    </button>
                    <button
                      className="keyword-mgr-action-btn"
                      title="삭제"
                      onClick={() => setConfirmDeleteId(kw.id)}
                    >
                      <IconTrash size={16} />
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
          {keywords.length === 0 && (
            <li className="keyword-mgr-empty">
              키워드가 없어요. 아래에서 추가해 보세요.
            </li>
          )}
        </ul>

        <form className="keyword-mgr-add-row" onSubmit={handleAdd}>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="새 키워드 이름"
            className="keyword-mgr-input"
          />
          <button
            type="submit"
            className="btn-primary keyword-mgr-btn"
            disabled={adding || !newName.trim()}
          >
            {adding ? "추가 중..." : "추가"}
          </button>
        </form>
      </div>
    </div>
  );
}
