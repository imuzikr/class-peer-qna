"use client";

// =============================================================
// 공부방 보드 추가 모달 (교사 전용)
// -------------------------------------------------------------
// 제목 + 설명 + 주제 키워드 연계(선택).
// 키워드를 연계하면 학생 카드에서 "질문하기"/"관련 질문"이 활성화되고,
// 질문 게시판에서는 "수업으로 돌아가기"가 활성화됩니다. 기본값은 미연결.
// =============================================================
import { useState } from "react";
import { addStudyBoard } from "@/lib/store";
import { getCurrentUser } from "@/lib/user";

export default function StudyBoardForm({ keywords = [], classId = null, onClose }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [linkKeyword, setLinkKeyword] = useState(false);
  const [keyword, setKeyword] = useState(keywords[0] ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      await addStudyBoard(getCurrentUser(), {
        title: title.trim(),
        type: "student",
        description: description.trim(),
        keyword: linkKeyword ? keyword : null,
        classId,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-form" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>➕ 새 수업 보드 만들기</h3>
          <button className="btn-close" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        <form className="form-grid" onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="보드 제목 (예: 2단원 - 수열의 합 탐구)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
          <textarea
            className="study-board-desc-input"
            placeholder="활동 안내를 적어 주세요. (선택)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <label className="study-link-toggle">
            <input
              type="checkbox"
              checked={linkKeyword}
              onChange={(e) => setLinkKeyword(e.target.checked)}
            />
            <span>질문 게시판 주제와 연계하기</span>
          </label>
          {linkKeyword && (
            <select value={keyword} onChange={(e) => setKeyword(e.target.value)}>
              {keywords.map((kw) => (
                <option key={kw} value={kw}>
                  # {kw}
                </option>
              ))}
            </select>
          )}
          <p className="study-link-hint">
            연계하면 학생이 카드에서 바로 질문하고 관련 질문을 모아 볼 수 있어요.
          </p>

          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? "만드는 중..." : "보드 만들기"}
          </button>
        </form>
      </div>
    </div>
  );
}
