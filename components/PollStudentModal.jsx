"use client";

// =============================================================
// 투표 — 학생 창
// -------------------------------------------------------------
// 떠 있는 동그라미의 '투표'가 열고, 새 투표가 열리거나 결과가 공유되면 처음
// 한 번 저절로 뜹니다(PollCenter).
//  · 열린 투표 — 항목을 고르고 '투표하기'. 마치기 전까지 다시 골라 바꿉니다.
//  · 결과는 선생님이 **공유했을 때만** 막대로 봅니다(내가 고른 줄에 '내 선택').
//  · 아래 '지난 투표'는 공유된 결과만 — 남의 표는 못 읽어 수만 봅니다.
// =============================================================
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { backdropClose } from "@/lib/modal";
import { submitPollVote } from "@/lib/store";
import { cleanPicks, hasVoted, pollKindOf, pollOptions } from "@/lib/poll";
import { IconPoll, PollKindPill, PollResultBars } from "./PollParts";

export default function PollStudentModal({ classId, user, polls, poll, vote, onClose }) {
  const uid = user?.uid;
  const past = useMemo(
    () => (polls ?? []).filter((p) => p.id !== poll?.id && p.shared).slice(0, 5),
    [polls, poll?.id]
  );

  return createPortal(
    <div className="modal-backdrop pq-backdrop" {...backdropClose(onClose)}>
      <div
        className="modal poll-student-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="poll-student-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3 id="poll-student-title" className="head-icon">
            <IconPoll size={22} /> 투표
          </h3>
          <button className="btn-close" onClick={onClose} aria-label="닫기">×</button>
        </div>

        <div className="poll-student-body">
          {poll ? (
            <CurrentPoll key={poll.id} classId={classId} uid={uid} poll={poll} vote={vote} />
          ) : (
            <p className="pq-empty">지금 진행 중인 투표가 없어요. 선생님이 투표를 열면 여기서 고를 수 있어요.</p>
          )}

          {past.length > 0 && (
            <section className="poll-past">
              <h4 className="poll-past-title">지난 투표 결과</h4>
              {past.map((p) => (
                <div key={p.id} className="poll-past-item">
                  <div className="poll-q-head">
                    <PollKindPill kind={p.kind} />
                    <p className="poll-q-title poll-q-title--sm">{p.title}</p>
                  </div>
                  <PollResultBars poll={p} counts={p.results} voters={p.voters ?? 0} />
                  <p className="poll-voters">투표한 사람 {p.voters ?? 0}명</p>
                </div>
              ))}
            </section>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function CurrentPoll({ classId, uid, poll, vote }) {
  const multi = pollKindOf(poll.kind) === "multi";
  const voted = hasVoted(vote);
  const savedPicks = useMemo(() => cleanPicks(poll, vote?.picks), [poll, vote?.picks]);
  const [picks, setPicks] = useState(savedPicks);
  const [editing, setEditing] = useState(!voted);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  // 내 표가 늦게 도착하면(처음 열 때) 그 값으로 맞춥니다 — 고치는 중이 아니면.
  useEffect(() => {
    if (!editing) setPicks(savedPicks);
  }, [savedPicks, editing]);
  useEffect(() => {
    if (voted) setEditing(false);
  }, [voted]);

  function toggle(key) {
    if (!poll.open || !editing) return;
    setErr(null);
    setPicks((cur) => {
      if (!multi) return [key];
      return cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
    });
  }

  async function send() {
    if (busy || !picks.length) return;
    setBusy(true);
    setErr(null);
    try {
      await submitPollVote(classId, poll, uid, picks);
      setEditing(false);
    } catch (e) {
      console.warn("[투표] 투표하지 못했어요:", e?.code, e?.message);
      setErr("투표하지 못했어요. 잠시 뒤 다시 눌러 주세요.");
    } finally {
      setBusy(false);
    }
  }

  const choosing = poll.open && editing;
  const shownPicks = choosing ? picks : savedPicks;

  return (
    <section className="poll-current">
      <div className="poll-q-head">
        <PollKindPill kind={poll.kind} />
        <span className={`poll-state${poll.open ? " is-open" : ""}`}>{poll.open ? "진행 중" : "마침"}</span>
      </div>
      <p className="poll-q-title">{poll.title}</p>

      {poll.open && (
        <>
          <p className="poll-hint">
            {multi ? "여러 개를 고를 수 있어요." : "하나만 고르세요."}
            {voted && !editing && " 투표했어요 — 마치기 전까지 바꿀 수 있어요."}
          </p>
          <div className="poll-options" role={multi ? "group" : "radiogroup"} aria-label="항목">
            {pollOptions(poll).map((o) => {
              const on = shownPicks.includes(o.key);
              return (
                <button
                  key={o.key}
                  type="button"
                  role={multi ? "checkbox" : "radio"}
                  aria-checked={on}
                  className={`poll-option${on ? " on" : ""}${multi ? " is-multi" : ""}`}
                  onClick={() => toggle(o.key)}
                  disabled={!choosing}
                >
                  <span className="poll-option-mark" aria-hidden="true">{on ? "✓" : ""}</span>
                  <span className="poll-option-text">{o.text}</span>
                </button>
              );
            })}
          </div>
          {err && <p className="form-error">{err}</p>}
          <div className="poll-send-row">
            {choosing ? (
              <button
                type="button"
                className="btn-primary poll-send"
                onClick={send}
                disabled={busy || !picks.length}
              >
                {busy ? "보내는 중…" : voted ? "이대로 바꾸기" : "투표하기"}
              </button>
            ) : (
              <button type="button" className="btn-ghost poll-send" onClick={() => setEditing(true)}>
                다시 고르기
              </button>
            )}
          </div>
        </>
      )}

      {poll.shared ? (
        <div className="poll-result-box">
          <p className="poll-result-title">선생님이 공유한 결과</p>
          <PollResultBars poll={poll} counts={poll.results} voters={poll.voters ?? 0} mine={savedPicks} />
          <p className="poll-voters">투표한 사람 {poll.voters ?? 0}명</p>
        </div>
      ) : (
        <p className="poll-wait">
          {poll.open
            ? "결과는 선생님이 공유하면 여기서 함께 봐요."
            : voted
              ? "투표를 마쳤어요. 선생님이 결과를 공유하면 여기서 볼 수 있어요."
              : "투표를 마쳤어요(투표하지 않았어요)."}
        </p>
      )}
    </section>
  );
}
