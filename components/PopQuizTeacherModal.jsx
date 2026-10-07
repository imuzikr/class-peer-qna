"use client";

// =============================================================
// 돌발 퀴즈 — 교사 창(두 칸)
// -------------------------------------------------------------
// 왼쪽은 관리, 오른쪽은 자리표입니다(선생님 요청).
//   왼쪽  · 새 퀴즈(글/코드 · 제목 · 설명) → 보내기
//         · 지금 보는 퀴즈 — 보낸 학생 n/N · 퀴즈 마치기
//         · 지난 퀴즈(접고 펴는 목록) — 누르면 그 퀴즈의 자리표·답으로, 🗑로 지우기
//   자리를 누르면 그 자리 **옆에 팝오버**로 그 학생의 답 + 🍊 과일 주기 · 반송
//         (한 마디는 선택)이 뜹니다(선생님 요청 — 왼쪽 칸까지 눈을 옮기지 않게).
//         옆자리를 누르면 그리로 옮겨 가고, 바깥 · Esc · ×로 닫힙니다.
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { backdropClose } from "@/lib/modal";
import {
  closePopQuiz,
  dailySeatLayoutId,
  deletePopQuiz,
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
import { usePopoverAnchor, usePopoverDismiss } from "@/lib/popover";
import { useSeatView } from "@/lib/seatView";
import { useClassRoster } from "@/lib/useClassRoster";
import { SeatPickGrid } from "./SeatPickGrid";
import SeatViewToggle from "./SeatViewToggle";
import { Caret, PopQuizAnswerBody, PopQuizQuestion, PopQuizStatus } from "./PopQuizParts";
import { IconQuizMemo, IconTrash } from "./StatusIcons";

export default function PopQuizTeacherModal({ classId, board = null, startNew = false, onClose }) {
  const [quizzes, setQuizzes] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [composing, setComposing] = useState(startNew);
  const [answers, setAnswers] = useState([]);
  // 누른 자리 — { uid, el }(el은 팝오버가 붙을 자리 칸)
  const [picked, setPicked] = useState(null);
  const [delAsk, setDelAsk] = useState(null); // 지우기를 되묻는 지난 퀴즈 id
  const [delBusy, setDelBusy] = useState(false);
  const [delErr, setDelErr] = useState(null);
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
  // 지금 보는 퀴즈 — 고른 것, 없으면 진행 중인 것. 마친 퀴즈를 저절로 위 칸에
  // 올리지 않습니다 — 한때 가장 최근 것을 올렸는데, 그러면 그 퀴즈가 목록에서
  // 빠져 지울 길이 없었습니다(선생님 지적). 마친 퀴즈는 모두 목록에 섭니다.
  const quiz =
    (quizzes ?? []).find((q) => q.id === selectedId) ?? openQuiz ?? null;
  const quizId = quiz?.id ?? null;

  useEffect(() => {
    setAnswers([]);
    setPicked(null);
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
  // 목록 — 진행 중인 것까지 모두(보는 중인 줄은 칠해 둠). 지우기는 마친 퀴즈만 —
  // 진행 중인 것은 '퀴즈 마치기' 뒤에 지웁니다(답을 쓰던 학생 화면이 사라지지 않게).
  const past = quizzes ?? [];
  // 위 칸이 비었으면(진행 중 없음 · 고른 것 없음) 목록을 펴 둡니다.
  const listOpen = pastOpen || (!showCompose && !quiz);
  const pickedStudent = picked ? byUid.get(picked.uid) ?? null : null;
  const closePicked = useCallback(() => setPicked(null), []);

  async function removeQuiz(id) {
    if (delBusy) return;
    setDelBusy(true);
    setDelErr(null);
    try {
      await deletePopQuiz(classId, id);
      setDelAsk(null);
      if (selectedId === id) setSelectedId(null);
    } catch (e) {
      console.error("[돌발 퀴즈] 지우지 못했어요:", e?.code, e?.message);
      setDelErr("지우지 못했어요. 다시 눌러 주세요.");
    } finally {
      setDelBusy(false);
    }
  }

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
                  // 마친 뒤에도 그 퀴즈를 그대로 봅니다 — 이미 온 답에 과일을 줘야 합니다.
                  <CloseQuizButton classId={classId} quiz={quiz} onClosed={() => setSelectedId(quiz.id)} />
                )}
              </section>
            ) : quizzes === null ? (
              <p className="pq-empty">불러오는 중…</p>
            ) : (
              <section className="pq-now pq-now--idle">
                <div className="pq-now-head">
                  <span className="pq-state">대기</span>
                  <button type="button" className="pq-new-btn" onClick={() => setComposing(true)}>
                    ＋ 새 퀴즈
                  </button>
                </div>
                <p className="pq-now-idle">
                  진행 중인 퀴즈가 없어요. 아래 목록에서 퀴즈를 고르면 그 퀴즈의 답과 자리표를 볼 수 있어요.
                </p>
              </section>
            )}


            {past.length > 0 && (
              <section className="pq-past pq-past--teacher">
                <button
                  type="button"
                  className="pq-past-toggle"
                  onClick={() => setPastOpen(!listOpen)}
                  aria-expanded={listOpen}
                >
                  <Caret open={listOpen} />
                  퀴즈 목록
                  <span className="pq-past-count">{past.length}</span>
                </button>
                {listOpen && (
                  <ul className="pq-past-list">
                    {past.map((q) => {
                      const viewing = !showCompose && q.id === quiz?.id;
                      return (
                      <li
                        key={q.id}
                        className={[delAsk === q.id && "asking", viewing && "on"].filter(Boolean).join(" ")}
                      >
                        <div className="pq-past-row">
                          <button
                            type="button"
                            className="pq-past-head"
                            onClick={() => { setSelectedId(q.id); setComposing(false); setPicked(null); setDelAsk(null); setPastOpen(true); }}
                            aria-current={viewing ? "true" : undefined}
                            title={viewing ? "지금 보고 있는 퀴즈" : "이 퀴즈의 자리표와 답 보기"}
                          >
                            <span className={`pq-state pq-state--sm${q.open ? " open" : ""}`}>
                              {q.open ? "진행" : "마침"}
                            </span>
                            <span className="pq-past-title">{q.title}</span>
                            <span className="pq-past-date">{formatTime(q.createdAt)}</span>
                          </button>
                          {q.open ? (
                            <span className="pq-past-del pq-past-del--off" title="진행 중인 퀴즈는 마친 뒤에 지울 수 있어요" aria-hidden="true">
                              <IconTrash size={15} />
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="pq-past-del"
                              onClick={() => { setDelAsk(delAsk === q.id ? null : q.id); setDelErr(null); }}
                              aria-label={`‘${q.title}’ 퀴즈 지우기`}
                              title="이 퀴즈 지우기"
                            >
                              <IconTrash size={15} />
                            </button>
                          )}
                        </div>
                        {/* 되묻기는 그 줄 안에서 — 확인 창(ConfirmModal)은 이 창(z 3010)
                            아래에 깔립니다. */}
                        {delAsk === q.id && (
                          <div className="pq-past-confirm" role="alert">
                            <p>
                              이 퀴즈와 학생들이 보낸 답을 모두 지워요. 되돌릴 수 없어요.
                              <span>이미 준 과일은 그대로예요.</span>
                            </p>
                            {delErr && <p className="form-error">{delErr}</p>}
                            <div className="pq-past-confirm-btns">
                              <button type="button" className="btn-ghost" onClick={() => setDelAsk(null)} disabled={delBusy}>
                                취소
                              </button>
                              <button type="button" className="pq-past-confirm-del" onClick={() => removeQuiz(q.id)} disabled={delBusy}>
                                {delBusy ? "지우는 중…" : "지우기"}
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                      );
                    })}
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
                onPick={(s, el) => { if (!showCompose && quiz) setPicked({ uid: s.uid, el }); }}
                quizStateByUid={showCompose || !quiz ? null : quizStateByUid}
                action="답 보기"
                hint={
                  showCompose ? "퀴즈를 보내면 답을 보낸 자리에 메모지가 떠요"
                  : !quiz ? "목록에서 퀴즈를 고르면 그 퀴즈의 답이 자리표에 떠요"
                  : "메모지 = 답을 보냄 · 초록 = 과일을 줌 — 눌러서 답 보기"
                }
                headTrail={<SeatViewToggle teacherView={teacherView} onToggle={toggleSeatView} />}
                flipped={teacherView}
              />
            )}
          </div>
        </div>

        {!showCompose && quiz && picked && pickedStudent && (
          <AnswerPopover anchor={picked.el} onClose={closePicked}>
            <AnswerReview
              key={`${quiz.id}:${picked.uid}`}
              classId={classId}
              quiz={quiz}
              student={pickedStudent}
              answer={answerByUid.get(picked.uid) ?? null}
              onClose={closePicked}
            />
          </AnswerPopover>
        )}
      </div>
    </div>,
    document.body
  );
}

// 누른 자리 옆에 붙어 뜨는 답 창 — 자리 잡기와 닫기는 lib/popover.js(자리표의
// 과일 창 StudentToolsPopover와 같은 길). body에 포털로 띄웁니다: 이 창의
// `.modal`에 등장 애니메이션(transform)이 걸리면 그 안의 fixed가 창 기준으로
// 바뀝니다. 클릭은 React 트리를 따라 창 본체의 stopPropagation에 닿아 배경
// 닫기로 번지지 않습니다. 자리 칸(`.attend-seat--pick`)을 누른 것은 '바깥'이
// 아니라 옆 학생으로 옮겨 가는 중이라 닫지 않습니다.
const POP_W = 380;
const POP_H = 380;
function AnswerPopover({ anchor, onClose, children }) {
  const ref = useRef(null);
  const w = typeof window === "undefined" ? POP_W : Math.min(POP_W, window.innerWidth - 16);
  const pos = usePopoverAnchor(anchor, { w, h: POP_H });
  usePopoverDismiss(true, ref, onClose, ".attend-seat--pick");
  return createPortal(
    <div
      ref={ref}
      className="pq-pop"
      style={{ left: pos.x, top: pos.y, width: w, maxHeight: pos.maxH }}
    >
      {children}
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

function CloseQuizButton({ classId, quiz, onClosed }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="pq-close-btn"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        onClosed?.();
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
  // 두 단추는 늘 함께 서고, 학생이 '보낸' 상태에서만 켜집니다. 반송한 뒤에는
  // 학생이 고쳐 다시 보낼 때까지 둘 다 꺼집니다(선생님 요청). 반송은 열린
  // 퀴즈에서만 — 마친 퀴즈는 학생이 다시 보낼 길이 없습니다.
  const canReward = st === "submitted";
  const canReturn = st === "submitted" && quiz.open;
  const rewardTitle = canReward
    ? "과일 1개를 주고 이 학생의 퀴즈를 마칩니다"
    : st === "returned" ? "반송한 답이에요 — 학생이 다시 보내면 줄 수 있어요"
    : "학생이 답을 보내면 줄 수 있어요";
  const returnTitle = canReturn
    ? "다시 써서 보내 달라고 돌려보냅니다"
    : st === "returned" ? "이미 반송했어요 — 학생이 다시 보내면 누를 수 있어요"
    : st === "submitted" ? "마친 퀴즈는 반송할 수 없어요"
    : "학생이 답을 보내면 누를 수 있어요";

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
      ) : (
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
          {st === "returned" && (
            <p className="pq-review-wait">반송했어요 — 학생이 고쳐 다시 보내면 두 단추가 다시 켜져요.</p>
          )}
          <div className="pq-review-btns">
            <button
              type="button"
              className="btn-ghost pq-return-btn"
              disabled={busy || !canReturn}
              onClick={() => act(() => returnPopQuizAnswer(classId, quiz.id, student.uid, note))}
              title={returnTitle}
            >
              반송
            </button>
            <button
              type="button"
              className="btn-primary pq-reward-btn"
              disabled={busy || !canReward}
              onClick={() =>
                act(() => rewardPopQuizAnswer(classId, quiz.id, student.uid, {
                  name: student.name, emoji: student.emoji ?? "🙂",
                }))
              }
              title={rewardTitle}
            >
              🍊 과일 주기
            </button>
          </div>
        </>
      )}
    </section>
  );
}
