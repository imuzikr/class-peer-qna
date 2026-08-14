"use client";

// =============================================================
// 책방 활동 만들기 (교사 전용)
// -------------------------------------------------------------
// 주제어(격자 한가운데 들어갈 학습주제 또는 도서명)와 모둠 구성을 정합니다.
// 한 화면에 다 들어오도록 선택지는 모두 가로 버튼으로 두었습니다.
//  · 교사 배정 / 무작위 → 만든 뒤 모둠 대시보드에서 명단을 짭니다.
//  · 자유 구성 → 학생이 대시보드에서 직접 골라 들어갑니다.
// 모둠 이름을 쉼표로 적으면 그 이름으로 한 번에 만들어집니다.
// =============================================================
import { backdropClose } from "@/lib/modal";
import { useState } from "react";

const MODES = [
  { key: "teacher", label: "교사 배정" },
  { key: "random", label: "무작위" },
  { key: "free", label: "자유 구성" },
];
const GROUP_COUNTS = [3, 4, 5, 6];

// "햇살, 바람, 나무" → ["햇살","바람","나무"] (빈 항목은 버림)
function parseNames(raw) {
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export default function BookActivityForm({ onSave, onClose }) {
  const [title, setTitle] = useState("닿소리 채우기");
  const [topic, setTopic] = useState("");
  const [groupMode, setGroupMode] = useState("teacher");
  const [groupCount, setGroupCount] = useState(4);
  const [maxPerGroup, setMaxPerGroup] = useState(6);
  const [namesRaw, setNamesRaw] = useState("");
  const [warning, setWarning] = useState(null); // 이름 개수 불일치 안내
  const [saving, setSaving] = useState(false);

  const names = parseNames(namesRaw);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!topic.trim() || saving) return;

    // 이름을 적었는데 모둠 수와 개수가 다르면 만들지 않고 알려 줍니다.
    if (names.length > 0 && names.length !== groupCount) {
      setWarning(
        `모둠은 ${groupCount}개인데 이름은 ${names.length}개를 적으셨어요.\n` +
          `개수를 맞추거나, 이름을 비우면 '1모둠·2모둠…'으로 자동으로 붙습니다.`
      );
      return;
    }

    setSaving(true);
    try {
      await onSave({ title, topic, groupMode, groupCount, maxPerGroup, groupNames: names });
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

        <div className="book-field-row">
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
          </label>
        </div>

        <div className="book-field">
          <span>모둠 구성 방식</span>
          <div className="book-seg">
            {MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                className={`book-seg-btn${groupMode === m.key ? " active" : ""}`}
                onClick={() => setGroupMode(m.key)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div className="book-field-row">
          <div className="book-field">
            <span>모둠 수</span>
            <div className="book-seg">
              {GROUP_COUNTS.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`book-seg-btn${groupCount === n ? " active" : ""}`}
                  onClick={() => setGroupCount(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          {groupMode === "free" && (
            <div className="book-field book-field--narrow">
              <span>모둠당 최대</span>
              <select value={maxPerGroup} onChange={(e) => setMaxPerGroup(Number(e.target.value))}>
                {[3, 4, 5, 6, 7, 8].map((n) => (
                  <option key={n} value={n}>{n}명</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <label className="book-field">
          <span>
            모둠 이름 <em className="book-optional">선택</em>
            {names.length > 0 && (
              <b className={names.length === groupCount ? "book-cnt ok" : "book-cnt bad"}>
                {names.length} / {groupCount}
              </b>
            )}
          </span>
          <input
            type="text"
            value={namesRaw}
            onChange={(e) => setNamesRaw(e.target.value)}
            placeholder="쉼표로 구분 — 예: 햇살, 바람, 나무, 별빛"
          />
        </label>

        <div className="modal-actions">
          <button type="button" className="btn-ghost" onClick={onClose}>취소</button>
          <button type="submit" className="btn-primary" disabled={!topic.trim() || saving}>
            {saving ? "만드는 중…" : `모둠 ${groupCount}개와 함께 만들기`}
          </button>
        </div>

        {warning && (
          <div className="modal-backdrop confirm-backdrop" onClick={() => setWarning(null)}>
            <div
              className="confirm-modal"
              role="alertdialog"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="confirm-icon-wrap">
                <span className="confirm-icon" aria-hidden="true">⚠️</span>
              </div>
              <h3 className="confirm-title">모둠 수와 이름 개수가 달라요</h3>
              <p className="confirm-desc">{warning}</p>
              <div className="confirm-actions">
                <button
                  type="button"
                  className="confirm-confirm"
                  onClick={() => setWarning(null)}
                  autoFocus
                >
                  확인
                </button>
              </div>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
