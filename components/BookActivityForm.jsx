"use client";

// =============================================================
// 책방 활동 만들기 (교사 전용)
// -------------------------------------------------------------
// 주제어(격자 한가운데 들어갈 학습주제 또는 도서명)와 모둠 구성 방식을 정합니다.
//  · 교사 배정 / 무작위 배정 → 만든 뒤 모둠 대시보드에서 명단을 짭니다.
//  · 자유 구성 → 여기서 정한 개수만큼 빈 모둠이 미리 만들어지고,
//    학생이 대시보드에서 직접 골라 들어갑니다.
// =============================================================
import { backdropClose } from "@/lib/modal";
import { useState } from "react";

const MODES = [
  { key: "teacher", label: "교사가 배정", desc: "선생님이 학생을 모둠에 직접 넣습니다." },
  { key: "random", label: "무작위 배정", desc: "인원을 고르게 나눠 자동으로 섞습니다." },
  { key: "free", label: "자유 구성", desc: "학생이 원하는 모둠에 직접 들어갑니다." },
];

export default function BookActivityForm({ onSave, onClose }) {
  const [title, setTitle] = useState("닿소리 채우기");
  const [topic, setTopic] = useState("");
  const [groupMode, setGroupMode] = useState("teacher");
  const [groupCount, setGroupCount] = useState(4);
  const [maxPerGroup, setMaxPerGroup] = useState(6);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!topic.trim() || saving) return;
    setSaving(true);
    try {
      await onSave({ title, topic, groupMode, groupCount, maxPerGroup });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      <form className="modal book-form" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="modal-head">
          <h3>활동 만들기</h3>
          <button type="button" className="btn-close" onClick={onClose} aria-label="닫기">×</button>
        </div>

        <label className="book-field">
          <span>활동 이름</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={40}
          />
        </label>

        <label className="book-field">
          <span>주제어 · 도서명</span>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="예: 어린 왕자"
            maxLength={30}
            autoFocus
          />
          <small>격자 한가운데에 표시됩니다.</small>
        </label>

        <div className="book-field">
          <span>모둠 구성 방식</span>
          <div className="book-mode-list">
            {MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                className={`book-mode-btn${groupMode === m.key ? " active" : ""}`}
                onClick={() => setGroupMode(m.key)}
              >
                <strong>{m.label}</strong>
                <small>{m.desc}</small>
              </button>
            ))}
          </div>
        </div>

        {groupMode === "free" && (
          <div className="book-field-row">
            <label className="book-field">
              <span>모둠 수</span>
              <select value={groupCount} onChange={(e) => setGroupCount(Number(e.target.value))}>
                {[2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>{n}개</option>
                ))}
              </select>
            </label>
            <label className="book-field">
              <span>모둠당 최대 인원</span>
              <select value={maxPerGroup} onChange={(e) => setMaxPerGroup(Number(e.target.value))}>
                {[3, 4, 5, 6, 7, 8].map((n) => (
                  <option key={n} value={n}>{n}명</option>
                ))}
              </select>
            </label>
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>취소</button>
          <button type="submit" className="btn-primary" disabled={!topic.trim() || saving}>
            {saving ? "만드는 중…" : "만들기"}
          </button>
        </div>
      </form>
    </div>
  );
}
