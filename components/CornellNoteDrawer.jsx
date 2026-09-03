"use client";

// =============================================================
// 수업 노트 서랍 (학생 전용) — 화면 오른쪽에서 꺼내 쓰는 코넬 노트
// -------------------------------------------------------------
// 학생이 스스로 공부하려고 남기는 기록입니다. 그래서 **방송과 상관없이
// 언제나** 열립니다 — 선생님이 슬라이드를 띄운 중이든, 설명하려고 잠깐
// 멈춘 사이든, 수업이 아예 없는 시간이든.
//
// [왜 오버레이 안이 아니라 밖인가]
// 발표 오버레이(PresentationOverlay)는 방송 문서가 사라지는 순간 통째로
// 언마운트됩니다. 그런데 LessonMode는 '종료'뿐 아니라 '일시정지'에도 그
// 문서를 지웁니다 — 선생님이 잠깐 멈출 때마다 오버레이가 사라진다는 뜻입니다.
// 서랍을 그 안에 두면 한 차시에 몇 번씩 사라졌다 나타나고, 그때마다 학생은
// 쓰던 자리를 잃습니다. 그래서 TopNav에서 오버레이와 형제로, 방송 조건과
// 무관하게 그립니다.
//
// [코넬 노트를 세로로 쌓는 이유]
// 본래 코넬 노트는 왼쪽 좁은 단서 칸 + 오른쪽 넓은 필기 칸 + 아래 요약의
// 2단입니다. 서랍은 380px뿐이라 좌우로 가르면 양쪽 다 못 씁니다. 여기서는
// 세로로 쌓아 순서(단서 → 필기 → 요약)만 지키고, 진짜 2단은 나중에 복습
// 화면에서 펼칩니다.
//
// 저장은 자동입니다. 2초 동안 입력이 없으면 조용히 저장하고, 서랍이
// 닫히거나 화면을 벗어날 때 한 번 더 저장합니다 — 방송이 꺼지며 화면이
// 바뀌어도 쓰던 글이 날아가지 않게.
// =============================================================
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  subscribeMyCornellNote,
  saveCornellNote,
  todayDateKey,
  CORNELL_LIMITS,
} from "@/lib/store";
import RichTextEditor from "./RichTextEditor";
import { richHtml, stripHtml } from "@/lib/html";

const SAVE_DELAY = 2000; // ms — 이만큼 입력이 없으면 저장
const OPEN_KEY = "cornell-drawer-open";

// 필기 칸에 붙이는 서식 — 수업 메모와 같은 넷.
// 필기는 갈래를 늘어놓는 글이라 목록이 특히 쓰입니다.
const NOTE_TOOLS = ["bold", "underline", "insertUnorderedList", "insertOrderedList"];

export default function CornellNoteDrawer({
  classId,
  user,
  lessonTitle = "",
  onOpenChange = null, // 열림 상태를 위로 — 발표 화면이 그만큼 좁아집니다
  onType = null,       // 타이핑 신호 — 전광판의 ✍️ 표시로 이어집니다
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(null);        // 서버에서 온 문서
  const [loaded, setLoaded] = useState(false);
  const [cue, setCue] = useState("");
  const [notes, setNotes] = useState("");        // HTML
  const [summary, setSummary] = useState("");
  const [status, setStatus] = useState("idle");  // idle | saving | saved
  const [date] = useState(() => todayDateKey());

  // 내가 고친 뒤로는 서버 값이 와도 덮어쓰지 않습니다(입력 중 글자가 튀는 것 방지)
  const dirtyRef = useRef(false);
  const timerRef = useRef(null);
  // 저장 함수가 항상 '지금 값'을 보도록 — 언마운트·창 닫기 때 쓰는 마지막
  // 저장은 오래된 클로저를 잡기 쉬워서, 값을 ref에 함께 들고 있습니다.
  const latestRef = useRef({ cue: "", notes: "", summary: "" });
  latestRef.current = { cue, notes, summary };

  // 접힘 상태는 기억해 둡니다 — 수업마다 다시 여는 수고를 덜려고요
  useEffect(() => {
    try {
      if (localStorage.getItem(OPEN_KEY) === "1") setOpen(true);
    } catch {}
  }, []);
  function toggle() {
    const next = !open;
    setOpen(next);
    try { localStorage.setItem(OPEN_KEY, next ? "1" : "0"); } catch {}
    // 닫을 때는 쓰던 것을 곧바로 저장합니다.
    // (setOpen의 갱신 함수 안에서 부르지 않습니다 — 개발 모드에서 그 함수가
    //  두 번 불려 저장도 두 번 나갑니다)
    if (!next) flush();
  }

  useEffect(() => { onOpenChange?.(open); }, [open, onOpenChange]);

  useEffect(() => {
    if (!classId || !user?.uid) { setLoaded(true); return; }
    return subscribeMyCornellNote(classId, user.uid, date, (doc) => {
      setNote(doc);
      if (!dirtyRef.current) {
        setCue(doc?.cue ?? "");
        setNotes(doc?.notes ?? "");
        setSummary(doc?.summary ?? "");
      }
      setLoaded(true);
    });
  }, [classId, user?.uid, date]);

  const flush = useCallback(() => {
    if (!dirtyRef.current || !classId || !user?.uid) return;
    clearTimeout(timerRef.current);
    saveCornellNote(classId, user, date, { ...latestRef.current, lessonTitle }).catch(() => {});
  }, [classId, user, date, lessonTitle]);

  // 자동 저장 — 입력이 멎으면
  useEffect(() => {
    if (!dirtyRef.current || !classId || !user?.uid) return;
    clearTimeout(timerRef.current);
    setStatus("saving");
    timerRef.current = setTimeout(async () => {
      try {
        await saveCornellNote(classId, user, date, { cue, notes, summary, lessonTitle });
        setStatus("saved");
      } catch {
        setStatus("idle");
      }
    }, SAVE_DELAY);
    return () => clearTimeout(timerRef.current);
  }, [cue, notes, summary, classId, user, date, lessonTitle]);

  // 화면을 벗어나거나 탭을 닫을 때 마지막으로 한 번 더
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [flush]);

  // Esc는 서랍만 닫습니다 — 발표 오버레이는 학생이 닫을 수 없어야 합니다
  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") { e.stopPropagation(); toggle(); }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  function edit(setter) {
    return (v) => {
      dirtyRef.current = true;
      onType?.();   // '필기 중' — 교사 전광판의 ✍️
      setter(v);
    };
  }

  if (!classId || !user?.uid) return null;

  const filled =
    (cue.trim() ? 1 : 0) + (stripHtml(notes).trim() ? 1 : 0) + (summary.trim() ? 1 : 0);
  const feedback = String(note?.feedback ?? "").trim();

  return (
    <>
      {/* 손잡이 — 접혀 있을 때만. 어느 화면에서나 같은 자리에 있어야
          '언제나 꺼낼 수 있다'가 몸에 붙습니다. */}
      {!open && (
        <button
          type="button"
          className={`cornell-handle${feedback ? " has-feedback" : ""}`}
          onClick={toggle}
          title="수업 노트 — 코넬 노트로 필기해요"
          aria-label="수업 노트 열기"
        >
          <span className="cornell-handle-label">수업 노트</span>
          {filled > 0 && <span className="cornell-handle-dot" aria-hidden="true" />}
        </button>
      )}

      {open && (
        <aside className="cornell-drawer" aria-label="수업 노트">
          <header className="cornell-head">
            <strong>📓 수업 노트</strong>
            <span className="cornell-date">{date}</span>
            <span className="cornell-status">
              {status === "saving" ? "저장 중…" : status === "saved" ? "저장됨" : ""}
            </span>
            <button
              type="button"
              className="cornell-close"
              onClick={toggle}
              aria-label="닫기"
              title="닫기 (Esc)"
            >
              ×
            </button>
          </header>

          {lessonTitle && <p className="cornell-lesson">{lessonTitle}</p>}

          {!loaded ? (
            <p className="cornell-empty">불러오는 중이에요…</p>
          ) : (
            <div className="cornell-body">
              {/* 선생님이 남긴 한 마디 — 있으면 맨 위에 */}
              {feedback && (
                <div className="cornell-feedback">
                  <span className="cornell-feedback-tag">선생님</span>
                  <p>{feedback}</p>
                </div>
              )}

              <section className="cornell-zone cornell-zone--cue">
                <label htmlFor="cornell-cue">
                  <b>단서 · 핵심 질문</b>
                  <em>나중에 이것만 보고 떠올릴 낱말이나 물음</em>
                </label>
                <textarea
                  id="cornell-cue"
                  rows={3}
                  value={cue}
                  onChange={(e) => edit(setCue)(e.target.value.slice(0, CORNELL_LIMITS.cue))}
                  placeholder="예) 사물인터넷은 왜 필요할까?"
                />
              </section>

              <section className="cornell-zone cornell-zone--notes">
                <label>
                  <b>필기</b>
                  <em>수업에서 들은 것을 그대로</em>
                </label>
                <RichTextEditor
                  key={`cornell-${date}`}
                  className="cornell-rte"
                  tools={NOTE_TOOLS}
                  initialHtml={richHtml(note?.notes ?? "")}
                  onChange={edit(setNotes)}
                  placeholder="들은 것, 칠판에 적힌 것, 떠오른 것"
                />
              </section>

              <section className="cornell-zone cornell-zone--summary">
                <label htmlFor="cornell-summary">
                  <b>내 말로 요약</b>
                  <em>수업 끝에 한두 줄로</em>
                </label>
                <textarea
                  id="cornell-summary"
                  rows={3}
                  value={summary}
                  onChange={(e) => edit(setSummary)(e.target.value.slice(0, CORNELL_LIMITS.summary))}
                  placeholder="오늘 배운 것을 한 문장으로 적어 보세요"
                />
              </section>

              {/* 몰래 보는 것이 아니라 알고 쓰는 것이 되도록 — 피드백이
                  온다는 걸 알고 쓰는 글은 성격이 달라집니다. */}
              <p className="cornell-note-hint">
                선생님이 수업 뒤에 읽고 피드백을 줄 수 있어요.
              </p>

              {/* 지난 노트는 학습 리포트에서 코넬 2단으로 펼쳐 봅니다 —
                  서랍은 좁아 오늘 것 쓰기에만 씁니다. 옮겨 가기 전에 쓰던
                  것을 저장합니다. */}
              <button
                type="button"
                className="cornell-past-link"
                onClick={() => {
                  flush();
                  router.push("/report#cornell-notes");
                }}
              >
                지난 노트 다시 보기 →
              </button>
            </div>
          )}
        </aside>
      )}
    </>
  );
}
