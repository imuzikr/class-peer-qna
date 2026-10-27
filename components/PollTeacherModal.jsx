"use client";

// =============================================================
// 투표 — 교사 창(떠 있는 동그라미의 '투표')
// -------------------------------------------------------------
// 두 칸 — 왼쪽 이 반의 투표 목록과 그 아래 '＋ 새 투표', 오른쪽 만들기 칸 또는 고른
// 투표의 결과.
//  · 만들기: 종류(하나만 고르기 · 여러 개 고르기) · 물음 · 항목(처음 셋, ＋로
//    열까지). '투표 시작'을 누르면 진행 중이던 투표는 마칩니다(한 번에 하나).
//  · 결과: 투표한 학생 n / N · 막대 · '누가 골랐나'(교사만) · 아직 안 한 학생.
//    '결과 공유'를 누르면 학생 창에도 같은 막대가 섭니다. 공유한 채 표가
//    바뀌면 PollCenter가 수를 다시 적습니다(학생은 남의 표를 못 읽음).
// =============================================================
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { backdropClose } from "@/lib/modal";
import {
  closePoll,
  createPoll,
  deletePoll,
  sharePollResults,
  subscribePollVotes,
  subscribePolls,
  subscribeUserDirectory,
  unsharePollResults,
} from "@/lib/store";
import {
  POLL_DEFAULT_OPTIONS,
  POLL_KINDS,
  POLL_OPTIONS_MAX,
  POLL_OPTIONS_MIN,
  POLL_OPTION_MAX,
  POLL_TITLE_MAX,
  cleanPicks,
  pollOptionsProblem,
  tallyVotes,
} from "@/lib/poll";
import { useClassRoster } from "@/lib/useClassRoster";
import { IconPoll, PollKindPill, PollResultBars } from "./PollParts";
import { IconTrash } from "./StatusIcons";

const nameOf = (s) => [s?.studentId, s?.name].filter(Boolean).join(" ") || "학생";

export default function PollTeacherModal({ classId, onClose }) {
  const [polls, setPolls] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [composing, setComposing] = useState(false);
  const [directory, setDirectory] = useState([]);

  useEffect(() => subscribePolls(classId, setPolls, 30), [classId]);
  useEffect(() => subscribeUserDirectory(setDirectory), []);
  const { roster } = useClassRoster(classId, { directory });

  const list = polls ?? [];
  const openPoll = list.find((p) => p.open) ?? null;
  const poll = list.find((p) => p.id === selectedId) ?? openPoll ?? null;
  // 투표가 하나도 없으면 곧바로 만들기 칸
  const showCompose = composing || (polls !== null && !poll);

  return createPortal(
    <div className="modal-backdrop pq-backdrop" {...backdropClose(onClose)}>
      <div
        className="modal poll-teacher-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="poll-teacher-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3 id="poll-teacher-title" className="head-icon">
            <IconPoll size={22} /> 투표
          </h3>
          <button className="btn-close" onClick={onClose} aria-label="닫기">×</button>
        </div>

        <div className="poll-teacher-body">
          <aside className="poll-side">
            {/* 오른쪽 '종류'와 같은 이름표 줄 — 그래서 바로 아래 '＋ 새 투표'가
                오른쪽 종류 단추와 같은 높이에서 시작합니다(선생님 요청). 목록은
                그 아래라 길어져도 단추는 제자리입니다. */}
            <span className="poll-field-label poll-side-label">투표 목록</span>
            <button
              type="button"
              className={`btn-primary poll-new${showCompose ? " on" : ""}`}
              onClick={() => setComposing(true)}
            >
              ＋ 새 투표
            </button>
            {polls === null ? (
              <p className="pq-empty">불러오는 중…</p>
            ) : list.length === 0 ? (
              <p className="pq-empty">아직 만든 투표가 없어요.</p>
            ) : (
              <ul className="poll-list">
                {list.map((p) => (
                  <li key={p.id} className={!showCompose && poll?.id === p.id ? "on" : ""}>
                    <button
                      type="button"
                      onClick={() => { setSelectedId(p.id); setComposing(false); }}
                    >
                      <span className="poll-list-title">{p.title}</span>
                      <span className="poll-list-meta">
                        <span className={`poll-state${p.open ? " is-open" : ""}`}>{p.open ? "진행 중" : "마침"}</span>
                        {p.shared && <span className="poll-state is-shared">공유됨</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          <div className="poll-main">
            {showCompose ? (
              <PollCompose
                classId={classId}
                hasOpen={!!openPoll}
                canCancel={!!poll}
                onCancel={() => setComposing(false)}
                onCreated={(id) => { setSelectedId(id); setComposing(false); }}
              />
            ) : poll ? (
              <PollDetail
                key={poll.id}
                classId={classId}
                poll={poll}
                roster={roster}
                onDeleted={() => setSelectedId(null)}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── 만들기 ──
function PollCompose({ classId, hasOpen, canCancel, onCancel, onCreated }) {
  const [kind, setKind] = useState("single");
  const [title, setTitle] = useState("");
  const [options, setOptions] = useState(() => Array(POLL_DEFAULT_OPTIONS).fill(""));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const problem = !title.trim() ? "물음을 적어 주세요." : pollOptionsProblem(options);

  function setOption(i, v) {
    setOptions((cur) => cur.map((o, j) => (j === i ? v : o)));
  }
  function addOption() {
    setOptions((cur) => (cur.length >= POLL_OPTIONS_MAX ? cur : [...cur, ""]));
  }
  function removeOption(i) {
    setOptions((cur) => (cur.length <= POLL_OPTIONS_MIN ? cur : cur.filter((_, j) => j !== i)));
  }

  async function start() {
    if (busy || problem) return;
    setBusy(true);
    setErr(null);
    try {
      const id = await createPoll(classId, { kind, title, options });
      onCreated(id);
    } catch (e) {
      console.warn("[투표] 투표를 열지 못했어요:", e?.code, e?.message);
      setErr(e?.message && !e?.code ? e.message : "투표를 열지 못했어요. 잠시 뒤 다시 눌러 주세요.");
      setBusy(false);
    }
  }

  return (
    <div className="poll-compose">
      <div className="poll-field">
        <span className="poll-field-label">종류</span>
        <div className="poll-kind-seg" role="radiogroup" aria-label="투표 종류">
          {POLL_KINDS.map((k) => (
            <button
              key={k.key}
              type="button"
              role="radio"
              aria-checked={kind === k.key}
              className={kind === k.key ? "on" : ""}
              onClick={() => setKind(k.key)}
            >
              {k.label}
            </button>
          ))}
        </div>
      </div>

      <label className="poll-field">
        <span className="poll-field-label">물음</span>
        <input
          type="text"
          value={title}
          maxLength={POLL_TITLE_MAX}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="예: 다음 시간에 먼저 해 볼 활동은?"
          autoFocus
        />
      </label>

      <div className="poll-field">
        <span className="poll-field-label">
          항목 <span className="poll-field-sub">{options.length} / {POLL_OPTIONS_MAX}</span>
        </span>
        <ol className="poll-opt-inputs">
          {options.map((o, i) => (
            <li key={i}>
              <span className="poll-opt-no" aria-hidden="true">{i + 1}</span>
              <input
                type="text"
                value={o}
                maxLength={POLL_OPTION_MAX}
                onChange={(e) => setOption(i, e.target.value)}
                placeholder={`항목 ${i + 1}`}
                aria-label={`항목 ${i + 1}`}
              />
              {options.length > POLL_OPTIONS_MIN && (
                <button
                  type="button"
                  className="poll-opt-del"
                  onClick={() => removeOption(i)}
                  aria-label={`항목 ${i + 1} 빼기`}
                  title="이 항목 빼기"
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ol>
        {options.length < POLL_OPTIONS_MAX && (
          <button type="button" className="btn-ghost poll-opt-add" onClick={addOption}>
            ＋ 항목 추가
          </button>
        )}
      </div>

      {err && <p className="form-error">{err}</p>}
      <p className="poll-compose-note">
        {problem ?? (hasOpen ? "새 투표를 시작하면 진행 중인 투표는 마쳐요." : "시작하면 학생 화면에 투표 창이 떠요.")}
      </p>
      <div className={`poll-actions${canCancel ? "" : " is-one"}`}>
        {canCancel && (
          <button type="button" className="btn-ghost" onClick={onCancel} disabled={busy}>취소</button>
        )}
        <button type="button" className="btn-primary" onClick={start} disabled={busy || !!problem}>
          {busy ? "여는 중…" : "투표 시작"}
        </button>
      </div>
    </div>
  );
}

// ── 결과 ──
function PollDetail({ classId, poll, roster, onDeleted }) {
  const [votes, setVotes] = useState([]);
  const [showWho, setShowWho] = useState(false);
  const [busy, setBusy] = useState(null); // 'share' | 'close' | 'delete'
  const [delAsk, setDelAsk] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => subscribePollVotes(classId, poll.id, setVotes), [classId, poll.id]);

  // 열려 있으면 표로 세고, 마친 투표는 표 그대로 셉니다(문서의 수와 같음).
  const tally = useMemo(() => tallyVotes(poll, votes), [poll, votes]);
  const byUid = useMemo(() => new Map(roster.map((s) => [s.uid, s])), [roster]);
  const votedUids = useMemo(
    () => new Set(votes.filter((v) => cleanPicks(poll, v.picks).length).map((v) => v.uid)),
    [poll, votes]
  );
  const votedInRoster = roster.filter((s) => votedUids.has(s.uid)).length;
  const notYet = roster.filter((s) => !votedUids.has(s.uid));
  const whoOf = (key) =>
    votes
      .filter((v) => cleanPicks(poll, v.picks).includes(key))
      .map((v) => (byUid.has(v.uid) ? nameOf(byUid.get(v.uid)) : "반에서 빠진 학생"));

  async function run(kindKey, fn) {
    if (busy) return;
    setBusy(kindKey);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      console.warn("[투표] 저장하지 못했어요:", e?.code, e?.message);
      setErr("저장하지 못했어요. 잠시 뒤 다시 눌러 주세요.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="poll-detail">
      <div className="poll-q-head">
        <PollKindPill kind={poll.kind} />
        <span className={`poll-state${poll.open ? " is-open" : ""}`}>{poll.open ? "진행 중" : "마침"}</span>
        {poll.shared && <span className="poll-state is-shared">학생에게 공유 중</span>}
      </div>
      <p className="poll-q-title">{poll.title}</p>
      <div className="poll-count-row">
        <span className="poll-count">
          투표한 학생 <strong>{votedInRoster}</strong> / {roster.length}명
        </span>
        <button
          type="button"
          className={`poll-who-toggle${showWho ? " on" : ""}`}
          onClick={() => setShowWho((v) => !v)}
          aria-pressed={showWho}
        >
          {showWho ? "이름 감추기" : "누가 골랐나 보기"}
        </button>
      </div>

      <PollResultBars poll={poll} counts={tally.counts} voters={tally.voters} whoOf={showWho ? whoOf : null} />

      {showWho && notYet.length > 0 && (
        <p className="poll-notyet">
          <strong>아직 안 한 학생 {notYet.length}명</strong> · {notYet.map(nameOf).join(" · ")}
        </p>
      )}

      {err && <p className="form-error">{err}</p>}

      <div className={`poll-actions${poll.open ? "" : " is-one"}`}>
        {poll.shared ? (
          <button
            type="button"
            className="btn-ghost"
            disabled={!!busy}
            onClick={() => run("share", () => unsharePollResults(classId, poll.id))}
          >
            공유 거두기
          </button>
        ) : (
          <button
            type="button"
            className="btn-primary"
            disabled={!!busy}
            onClick={() => run("share", () => sharePollResults(classId, poll.id, tally))}
          >
            {busy === "share" ? "공유하는 중…" : "결과 공유"}
          </button>
        )}
        {poll.open && (
          <button
            type="button"
            className="btn-primary poll-close"
            disabled={!!busy}
            onClick={() => run("close", () => closePoll(classId, poll.id, tally))}
          >
            {busy === "close" ? "마치는 중…" : "투표 마치기"}
          </button>
        )}
      </div>
      <p className="poll-share-note">
        {poll.shared
          ? "학생 창에 이 막대가 보여요(누가 골랐는지는 안 보여요)."
          : "‘결과 공유’를 누르면 학생 창에 같은 막대가 떠요 — 이름은 안 보여요."}
      </p>

      <div className="poll-del">
        {delAsk ? (
          <div className="poll-del-ask">
            <span>이 투표와 학생들이 고른 것을 지울까요?</span>
            <button type="button" className="btn-ghost" onClick={() => setDelAsk(false)} disabled={!!busy}>취소</button>
            <button
              type="button"
              className="poll-del-go"
              disabled={!!busy}
              onClick={() => run("delete", async () => { await deletePoll(classId, poll.id); onDeleted(); })}
            >
              {busy === "delete" ? "지우는 중…" : "지우기"}
            </button>
          </div>
        ) : (
          <button type="button" className="poll-del-btn" onClick={() => setDelAsk(true)}>
            <IconTrash size={15} /> 투표 지우기
          </button>
        )}
      </div>
    </div>
  );
}
