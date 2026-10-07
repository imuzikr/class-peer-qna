"use client";

import { useEffect, useRef, useState } from "react";
import {
  addStudentReward,
  confirmQuestionSignal,
  dismissQuestionSignal,
  formatTime,
  markSignalSeen,
  sendSignalMessage,
  setQuestionSignal,
  subscribeMyQuestionSignal,
  subscribeMySignalThread,
  subscribeQuestionSignals,
  subscribeSignalThreads,
} from "@/lib/store";
import {
  SIGNAL_MESSAGE_MAX,
  awaitsTeacher,
  lastTeacherEntry,
  studentLight,
  threadEntries,
  threadKeyOf,
} from "@/lib/signalThread";
import QuestionSeatModal from "./QuestionSeatModal";
import SignalThread from "./SignalThread";
import { QUESTION_TAGS, QUESTION_NOTE_MAX } from "@/lib/questionTags";
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
  // 학생이 손을 들며 함께 보내는 것 — 태그 하나와 짧은 메모.
  const [tag, setTag] = useState("");
  const [note, setNote] = useState("");
  // 확인 처리 중인 학생 uid — 그 항목의 확인 버튼만 잠가 중복 클릭을 막습니다.
  const [dismissing, setDismissing] = useState(() => new Set());
  // 손들기 대화(lib/signalThread.js) — 손든 학생과 교사가 주고받는 말.
  //   교사: 열린 대화들의 말 · 지금 답을 쓰는 학생과 글.
  //   학생: 내 대화의 말({ key, rows } — 어느 줄기의 답인지 함께 들어 '아직 안
  //         왔다'와 '없다'를 가름) · 이 기기에서 방금 본 마지막 말 id(불 끄기) ·
  //         닫힌 대화를 열어 본 그 모습 · 이어서 적는 글.
  const [messages, setMessages] = useState([]);
  const [myMsgs, setMyMsgs] = useState({ key: null, rows: [] });
  const [replyTo, setReplyTo] = useState(null); // 교사가 답을 쓰는 학생 uid
  const [replyText, setReplyText] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);
  const [replyErr, setReplyErr] = useState(null);
  const [mineLoaded, setMineLoaded] = useState(false);
  const [seenLocal, setSeenLocal] = useState(null);
  const [closedView, setClosedView] = useState(null);
  const [lastThread, setLastThread] = useState(null); // 학생: 마지막 대화 { key, seen }
  const [draft, setDraft] = useState("");
  const [draftErr, setDraftErr] = useState(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    setMineLoaded(false);
    if (!classId || !user?.uid) {
      setSignals([]);
      setMine(null);
      setReadError(null);
      return;
    }
    if (isTeacher) return subscribeQuestionSignals(classId, setSignals, setReadError);
    setLastThread(readLastThread(classId, user.uid));
    return subscribeMyQuestionSignal(classId, user.uid, (s) => {
      setMine(s);
      setMineLoaded(true);
    });
  }, [classId, user?.uid, isTeacher]);

  // ── 교사: 열린 대화들의 말 ── 손든 학생들의 줄기만 듣습니다(이력이 쌓여도
  // 읽는 양이 손든 학생 수만큼). 목록을 펼치지 않아도 늘 듣습니다 — 손바닥
  // 불(답을 기다리는 대화가 있나)이 그것으로 켜지므로.
  const threadIdsKey = isTeacher ? signals.map(threadKeyOf).filter(Boolean).sort().join(",") : "";
  useEffect(() => {
    if (!isTeacher || !classId) { setMessages([]); return; }
    return subscribeSignalThreads(classId, threadIdsKey ? threadIdsKey.split(",") : [], setMessages);
  }, [isTeacher, classId, threadIdsKey]);

  // ── 학생의 대화 ──
  // 손이 올라가 있으면 그 손의 줄기. 손이 내려갔는데(교사가 '확인'·'닫기')
  // 마지막 줄기에 아직 못 본 선생님 말이 있으면 **닫힌 대화** — 초록 불로 알리고
  // 한 번 보여 줍니다. 마지막 줄기는 이 기기에 적어 둡니다(손 문서가 지워지면
  // 줄기 id를 알 길이 없어서) — 다른 기기에서는 닫힌 대화 알림이 안 뜹니다.
  const mineKey = !isTeacher ? threadKeyOf(mine) : null;
  useEffect(() => {
    if (isTeacher || !mineKey || !classId || !user?.uid) return;
    if (lastThread?.key === mineKey) return;
    const next = { key: mineKey, seen: null };
    setLastThread(next);
    writeLastThread(classId, user.uid, next);
  }, [isTeacher, mineKey, lastThread?.key, classId, user?.uid]);
  const myKey = isTeacher || !mineLoaded ? null : mineKey || lastThread?.key || null;
  useEffect(() => {
    if (isTeacher || !classId || !user?.uid || !myKey) { setMyMsgs({ key: null, rows: [] }); return; }
    return subscribeMySignalThread(classId, user.uid, myKey, (rows) => setMyMsgs({ key: myKey, rows }));
  }, [isTeacher, classId, user?.uid, myKey]);
  const myRows = myMsgs.key === myKey ? myMsgs.rows : [];
  const myEntries = !isTeacher && myKey ? threadEntries(mine, myRows) : [];
  const lastTeacherId = lastTeacherEntry(myEntries)?.id ?? null;
  const closed = !isTeacher && mineLoaded && !mine && myMsgs.key === myKey && !!lastTeacherId
    && lastThread?.seen !== lastTeacherId;
  const light = isTeacher ? null : studentLight({ signal: mine, entries: myEntries, seenLocal, closed });

  // 닫힌 대화에 볼 것이 없으면(선생님 말 없음 · 이미 봄) 적어 둔 줄기를 놓습니다.
  useEffect(() => {
    if (isTeacher || !mineLoaded || mine || !lastThread || myMsgs.key !== lastThread.key) return;
    if (lastTeacherId && lastThread.seen !== lastTeacherId) return;
    setLastThread(null);
    writeLastThread(classId, user?.uid, null);
  }, [isTeacher, mineLoaded, mine, lastThread, myMsgs.key, lastTeacherId, classId, user?.uid]);

  // 본 것으로 적기 — **손바닥을 눌러 창을 열면 불이 모두 꺼집니다**(선생님 요청).
  // 창이 열린 채 선생님 말이 오면 그것도 곧바로 봄. 학생이 창에서 이어 적은
  // 말은 봄으로 치지 않아, 창을 닫으면 '답을 기다림' 빨간 불이 섭니다.
  const lastEntry = myEntries[myEntries.length - 1] ?? null;
  function markSeen() {
    if (!mine || !lastEntry || !classId || !user?.uid) return;
    setSeenLocal(lastEntry.id);
    // 손이 올라가 있는 동안 본 선생님 말은 닫힌 뒤에 다시 알리지 않습니다.
    if (lastTeacherId && mineKey) {
      const next = { key: mineKey, seen: lastTeacherId };
      setLastThread(next);
      writeLastThread(classId, user.uid, next);
    }
    markSignalSeen(classId, user.uid).catch((e) =>
      console.warn("[손들기] 본 것을 적지 못했어요:", e?.code, e?.message)
    );
  }
  useEffect(() => {
    if (isTeacher || !open || !light || !mine) return;
    markSeen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    if (isTeacher || !open || light !== "green") return;
    markSeen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEntry?.id]);

  // 닫힌 대화를 열어 보면 그 모습을 붙들어 두고(창을 닫을 때까지 보임) 봤다고 적습니다.
  useEffect(() => {
    if (isTeacher || !open || !closed || closedView) return;
    setClosedView(myEntries);
    const next = { key: lastThread?.key ?? myKey, seen: lastTeacherId };
    setLastThread(next);
    writeLastThread(classId, user?.uid, next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTeacher, open, closed, closedView]);
  useEffect(() => {
    if (!open) { setClosedView(null); setDraftErr(null); }
  }, [open]);

  // 학생 대화 칸 — 새 말이 오면 맨 아래로
  const threadRef = useRef(null);
  const threadLen = closedView ? closedView.length : myEntries.length;
  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [open, threadLen]);

  useEffect(() => {
    if (!open) return;
    function onDown(e) {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  // 창을 열 때 손들기 칸은 늘 비어서 시작합니다(손이 올라가 있으면 그 칸
  // 대신 대화가 서므로 고쳐 쓸 일이 없습니다).
  useEffect(() => {
    if (isTeacher || !open) return;
    setTag("");
    setNote("");
  }, [open, isTeacher]);

  // ── 교사의 대화 ── 손든 학생마다 한 줄기
  const threads = isTeacher
    ? signals.map((s) => {
        const key = threadKeyOf(s);
        return { s, key, entries: threadEntries(s, messages.filter((m) => key && m.threadId === key)) };
      })
    : [];
  const waiting = threads.filter((t) => awaitsTeacher(t.entries)).length;

  const count = isTeacher ? signals.length : mine ? 1 : 0;
  const active = count > 0;
  // 점과 기울기 — **답을 기다리는 쪽에만** 불이 켜집니다(선생님 요청).
  //   교사  빨간 불 = 답을 기다리는 대화가 있다(손을 들었거나 학생이 이어 물음).
  //         다 답했으면 손바닥은 남되(대화가 열려 있으므로) 불이 꺼집니다.
  //   학생  빨간 불 = 내 말이 답을 기다린다 · 초록 불 = 안 본 선생님 말.
  //         **손바닥을 눌러 보면 불이 모두 꺼집니다** — 대화는 '닫기' 전까지
  //         그대로 열려 있어 손바닥을 누르면 다시 봅니다.
  // 초록은 이 앱에서 늘 '됐다'는 뜻입니다(자리표의 이벤트 점과 같은 값).
  const dot = isTeacher ? (waiting > 0 ? "red" : null) : light;
  const tilted = !!dot;

  // [교사 화면에는 손든 학생이 있을 때만]
  // 한동안 흐린 채로 늘 두어 봤습니다. 아이콘이 없을 때 '아무도 안 들었다'인지
  // '보고 있는 반이 다르다'인지 알 수 있게 하려던 것인데, 손든 학생이 없는
  // 시간이 수업의 대부분이라 상단바에 늘 흐린 아이콘 하나가 앉아 있게 됐습니다.
  // 손바닥은 '지금 봐 달라'는 신호라, 아무 일 없을 때 자리를 차지하면 정작
  // 누가 들었을 때의 눈에 띔이 줄어듭니다. 그래서 있을 때만 나타납니다.
  //
  // 학생 쪽은 그대로 늘 있습니다 — 손을 드는 버튼 자체라 사라지면 들 수가
  // 없습니다.

  // 학생도 곧바로 손을 들지 않고 **작은 창**을 먼저 엽니다 — 태그와 메모를
  // 함께 보내면 교사가 다가가기 전에 무엇인지 알 수 있습니다. 그냥 부르는
  // 손도 있어야 하므로 '내용 없이 손들기'가 나란히 있습니다.
  function handleClick() {
    if (!classId || !user?.uid || busy) return;
    setOpen((v) => !v);
  }

  // 손 들기(또는 든 손 고치기). withNote=false면 메모 없이 보냅니다.
  async function raise(withNote) {
    if (!classId || !user?.uid || busy) return;
    setBusy(true);
    try {
      await setQuestionSignal(classId, user, true, {
        tag,
        note: withNote ? note : "",
      });
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function lower() {
    if (!classId || !user?.uid || busy) return;
    setBusy(true);
    try {
      await setQuestionSignal(classId, user, false);
      setTag("");
      setNote("");
      setOpen(false);
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
      // 대화도 여기서 끝납니다 — 말은 지우지 않고 이력으로 남깁니다(자리표의
      // '손들고 대화한 이력'). 방금 단 답은 학생이 '닫힌 대화'로 한 번 봅니다.
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

  // 못 보낸 까닭 — 규칙 거부는 다시 눌러도 같으므로 그렇게 말합니다
  // (배포된 규칙이 앱보다 옛것일 때 실제로 이 모양으로 났습니다).
  function sendErrorText(e) {
    return e?.code === "permission-denied"
      ? "권한이 없어 보내지 못했어요 — 서버 규칙이 최신인지 확인해 주세요."
      : "보내지 못했어요. 다시 눌러 주세요.";
  }

  async function sendReply(s) {
    const text = replyText.trim();
    if (!classId || !text || replyBusy) return;
    setReplyBusy(true);
    setReplyErr(null);
    try {
      await sendSignalMessage(classId, s.uid, "teacher", text, threadKeyOf(s));
      setReplyTo(null);
      setReplyText("");
    } catch (e) {
      console.error("[손들기] 답을 보내지 못했어요:", e?.code, e?.message);
      setReplyErr(sendErrorText(e));
    } finally {
      setReplyBusy(false);
    }
  }

  // [학생] 대화에 이어 적기 — 손은 그대로 올라가 있고, 교사 쪽에 빨간 불.
  async function sendFollow() {
    const text = draft.trim();
    if (!classId || !user?.uid || !text || busy) return;
    setBusy(true);
    setDraftErr(null);
    try {
      await sendSignalMessage(classId, user.uid, "student", text, threadKeyOf(mine));
      setDraft("");
    } catch (e) {
      console.error("[손들기] 말을 보내지 못했어요:", e?.code, e?.message);
      setDraftErr(sendErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  // 훅을 모두 지나온 자리입니다(구독은 계속 돌아야 손들면 바로 나타납니다).
  //
  // 손이 없으면 **보이지는 않되 자리는 비워 둡니다**(빈 상자 하나). 위 설명대로
  // 그림을 안 그리는 것은 그대로인데, 통째로 없애면 손이 오르내릴 때마다 오른쪽
  // 묶음의 폭이 28px씩 달라지고 그 왼쪽에 붙어 있는 **전광판이 그만큼 밀립니다**
  // — 수업 중에 읽고 있던 한 줄이 움직입니다. 상자 크기는 `.question-signal-btn`
  // 과 같은 28px 고정이라(인원수를 숫자로 안 달아 늘 같은 크기입니다) 정확히
  // 맞아떨어집니다. 학생 쪽은 손바닥이 늘 있어 이 갈래를 안 지납니다.
  if (isTeacher && !active) {
    return <span className="question-signal-hold" aria-hidden="true" />;
  }

  return (
    <div className="question-signal-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`question-signal-btn${tilted ? " on" : ""}`}
        onClick={handleClick}
        disabled={!classId || busy}
        aria-haspopup={isTeacher ? "menu" : undefined}
        aria-expanded={isTeacher ? open : undefined}
        title={
          isTeacher
            ? `질문하려고 손든 학생 ${signals.length}명${waiting ? ` · 답을 기다리는 ${waiting}명` : ""}${className ? ` · ${className}` : ""}`
            : light === "green"
              ? "선생님 답변이 왔어요"
              : mine
                ? "질문 대화 보기"
                : "질문하기"
        }
        aria-label={
          isTeacher
            ? `질문하려고 손든 학생 ${signals.length}명 보기${waiting ? `, 답을 기다리는 ${waiting}명` : ""}`
            : light === "green"
              ? "선생님 답변이 왔어요 — 열어 보기"
              : mine
                ? "질문 대화 보기"
                : "질문하기"
        }
      >
        <span className="question-signal-hand" aria-hidden="true">🖐️</span>
        {/* 학생·교사 모두 숫자 없는 점 하나입니다. 교사 쪽에 인원수를 숫자로
            달아 봤더니 16px짜리 뱃지가 34px 손바닥의 한 귀퉁이를 덮어, 정작
            '손이 올라왔다'가 잘 안 읽혔습니다. 몇 명인지는 눌러서 여는 목록에
            이름까지 함께 있고, 툴팁(title)·스크린리더(aria-label)에도 그대로
            남겨 두었습니다. */}
        {dot && (
          <span
            className={`question-signal-dot${dot === "green" ? " is-reply" : ""}`}
            aria-hidden="true"
          />
        )}
      </button>

      {/* 학생 — 손바닥 옆에 뜨는 작은 창.
          · 손이 내려가 있으면 손들기 칸(태그 하나 + 짧은 메모).
          · 손이 올라가 있으면 **대화** — 첫 물음부터 선생님과 주고받은 말이
            시간순으로 서고, 아래에서 이어 적습니다. 교사가 '확인'·'닫기'로
            손을 내릴 때까지 그대로입니다.
          · 교사가 닫았는데 못 읽은 답이 있었으면 그 대화를 한 번 보여 줍니다. */}
      {!isTeacher && open && (
        <div className="question-signal-dropdown question-signal-ask">
          <div className="question-signal-head">
            <p className="question-signal-title">
              {closedView ? "질문 대화 · 닫힘" : mine ? "질문 대화" : "질문하기"}
            </p>
            <button
              type="button"
              className="btn-close"
              onClick={() => setOpen(false)}
              aria-label="닫기"
            >
              ×
            </button>
          </div>

          {closedView ? (
            <>
              <SignalThread entries={closedView} viewer="student" listRef={threadRef} />
              <p className="qsig-thread-closed">
                선생님이 대화를 닫았어요. 더 궁금한 것이 있으면 새로 손을 들어 주세요.
              </p>
              <div className="qsig-actions qsig-actions--one">
                <button type="button" className="btn-primary" onClick={() => setClosedView(null)}>
                  새로 질문하기
                </button>
              </div>
            </>
          ) : mine ? (
            <>
              <SignalThread entries={myEntries} viewer="student" listRef={threadRef} />
              <textarea
                className="qsig-note qsig-follow"
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, SIGNAL_MESSAGE_MAX))}
                onKeyDown={(e) => {
                  // Ctrl(⌘)+Enter로 보내기 — 채팅 입력과 같은 약속
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendFollow(); }
                }}
                placeholder="더 궁금한 점이나 덧붙일 말을 적어 주세요."
                rows={3}
                aria-label="이어서 적기"
              />
              {draftErr && <span className="qsig-reply-err">{draftErr}</span>}
              <div className="qsig-actions">
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={lower}
                  disabled={busy}
                  title="해결됐으면 손을 내려 주세요 — 대화도 함께 정리돼요"
                >
                  해결됐어요 · 손 내리기
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={sendFollow}
                  disabled={busy || !draft.trim()}
                  title={draft.trim() ? "Ctrl+Enter로도 보내져요" : "적으면 보낼 수 있어요"}
                >
                  보내기
                </button>
              </div>
            </>
          ) : (
            <>
              {/* 태그 — 셋 다 같은 크기(한 줄 3칸 격자). 고르는 데 시간이 들면
                  손드는 일 자체가 부담이 되므로 갈래를 셋으로 못 박아 둡니다.
                  다시 누르면 고름이 풀립니다(태그 없이도 보낼 수 있습니다). */}
              <div className="qsig-tags" role="group" aria-label="무엇 때문인가요">
                {QUESTION_TAGS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    className={`qsig-tag qsig-tag--${t.key}${tag === t.key ? " on" : ""}`}
                    onClick={() => setTag((v) => (v === t.key ? "" : t.key))}
                    aria-pressed={tag === t.key}
                  >
                    {/* 이모지는 여기 안 답니다 — 셋을 같은 크기로 두려면 알약
                        하나가 121px인데, 이모지까지 넣으면 글자가 잘립니다.
                        고른 것은 색이 말해 주고, 교사 목록에서는 알약이 하나뿐이라
                        자리가 남아 이모지를 답니다. */}
                    {t.label}
                  </button>
                ))}
              </div>

              <label className="qsig-note-label" htmlFor="qsig-note">
                메모 <em>(선택)</em>
              </label>
              <textarea
                id="qsig-note"
                className="qsig-note"
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, QUESTION_NOTE_MAX))}
                placeholder="어떤 도움이 필요한지 적어 주세요."
                rows={4}
              />
              <span className="qsig-note-count">
                {note.length.toLocaleString()} / {QUESTION_NOTE_MAX.toLocaleString()}자
              </span>

              <div className="qsig-actions">
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => raise(false)}
                  disabled={busy}
                  title="적은 것 없이 손만 듭니다"
                >
                  내용 없이 손들기
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => raise(true)}
                  disabled={busy || !note.trim()}
                  title={note.trim() ? "" : "메모를 적으면 눌러 보낼 수 있어요"}
                >
                  내용과 함께 손들기
                </button>
              </div>
            </>
          )}
        </div>
      )}

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
              {threads.map(({ s, entries }) => (
                <li key={s.id} className={awaitsTeacher(entries) ? "is-waiting" : ""}>
                  <span className="question-signal-item">
                    <span className="question-signal-avatar" aria-hidden="true">
                      {s.emoji || "🙂"}
                    </span>
                    <span className="question-signal-name">
                      <strong>{s.name || "이름 미설정"}</strong>
                      <small>
                        {s.studentId ? `${s.studentId} · ` : ""}
                        {formatTime(s.createdAt)}
                        {awaitsTeacher(entries) && (
                          <span className="qsig-waiting"> · 답을 기다려요</span>
                        )}
                      </small>
                    </span>
                    {/* 두 갈래로 나눠 둡니다 — 손든 것을 격려하는 '확인'과,
                        잘못 눌린 손을 조용히 내리는 '닫기'. 과일이 붙는 쪽에만
                        🍊를 달아 어느 버튼이 주는 버튼인지 눈으로 갈립니다.
                        둘 다 **대화를 끝냅니다**(학생 손이 내려감). */}
                    <button
                      type="button"
                      className="question-signal-confirm"
                      onClick={() => handleDismiss(s.uid, true)}
                      disabled={dismissing.has(s.uid)}
                      title={`${s.name || "이 학생"}의 질문 확인 — 과일 1개를 주고 대화를 닫습니다`}
                    >
                      🍊 확인
                    </button>
                    <button
                      type="button"
                      className="question-signal-close"
                      onClick={() => handleDismiss(s.uid, false)}
                      disabled={dismissing.has(s.uid)}
                      title={`${s.name || "이 학생"}의 대화 닫기 — 과일은 주지 않습니다`}
                    >
                      닫기
                    </button>
                  </span>
                  {/* 대화 — 첫 물음(태그·메모)부터 주고받은 말이 시간순으로.
                      교사의 말이 오른쪽, 학생의 말이 왼쪽입니다. */}
                  <SignalThread entries={entries} viewer="teacher" compact />
                  <ReplyArea
                    signal={s}
                    answered={!!lastTeacherEntry(entries)}
                    editing={replyTo === s.uid}
                    text={replyText}
                    busy={replyBusy}
                    error={replyTo === s.uid ? replyErr : null}
                    onStart={() => { setReplyTo(s.uid); setReplyText(""); setReplyErr(null); }}
                    onChange={setReplyText}
                    onCancel={() => { setReplyTo(null); setReplyErr(null); }}
                    onSend={() => sendReply(s)}
                  />
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

// 교사 목록의 답하기 칸 — 한 학생의 대화 아래. 보낸 말은 위 대화에 쌓이므로
// 여기는 쓰는 칸 하나뿐입니다(고치기는 없습니다 — 대화는 쌓기만).
function ReplyArea({ signal, answered, editing, text, busy, error, onStart, onChange, onCancel, onSend }) {
  const name = signal.name || "이 학생";
  if (editing) {
    return (
      <span className="qsig-reply-edit">
        <textarea
          className="qsig-note"
          value={text}
          onChange={(e) => onChange(e.target.value.slice(0, SIGNAL_MESSAGE_MAX))}
          onKeyDown={(e) => {
            // Ctrl(⌘)+Enter로 보내기 — 채팅 입력과 같은 약속
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onSend(); }
            if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onCancel(); }
          }}
          placeholder={`${name}에게 답해 주세요.`}
          rows={3}
          autoFocus
          aria-label={`${name}에게 보낼 답`}
        />
        {error && <span className="qsig-reply-err">{error}</span>}
        <span className="qsig-reply-btns">
          <button type="button" className="question-signal-close" onClick={onCancel} disabled={busy}>
            취소
          </button>
          <button
            type="button"
            className="question-signal-confirm"
            onClick={onSend}
            disabled={busy || !text.trim()}
            title="학생 손바닥에 초록 불이 켜지고, 누르면 이 대화를 봅니다"
          >
            {busy ? "보내는 중…" : "보내기"}
          </button>
        </span>
      </span>
    );
  }
  return (
    <span className="qsig-reply-row">
      <button type="button" className="qsig-reply-start" onClick={onStart}>
        💬 {answered ? "이어서 답하기" : "답하기"}
      </button>
    </span>
  );
}

// 학생 — 마지막 대화 줄기를 이 기기에 적어 둡니다({ key, seen }). 손들기 문서가
// 지워진 뒤에도(교사가 닫음) 그 줄기를 찾아 '닫힌 대화'를 한 번 보여 주려고요.
const lastThreadKey = (classId, uid) => `qsig_thread:${classId}:${uid}`;
function readLastThread(classId, uid) {
  try {
    const v = JSON.parse(localStorage.getItem(lastThreadKey(classId, uid)) || "null");
    return v && typeof v.key === "string" ? v : null;
  } catch { return null; }
}
function writeLastThread(classId, uid, v) {
  if (!classId || !uid) return;
  try {
    if (v) localStorage.setItem(lastThreadKey(classId, uid), JSON.stringify(v));
    else localStorage.removeItem(lastThreadKey(classId, uid));
  } catch { /* 저장소가 막힌 브라우저 — 닫힌 대화 알림만 빠짐 */ }
}
