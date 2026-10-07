"use client";

// =============================================================
// 돌발 퀴즈 — 교사 창(두 칸)
// -------------------------------------------------------------
// 왼쪽은 관리, 오른쪽은 자리표입니다(선생님 요청).
//   왼쪽  · 새 퀴즈(글/코드 · 제목 · 설명) → 보내기
//         · 지금 보는 퀴즈 — 보낸 학생 n/N · 퀴즈 마치기
//         · 자리를 누르면 그 학생의 답 + 🍊 과일 주기 · 반송(한 마디는 선택)
//         · 지난 퀴즈(접고 펴는 목록) — 누르면 그 퀴즈의 자리표·답으로
//   오른쪽 자리표 — 답을 보냈는데 아직 확인 전이면 메모지, 과일을 줬으면
//         초록 바탕. 반송했거나 안 보냈으면 아무 표시가 없습니다(선생님
//         요청 — 반송은 '미제출처럼').
//
// 여는 자리는 셋 — 공부방 카드 머리의 '돌발 퀴즈'(그 프로젝트에서 보낸 것으로
// 적힘) · 상단바의 메모지 · 수업 화면 머리의 메모지. 카드에서 열면 곧바로
// 새 퀴즈를 쓰는 칸이 섭니다(`startNew`).
//
// 읽는 것: 이 반의 퀴즈 목록 · 고른 퀴즈의 답 · 자리표 둘 · 명단(디렉터리 ·
// 과일). 창이 떠 있는 동안만 듣습니다.
// =============================================================
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { backdropClose } from "@/lib/modal";
import {
  closePopQuiz,
  dailySeatLayoutId,
  returnPopQuizAnswer,
  rewardPopQuizAnswer,
  sendPopQuiz,
  subscribeClassRewards,
  subscribePopQuizAnswers,
  subscribePopQuizzes,
  subscribeStudySeatLayout,
  subscribeUserDirectory,
  todayDateKey,
  formatTime,
} from "@/lib/store";
import {
  QUIZ_DESC_MAX,
  QUIZ_KINDS,
  QUIZ_NOTE_MAX,
  QUIZ_TITLE_MAX,
  quizCounts,
  seatQuizState,
} from "@/lib/popQuiz";
import { normalizeSeats } from "@/lib/seats";
import { useSeatView } from "@/lib/seatView";
import { useClassRoster } from "@/lib/useClassRoster";
import { SeatPickGrid } from "./SeatPickGrid";
import SeatViewToggle from "./SeatViewToggle";
import { Caret, PopQuizAnswerBody, PopQuizQuestion, PopQuizStatus } from "./PopQuizParts";
import { IconQuizMemo } from "./StatusIcons";

export default function PopQuizTeacherModal({ classId, board = null, startNew = false, onClose }) {
  const [quizzes, setQuizzes] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [composing, setComposing] = useState(startNew);
  const [answers, setAnswers] = useState([]);
  const [pickedUid, setPickedUid] = useState(null);
  const [pastOpen, setPastOpen] = useState(false);
  const [directory, setDirectory] = useState([]);
  const [rewards, setRewards] = useState([]);
  const [seatLayout, setSeatLayout] = useState(null);
  const [dailySeatLayout, setDailySeatLayout] = useState(null);
  const [teacherView, toggleSeatView] = useSeatView();

  useEffect(() => subscribePopQuizzes(classId, setQuizzes), [classId]);
  useEffect(() => subscribeUserDirectory(setDirectory), []);
  useEffect(() => (classId ? subscribeClassRewards(classId, setRewards) : undefined), [classId]);
  useEffect(
    () => (classId ? subscribeStudySeatLayout(classId, "default", setSeatLayout) : undefined),
    [classId]
  );
  const todayLayoutId = dailySeatLayoutId(todayDateKey());
  useEffect(
    () => (classId ? subscribeStudySeatLayout(classId, todayLayoutId, setDailySeatLayout) : undefined),
    [classId, todayLayoutId]
  );

  const openQuiz = (quizzes ?? []).find((q) => q.open) ?? null;
  // 지금 보는 퀴즈 — 고른 것이 없으면 열린 것, 그것도 없으면 가장 최근 것.
  const quiz =
    (quizzes ?? []).find((q) => q.id === selectedId) ?? openQuiz ?? (quizzes ?? [])[0] ?? null;
  const quizId = quiz?.id ?? null;

  useEffect(() => {
    setAnswers([]);
    setPickedUid(null);
    if (!quizId) return;
    return subscribePopQuizAnswers(classId, quizId, setAnswers);
  }, [classId, quizId]);

  const { roster } = useClassRoster(classId, { directory, rewards });
  const byUid = useMemo(() => new Map(roster.map((s) => [s.uid, s])), [roster]);
  const seats = useMemo(
    () => normalizeSeats(dailySeatLayout?.seats ?? seatLayout?.seats ?? [], roster),
    [dailySeatLayout?.seats, seatLayout?.seats, roster]
  );
  const answerByUid = useMemo(() => new Map(answers.map((a) => [a.uid, a])), [answers]);
  const quizStateByUid = useMemo(() => {
    const m = new Map();
    answers.forEach((a) => {
      const st = seatQuizState(a);
      if (st) m.set(a.uid, st);
    });
    return m;
  }, [answers]);
  const counts = quizCounts(answers, roster.map((s) => s.uid));

  // 아직 아무 퀴즈도 없으면 곧바로 쓰는 칸
  const showCompose = composing || (quizzes !== null && quizzes.length === 0);
  const past = (quizzes ?? []).filter((q) => q.id !== quiz?.id);
  const picked = pickedUid ? byUid.get(pickedUid) ?? null : null;

  return createPortal(
    <div className="modal-backdrop pq-backdrop" {...backdropClose(onClose)}>
      <div
        className="modal pq-teacher-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pq-teacher-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3 id="pq-teacher-title" className="head-icon">
            <IconQuizMemo size={22} /> 돌발 퀴즈
          </h3>
          <button className="btn-close" onClick={onClose} aria-label="닫기">×</button>
        </div>

        <div className="pq-teacher-body">
          <div className="pq-left">
            {showCompose ? (
              <ComposeQuiz
                classId={classId}
                board={board}
                openQuiz={openQuiz}
                canCancel={(quizzes ?? []).length > 0}
                onCancel={() => setComposing(false)}
                onSent={(id) => { setComposing(false); setSelectedId(id); setPastOpen(false); }}
              />
            ) : quiz ? (
              <section className="pq-now">
                <div className="pq-now-head">
                  <span className={`pq-state${quiz.open ? " open" : ""}`}>
                    {quiz.open ? "진행 중" : "마침"}
                  </span>
                  <button type="button" className="pq-new-btn" onClick={() => setComposing(true)}>
                    ＋ 새 퀴즈
                  </button>
                </div>
                <PopQuizQuestion quiz={quiz} />
                <div className="pq-counts">
                  <span className="pq-count-main">
                    보낸 학생 <b>{counts.sent}</b> / {counts.total}
                  </span>
                  <span>확인 전 {counts.pending}</span>
                  <span>반송 {counts.returned}</span>
                  <span>🍊 {counts.rewarded}</span>
                </div>
                {quiz.open && (
                  <CloseQuizButton classId={classId} quiz={quiz} />
                )}
              </section>
            ) : (
              <p className="pq-empty">불러오는 중…</p>
            )}

            {!showCompose && quiz && (
              picked ? (
                <AnswerReview
                  key={`${quiz.id}:${picked.uid}`}
                  classId={classId}
                  quiz={quiz}
                  student={picked}
                  answer={answerByUid.get(picked.uid) ?? null}
                  onClose={() => setPickedUid(null)}
                />
              ) : (
                <p className="pq-pick-hint">
                  자리를 누르면 그 학생의 답을 여기서 보고 과일을 주거나 반송할 수 있어요.
                </p>
              )
            )}

            {past.length > 0 && (
              <section className="pq-past pq-past--teacher">
                <button
                  type="button"
                  className="pq-past-toggle"
                  onClick={() => setPastOpen((v) => !v)}
                  aria-expanded={pastOpen}
                >
                  <Caret open={pastOpen} />
                  지난 퀴즈
                  <span className="pq-past-count">{past.length}</span>
                </button>
                {pastOpen && (
                  <ul className="pq-past-list">
                    {past.map((q) => (
                      <li key={q.id}>
                        <button
                          type="button"
                          className="pq-past-head"
                          onClick={() => { setSelectedId(q.id); setComposing(false); setPickedUid(null); }}
                          title="이 퀴즈의 자리표와 답 보기"
                        >
                          <span className={`pq-state pq-state--sm${q.open ? " open" : ""}`}>
                            {q.open ? "진행" : "마침"}
                          </span>
                          <span className="pq-past-title">{q.title}</span>
                          <span className="pq-past-date">{formatTime(q.createdAt)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </div>

          <div className="pq-right">
            {roster.length === 0 ? (
              <p className="lesson-note-empty">이 반에 입장한 학생이 없어요.</p>
            ) : (
              <SeatPickGrid
                seats={seats}
                byUid={byUid}
                onPick={(s) => !showCompose && quiz && setPickedUid(s.uid)}
                quizStateByUid={showCompose ? null : quizStateByUid}
                action="답 보기"
                hint={showCompose ? "퀴즈를 보내면 답을 보낸 자리에 메모지가 떠요" : "메모지 = 답을 보냄 · 초록 = 과일을 줌 — 눌러서 답 보기"}
                headTrail={<SeatViewToggle teacherView={teacherView} onToggle={toggleSeatView} />}
                flipped={teacherView}
              />
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// 새 퀴즈 쓰기 — 글/코드 · 제목(꼭) · 설명(선택, ``` 로 코드 블록).
function ComposeQuiz({ classId, board, openQuiz, canCancel, onCancel, onSent }) {
  const [kind, setKind] = useState("text");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function send() {
    if (!title.trim() || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const id = await sendPopQuiz(classId, {
        kind, title, desc, boardId: board?.id ?? null, boardTitle: board?.title ?? "",
      });
      onSent(id);
    } catch (e) {
      console.error("[돌발 퀴즈] 보내지 못했어요:", e?.code, e?.message);
      setErr(
        e?.code === "permission-denied"
          ? "권한이 없어 보내지 못했어요 — 서버 규칙이 최신인지 확인해 주세요."
          : "보내지 못했어요. 다시 눌러 주세요."
      );
      setBusy(false);
    }
  }

  return (
    <section className="pq-compose">
      <h4 className="pq-compose-title">새 돌발 퀴즈</h4>
      <div className="pq-kind-seg" role="radiogroup" aria-label="답하는 방식">
        {QUIZ_KINDS.map((k) => (
          <button
            key={k.key}
            type="button"
            role="radio"
            aria-checked={kind === k.key}
            className={kind === k.key ? "on" : ""}
            onClick={() => setKind(k.key)}
          >
            {k.key === "code" ? "‹/› 코드" : "✎ 글"}
          </button>
        ))}
      </div>
      <label className="pq-field">
        <span>제목</span>
        <input
          type="text"
          value={title}
          maxLength={QUIZ_TITLE_MAX}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
          placeholder={kind === "code" ? "예: 1부터 10까지 더하는 코드를 짜 보세요" : "예: 변수란 무엇일까요?"}
          autoFocus
        />
      </label>
      <label className="pq-field">
        <span>설명 <em>(선택 · ``` 로 감싸면 코드 블록)</em></span>
        <textarea
          rows={5}
          value={desc}
          maxLength={QUIZ_DESC_MAX}
          onChange={(e) => setDesc(e.target.value)}
          placeholder={"예: 아래 코드의 결과를 예측해 보세요.\n```\nx = 3\nprint(x * 2)\n```"}
        />
      </label>
      {board?.title && <p className="pq-compose-from">‘{board.title}’에서 보내요</p>}
      {openQuiz && (
        <p className="pq-compose-warn">보내면 지금 진행 중인 ‘{openQuiz.title}’은 마쳐져요.</p>
      )}
      {err && <p className="form-error">{err}</p>}
      <div className="pq-compose-btns">
        {canCancel && (
          <button type="button" className="btn-ghost" onClick={onCancel} disabled={busy}>
            취소
          </button>
        )}
        <button type="button" className="btn-primary" onClick={send} disabled={!title.trim() || busy}>
          {busy ? "보내는 중…" : "보내기"}
        </button>
      </div>
    </section>
  );
}

function CloseQuizButton({ classId, quiz }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="pq-close-btn"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try { await closePopQuiz(classId, quiz.id); }
        catch (e) { console.error("[돌발 퀴즈] 마치지 못했어요:", e?.code, e?.message); }
        finally { setBusy(false); }
      }}
      title="더는 답을 받지 않습니다 — 이미 온 답에 과일은 그대로 줄 수 있어요"
    >
      {busy ? "마치는 중…" : "퀴즈 마치기"}
    </button>
  );
}

// 한 학생의 답 — 과일 1개 · 반송(한 마디는 선택).
function AnswerReview({ classId, quiz, student, answer, onClose }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const st = answer?.status;
  const canReward = st === "submitted" || st === "returned";
  const canReturn = st === "submitted" && quiz.open;

  async function act(fn) {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      await fn();
      setNote("");
    } catch (e) {
      console.error("[돌발 퀴즈] 처리하지 못했어요:", e?.code, e?.message);
      setErr("처리하지 못했어요. 다시 눌러 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="pq-review" aria-label={`${student.name}의 답`}>
      <div className="pq-review-head">
        <strong>
          <span aria-hidden="true">{student.emoji ?? "🙂"}</span>
          {student.studentId && <span className="pq-review-no">{student.studentId}</span>}
          {student.name}
        </strong>
        <PopQuizStatus answer={answer} quizOpen={!!quiz.open} />
        <button type="button" className="btn-close" onClick={onClose} aria-label="답 닫기">×</button>
      </div>
      {answer ? (
        <>
          <PopQuizAnswerBody answer={answer} />
          <p className="pq-review-time">보낸 시각 {formatTime(answer.submittedAt)}</p>
          {st === "returned" && answer.returnNote && (
            <p className="pq-review-note">반송하며 남긴 말 — {answer.returnNote}</p>
          )}
        </>
      ) : (
        <p className="pq-empty">아직 답을 보내지 않았어요.</p>
      )}
      {err && <p className="form-error">{err}</p>}
      {st === "rewarded" ? (
        <p className="pq-review-done">🍊 과일을 줬어요 — 이 학생의 퀴즈는 끝났어요.</p>
      ) : canReward && (
        <>
          {canReturn && (
            <input
              type="text"
              className="pq-return-note"
              value={note}
              maxLength={QUIZ_NOTE_MAX}
              onChange={(e) => setNote(e.target.value)}
              placeholder="반송할 때 남길 한 마디 (선택)"
              aria-label="반송할 때 남길 한 마디"
            />
          )}
          {/* 반송할 수 없으면(이미 반송 · 마친 퀴즈) 단추를 안 그립니다 — 꺼진
              테두리 단추가 빈 입력칸처럼 보였습니다(실측). 과일이 줄을 다 씁니다. */}
          <div className={`pq-review-btns${canReturn ? "" : " is-single"}`}>
            {canReturn && (
              <button
                type="button"
                className="btn-ghost pq-return-btn"
                disabled={busy}
                onClick={() => act(() => returnPopQuizAnswer(classId, quiz.id, student.uid, note))}
                title="다시 써서 보내 달라고 돌려보냅니다"
              >
                반송
              </button>
            )}
            <button
              type="button"
              className="btn-primary pq-reward-btn"
              disabled={busy}
              onClick={() =>
                act(() => rewardPopQuizAnswer(classId, quiz.id, student.uid, {
                  name: student.name, emoji: student.emoji ?? "🙂",
                }))
              }
              title="과일 1개를 주고 이 학생의 퀴즈를 마칩니다"
            >
              🍊 과일 주기
            </button>
          </div>
        </>
      )}
    </section>
  );
}
