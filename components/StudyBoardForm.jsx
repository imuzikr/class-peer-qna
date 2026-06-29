"use client";

// =============================================================
// 공부방 보드 추가 모달 (교사 전용)
// -------------------------------------------------------------
// · 제목 행 오른쪽에 토글로 "질문 게시판 연계하기" 설정
// · 연계 ON 시 키워드 칩을 복수로 선택 가능 (제목 바로 아래)
// · 설명 입력 (선택)
// =============================================================
import { useState } from "react";
import { addStudyBoard } from "@/lib/store";
import { getCurrentUser } from "@/lib/user";

export default function StudyBoardForm({ keywords = [], classId = null, onClose }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [linkKeyword, setLinkKeyword] = useState(false);
  const [selectedKeywords, setSelectedKeywords] = useState([]);
  const [saving, setSaving] = useState(false);

  function toggleKeyword(kw) {
    setSelectedKeywords((prev) =>
      prev.includes(kw) ? prev.filter((k) => k !== kw) : [...prev, kw]
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      await addStudyBoard(getCurrentUser(), {
        title: title.trim(),
        type: "student",
        description: description.trim(),
        keywords: linkKeyword ? selectedKeywords : [],
        classId,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-study-board" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>➕ 새 수업 보드 만들기</h3>
          <button className="btn-close" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        <form className="form-grid" onSubmit={handleSubmit}>
          {/* 제목 + 연계 토글 */}
          <div className="study-board-form-title-row">
            <input
              type="text"
              placeholder="보드 제목 (예: 이온 결합 모형 탐구)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
            <label
              className="toggle-switch"
              title="질문 게시판 주제와 연계하기"
            >
              <input
                type="checkbox"
                checked={linkKeyword}
                onChange={(e) => setLinkKeyword(e.target.checked)}
              />
              <span className="toggle-track" />
              <span className="toggle-label">연계하기</span>
            </label>
          </div>

          {/* 키워드 칩 (연계 ON일 때) */}
          {linkKeyword && (
            <div className="study-keyword-chips">
              {keywords.map((kw) => (
                <button
                  key={kw}
                  type="button"
                  className={`study-keyword-chip${selectedKeywords.includes(kw) ? " selected" : ""}`}
                  onClick={() => toggleKeyword(kw)}
                >
                  # {kw}
                </button>
              ))}
              {keywords.length === 0 && (
                <p className="study-link-hint">
                  키워드를 먼저 추가해 주세요.
                </p>
              )}
            </div>
          )}

          <textarea
            className="study-board-desc-input"
            placeholder="활동 안내를 적어 주세요. (선택)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? "만드는 중..." : "보드 만들기"}
          </button>
        </form>
      </div>
    </div>
  );
}
