"use client";

// =============================================================
// 수업 노트 읽기 (교사 전용) — 한 학생의 지난 노트를 넘겨 보며 한 마디
// -------------------------------------------------------------
// 학생 카드를 누르면 열립니다. 그 학생의 노트를 전부 받아(한 학기에 많아야
// 수십 건) 날짜로 넘겨 볼 수 있게 하고, 아래에 피드백 한 칸을 둡니다.
//
// **본문은 손대지 않습니다.** 규칙도 feedback 세 필드만 열어 두었고, 화면에도
// 고칠 자리를 두지 않았습니다 — 남의 필기를 고칠 수 있으면 그건 그 학생의
// 기록이 아니게 됩니다.
//
// 저장은 손으로 누릅니다(서랍의 자동 저장과 다릅니다). 학생 화면에 곧바로
// 뜨는 글이라, 쓰다 만 문장이 새어 나가면 안 됩니다.
// =============================================================
import { useEffect, useMemo, useState } from "react";
import { backdropClose } from "@/lib/modal";
import { subscribeStudentCornellNotes, saveCornellFeedback } from "@/lib/store";
import CornellNoteSheet from "./CornellNoteSheet";
import { IconRecord } from "./StatusIcons";

const FEEDBACK_MAX = 2000;

export default function CornellNoteReadModal({
  classId,
  student,
  user,
  initialDate = null,
  onBack = null,
  onClose,
}) {
  const [notes, setNotes] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [date, setDate] = useState(initialDate);
  const [draft, setDraft] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!classId || !student?.uid) { setNotes([]); setLoaded(true); return; }
    return subscribeStudentCornellNotes(classId, student.uid, (list) => {
      setNotes(list);
      setLoaded(true);
    });
  }, [classId, student?.uid]);

  // 고른 날짜가 아직 없거나 목록에 없으면 가장 최근 것으로.
  useEffect(() => {
    if (notes.length === 0) return;
    if (!date || !notes.some((n) => n.date === date)) setDate(notes[0].date);
  }, [notes, date]);

  const index = notes.findIndex((n) => n.date === date);
  const note = index >= 0 ? notes[index] : null;

  // 노트를 옮길 때마다 피드백 칸을 그 노트의 것으로 되돌립니다.
  // 쓰던 중이면(dirty) 그대로 두지 않고 버립니다 — 다른 학생의 노트에 남긴
  // 글이 옆 노트로 따라가는 것이 훨씬 나쁩니다.
  useEffect(() => {
    setDraft(String(note?.feedback ?? ""));
    setDirty(false);
    setSaved(false);
  }, [note?.id]);

  const counted = useMemo(
    () => ({ index: index >= 0 ? index + 1 : 0, total: notes.length }),
    [index, notes.length]
  );

  async function save() {
    if (!note || saving) return;
    setSaving(true);
    try {
      await saveCornellFeedback(classId, note.id, draft, user);
      setDirty(false);
      setSaved(true);
    } catch (e) {
      console.warn("[수업 노트] 피드백을 저장하지 못했어요:", e?.code, e?.message);
      alert("피드백을 저장하지 못했어요. 잠시 뒤 다시 눌러 주세요.");
    } finally {
      setSaving(false);
    }
  }

  function go(step) {
    const next = index + step;
    if (next < 0 || next >= notes.length) return;
    setDate(notes[next].date);
  }

  return (
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      <div
        className="modal modal-cornell-read"
        role="dialog"
        aria-modal="true"
        aria-label="수업 노트 읽기"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3 className="head-icon">
            {onBack && (
              <button type="button" className="modal-back" onClick={onBack} aria-label="뒤로" title="뒤로">
                ‹
              </button>
            )}
            <IconRecord size={19} /> 수업 노트
            <span className="notes-student">
              {student?.emoji ?? "🙂"} {student?.name}
            </span>
          </h3>
          <button className="btn-close" onClick={onClose} aria-label="닫기">×</button>
        </div>

        {!loaded ? (
          <p className="empty-note">불러오는 중이에요…</p>
        ) : notes.length === 0 ? (
          <p className="empty-note">이 학생은 아직 수업 노트를 쓰지 않았어요.</p>
        ) : (
          <>
            {/* 날짜 넘기기 — 한 학생의 흐름을 따라가는 자리입니다.
                ‹ ›는 붙여 둡니다(학생 화면과 같은 모양) */}
            <div className="cornell-read-bar">
              <select
                className="cornell-read-date"
                value={date ?? ""}
                onChange={(e) => setDate(e.target.value)}
                aria-label="날짜 고르기"
              >
                {notes.map((n) => (
                  <option key={n.id} value={n.date}>
                    {n.date}
                    {n.lessonTitle ? ` · ${n.lessonTitle}` : ""}
                    {String(n.feedback ?? "").trim() ? " · 피드백 남김" : ""}
                  </option>
                ))}
              </select>
              <div className="cornell-read-nav">
                <button
                  type="button"
                  className="cornell-read-step"
                  onClick={() => go(1)}
                  disabled={index >= notes.length - 1}
                  title="이전 날짜"
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="cornell-read-step"
                  onClick={() => go(-1)}
                  disabled={index <= 0}
                  title="다음 날짜"
                >
                  ›
                </button>
              </div>
              <span className="cornell-read-count">
                {counted.index} / {counted.total}
              </span>
            </div>

            <CornellNoteSheet note={note} showFeedback={false} />

            <div className="cornell-read-feedback">
              <label htmlFor="cornell-feedback">
                <b>선생님 한 마디</b>
                <em>학생 서랍 맨 위에 그대로 보입니다</em>
              </label>
              <textarea
                id="cornell-feedback"
                rows={3}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value.slice(0, FEEDBACK_MAX));
                  setDirty(true);
                  setSaved(false);
                }}
                placeholder="예) 단서 칸에 물음표를 붙여 보면 복습할 때 훨씬 좋아요"
              />
              <div className="cornell-read-actions">
                <span className="cornell-read-hint">
                  {saved ? "저장했어요" : dirty ? "저장하지 않은 글이 있어요" : ""}
                </span>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={save}
                  disabled={!dirty || saving}
                >
                  {saving ? "저장 중…" : "피드백 저장"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
