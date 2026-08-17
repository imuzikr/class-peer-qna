"use client";

// =============================================================
// 수업하기 — 교사용 수업 페이지
// -------------------------------------------------------------
// 위아래로 스크롤되는 '페이지'입니다. 지금은 슬라이드 카드와 해설 카드
// 두 장이 2열로 놓여 있고, 앞으로 수업 관련 기능을 이 아래에 섹션으로
// 계속 덧붙일 수 있게 만들었습니다.
//
// 같은 화면을 두 가지 모드로 씁니다.
//  · mode="edit"  — 수업 전, 장마다 해설을 적어 두는 화면(자동 저장)
//  · mode="teach" — 수업 중. 넘길 때마다 그 반 학생 화면이 같은 장으로
//                   강제 전환됩니다(학생에겐 슬라이드만, 해설은 교사 전용).
//
// [스크롤과 학생 화면은 무관합니다]
// 방송은 '지금 몇 번째 장인지'가 바뀔 때만 씁니다(아래 useEffect의 의존성).
// 교사가 페이지를 아무리 위아래로 굴려도 그 값은 변하지 않으므로, 학생
// 화면은 교사가 슬라이드를 넘기기 전까지 계속 같은 장에 머뭅니다.
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
          <span className="lesson-badge lesson-badge--edit">해설 작성</span>
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

      {/* 수업 페이지 본문 — 위아래로 스크롤됩니다. 스크롤은 이 화면 안의
          일일 뿐이라 학생 화면과는 아무 상관이 없습니다(아래 주석 참고). */}
      <div className="lesson-page">
        <div className="lesson-deck">
          {/* ── 슬라이드 카드 ── */}
          <section className="lesson-card lesson-card--slide">
            <div className="lesson-card-head">
              <h2>슬라이드</h2>
            </div>

            <div className="lesson-stage">
              {cur ? (
                <img className="lesson-slide-img" src={cur.imageUrl} alt={`슬라이드 ${idx + 1}`} />
              ) : (
                <p className="lesson-empty">슬라이드가 없어요.</p>
              )}
            </div>

            {/* 넘기기 버튼은 슬라이드와 한 카드에 둡니다 — 아래에 다른 수업
                기능이 붙어도 슬라이드와 조작이 떨어지지 않게. */}
            <div className="lesson-card-foot">
              <button
                type="button"
                className="btn-primary lesson-nav"
                onClick={() => setIdx((i) => Math.max(0, i - 1))}
                disabled={idx === 0}
              >
                ‹ 이전
              </button>
              {total > 0 && total <= 24 && (
                <span className="lesson-dots" aria-hidden="true">
                  {slides.map((_, i) => (
                    <i key={i} className={i === idx ? "on" : ""} />
                  ))}
                </span>
              )}
              <button
                type="button"
                className="btn-primary lesson-nav"
                onClick={() => setIdx((i) => Math.min(total - 1, i + 1))}
                disabled={idx >= total - 1}
              >
                다음 ›
              </button>
            </div>
          </section>

          {/* ── 해설 카드 ── */}
          <section className="lesson-card lesson-card--note">
            <div className="lesson-card-head">
              <h2>해설</h2>
              {editing && saved && <em className="lesson-saved">✓ 저장됨</em>}
              <small>나만 보여요</small>
            </div>

            <div className="lesson-note-body">
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
                <p className="lesson-note-empty">이 장에는 해설이 없어요.</p>
              )}
            </div>
          </section>
        </div>

        {/* 앞으로 수업 관련 기능(출석·퀴즈·활동 등)은 이 아래에 섹션으로
            덧붙이면 됩니다. 슬라이드 카드와 독립적이라 방송에는 영향 없습니다. */}
      </div>
    </div>
  );
}
