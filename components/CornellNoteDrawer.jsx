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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  subscribeMyCornellNote,
  saveCornellNote,
  fetchMyRecentCornellNotes,
  markCornellFeedbackSeen,
  isCornellFeedbackUnread,
  todayDateKey,
  CORNELL_LIMITS,
  CORNELL_RECENT_DAYS,
} from "@/lib/store";
import RichTextEditor from "./RichTextEditor";
import CornellNoteSheet from "./CornellNoteSheet";
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
  // 아직 저장 안 된 편집이 있는지 — 머리말의 '저장' 단추가 이걸 보고 삽니다.
  // (아래 dirtyRef와 다릅니다: ref는 '한 번이라도 손댔나'라 저장 뒤에도 켜진
  //  채로 둡니다 — 서버 값이 내 글자를 덮어쓰지 못하게 하는 빗장이라서요)
  const [dirty, setDirty] = useState(false);
  const [date] = useState(() => todayDateKey());
  // 최근 14일치 — '안 읽은 선생님 한 마디'와 '지난 노트' 목록에 씁니다
  const [recent, setRecent] = useState([]);
  const [seenNow, setSeenNow] = useState(() => new Set()); // 이번에 읽은 것
  const [openAlert, setOpenAlert] = useState(null); // 맨 위 알림에서 펼친 노트
  const [openPast, setOpenPast] = useState(null);   // 아래 지난 노트에서 펼친 것

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

  // 최근 14일치를 한 번 훑습니다(짧게 캐시되어 화면을 옮겨도 다시 안 읽습니다).
  // 오늘 것은 위 구독이 실시간으로 보고 있으므로, 여기서는 '지난 것'만 씁니다.
  useEffect(() => {
    if (!classId || !user?.uid) { setRecent([]); return; }
    let alive = true;
    fetchMyRecentCornellNotes(classId, user.uid)
      .then((list) => { if (alive) setRecent(list); })
      .catch(() => {});
    return () => { alive = false; };
  }, [classId, user?.uid, date]);

  // 읽음 도장 — 노트 문서에 적습니다. 기기를 바꿔도 배지가 되살아나지 않게.
  const markSeen = useCallback(
    (noteDate, noteId) => {
      setSeenNow((prev) => (prev.has(noteId) ? prev : new Set(prev).add(noteId)));
      markCornellFeedbackSeen(classId, user?.uid, noteDate).catch(() => {});
    },
    [classId, user?.uid]
  );

  // 오늘 것은 위 구독이 실시간으로 보고 있으므로 그쪽 값을 앞세웁니다
  // (선생님이 지금 막 쓴 한 마디는 캐시에 아직 없습니다).
  const merged = useMemo(() => {
    const map = new Map(recent.map((n) => [n.id, n]));
    if (note?.id) map.set(note.id, note);
    return [...map.values()].sort((a, b) =>
      String(b.date ?? "").localeCompare(String(a.date ?? ""))
    );
  }, [recent, note]);

  // 서랍을 열면 그 자리에서 한 마디가 다 보입니다 — 그 순간 읽은 것으로 봅니다.
  // (줄마다 눌러야 읽음이 되면, 안 누른 것 때문에 배지가 계속 남습니다)
  useEffect(() => {
    if (!open) return;
    merged.forEach((n) => {
      if (isCornellFeedbackUnread(n) && !seenNow.has(n.id)) markSeen(n.date, n.id);
    });
  }, [open, merged, seenNow, markSeen]);

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
        setDirty(false);
      } catch {
        setStatus("idle");
      }
    }, SAVE_DELAY);
    return () => clearTimeout(timerRef.current);
  }, [cue, notes, summary, classId, user, date, lessonTitle]);

  // 손으로 누르는 저장 — 자동 저장은 그대로 두고 하나 더 둡니다.
  // 2초를 기다리는 동안이 불안한 것은 자연스러운 일이고, 수업이 끝나 자리를
  // 뜰 때 '눌러서 끝냈다'는 감각이 필요합니다.
  const saveNow = useCallback(async () => {
    if (!classId || !user?.uid) return;
    clearTimeout(timerRef.current);
    setStatus("saving");
    try {
      await saveCornellNote(classId, user, date, { ...latestRef.current, lessonTitle });
      setStatus("saved");
      setDirty(false);
    } catch {
      setStatus("idle");
    }
  }, [classId, user, date, lessonTitle]);

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
      setDirty(true);
      onType?.();   // '필기 중' — 교사 전광판의 ✍️
      setter(v);
    };
  }

  if (!classId || !user?.uid) return null;

  const filled =
    (cue.trim() ? 1 : 0) + (stripHtml(notes).trim() ? 1 : 0) + (summary.trim() ? 1 : 0);
  const feedback = String(note?.feedback ?? "").trim();

  // 손잡이 배지 — 아직 안 본 한 마디의 수
  const unreadCount = merged.filter(
    (n) => isCornellFeedbackUnread(n) && !seenNow.has(n.id)
  ).length;
  // 맨 위 알림 — **이번에 새로 온** 한 마디만. 예전에 읽은 것까지 여기 두면
  // 알림이 아니라 목록이 되어, 정작 새 것이 묻힙니다(그건 아래 '지난 노트'가
  // 합니다). seenNow를 함께 보는 이유: 서랍을 연 순간 읽음 처리가 되므로,
  // 그것만으로 거르면 뜨자마자 사라져 읽을 새가 없습니다.
  const arrivedFeedback = merged.filter(
    (n) =>
      n.date !== date &&
      String(n.feedback ?? "").trim() &&
      (isCornellFeedbackUnread(n) || seenNow.has(n.id))
  );
  const openAlertNote = arrivedFeedback.find((n) => n.id === openAlert) ?? null;

  // 아래 '지난 노트' — 최근 14일 전부. 배지를 세려고 이미 받아 둔 것이라
  // 여기 늘어놓는 데 읽기가 1건도 늘지 않습니다.
  const pastNotes = merged.filter((n) => n.date !== date);
  const openPastNote = pastNotes.find((n) => n.id === openPast) ?? null;

  return (
    <>
      {/* 손잡이 — **열려 있을 때도 남깁니다.** 열면 서랍 왼쪽 가장자리로
          옮겨 붙어 그대로 '닫기'가 됩니다. 여닫는 자리가 늘 같은 곳이라야
          손이 기억합니다. 예전에는 열리는 순간 사라져, 닫는 길이 머리말의
          ×와 Esc뿐이었습니다.
          바깥을 눌러 닫지는 않습니다 — 수업 중에 슬라이드를 한 번 볼 때마다
          닫혀 쓰던 흐름이 끊깁니다(글은 자동 저장이라 날아가진 않지만). */}
      <button
        type="button"
        className={`cornell-handle${open ? " open" : ""}${
          !open && unreadCount > 0 ? " has-feedback" : ""
        }`}
        onClick={toggle}
        title={
          open
            ? "수업 노트 닫기 (Esc)"
            : unreadCount > 0
              ? `선생님이 한 마디를 남겼어요 (${unreadCount}개)`
              : "수업 노트 — 코넬 노트로 필기해요"
        }
        aria-label={
          open
            ? "수업 노트 닫기"
            : unreadCount > 0
              ? `수업 노트 열기 — 안 읽은 선생님 한 마디 ${unreadCount}개`
              : "수업 노트 열기"
        }
        aria-expanded={open}
      >
        {/* 여는 쪽인지 닫는 쪽인지 — 화살표 방향으로만 알립니다.
            글자를 '닫기'로 바꾸면 같은 자리의 같은 것으로 안 보입니다. */}
        <span className="cornell-handle-caret" aria-hidden="true">
          {open ? "›" : "‹"}
        </span>
        <span className="cornell-handle-label">수업 노트</span>
        {/* 숫자가 있으면 숫자를, 없으면 '오늘 쓴 게 있다'는 점만.
            열려 있으면 둘 다 뺍니다 — 안이 이미 다 보입니다. */}
        {open ? null : unreadCount > 0 ? (
          <span className="cornell-handle-badge">{unreadCount}</span>
        ) : filled > 0 ? (
          <span className="cornell-handle-dot" aria-hidden="true" />
        ) : null}
      </button>

      {open && (
        <aside className="cornell-drawer" aria-label="수업 노트">
          <header className="cornell-head">
            <strong>📓 수업 노트</strong>
            <span className="cornell-date">{date}</span>
            {/* 저장은 자동입니다(2초). 그래도 단추를 둡니다 — 자리를 뜰 때
                '눌러서 끝냈다'는 감각이 필요하고, 기다리는 2초가 불안한 것도
                자연스러운 일입니다. 상태 글자를 따로 두지 않고 단추가 곧
                상태입니다(머리말은 좁고, 같은 말이 두 군데 있으면 헷갈립니다). */}
            <button
              type="button"
              className={`cornell-save${dirty ? " on" : ""}`}
              onClick={saveNow}
              disabled={!dirty || status === "saving"}
              title="지금 저장 — 안 눌러도 2초 뒤 저절로 저장돼요"
            >
              {status === "saving"
                ? "저장 중…"
                : !dirty && status === "saved"
                  ? "저장됨"
                  : "저장"}
            </button>
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
              {/* 지난 노트에 달린 한 마디 — 선생님은 수업이 끝난 뒤에 쓰므로
                  대부분 '어제 것'입니다. 여기가 없으면 학생은 리포트에
                  들어가 그 날짜를 펼쳐 봐야만 알게 됩니다.
                  줄을 누르면 그날 노트를 이 안에서 펼쳐 봅니다 — 무엇에
                  대한 말인지 보려고 화면을 옮기지 않아도 되게. */}
              {arrivedFeedback.length > 0 && (
                <div className="cornell-newfb">
                  <span className="cornell-newfb-tag">
                    지난 노트에 선생님 한 마디
                  </span>
                  {arrivedFeedback.map((n) => (
                    <div key={n.id} className="cornell-newfb-row">
                      <button
                        type="button"
                        className={`cornell-newfb-item${openAlert === n.id ? " open" : ""}`}
                        onClick={() => setOpenAlert(openAlert === n.id ? null : n.id)}
                        aria-expanded={openAlert === n.id}
                      >
                        {/* 서랍이 좁아 연도는 뺍니다 — 14일치라 헷갈릴 일이 없습니다 */}
                        <time dateTime={n.date}>{String(n.date ?? "").slice(5)}</time>
                        <span className="cornell-newfb-text">{n.feedback}</span>
                        <span className="cornell-newfb-caret" aria-hidden="true">
                          {openAlert === n.id ? "▾" : "▸"}
                        </span>
                      </button>
                      {/* 펼친 노트는 **누른 줄 바로 아래**에. 목록 끝에 붙이면
                          어느 줄에 대한 것인지 알 수 없습니다. */}
                      {openAlertNote?.id === n.id && (
                        <CornellNoteSheet note={openAlertNote} showFeedback={false} />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* 선생님이 남긴 한 마디 — 오늘 것은 제자리에 */}
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

              {/* 지난 노트 — 배지를 세려고 이미 받아 둔 최근 14일치라
                  여기 늘어놓는 데 읽기가 1건도 늘지 않습니다. 오늘 것을 쓰다
                  "저번에 뭐라고 적었더라" 할 때 화면을 옮기지 않게 하는 자리라,
                  쓰는 칸 **아래**에 둡니다(위에 두면 매번 지나쳐 스크롤해야
                  합니다). 더 옛것은 리포트로 갑니다. */}
              {pastNotes.length > 0 && (
                <section className="cornell-past">
                  <div className="cornell-past-head">
                    <b>지난 노트</b>
                    <span>
                      최근 {CORNELL_RECENT_DAYS}일 · {pastNotes.length}장
                    </span>
                  </div>
                  {pastNotes.map((n) => {
                    const hasFb = !!String(n.feedback ?? "").trim();
                    const preview =
                      String(n.lessonTitle ?? "").trim() ||
                      stripHtml(n.notes ?? "") ||
                      String(n.cue ?? "").trim() ||
                      "수업";
                    return (
                      <div key={n.id} className="cornell-past-row">
                        <button
                          type="button"
                          className={`cornell-past-item${openPast === n.id ? " open" : ""}`}
                          onClick={() => setOpenPast(openPast === n.id ? null : n.id)}
                          aria-expanded={openPast === n.id}
                        >
                          <time dateTime={n.date}>{String(n.date ?? "").slice(5)}</time>
                          <span className="cornell-past-title">{preview}</span>
                          {hasFb && (
                            <span className="cornell-past-fb" title="선생님 한 마디가 있어요">
                              💬
                            </span>
                          )}
                          <span className="cornell-past-caret" aria-hidden="true">
                            {openPast === n.id ? "▾" : "▸"}
                          </span>
                        </button>
                        {openPastNote?.id === n.id && <CornellNoteSheet note={openPastNote} />}
                      </div>
                    );
                  })}
                </section>
              )}

              {/* 14일보다 옛것과, 코넬 2단을 넓게 펴서 보는 것은 리포트에서 —
                  서랍은 좁아 오늘 것 쓰기가 본업입니다. 옮겨 가기 전에 쓰던
                  것을 저장합니다. */}
              <button
                type="button"
                className="cornell-past-link"
                onClick={() => {
                  flush();
                  router.push("/report#cornell-notes");
                }}
              >
                노트 전체 보기 →
              </button>
            </div>
          )}
        </aside>
      )}
    </>
  );
}
