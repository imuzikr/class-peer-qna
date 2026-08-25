"use client";

import { useEffect, useRef, useState } from "react";
import {
  dismissQuestionSignal,
  formatTime,
  setQuestionSignal,
  subscribeMyQuestionSignal,
  subscribeQuestionSignals,
} from "@/lib/store";

export default function QuestionSignalButton({ classId, user, isTeacher = false }) {
  const [signals, setSignals] = useState([]);
  const [mine, setMine] = useState(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // 확인 처리 중인 학생 uid — 그 항목의 확인 버튼만 잠가 중복 클릭을 막습니다.
  const [dismissing, setDismissing] = useState(() => new Set());
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!classId || !user?.uid) {
      setSignals([]);
      setMine(null);
      return;
    }
    if (isTeacher) return subscribeQuestionSignals(classId, setSignals);
    return subscribeMyQuestionSignal(classId, user.uid, setMine);
  }, [classId, user?.uid, isTeacher]);

  useEffect(() => {
    if (!open) return;
    function onDown(e) {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const count = isTeacher ? signals.length : mine ? 1 : 0;
  const active = count > 0;

  // 손든 학생이 없어져 아이콘이 사라졌다가 다시 나타날 때, 이전에 열어
  // 보던 목록이 그대로 펼쳐진 채 나타나지 않도록 닫아 둡니다.
  useEffect(() => {
    if (!active) setOpen(false);
  }, [active]);

  if (isTeacher && !active) return null;

  async function handleClick() {
    if (!classId || !user?.uid || busy) return;
    if (isTeacher) {
      setOpen((v) => !v);
      return;
    }
    setBusy(true);
    try {
      await setQuestionSignal(classId, user, !mine);
    } finally {
      setBusy(false);
    }
  }

  async function handleDismiss(uid) {
    if (!classId || dismissing.has(uid)) return;
    setDismissing((prev) => new Set(prev).add(uid));
    try {
      await dismissQuestionSignal(classId, uid);
    } finally {
      // signals 구독이 곧 목록을 갱신해 이 항목 자체가 사라지므로, 실패했을
      // 때만 다시 누를 수 있게 풀어 주면 됩니다.
      setDismissing((prev) => {
        const next = new Set(prev);
        next.delete(uid);
        return next;
      });
    }
  }

  return (
    <div className="question-signal-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`question-signal-btn${active ? " on" : ""}`}
        onClick={handleClick}
        disabled={!classId || busy}
        aria-haspopup={isTeacher ? "menu" : undefined}
        aria-expanded={isTeacher ? open : undefined}
        title={isTeacher ? "질문하려고 손든 학생" : mine ? "질문 취소" : "질문하기"}
        aria-label={
          isTeacher
            ? "질문하려고 손든 학생 보기"
            : mine
              ? "질문 취소"
              : "질문하기"
        }
      >
        <span className="question-signal-hand" aria-hidden="true">🖐️</span>
        {!isTeacher && active && <span className="question-signal-dot" aria-hidden="true" />}
      </button>

      {isTeacher && open && (
        <div className="question-signal-dropdown" role="menu">
          <p className="question-signal-title">질문 대기 {signals.length}명</p>
          {signals.length === 0 ? (
            <p className="question-signal-empty">손든 학생이 없어요.</p>
          ) : (
            <ul className="question-signal-list">
              {signals.map((s) => (
                <li key={s.id}>
                  <span className="question-signal-item">
                    <span className="question-signal-avatar" aria-hidden="true">
                      {s.emoji || "🙂"}
                    </span>
                    <span className="question-signal-name">
                      <strong>{s.name || "이름 미설정"}</strong>
                      <small>
                        {s.studentId ? `${s.studentId} · ` : ""}
                        {formatTime(s.createdAt)}
                      </small>
                    </span>
                    <button
                      type="button"
                      className="question-signal-confirm"
                      onClick={() => handleDismiss(s.uid)}
                      disabled={dismissing.has(s.uid)}
                      title={`${s.name || "이 학생"}의 질문 확인 — 목록에서 지웁니다`}
                    >
                      확인
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
