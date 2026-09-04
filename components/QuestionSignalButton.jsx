"use client";

import { useEffect, useRef, useState } from "react";
import {
  addStudentReward,
  confirmQuestionSignal,
  dismissQuestionSignal,
  formatTime,
  setQuestionSignal,
  subscribeMyQuestionSignal,
  subscribeQuestionSignals,
} from "@/lib/store";
import QuestionSeatModal from "./QuestionSeatModal";
import { IconChair } from "./StatusIcons";

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

  // [교사 화면에는 손든 학생이 있을 때만]
  // 한동안 흐린 채로 늘 두어 봤습니다. 아이콘이 없을 때 '아무도 안 들었다'인지
  // '보고 있는 반이 다르다'인지 알 수 있게 하려던 것인데, 손든 학생이 없는
  // 시간이 수업의 대부분이라 상단바에 늘 흐린 아이콘 하나가 앉아 있게 됐습니다.
  // 손바닥은 '지금 봐 달라'는 신호라, 아무 일 없을 때 자리를 차지하면 정작
  // 누가 들었을 때의 눈에 띔이 줄어듭니다. 그래서 있을 때만 나타납니다.
  //
  // 학생 쪽은 그대로 늘 있습니다 — 손을 드는 버튼 자체라 사라지면 들 수가
  // 없습니다.

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

  // 손든 학생을 목록에서 내립니다.
  //   award=true  '확인' — 용기 내어 손든 것 자체를 격려하려고 과일도 한 개 줍니다.
  //   award=false '닫기' — 실수로 눌렀거나 이미 해결된 손. 과일 없이 내리기만.
  // 과일을 먼저 주고 그다음에 내립니다. 순서를 뒤집으면 목록 항목이 먼저
  // 사라져, 과일 주기가 실패해도 아무도 모르게 됩니다.
  async function handleDismiss(uid, award = false) {
    if (!classId || dismissing.has(uid)) return;
    setDismissing((prev) => new Set(prev).add(uid));
    try {
      const s = signals.find((x) => x.uid === uid);
      if (award) {
        // 손든 기록에 이미 실명·이모지가 담겨 있어(signalIdentity) 이름표를
        // 알아내려고 사용자 디렉터리를 따로 구독하지 않아도 됩니다.
        await addStudentReward(classId, uid, 1, s ? { name: s.name, emoji: s.emoji } : null);
        // 받아 준 손만 이력에 남깁니다(손 내리기까지 함께 합니다).
        await confirmQuestionSignal(classId, s ?? { uid });
      } else {
        // '닫기'는 잘못 눌린 손이라 아무것도 남기지 않고 내리기만 합니다.
        await dismissQuestionSignal(classId, uid);
      }
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

  // 훅을 모두 지나온 자리입니다(구독은 계속 돌아야 손들면 바로 나타납니다).
  if (isTeacher && !active) return null;

  return (
    <div className="question-signal-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`question-signal-btn${active ? " on" : ""}`}
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
        {/* 학생·교사 모두 숫자 없는 점 하나입니다. 교사 쪽에 인원수를 숫자로
            달아 봤더니 16px짜리 뱃지가 34px 손바닥의 한 귀퉁이를 덮어, 정작
            '손이 올라왔다'가 잘 안 읽혔습니다. 몇 명인지는 눌러서 여는 목록에
            이름까지 함께 있고, 툴팁(title)·스크린리더(aria-label)에도 그대로
            남겨 두었습니다. */}
        {active && <span className="question-signal-dot" aria-hidden="true" />}
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
              <IconChair size={14} /> 자리확인
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
                    {/* 두 갈래로 나눠 둡니다 — 손든 것을 격려하는 '확인'과,
                        잘못 눌린 손을 조용히 내리는 '닫기'. 과일이 붙는 쪽에만
                        🍎를 달아 어느 버튼이 주는 버튼인지 눈으로 갈립니다. */}
                    <button
                      type="button"
                      className="question-signal-confirm"
                      onClick={() => handleDismiss(s.uid, true)}
                      disabled={dismissing.has(s.uid)}
                      title={`${s.name || "이 학생"}의 질문 확인 — 과일 1개를 주고 목록에서 지웁니다`}
                    >
                      🍎 확인
                    </button>
                    <button
                      type="button"
                      className="question-signal-close"
                      onClick={() => handleDismiss(s.uid, false)}
                      disabled={dismissing.has(s.uid)}
                      title={`${s.name || "이 학생"}의 손 내리기 — 과일은 주지 않습니다`}
                    >
                      닫기
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
