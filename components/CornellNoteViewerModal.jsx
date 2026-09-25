"use client";

// =============================================================
// 내 수업 노트 크게 보기 (학생 전용) — 화면 한가운데 코넬 2단
// -------------------------------------------------------------
// 서랍의 '노트 전체 보기 →'가 여는 자리입니다. 예전에는 학습 리포트로
// 옮겨 갔는데, 수업 중에 화면을 통째로 옮기는 것은 부담이 큽니다(방송이
// 떠 있고, 쓰던 노트도 두고 가야 합니다). 그래서 그 자리에서 크게 폅니다.
//
// [왜 서랍의 14일치가 아니라 다시 받는가]
// 서랍은 배지를 세려고 최근 14일만 봅니다. 여기는 이름 그대로 '전체 보기'라
// 그 반의 내 노트를 전부 받습니다(한 학기에 쉰 장 남짓). 열었을 때만 받고,
// 이미 갖고 있는 14일치를 먼저 그려 두어 기다림 없이 열립니다.
//
// 넘기기는 이전(‹, 더 옛날) · 다음(›, 더 최근) 두 단추와 ← → 자판입니다.
// 목록은 최근이 앞이라 '이전'이 index+1입니다 — 교사 열람 화면과 같은 규칙.
//
// [탭 둘 — 코넬 노트 · KWLS 노트]
// 학생이 남기는 '내가 쓴 것'은 이 둘입니다. 따로 두면 KWLS를 보러 공부방
// 사이드 패널의 기록 탭까지 찾아 들어가야 해서, 지난 기록을 펴 보는 자리를
// 여기 하나로 모읍니다. 코넬 탭은 지금까지 그대로이고, KWLS 탭은
// MyKwlsNotes가 통째로 맡습니다(구독도 그쪽에서).
//
// KWLS 탭은 **한 번 열면 감춰만 둡니다.** 탭을 오갈 때마다 지웠다 다시
// 만들면 그때마다 구독이 새로 붙어 내 기록을 다시 읽습니다.
// =============================================================
//
// [고치기는 여기에만 있습니다]
// 서랍은 **오늘 노트를 쓰는 자리**입니다(날짜가 오늘로 못 박혀 있습니다).
// 지난 노트를 고치는 길은 이 창 하나뿐이라, 어느 날짜를 고치는 중인지가
// 늘 화면 한가운데에 적혀 있습니다. 규칙은 원래 날짜를 보지 않으므로
// (isMyCornellNote는 문서 id와 칸 길이만 봅니다) 규칙을 안 건드립니다.
//
// 넘길 때는 **저장하고 넘어갑니다** — 이 앱에는 '제출'이 없고 글은 늘
// 저절로 저장되므로, 넘기다 고치던 것을 잃는 쪽이 더 놀랍습니다.
import { useCallback, useEffect, useRef, useState } from "react";
import { backdropClose } from "@/lib/modal";
import {
  subscribeMyCornellNotes,
  markCornellFeedbackSeen,
  isCornellFeedbackUnread,
  saveCornellNote,
  invalidateMyRecentCornellNotes,
} from "@/lib/store";
import { blocksOf, emptyBlock, flattenBlocks, usedBlocks, CORNELL_BLOCK_MAX } from "@/lib/cornell";
import { marksOf } from "@/lib/cornellMarks";
import { printCornellNotes, printableName } from "@/lib/exportCornell";
import CornellNoteSheet from "./CornellNoteSheet";
import CornellNoteEditSheet from "./CornellNoteEditSheet";
import MyKwlsNotes from "./MyKwlsNotes";
import { IconRecord } from "./StatusIcons";

export default function CornellNoteViewerModal({
  classId,
  user,
  className = "",
  initialNotes = [],
  startId = null,
  onClose,
}) {
  const [tab, setTab] = useState("cornell"); // 'cornell' | 'kwls'
  // KWLS 탭은 한 번 열린 뒤로는 계속 붙어 있습니다(감추기만) — 위 설명 참고
  const [kwlsMounted, setKwlsMounted] = useState(false);
  // 서랍이 이미 갖고 있는 14일치로 먼저 그립니다 — 빈 화면이 잠깐 스치지 않게
  const [notes, setNotes] = useState(initialNotes);
  const [id, setId] = useState(startId ?? initialNotes[0]?.id ?? null);
  const [loaded, setLoaded] = useState(initialNotes.length > 0);
  // 여기서 읽은 것도 읽음으로 — 서랍이 훑는 14일 **밖**의 옛 노트는
  // 여기서만 열립니다. 한 번씩만 쓰도록 ref로 막습니다.
  const markedRef = useRef(new Set());

  // ── 고치는 중의 값 ─────────────────────────────────────────────
  // 문서는 구독으로 살아 오지만(선생님이 지금 한 마디를 쓸 수도 있습니다),
  // 고치는 글은 **따로 들고 있습니다** — 안 그러면 스냅샷이 올 때마다 치던
  // 글자가 서버 값으로 덮입니다(서랍의 dirtyRef가 하던 일을 여기서는 '칸을
  // 따로 든다'로 대신합니다).
  const [editing, setEditing] = useState(false);
  const [topic, setTopic] = useState("");
  const [blocks, setBlocks] = useState([]);
  const [summary, setSummary] = useState("");
  const [loadSeq, setLoadSeq] = useState(0);
  const [saving, setSaving] = useState(false);
  // **어느 날짜를 고치는 중인가를 따로 듭니다.** 구독으로 목록이 갈릴 때
  // 보던 노트가 사라지면 위 효과가 `id`를 맨 앞으로 옮기는데, 저장할 날짜를
  // `note`에서 그때그때 읽으면 고치던 글이 **엉뚱한 날짜에** 쓰입니다.
  const [editDate, setEditDate] = useState("");
  // 저장 함수가 늘 '지금 값'과 '지금 날짜'를 보도록 — 창을 닫거나 날짜를
  // 넘길 때의 마지막 저장은 오래된 클로저를 잡기 쉽습니다.
  const draftRef = useRef(null);

  useEffect(() => {
    if (!classId || !user?.uid) { setLoaded(true); return; }
    return subscribeMyCornellNotes([classId], user.uid, (list) => {
      setNotes(list);
      setLoaded(true);
    });
  }, [classId, user?.uid]);

  // 목록이 바뀌어 보던 것이 사라졌으면 맨 앞으로
  useEffect(() => {
    if (notes.length === 0) return;
    if (!id || !notes.some((n) => n.id === id)) setId(notes[0].id);
  }, [notes, id]);

  const index = notes.findIndex((n) => n.id === id);
  const note = index >= 0 ? notes[index] : null;

  useEffect(() => {
    if (!note || markedRef.current.has(note.id)) return;
    if (!isCornellFeedbackUnread(note)) return;
    markedRef.current.add(note.id);
    markCornellFeedbackSeen(classId, user?.uid, note.date).catch(() => {});
  }, [note, classId, user?.uid]);

  // 고치는 칸에 지금 노트를 담습니다 — '고치기'를 누를 때와, 저장하고
  // 다음 날짜로 넘어갔을 때.
  const loadDraft = useCallback((n) => {
    setEditDate(String(n?.date ?? ""));
    setTopic(String(n?.lessonTitle ?? ""));
    const list = blocksOf(n);
    setBlocks(list.length > 0 ? list : [emptyBlock()]);
    setSummary(String(n?.summary ?? ""));
    setLoadSeq((v) => v + 1);
  }, []);

  draftRef.current = editing ? { date: editDate, topic, blocks, summary } : null;

  // 저장 — 고치는 중일 때만 실제로 씁니다.
  // `materials`를 안 넘깁니다(merge라 그대로 남습니다) — 그날 걸린 자료는
  // 학생이 고칠 것이 아닙니다. `feedback`·`feedbackMarks`도 마찬가지로
  // 안 보내므로 선생님이 남긴 것은 흔들리지 않습니다(규칙도 그것을 막습니다).
  const saveDraft = useCallback(async () => {
    const d = draftRef.current;
    if (!d || !d.date || !classId || !user?.uid) return;
    setSaving(true);
    try {
      await saveCornellNote(classId, user, d.date, {
        ...flattenBlocks(d.blocks),
        blocks: usedBlocks(d.blocks),
        summary: d.summary,
        lessonTitle: d.topic,
      });
      // 서랍의 '지난 노트' 목록은 5분 캐시라, 버리지 않으면 방금 고친 것이
      // 옛 내용으로 남습니다. **저장이 끝난 뒤**에 버려야 저장 전 값이 다시
      // 캐시되지 않습니다.
      invalidateMyRecentCornellNotes(classId, user.uid);
    } catch {
      // 실패해도 칸의 글은 그대로 두어 다시 누를 수 있게 합니다
    }
    setSaving(false);
  }, [classId, user]);

  const printMeta = { studentName: printableName(user), className };
  function printOne(n) {
    if (n) printCornellNotes([n], printMeta);
  }
  function printAll() {
    if (notes.length > 0) printCornellNotes(notes, printMeta);
  }

  // 다른 날짜로 — 고치는 중이면 **저장하고** 넘어갑니다. 이 앱에는 '제출'이
  // 없고 글은 늘 저절로 저장되므로, 넘기다 고치던 것을 잃는 쪽이 더
  // 놀랍습니다. 넘어간 뒤에는 그 노트를 고치는 칸에 새로 담습니다.
  const jumpTo = useCallback(
    (targetId) => {
      const target = notes.find((n) => n.id === targetId);
      if (!target) return;
      if (!editing) {
        setId(target.id);
        return;
      }
      saveDraft().then(() => {
        setId(target.id);
        loadDraft(target);
      });
    },
    [notes, editing, saveDraft, loadDraft]
  );

  const go = useCallback(
    (step) => {
      const i = notes.findIndex((n) => n.id === id);
      const next = i + step;
      if (i < 0 || next < 0 || next >= notes.length) return;
      jumpTo(notes[next].id);
    },
    [notes, id, jumpTo]
  );

  // ← 더 옛날 / → 더 최근. Esc는 이 창만 닫습니다(서랍은 그대로).
  // 방향키는 **코넬 탭일 때만** — KWLS 탭은 제 것을 따로 듣습니다.
  // 창을 닫을 때도 고치던 것을 저장합니다.
  const closeNow = useCallback(() => {
    if (!editing) {
      onClose();
      return;
    }
    saveDraft().finally(() => onClose());
  }, [editing, saveDraft, onClose]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeNow();
      } else if (tab !== "cornell") {
        // 다른 탭이 넘길 차례입니다
      } else if (editing) {
        // **고치는 중에는 방향키를 안 듣습니다** — 글자 칸 안에서 ← →는
        // 커서를 옮기는 키입니다. 여기서 가로채면 글 가운데로 커서를
        // 옮길 수 없습니다. 넘기는 길은 ‹ › 단추로 그대로 있습니다.
      } else if (e.key === "ArrowLeft") {
        go(1);
      } else if (e.key === "ArrowRight") {
        go(-1);
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [go, closeNow, tab, editing]);

  function pickTab(next) {
    // KWLS 탭으로 옮길 때도 고치던 것을 저장하고 읽기로 돌아갑니다 —
    // 감춰 둔 칸에 안 저장된 글이 남아 있으면 어디에 있는지 알 수 없습니다.
    if (next !== "cornell" && editing) {
      saveDraft();
      setEditing(false);
    }
    setTab(next);
    if (next === "kwls") setKwlsMounted(true);
  }

  function startEdit() {
    if (!note) return;
    loadDraft(note);
    setEditing(true);
  }

  function finishEdit() {
    saveDraft().then(() => setEditing(false));
  }

  function editBlock(id2, patch) {
    setBlocks((prev) => prev.map((b) => (b.id === id2 ? { ...b, ...patch } : b)));
  }
  function addBlock() {
    setBlocks((prev) => (prev.length >= CORNELL_BLOCK_MAX ? prev : [...prev, emptyBlock()]));
  }
  // 마지막 한 줄은 남깁니다 — 덩어리가 0개면 고칠 자리가 사라집니다.
  function removeBlock(id2) {
    setBlocks((prev) => (prev.length <= 1 ? prev : prev.filter((b) => b.id !== id2)));
  }

  return (
    <div
      className="modal-backdrop cornell-viewer-backdrop"
      {...backdropClose(closeNow)}
    >
      <div
        className="modal modal-cornell-viewer"
        role="dialog"
        aria-modal="true"
        aria-label="내 수업 노트"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3 className="head-icon"><IconRecord size={20} /> 내 수업 노트</h3>
          <button className="btn-close" onClick={closeNow} aria-label="닫기">×</button>
        </div>

        {/* 탭 — 전체 보기의 격자/구름 탭과 같은 모양(.dash-view-tabs)입니다.
            이 앱에서 '한 자리에 두 얼굴'을 고르는 자리는 늘 이 알약 줄입니다. */}
        <div className="cornell-view-tabs dash-view-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "cornell"}
            className={`dash-view-tab${tab === "cornell" ? " on" : ""}`}
            onClick={() => pickTab("cornell")}
          >
            수업 노트
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "kwls"}
            className={`dash-view-tab${tab === "kwls" ? " on" : ""}`}
            onClick={() => pickTab("kwls")}
          >
            KWLS 노트
          </button>
        </div>

        <div className="cornell-view-pane" hidden={tab !== "cornell"}>
        {!loaded ? (
          <p className="empty-note">불러오는 중이에요…</p>
        ) : notes.length === 0 ? (
          <p className="empty-note">
            아직 쓴 노트가 없어요. 서랍에서 오늘 수업을 적어 보세요.
          </p>
        ) : (
          <>
            {/* 고르는 칸 · 넘기는 단추 · 몇 번째 — ‹ ›를 **붙여 둡니다.**
                긴 칸 양끝에 떼어 놓으면 한 장 넘길 때마다 손이 화면을 가로질러
                오갑니다. 칸도 늘이지 않아 아래 노트와 폭이 맞습니다. */}
            <div className="cornell-read-bar">
              <select
                className="cornell-read-date"
                value={id ?? ""}
                onChange={(e) => jumpTo(e.target.value)}
                aria-label="날짜 고르기"
              >
                {notes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.date}
                    {n.lessonTitle ? ` · ${n.lessonTitle}` : ""}
                    {String(n.feedback ?? "").trim() ? " · 💬" : ""}
                  </option>
                ))}
              </select>
              <div className="cornell-read-nav">
                <button
                  type="button"
                  className="cornell-read-step"
                  onClick={() => go(1)}
                  disabled={index >= notes.length - 1 || saving}
                  title={editing ? "저장하고 이전 노트로" : "이전 노트 (←)"}
                  aria-label="이전 노트"
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="cornell-read-step"
                  onClick={() => go(-1)}
                  disabled={index <= 0 || saving}
                  title={editing ? "저장하고 다음 노트로" : "다음 노트 (→)"}
                  aria-label="다음 노트"
                >
                  ›
                </button>
              </div>
              <span className="cornell-read-count">
                {index + 1} / {notes.length}
              </span>
              {/* PDF로 저장 — 인쇄 창을 열고 '대상: PDF로 저장'을 고르면
                  됩니다. 그림으로 굽지 않아 글자가 글자로 남습니다(복사·검색이
                  되고 확대해도 안 흐려집니다). 자세한 것은 lib/exportCornell.js.
                  '이 노트'와 '전체'를 나눈 이유: 오늘 것만 뽑아 붙이는 일과
                  한 학기치를 묶어 복습하는 일이 둘 다 있어서입니다. */}
              {/* 고치기 — 지난 노트를 고치는 길은 이 창 하나뿐입니다(서랍은
                  오늘 노트만 씁니다). 누르면 보고 있던 2단이 그대로 입력칸이
                  되고, 넘기거나 닫으면 저절로 저장됩니다. */}
              <button
                type="button"
                className={`cornell-read-edit${editing ? " on" : ""}`}
                onClick={editing ? finishEdit : startEdit}
                disabled={!note || saving}
                title={
                  editing
                    ? "저장하고 읽기로 돌아갑니다"
                    : "이 노트를 고칩니다 — 넘기거나 닫으면 저절로 저장돼요"
                }
              >
                {editing ? (saving ? "저장 중…" : "저장하고 마치기") : "✏ 고치기"}
              </button>
              <span className="cornell-read-print">
                <button
                  type="button"
                  className="cornell-read-pdf"
                  onClick={() => printOne(note)}
                  disabled={!note}
                  title="지금 보고 있는 노트 한 장을 PDF로 저장합니다"
                >
                  🖨 이 노트
                </button>
                <button
                  type="button"
                  className="cornell-read-pdf"
                  onClick={printAll}
                  title="이 반에서 쓴 노트를 모두 한 파일로 저장합니다"
                >
                  🖨 전체 {notes.length}장
                </button>
              </span>
            </div>

            {/* 선생님이 짚어 둔 자리가 있으면 고치기 전에 일러 둡니다.
                표시가 없는 노트에는 안 띄웁니다 — 무슨 소린지 알 수 없는
                경고가 됩니다. */}
            {editing && marksOf(note).length > 0 && (
              <p className="cornell-edit-warn">
                하이라이트가 있는 경우 내용을 수정하면 하이라이트가 사라질 수도 있습니다.
                단, 표시만 사라질 뿐 피드백 내용은 그대로 유지되니 걱정하지 마세요.
              </p>
            )}

            {editing ? (
              <CornellNoteEditSheet
                date={editDate}
                feedback={note?.feedback ?? ""}
                topic={topic}
                blocks={blocks}
                summary={summary}
                loadSeq={loadSeq}
                onTopic={setTopic}
                onBlock={editBlock}
                onAddBlock={addBlock}
                onRemoveBlock={removeBlock}
                onSummary={setSummary}
              />
            ) : (
              <CornellNoteSheet note={note} />
            )}

            {/* 복습하는 자리라 한 줄 일러 둡니다 — 코넬 노트의 쓰임이
                '오른쪽을 가리고 왼쪽만 보며 떠올리기'라서요.
                고치는 중에는 그 말 대신 저장이 어떻게 되는지 적습니다. */}
            <p className="cornell-viewer-hint">
              {editing
                ? "고친 것은 넘기거나 창을 닫을 때 저절로 저장돼요. 선생님 한 마디는 학생이 고칠 수 없습니다."
                : "오른쪽 필기를 손으로 가리고 왼쪽 단서만 보며 떠올려 보세요. ← → 로 넘길 수 있어요."}
            </p>
          </>
        )}
        </div>

        {kwlsMounted && (
          <div className="cornell-view-pane" hidden={tab !== "kwls"}>
            <MyKwlsNotes classId={classId} user={user} active={tab === "kwls"} />
          </div>
        )}
      </div>
    </div>
  );
}
