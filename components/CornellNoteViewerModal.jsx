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
// =============================================================
import { useCallback, useEffect, useRef, useState } from "react";
import { backdropClose } from "@/lib/modal";
import {
  subscribeMyCornellNotes,
  markCornellFeedbackSeen,
  isCornellFeedbackUnread,
} from "@/lib/store";
import CornellNoteSheet from "./CornellNoteSheet";

export default function CornellNoteViewerModal({
  classId,
  user,
  initialNotes = [],
  startId = null,
  onClose,
}) {
  // 서랍이 이미 갖고 있는 14일치로 먼저 그립니다 — 빈 화면이 잠깐 스치지 않게
  const [notes, setNotes] = useState(initialNotes);
  const [id, setId] = useState(startId ?? initialNotes[0]?.id ?? null);
  const [loaded, setLoaded] = useState(initialNotes.length > 0);
  // 여기서 읽은 것도 읽음으로 — 서랍이 훑는 14일 **밖**의 옛 노트는
  // 여기서만 열립니다. 한 번씩만 쓰도록 ref로 막습니다.
  const markedRef = useRef(new Set());

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

  const go = useCallback(
    (step) => {
      setId((cur) => {
        const i = notes.findIndex((n) => n.id === cur);
        const next = i + step;
        if (i < 0 || next < 0 || next >= notes.length) return cur;
        return notes[next].id;
      });
    },
    [notes]
  );

  // ← 더 옛날 / → 더 최근. Esc는 이 창만 닫습니다(서랍은 그대로).
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      } else if (e.key === "ArrowLeft") {
        go(1);
      } else if (e.key === "ArrowRight") {
        go(-1);
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [go, onClose]);

  return (
    <div
      className="modal-backdrop cornell-viewer-backdrop"
      {...backdropClose(onClose)}
    >
      <div
        className="modal modal-cornell-viewer"
        role="dialog"
        aria-modal="true"
        aria-label="내 수업 노트"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3>📓 내 수업 노트</h3>
          <button className="btn-close" onClick={onClose} aria-label="닫기">×</button>
        </div>

        {!loaded ? (
          <p className="empty-note">불러오는 중이에요…</p>
        ) : notes.length === 0 ? (
          <p className="empty-note">
            아직 쓴 노트가 없어요. 서랍에서 오늘 수업을 적어 보세요.
          </p>
        ) : (
          <>
            <div className="cornell-read-bar">
              <button
                type="button"
                className="cornell-read-step"
                onClick={() => go(1)}
                disabled={index >= notes.length - 1}
                title="이전 노트 (←)"
                aria-label="이전 노트"
              >
                ‹
              </button>
              <select
                className="cornell-read-date"
                value={id ?? ""}
                onChange={(e) => setId(e.target.value)}
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
              <button
                type="button"
                className="cornell-read-step"
                onClick={() => go(-1)}
                disabled={index <= 0}
                title="다음 노트 (→)"
                aria-label="다음 노트"
              >
                ›
              </button>
              <span className="cornell-read-count">
                {index + 1} / {notes.length}
              </span>
            </div>

            {note?.lessonTitle && (
              <p className="cornell-read-lesson">{note.lessonTitle}</p>
            )}

            <CornellNoteSheet note={note} />

            {/* 복습하는 자리라 한 줄 일러 둡니다 — 코넬 노트의 쓰임이
                '오른쪽을 가리고 왼쪽만 보며 떠올리기'라서요. */}
            <p className="cornell-viewer-hint">
              오른쪽 필기를 손으로 가리고 왼쪽 단서만 보며 떠올려 보세요. ← → 로 넘길 수 있어요.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
