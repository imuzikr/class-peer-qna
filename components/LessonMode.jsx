"use client";

// =============================================================
// 수업하기 — 교사 화면 (왼쪽 슬라이드 · 오른쪽 메모)
// -------------------------------------------------------------
// 같은 레이아웃을 두 가지로 씁니다.
//  · mode="edit"  — 수업 전, 장마다 메모를 적어 두는 화면(자동 저장)
//  · mode="teach" — 수업 중. 넘길 때마다 그 반 학생 화면이 같은 장으로
//                   강제 전환됩니다(학생에겐 슬라이드만, 메모는 교사 전용).
//
// 이전 / 다음 / 종료 — 종료하면 방송이 꺼져 학생 화면도 원래대로 돌아갑니다.
// =============================================================
import { useEffect, useRef, useState } from "react";
import { startBroadcast, stopBroadcast } from "@/lib/store";
import { getCurrentUser } from "@/lib/user";

export default function LessonMode({
  lesson,
  mode = "teach",
  classId = null,
  className = "",
  onSaveNote,
  onClose,
}) {
  const slides = lesson.slides ?? [];
  const total = slides.length;
  const [idx, setIdx] = useState(0);
  const [note, setNote] = useState(slides[0]?.note ?? "");
  const [saved, setSaved] = useState(false);
  const editing = mode === "edit";
  const noteRef = useRef(note);

  const cur = slides[Math.min(idx, total - 1)];

  // 장을 넘기면 그 장의 메모를 불러옵니다.
  useEffect(() => {
    const next = slides[idx]?.note ?? "";
    setNote(next);
    noteRef.current = next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, lesson.id]);

  // 메모 자동 저장 — 입력이 0.8초 멈추면 저장(편집 모드에서만)
  useEffect(() => {
    if (!editing) return;
    if (note === (slides[idx]?.note ?? "")) return;
    const t = setTimeout(async () => {
      await onSaveNote?.(idx, note);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note, idx, editing]);

  // 수업 중 — 현재 장을 방송에 실어 학생 화면을 같은 장으로 맞춥니다.
  useEffect(() => {
    if (editing || !classId || !cur) return;
    startBroadcast(getCurrentUser(), classId, {
      mode: "lesson",
      lessonTitle: lesson.title ?? "",
      imageUrl: cur.imageUrl,
      slideIndex: idx,
      slideCount: total,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, classId, cur?.imageUrl, idx, total]);

  // 수업을 끝내면(화면을 벗어나면) 방송도 반드시 종료
  useEffect(() => {
    if (editing || !classId) return;
    return () => { stopBroadcast(classId); };
  }, [editing, classId]);

  // 키보드 ← → 로 넘기기 (메모를 쓰는 중에는 방해하지 않음)
  useEffect(() => {
    function onKey(e) {
      if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT") return;
      if (e.key === "ArrowLeft") setIdx((i) => Math.max(0, i - 1));
      else if (e.key === "ArrowRight") setIdx((i) => Math.min(total - 1, i + 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [total]);

  return (
    <div className="lesson-mode">
      <div className="lesson-head">
        <strong className="lesson-title">{lesson.title}</strong>
        {editing ? (
          <span className="lesson-badge lesson-badge--edit">메모 작성</span>
        ) : (
          <span className="lesson-badge">
            <span className="broadcast-live-dot" aria-hidden="true" />
            수업 중{className && ` · ${className}`}
          </span>
        )}
        <span className="lesson-count">{total === 0 ? 0 : idx + 1} / {total}</span>
        <button type="button" className="lesson-exit" onClick={onClose}>
          {editing ? "닫기" : "수업 종료"}
        </button>
      </div>

      <div className="lesson-body">
        <div className="lesson-slide-pane">
          {cur ? (
            <img className="lesson-slide-img" src={cur.imageUrl} alt={`슬라이드 ${idx + 1}`} />
          ) : (
            <p className="lesson-empty">슬라이드가 없어요.</p>
          )}
        </div>

        <aside className="lesson-note-pane">
          <div className="lesson-note-head">
            <span>수업 메모</span>
            {editing && saved && <em className="lesson-saved">✓ 저장됨</em>}
            <small>나만 보여요</small>
          </div>
          {editing ? (
            <textarea
              className="lesson-note-input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="이 장에서 할 이야기, 발문, 활동 안내를 적어 두세요."
            />
          ) : note.trim() ? (
            <div className="lesson-note-text">{note}</div>
          ) : (
            <p className="lesson-note-empty">이 장에는 메모가 없어요.</p>
          )}
        </aside>
      </div>

      <div className="lesson-foot">
        <button
          type="button"
          className="btn-primary lesson-nav"
          onClick={() => setIdx((i) => Math.max(0, i - 1))}
          disabled={idx === 0}
        >
          ‹ 이전
        </button>
        <span className="lesson-dots" aria-hidden="true">
          {slides.map((_, i) => (
            <i key={i} className={i === idx ? "on" : ""} />
          ))}
        </span>
        <button
          type="button"
          className="btn-primary lesson-nav"
          onClick={() => setIdx((i) => Math.min(total - 1, i + 1))}
          disabled={idx >= total - 1}
        >
          다음 ›
        </button>
      </div>
    </div>
  );
}
