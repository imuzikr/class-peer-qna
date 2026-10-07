"use client";

// =============================================================
// 돌발 퀴즈 — 학생 창
// -------------------------------------------------------------
// 선생님이 퀴즈를 보내면 **처음 한 번** 저절로 뜨고(PopQuizButton), 그 뒤로는
// 상단바의 메모지를 눌러 엽니다. 닫아도 됩니다 — 쓰던 글은 이 기기에 남겨
// 두었다가 다시 열면 이어 씁니다.
//
//  · 글 퀴즈는 서식 에디터, 코드 퀴즈는 코드 칸 + ▶ 실행(결과도 함께 보냄).
//  · '선생님께 보내기'를 누르면 선생님이 확인할 때까지 못 고칩니다.
//  · 반송되면 맨 위에 선생님 한 마디(있으면)가 서고, 보냈던 답이 입력칸에
//    그대로 남아 고쳐 다시 보냅니다(선생님 요청 — 이력은 안 남김).
//  · 과일을 받으면 그 퀴즈는 끝입니다.
//  · 아래 '지난 퀴즈'는 접고 펴는 목록 — 펼칠 때 그 퀴즈의 내 답을 한 건 읽습니다.
// =============================================================
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { backdropClose } from "@/lib/modal";
import {
  fetchMyPopQuizAnswer,
  fetchPopQuizzes,
  formatTime,
  submitPopQuizAnswer,
} from "@/lib/store";
import {
  QUIZ_ANSWER_MAX,
  canSubmitQuiz,
  quizAnswerFilled,
  quizKindOf,
} from "@/lib/popQuiz";
import { runPython, stopPython } from "@/lib/pyRun";
import { dedent, codeUsesInput } from "@/lib/pyCells";
import { outputTextOf } from "@/lib/pyShare";
import RichTextEditor from "./RichTextEditor";
import { PyCodeInput } from "./PyCellEditor";
import PyLineText from "./PyLineText";
import { Caret, PopQuizAnswerBody, PopQuizQuestion, PopQuizStatus } from "./PopQuizParts";
import { IconQuizMemo } from "./StatusIcons";

const TEXT_TOOLS = ["bold", "underline", "insertUnorderedList", "insertOrderedList", "codeBlock"];

// 쓰던 답 — 이 기기에 남겨 두어 창을 닫았다 열어도 이어 씁니다. 보내면 지웁니다.
const draftKey = (quizId, uid) => `popquiz_draft:${quizId}:${uid}`;
function readDraft(quizId, uid) {
  try {
    const v = JSON.parse(localStorage.getItem(draftKey(quizId, uid)) || "null");
    return v && typeof v.text === "string" ? v : null;
  } catch { return null; }
}
function writeDraft(quizId, uid, v) {
  try {
    if (v) localStorage.setItem(draftKey(quizId, uid), JSON.stringify(v));
    else localStorage.removeItem(draftKey(quizId, uid));
  } catch { /* 저장소가 막힌 브라우저 — 창을 닫으면 쓰던 글만 사라짐 */ }
}

export default function PopQuizStudentModal({ classId, user, quiz, answer, onClose }) {
  const uid = user?.uid;
  const open = !!quiz?.open;
  const editable = canSubmitQuiz(quiz, answer);
  const kind = quizKindOf(quiz?.kind);

  return createPortal(
    <div className="modal-backdrop pq-backdrop" {...backdropClose(onClose)}>
      <div
        className="modal pq-student-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pq-student-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3 id="pq-student-title" className="head-icon">
            <IconQuizMemo size={22} /> 돌발 퀴즈
          </h3>
          <button className="btn-close" onClick={onClose} aria-label="닫기">×</button>
        </div>

        <div className="pq-student-body">
          {open ? (
            <section className="pq-current">
              {answer?.status === "returned" && (
                <div className="pq-returned-note" role="status">
                  <strong>선생님이 답을 돌려보냈어요 — 고쳐서 다시 보내 주세요.</strong>
                  {answer.returnNote && <p>{answer.returnNote}</p>}
                </div>
              )}
              <PopQuizQuestion quiz={quiz} />
              {editable ? (
                <AnswerEditor
                  key={`${quiz.id}:${answer?.status ?? "new"}`}
                  classId={classId}
                  uid={uid}
                  quiz={quiz}
                  kind={kind}
                  answer={answer}
                />
              ) : (
                <div className="pq-mine">
                  <div className="pq-mine-head">
                    <span>내가 보낸 답</span>
                    <PopQuizStatus answer={answer} />
                  </div>
                  <PopQuizAnswerBody answer={answer} />
                  <p className="pq-mine-foot">
                    {answer?.status === "rewarded"
                      ? "선생님이 과일을 주셨어요. 이 퀴즈는 끝났어요."
                      : "선생님께 보냈어요 — 확인을 기다리는 중이에요. 그동안은 고칠 수 없어요."}
                  </p>
                </div>
              )}
            </section>
          ) : (
            <p className="pq-empty">지금 열린 돌발 퀴즈가 없어요.</p>
          )}

          <PastQuizzes classId={classId} uid={uid} currentId={open ? quiz.id : null} />
        </div>
      </div>
    </div>,
    document.body
  );
}

// 답 쓰기 — 글이면 서식 에디터, 코드면 코드 칸 + ▶ 실행.
// key가 (퀴즈 · 상태)라 반송되면 새로 그려지며 보냈던 답을 다시 채웁니다.
function AnswerEditor({ classId, uid, quiz, kind, answer }) {
  const saved = readDraft(quiz.id, uid);
  // 처음 채울 글 — 이 기기에 쓰던 것이 있으면 그것, 없으면 반송된 답.
  const [text, setText] = useState(() => saved?.text ?? answer?.text ?? "");
  const [output, setOutput] = useState(() => saved?.output ?? answer?.output ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const initialRef = useRef(saved?.text ?? answer?.text ?? "");

  function update(next, nextOut = output) {
    setText(next);
    writeDraft(quiz.id, uid, { text: next, output: nextOut });
  }

  const filled = quizAnswerFilled(kind, text);
  const tooLong = text.length > QUIZ_ANSWER_MAX;

  async function send() {
    if (!filled || busy || tooLong) return;
    setBusy(true);
    setErr(null);
    try {
      await submitPopQuizAnswer(classId, quiz.id, uid, { kind, text, output });
      writeDraft(quiz.id, uid, null);
    } catch (e) {
      console.error("[돌발 퀴즈] 답을 보내지 못했어요:", e?.code, e?.message);
      setErr(
        e?.code === "permission-denied"
          ? "보낼 수 없어요 — 선생님이 퀴즈를 마쳤거나 이미 보낸 답이에요."
          : "보내지 못했어요. 다시 눌러 주세요."
      );
      setBusy(false);
    }
  }

  return (
    <div className="pq-editor">
      <span className="pq-editor-label">{kind === "code" ? "코드로 답하기" : "답 쓰기"}</span>
      {kind === "code" ? (
        <CodeAnswer
          code={text}
          output={output}
          onCode={(c) => {
            // 코드를 고치면 지난 결과는 그 코드의 것이 아니라 걷습니다.
            setOutput("");
            update(c, "");
          }}
          onOutput={(o) => {
            setOutput(o);
            writeDraft(quiz.id, uid, { text, output: o });
          }}
        />
      ) : (
        <RichTextEditor
          className="pq-rte"
          tools={TEXT_TOOLS}
          initialHtml={initialRef.current}
          onChange={(html) => update(html)}
          placeholder="여기에 답을 적어 주세요."
          autoFocus
        />
      )}
      {err && <p className="form-error">{err}</p>}
      {tooLong && <p className="form-error">답이 너무 길어요 — 조금 줄여 주세요.</p>}
      <div className="pq-send-row">
        <span className="pq-send-hint">
          {filled ? "보내면 선생님이 확인할 때까지 고칠 수 없어요." : "답을 적으면 보낼 수 있어요."}
        </span>
        <button
          type="button"
          className="btn-primary pq-send"
          onClick={send}
          disabled={!filled || busy || tooLong}
        >
          {busy ? "보내는 중…" : "선생님께 보내기"}
        </button>
      </div>
    </div>
  );
}

// 코드 답 — 코드 칸 하나 + ▶ 실행. 실행은 셀 창과 같은 엔진(lib/pyRun.js)이고
// 늘 새 이름 공간에서 돕니다. 끝나면 출력이 '보낼 결과'가 됩니다.
function CodeAnswer({ code, output, onCode, onOutput }) {
  const [lines, setLines] = useState([]);
  const [running, setRunning] = useState(false);
  const [stdin, setStdin] = useState("");
  const linesRef = useRef([]);
  const ranRef = useRef("");
  const codeRef = useRef(code);
  codeRef.current = code;
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  function add(type, text, parts) {
    linesRef.current = [...linesRef.current, { type, text, parts }];
    if (aliveRef.current) setLines(linesRef.current);
  }

  function finish() {
    setRunning(false);
    if (!aliveRef.current) return;
    if (codeRef.current !== ranRef.current) {
      add("info", "코드가 바뀌어 이 결과는 남기지 않았어요 — 다시 실행해 주세요.");
      return;
    }
    const out = outputTextOf(linesRef.current);
    if (!out) add("info", "✓ 출력 없이 끝났어요.");
    onOutput(out);
  }

  function run() {
    if (running) return;
    const src = dedent(code).replace(/\s+$/, "");
    linesRef.current = [];
    if (!src.trim()) {
      setLines([{ type: "info", text: "돌릴 코드가 없어요 — 먼저 코드를 적어 주세요." }]);
      return;
    }
    setLines([]);
    ranRef.current = code;
    const how = runPython({
      code: src,
      stdin,
      onLine: (type, text, parts) => add(type, text, parts),
      onDone: (result) => { if (result) add("result", result); finish(); },
      onError: (e) => { add("err", e); finish(); },
      onTimeout: (ms) => { add("err", `⏱ ${ms / 1000}초를 넘겨 멈췄어요. (무한 루프인지 확인해 보세요)`); finish(); },
    });
    if (how === "busy") {
      setLines([{ type: "info", text: "다른 곳에서 파이썬이 돌고 있어요 — 끝나면 다시 눌러 주세요." }]);
      return;
    }
    if (how === "fresh") add("info", "파이썬을 불러오는 중이에요… (처음 한 번만, 조금 걸려요)");
    setRunning(true);
  }

  function stop() {
    stopPython();
    add("info", "⏹ 멈췄어요.");
    finish();
  }

  return (
    <div className="pq-code">
      <PyCodeInput
        code={code}
        onCode={(c) => {
          if (linesRef.current.length && !running) { linesRef.current = []; setLines([]); }
          onCode(c);
        }}
        onRun={run}
        autoFocus
        placeholder="코드를 적고 ▶ 실행(Ctrl+Enter)으로 돌려 보세요"
      />
      {codeUsesInput(code) && (
        <label className="ltask-stdin">
          <span>입력값 <em>한 줄에 하나씩 — 실행 전에 미리</em></span>
          <textarea rows={2} value={stdin} onChange={(e) => setStdin(e.target.value)} placeholder={"홍길동\n7"} />
        </label>
      )}
      <div className="pq-code-run">
        <span className="pq-code-run-hint">실행 결과도 함께 보내져요</span>
        {running ? (
          <button type="button" className="ltask-run-stop pq-run" onClick={stop}>⏹ 중단</button>
        ) : (
          <button type="button" className="ltask-run-btn pq-run" onClick={run}>▶ 실행</button>
        )}
      </div>
      {lines.length > 0 ? (
        <div className="ltask-out pycell-out" aria-live="polite">
          {lines.map((l, n) => (
            <span key={n} className={`ltask-out-line ltask-out-line--${l.type}`}>
              <PyLineText line={l} />
            </span>
          ))}
        </div>
      ) : output ? (
        <div className="ltask-out pycell-out">{output}</div>
      ) : null}
    </div>
  );
}

// 지난 퀴즈 — 접고 펴는 목록(선생님 요청). 창을 열 때 목록을 한 번 읽고,
// 한 줄을 펼칠 때 그 퀴즈의 내 답을 한 건 읽습니다(펴 본 것은 기억).
function PastQuizzes({ classId, uid, currentId }) {
  const [list, setList] = useState(null);
  const [listOpen, setListOpen] = useState(false);
  const [openIds, setOpenIds] = useState(() => new Set());
  const [answers, setAnswers] = useState({});

  useEffect(() => {
    let alive = true;
    fetchPopQuizzes(classId)
      .then((l) => { if (alive) setList(l); })
      .catch(() => { if (alive) setList([]); });
    return () => { alive = false; };
  }, [classId]);

  const past = (list ?? []).filter((q) => q.id !== currentId);

  function toggle(q) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(q.id)) next.delete(q.id);
      else next.add(q.id);
      return next;
    });
    if (!(q.id in answers)) {
      fetchMyPopQuizAnswer(classId, q.id, uid)
        .then((a) => setAnswers((m) => ({ ...m, [q.id]: a })))
        .catch(() => setAnswers((m) => ({ ...m, [q.id]: null })));
    }
  }

  return (
    <section className="pq-past">
      <button
        type="button"
        className="pq-past-toggle"
        onClick={() => setListOpen((v) => !v)}
        aria-expanded={listOpen}
      >
        <Caret open={listOpen} />
        지난 퀴즈
        <span className="pq-past-count">{list ? past.length : "…"}</span>
      </button>
      {listOpen && (
        list === null ? (
          <p className="pq-past-empty">불러오는 중…</p>
        ) : past.length === 0 ? (
          <p className="pq-past-empty">지난 퀴즈가 없어요.</p>
        ) : (
          <ul className="pq-past-list">
            {past.map((q) => {
              const isOpen = openIds.has(q.id);
              const a = answers[q.id];
              return (
                <li key={q.id} className={isOpen ? "open" : ""}>
                  <button
                    type="button"
                    className="pq-past-head"
                    onClick={() => toggle(q)}
                    aria-expanded={isOpen}
                  >
                    <Caret open={isOpen} />
                    <span className="pq-past-title">{q.title}</span>
                    <span className="pq-past-date">{formatTime(q.createdAt)}</span>
                  </button>
                  {isOpen && (
                    <div className="pq-past-body">
                      <PopQuizQuestion quiz={q} compact />
                      {a === undefined ? (
                        <p className="pq-past-empty">불러오는 중…</p>
                      ) : (
                        <div className="pq-mine">
                          <div className="pq-mine-head">
                            <span>내 답</span>
                            <PopQuizStatus answer={a} quizOpen={!!q.open} />
                          </div>
                          {a ? <PopQuizAnswerBody answer={a} /> : null}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )
      )}
    </section>
  );
}
