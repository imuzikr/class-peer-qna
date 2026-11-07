"use client";

// =============================================================
// RAFT 글쓰기 — 교사 피드백(형광펜 + 메모) 화면 조각 (교사 RaftBoard · 학생 RaftForm 공용)
// -------------------------------------------------------------
//  · RaftFeedbackText  — 형광펜을 칠한 글. 교사는 드래그로 새 범위를 고릅니다(onSelectRange).
//                        형광펜을 누르면 그 메모가 열립니다(onOpenNote).
//  · RaftFeedbackButton — 박스 바깥 위쪽 '글 n자' 왼쪽의 「피드백 n개」 단추(학생은 '새 n').
//  · RaftFeedbackList   — 그 단추가 여는 메모 목록(번호 · 칠한 부분 · 메모 글).
//  · RaftFeedbackPopover — 메모 창(팝오버). 교사: 쓰기 · 고치기 · 지우기 / 학생: 읽기만.
// 셈(자리 · 조각 나누기 · 겹침)은 lib/raftFeedback.js에 있습니다.
// 글자 차례(start · end)는 글 문자열 그대로의 차례입니다 — 그래서 글은 **다듬지 않은
// 원문**을 그립니다(앞뒤 빈칸을 걷으면 차례가 어긋남, white-space: pre-wrap).
// =============================================================
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RAFT_FEEDBACK_MAX, splitFeedbackSegments } from "@/lib/raftFeedback";
import { usePopoverAnchor, usePopoverDismiss } from "@/lib/popover";
import { IconQuizMemo } from "./StatusIcons";

// 새로 고르는 중인 범위의 표시 id(아직 저장 전)
export const PENDING_ID = "__new";

export function RaftFeedbackText({ text, notes = [], pending = null, activeId = null, onSelectRange = null, onOpenNote = null, emptyText = "아직 쓰지 않았어요" }) {
  const ref = useRef(null);
  const raw = String(text ?? "");
  if (!raw.trim()) return <p className="paratext-read-text empty">{emptyText}</p>;

  const marks = notes.filter((n) => n.range).map((n) => ({ id: n.id, range: n.range }));
  if (pending) marks.push({ id: PENDING_ID, range: pending });
  const segs = splitFeedbackSegments(raw, marks);
  const noOf = new Map(notes.map((n) => [n.id, n.no]));

  // 드래그를 놓은 순간 — 글 상자 안에서 고른 범위만, 글자 차례로 바꿔 넘깁니다.
  // 형광펜(<mark>)이 섞여 있어도 Range.toString()이 글자만 이으므로 차례가 맞습니다.
  function readSelection() {
    if (!onSelectRange) return;
    const box = ref.current;
    const sel = box?.ownerDocument?.getSelection?.();
    if (!box || !sel || sel.isCollapsed || sel.rangeCount === 0) return;
    const r = sel.getRangeAt(0);
    if (!box.contains(r.startContainer) || !box.contains(r.endContainer)) return;
    const offset = (node, o) => {
      const pre = box.ownerDocument.createRange();
      pre.selectNodeContents(box);
      pre.setEnd(node, o);
      return pre.toString().length;
    };
    const s = offset(r.startContainer, r.startOffset);
    const e = offset(r.endContainer, r.endOffset);
    sel.removeAllRanges();
    onSelectRange(s, e);
  }

  return (
    <p
      ref={ref}
      className={`paratext-read-text raft-fb-text${onSelectRange ? " can-mark" : ""}`}
      onMouseUp={readSelection}
      // 터치는 손을 뗀 뒤 고른 범위가 자리를 잡으므로 한 박자 뒤에 읽습니다
      onTouchEnd={onSelectRange ? () => setTimeout(readSelection, 0) : undefined}
    >
      {segs.map((sg, i) =>
        sg.id ? (
          <mark
            key={`${sg.id}_${i}`}
            data-fid={sg.id}
            data-n={sg.id === PENDING_ID ? "" : noOf.get(sg.id) ?? ""}
            className={`raft-fb-mark${sg.id === PENDING_ID ? " pending" : ""}${activeId === sg.id ? " on" : ""}`}
            onClick={sg.id !== PENDING_ID && onOpenNote ? (e) => onOpenNote(sg.id, e.currentTarget) : undefined}
          >
            {sg.text}
          </mark>
        ) : (
          sg.text
        )
      )}
    </p>
  );
}

// 박스 바깥 위쪽 '글 n자' 왼쪽의 단추 하나 — 「피드백 n개」. 누르면 메모 목록(RaftFeedbackList).
// 한때 메모마다 아이콘(📝1 📝2 …)을 늘어놓았는데, 메모가 많으면 줄이 넘쳐 위 칸에 얹혀
// 단추 하나로 모았습니다(선생님 요청). 학생은 안 본 메모가 있으면 빨간 '새 n'.
export function RaftFeedbackButton({ notes = [], isNew = null, open = false, onToggle }) {
  if (!notes.length) return null;
  const fresh = isNew ? notes.filter(isNew).length : 0;
  return (
    <button
      type="button"
      className={`raft-fb-btn${open ? " on" : ""}`}
      onClick={(e) => onToggle(e.currentTarget)}
      aria-expanded={open}
      aria-haspopup="dialog"
      title={fresh ? `새 피드백 ${fresh}개 — 눌러서 읽기` : "피드백 메모 목록"}
    >
      <IconQuizMemo size={18} />
      피드백 {notes.length}개
      {fresh > 0 && <span className="raft-fb-btn-new">새 {fresh}</span>}
    </button>
  );
}

// 메모 목록 — 단추 옆에 뜨는 팝오버. 줄마다 번호 · 칠한 부분 · 메모 글(다 보임).
//   onPick(id) — 줄을 누름(교사: 그 형광펜에서 메모 창을 엶 · 학생: 그 형광펜을 짚어 줌)
export function RaftFeedbackList({ anchor, notes = [], isNew = null, activeId = null, onPick, onClose, title = "피드백 메모" }) {
  const ref = useRef(null);
  const pos = usePopoverAnchor(anchor, { w: 360, h: Math.min(460, 90 + notes.length * 92), gap: 10 });
  usePopoverDismiss(true, ref, onClose, ".raft-fb-btn, .raft-fb-mark");
  return createPortal(
    <div
      ref={ref}
      className="raft-fb-pop raft-fb-list"
      role="dialog"
      aria-label={title}
      style={{ left: pos.x, top: pos.y, maxHeight: pos.maxH }}
    >
      <div className="raft-fb-pop-head">
        <IconQuizMemo size={18} />
        <strong>{title} {notes.length}개</strong>
        <button type="button" className="raft-fb-pop-x" onClick={onClose} aria-label="닫기">×</button>
      </div>
      <ol className="raft-fb-rows">
        {notes.map((n) => {
          const fresh = !!isNew?.(n);
          return (
            <li key={n.id}>
              <button
                type="button"
                className={`raft-fb-row${activeId === n.id ? " on" : ""}${fresh ? " fresh" : ""}`}
                onClick={() => onPick(n.id)}
              >
                <b className="raft-fb-row-no">{n.no}</b>
                <span className="raft-fb-row-body">
                  <span className="raft-fb-row-quote">{n.quote}</span>
                  <span className="raft-fb-row-text">{n.text}</span>
                </span>
                {fresh && <span className="raft-fb-row-new">새 피드백</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </div>,
    document.body
  );
}

// 메모 창 — anchor(형광펜 · 목록 단추 요소) 옆에 뜹니다(lib/popover.js).
//   note      열린 메모(새로 쓰는 중이면 null) · quote  칠한 부분
//   canEdit   교사 — 쓰기 · 고치기 · 지우기 / 아니면 읽기만
export function RaftFeedbackPopover({ anchor, note = null, quote = "", canEdit = false, onSave, onDelete, onClose }) {
  const ref = useRef(null);
  const [draft, setDraft] = useState(note?.text ?? "");
  const [busy, setBusy] = useState(false);
  const [askDelete, setAskDelete] = useState(false);
  const [error, setError] = useState("");
  const pos = usePopoverAnchor(anchor, { w: 320, h: canEdit ? 280 : 220, gap: 12 });
  const dirty = canEdit && draft.trim() !== (note?.text ?? "").trim();

  // 다른 메모로 옮겨 가면 그 메모의 글로
  const noteId = note?.id ?? null;
  const noteText = note?.text ?? "";
  useEffect(() => { setDraft(noteText); setAskDelete(false); setError(""); }, [noteId, noteText]);

  // 바깥 · Esc로 닫되, 고쳐 쓰던 글이 있으면 닫지 않습니다(글이 날아가지 않게 — '취소'로 닫음).
  // 형광펜 · 목록 단추를 누르면 그쪽으로 옮겨 가므로 닫지 않습니다(깜빡임 방지).
  usePopoverDismiss(true, ref, () => { if (!dirty) onClose(); }, ".raft-fb-btn, .raft-fb-mark");

  async function save() {
    const t = draft.trim();
    if (!t || busy) return;
    setBusy(true);
    setError("");
    try {
      await onSave(t);
    } catch (e) {
      console.warn("[RAFT 피드백] 저장하지 못했어요:", e?.code, e?.message);
      setError("저장하지 못했어요. 잠시 뒤 다시 눌러 주세요.");
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    try {
      await onDelete();
    } catch (e) {
      console.warn("[RAFT 피드백] 지우지 못했어요:", e?.code, e?.message);
      setError("지우지 못했어요. 잠시 뒤 다시 눌러 주세요.");
      setBusy(false);
    }
  }

  // body에 띄웁니다 — 구르는 상자 · 변형(transform)된 조상 안에서도 fixed 자리가 맞게
  return createPortal(
    <div
      ref={ref}
      className="raft-fb-pop"
      role="dialog"
      aria-label={note ? `피드백 메모 ${note.no ?? ""}` : "새 피드백 메모"}
      style={{ left: pos.x, top: pos.y, maxHeight: pos.maxH }}
    >
      <div className="raft-fb-pop-head">
        <IconQuizMemo size={18} />
        <strong>{note ? `피드백 ${note.no ?? ""}` : "새 피드백"}</strong>
        <button type="button" className="raft-fb-pop-x" onClick={onClose} aria-label="닫기">×</button>
      </div>
      {quote && <blockquote className="raft-fb-quote">{quote}</blockquote>}
      {canEdit ? (
        <>
          <textarea
            className="raft-fb-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); save(); } }}
            rows={4}
            maxLength={RAFT_FEEDBACK_MAX}
            placeholder="이 부분에 대한 피드백을 적어 주세요"
            autoFocus
            aria-label="피드백 메모"
          />
          {error && <p className="raft-fb-error">{error}</p>}
          {askDelete ? (
            <div className="raft-fb-actions">
              <span className="raft-fb-ask">이 메모를 지울까요?</span>
              <button type="button" className="btn-ghost" onClick={() => setAskDelete(false)} disabled={busy}>아니요</button>
              <button type="button" className="raft-fb-del" onClick={remove} disabled={busy}>지우기</button>
            </div>
          ) : (
            <div className="raft-fb-actions">
              {note ? (
                <button type="button" className="raft-fb-del-link" onClick={() => setAskDelete(true)} disabled={busy}>메모 지우기</button>
              ) : (
                <span className="raft-fb-count">{draft.length} / {RAFT_FEEDBACK_MAX}</span>
              )}
              <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>취소</button>
              <button type="button" className="btn-primary" onClick={save} disabled={busy || !draft.trim() || (note && !dirty)}>
                {busy ? "저장 중…" : "저장"}
              </button>
            </div>
          )}
        </>
      ) : (
        <p className="raft-fb-read">{note?.text}</p>
      )}
    </div>,
    document.body
  );
}
