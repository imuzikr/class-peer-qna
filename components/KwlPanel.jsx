"use client";

// KWL 사이드 패널 — 공부방 왼쪽에 항상 표시되는 수업 단위 KWL 작성 공간
// K(알고 있었던 것) / W(알고 싶은 것) / L(새롭게 알게 된 것)
import { useEffect, useState } from "react";
import { subscribeMyKwl, subscribeAllKwl, saveKwl } from "@/lib/store";

function getToday() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function getTodayLabel() {
  return new Date().toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

export default function KwlPanel({ classId, user, isTeacher, onAsk }) {
  const today = getToday();

  const [K, setK] = useState("");
  const [W, setW] = useState("");
  const [L, setL] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [allEntries, setAllEntries] = useState([]);
  const [showAllW, setShowAllW] = useState(false);

  // 내 KWL 구독
  useEffect(() => {
    if (!classId || !user) return;
    return subscribeMyKwl(classId, user.uid, today, (entry) => {
      if (entry) {
        setK(entry.K ?? "");
        setW(entry.W ?? "");
        setL(entry.L ?? "");
      }
    });
  }, [classId, user?.uid, today]);

  // 교사: 전체 학생 KWL 구독
  useEffect(() => {
    if (!isTeacher || !classId) return;
    return subscribeAllKwl(classId, today, setAllEntries);
  }, [isTeacher, classId, today]);

  async function handleSave() {
    if (!classId || !user) return;
    setSaving(true);
    try {
      await saveKwl(classId, user, today, { K, W, L });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  const allW = allEntries.filter((e) => e.W?.trim() && e.userId !== user?.uid);
  const isEmpty = !K.trim() && !W.trim() && !L.trim();

  if (!classId || !user) return null;

  return (
    <aside className="kwl-panel">
      <div className="kwl-panel-head">
        <span className="kwl-panel-title">📋 KWL</span>
        <span className="kwl-panel-date">{getTodayLabel()}</span>
      </div>

      {/* K */}
      <div className="kwl-section">
        <label className="kwl-label">
          <span className="kwl-badge kwl-badge-k">K</span>
          알고 있었던 것
        </label>
        <textarea
          className="kwl-textarea"
          value={K}
          onChange={(e) => setK(e.target.value)}
          placeholder="이미 알고 있던 내용..."
          rows={3}
        />
      </div>

      {/* W */}
      <div className="kwl-section">
        <div className="kwl-label-row">
          <label className="kwl-label">
            <span className="kwl-badge kwl-badge-w">W</span>
            알고 싶은 것
          </label>
          {W.trim() && onAsk && (
            <button
              type="button"
              className="kwl-ask-btn"
              onClick={() => onAsk(W.trim())}
              title="W를 질문 게시판에 올리기"
            >
              ❓ 질문으로
            </button>
          )}
        </div>
        <textarea
          className="kwl-textarea"
          value={W}
          onChange={(e) => setW(e.target.value)}
          placeholder="궁금한 점, 더 알고 싶은 것..."
          rows={3}
        />
      </div>

      {/* L */}
      <div className="kwl-section">
        <label className="kwl-label">
          <span className="kwl-badge kwl-badge-l">L</span>
          새롭게 알게 된 것
        </label>
        <textarea
          className="kwl-textarea"
          value={L}
          onChange={(e) => setL(e.target.value)}
          placeholder="오늘 배우고 깨달은 것..."
          rows={3}
        />
      </div>

      <button
        type="button"
        className="kwl-save-btn"
        onClick={handleSave}
        disabled={saving || isEmpty}
      >
        {saving ? "저장 중..." : saved ? "✓ 저장됨" : "저장"}
      </button>

      {/* 교사: 학생 W 모아보기 */}
      {isTeacher && allW.length > 0 && (
        <div className="kwl-all-w">
          <button
            type="button"
            className="kwl-all-w-toggle"
            onClick={() => setShowAllW((v) => !v)}
          >
            <span>👥 학생 W 모음 ({allW.length})</span>
            <span className="kwl-chevron">{showAllW ? "▴" : "▾"}</span>
          </button>
          {showAllW && (
            <ul className="kwl-all-w-list">
              {allW.map((e) => (
                <li key={e.id} className="kwl-all-w-item">
                  <span className="kwl-all-w-author">
                    {e.authorEmoji} {e.authorName}
                  </span>
                  <p className="kwl-all-w-text">{e.W}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </aside>
  );
}
