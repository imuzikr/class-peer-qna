"use client";

import { useEffect, useRef, useState } from "react";
import {
  dismissQuestionSignal,
  formatTime,
  setQuestionSignal,
  subscribeMyQuestionSignal,
  subscribeQuestionSignals,
} from "@/lib/store";
import QuestionSeatModal from "./QuestionSeatModal";

export default function QuestionSignalButton({
  classId,
  user,
  isTeacher = false,
  // 지금 지켜보는 반 이름 — 교사가 여러 반을 오가므로, 손이 안 올라올 때
  // '아무도 안 들었다'인지 '엉뚱한 반을 보고 있다'인지 가릴 자리가 필요합니다.
  className = "",
}) {
  const [seatOpen, setSeatOpen] = useState(false);
  const [signals, setSignals] = useState([]);
  const [readError, setReadError] = useState(null);
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
      setReadError(null);
      return;
    }
    if (isTeacher) return subscribeQuestionSignals(classId, setSignals, setReadError);
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

  // [교사 화면에 손바닥을 늘 두는 이유]
  // 예전에는 손든 학생이 있을 때만 아이콘이 나타났습니다. 자리를 아끼는
  // 방법이지만, 아이콘이 없을 때 그것이 '아무도 안 들었다'인지 '보고 있는
  // 반이 다르다·읽기에 실패했다'인지 알 길이 없었습니다. 옆의 확성기·종은
  // 늘 있는데 손바닥만 사라지니 더 그렇습니다.
  // 그래서 늘 두되, 아무도 안 들었으면 흐리게 두고 숫자도 붙이지 않습니다.

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
        className={
          `question-signal-btn${active ? " on" : ""}` +
          (isTeacher && !active ? " idle" : "")
        }
        onClick={handleClick}
        disabled={!classId || busy}
        aria-haspopup={isTeacher ? "menu" : undefined}
        aria-expanded={isTeacher ? open : undefined}
        title={
          isTeacher
            ? `질문하려고 손든 학생 ${signals.length}명${className ? ` · ${className}` : ""}`
            : mine
              ? "질문 취소"
              : "질문하기"
        }
        aria-label={
          isTeacher
            ? `질문하려고 손든 학생 ${signals.length}명 보기`
            : mine
              ? "질문 취소"
              : "질문하기"
        }
      >
        <span className="question-signal-hand" aria-hidden="true">🖐️</span>
        {!isTeacher && active && <span className="question-signal-dot" aria-hidden="true" />}
        {/* 교사는 몇 명인지가 곧 봐야 할 정보라 숫자로 답니다(종 뱃지와 같은 모양) */}
        {isTeacher && active && (
          <span className="question-signal-count" aria-hidden="true">{signals.length}</span>
        )}
      </button>

      {isTeacher && open && (
        <div className="question-signal-dropdown" role="menu">
          <div className="question-signal-head">
            <p className="question-signal-title">
              질문 대기 {signals.length}명
              {/* 어느 반을 지켜보는 중인지 — 손이 안 올라올 때 반을 잘못 고른
                  것인지 여기서 바로 가려집니다(상단바는 반을 안 보여 줍니다) */}
              {className && <em className="question-signal-scope">{className}</em>}
            </p>
            {/* 이름만으로는 교실에서 누가 손을 든 건지 찾기 어려워, 자리표로
                한 번에 확인할 수 있는 입구를 둡니다 */}
            <button
              type="button"
              className="question-signal-seats"
              onClick={() => { setSeatOpen(true); setOpen(false); }}
              title="자리표에서 손든 학생 확인 — 자리를 눌러 과일·누가기록도 열 수 있어요"
            >
              🪑 자리확인
            </button>
          </div>
          {readError ? (
            // 읽기 실패를 '아무도 안 들었다'로 보여 주면 고장을 못 알아챕니다.
            <p className="question-signal-empty question-signal-error">
              손든 학생 목록을 읽지 못했어요({readError}).
              <br />
              지금 고른 반이 맞는지 확인해 주세요.
            </p>
          ) : signals.length === 0 ? (
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

      {seatOpen && (
        <QuestionSeatModal classId={classId} onClose={() => setSeatOpen(false)} />
      )}
    </div>
  );
}
