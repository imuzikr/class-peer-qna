"use client";

// =============================================================
// 내 생각은요... — 교사·학생이 함께 쓰는 메모판
// -------------------------------------------------------------
// 교사가 나눈 영역(찬성 · 반대 …) 위에 학생이 포스트잇 같은 메모를 붙입니다.
// 반 전체가 **같은 판을 함께** 봅니다 — 그래서 교사 화면과 학생 화면이
// 한 컴포넌트이고, 갈리는 것은 누가 무엇을 만질 수 있는가뿐입니다.
//
//   붙이기   학생(잠기기 전) · 교사('선생님' 메모)
//   글 고치기 쓴 사람(잠기기 전)
//   옮기기   쓴 사람(잠기기 전) · 교사(아무 메모나 — 칠판 앞에서 모아 정리)
//   떼어 내기 쓴 사람(잠기기 전) · 교사
//   읽기     누구나 — 메모를 누르면 크게 열립니다
//
// [누르기와 끌기] 한 손짓으로 둘을 가립니다 — 4px 넘게 움직이면 끌기,
// 아니면 누르기(크게 보기). 끄는 동안은 화면에서만 움직이고, 놓는 순간
// 영역 + 영역 안의 비율로 바꿔 한 번 저장합니다(lib/opinion.js).
// 저장이 돌아오기 전에 원래 자리로 튀지 않게 놓은 자리를 잠깐 붙들어 둡니다.
// =============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import {
  addOpinionNote,
  deleteOpinionNote,
  moveOpinionNote,
  subscribeOpinionNotes,
  updateOpinionNote,
} from "@/lib/store";
import {
  OPINION_COLORS,
  OPINION_TEXT_MAX,
  canAddOpinionNote,
  nextNoteSpot,
  noteAuthorLabel,
  noteRealLabel,
  noteStackTime,
  noteTilt,
  normalizeZones,
  opinionColor,
  opinionNoteMode,
  opinionStats,
  pixelsFromPlace,
  placeFromPixels,
  zoneOfNote,
} from "@/lib/opinion";
import { safeBookUrl } from "@/lib/paratext";
import { backdropClose } from "@/lib/modal";
import ConfirmModal from "./ConfirmModal";
import { IconBook, IconLock, IconUnlock } from "./StatusIcons";

// 메모지 크기 — CSS의 .opinion-note와 같은 값이어야 자리 셈이 맞습니다.
const NOTE_W = 176;
const NOTE_H = 142;
// 이만큼 움직여야 '끌기' — 그보다 작으면 누른 것으로 봅니다(손 떨림).
const DRAG_SLOP = 4;
// 영역마다 머리 띠 색 — 메모 색과 같은 식구에서 고르되 겹치지 않게.
const ZONE_TINTS = ["peach", "mint", "sky", "lavender"];

export default function OpinionBoard({
  activity,
  user,
  isTeacher = false,
  roster = [],
  className = "",
  classPicker = null,
  classTools = null,
  onBack,
}) {
  const [notes, setNotes] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const zones = useMemo(() => normalizeZones(activity.zones), [activity.zones]);
  const locked = !!activity.locked;
  const uid = user?.uid ?? null;

  useEffect(() => {
    setLoaded(false);
    return subscribeOpinionNotes(activity.id, (list) => {
      setNotes(list);
      setLoaded(true);
    });
  }, [activity.id]);

  // 이름표는 **누구에게나 익명**입니다(질문방과 같습니다). 교사만 이름표를
  // 눌러 실제 학생을 봅니다 — 그때는 **명단의 이름**을 씁니다(메모에 적힌
  // 것은 붙일 때의 것이라). 연 이름표는 메모 id로 기억해 판과 크게 보기 창이
  // 함께 따라갑니다.
  const rosterById = useMemo(() => new Map(roster.map((s) => [s.uid, s])), [roster]);
  const [revealed, setRevealed] = useState(() => new Set());
  const canReveal = (n) => isTeacher && !n.byTeacher;
  const isRevealed = (n) => canReveal(n) && revealed.has(n.id);
  const toggleReveal = (n) =>
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(n.id)) next.delete(n.id);
      else next.add(n.id);
      return next;
    });
  const labelOf = (n) => noteAuthorLabel(n);
  const realOf = (n) => noteRealLabel(n, rosterById.get(n.authorId) ?? null);

  // ── 판 크기 재기 — 자리 셈이 픽셀을 알아야 합니다 ──
  const bodyRef = useRef(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return undefined;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [loaded]);

  // 놓은 자리를 저장이 돌아올 때까지 붙들어 둡니다 { [id]: {zone,x,y} }.
  const [pending, setPending] = useState({});
  // 지금 끄는 메모 { id, left, top } — 화면에서만 움직입니다.
  const [drag, setDrag] = useState(null);
  const dragRef = useRef(null);

  const [openId, setOpenId] = useState(null);
  const [composeZone, setComposeZone] = useState(null); // 새 메모를 쓰는 중이면 영역 key
  const [error, setError] = useState("");

  const isMine = (n) => !!uid && n.authorId === uid;
  // 붙이기 — 한 사람에 한 장이면 이미 붙인 학생은 더 못 붙입니다(고치고 옮기는
  // 것은 그대로). 교사 메모(byTeacher)는 세지 않습니다.
  const noteMode = opinionNoteMode(activity);
  const myStudentNotes = isTeacher ? 0 : notes.filter((n) => isMine(n) && !n.byTeacher).length;
  const canPost = canAddOpinionNote({ mode: noteMode, myCount: myStudentNotes, isTeacher, locked });
  const usedMyOne = !isTeacher && !locked && !canPost;
  const canMove = (n) => isTeacher || (isMine(n) && !locked);
  const canEdit = (n) => isMine(n) && !locked;
  const canRemove = (n) => isTeacher || (isMine(n) && !locked);

  const ordered = useMemo(
    () => notes.slice().sort((a, b) => noteStackTime(a) - noteStackTime(b)),
    [notes]
  );
  const { byZone, writers } = useMemo(() => opinionStats(notes, zones), [notes, zones]);
  // 교사 머리말의 '쓴 학생 n / N' — **지금 명단에 있는** 학생만 셉니다
  // (반에서 빠진 학생의 메모까지 세면 분자가 분모를 넘습니다).
  const rosterWriters = useMemo(
    () => [...writers].filter((id) => rosterById.has(id)).length,
    [writers, rosterById]
  );
  const myCount = notes.filter(isMine).length;
  const openNote = openId ? notes.find((n) => n.id === openId) ?? null : null;

  // 메모 한 장의 화면 자리
  function placeOf(n) {
    const p = pending[n.id];
    return p ?? { zone: zoneOfNote(n, zones), x: n.x, y: n.y };
  }
  function pixelsOf(n) {
    const p = placeOf(n);
    return pixelsFromPlace({ ...p, boardW: box.w, zoneH: box.h, noteW: NOTE_W, noteH: NOTE_H, zones });
  }

  // ── 누르기 / 끌기 ──
  function onNoteDown(e, n) {
    if (e.button !== undefined && e.button !== 0) return;
    const start = pixelsOf(n);
    dragRef.current = {
      id: n.id,
      sx: e.clientX,
      sy: e.clientY,
      left: start.left,
      top: start.top,
      movable: canMove(n),
      moved: false,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function onNoteMove(e) {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < DRAG_SLOP) return;
    d.moved = true;
    // 못 옮기는 메모(남의 것)는 제자리 — 다만 끌던 손짓이 놓는 순간 '누르기'로
    // 읽혀 창이 뜨지 않게, 움직였다는 표시만 남깁니다.
    if (!d.movable) return;
    const left = Math.min(Math.max(0, d.left + dx), Math.max(0, box.w - NOTE_W));
    const top = Math.min(Math.max(0, d.top + dy), Math.max(0, box.h - NOTE_H));
    // 놓을 때 쓸 자리는 ref에도 — 상태는 마지막 움직임이 아직 안 그려졌을 수 있습니다
    d.cur = { left, top };
    setDrag({ id: d.id, left, top });
  }
  async function onNoteUp(e, n) {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    if (!d.moved) {
      setDrag(null);
      setOpenId(n.id);
      return;
    }
    const cur = d.cur ?? null;
    setDrag(null);
    if (!cur) return;
    const place = placeFromPixels({
      px: cur.left, py: cur.top, boardW: box.w, zoneH: box.h, noteW: NOTE_W, noteH: NOTE_H, zones,
    });
    setPending((p) => ({ ...p, [n.id]: place }));
    try {
      await moveOpinionNote(activity.id, n.id, place);
    } catch {
      setError("메모를 옮기지 못했어요. 잠시 뒤 다시 해 주세요.");
    } finally {
      setPending((p) => {
        const next = { ...p };
        delete next[n.id];
        return next;
      });
    }
  }

  // ── 붙이기 · 고치기 · 떼어 내기 ──
  async function createNote({ text, color, zone }) {
    const spot = nextNoteSpot(byZone.get(zone) ?? 0);
    await addOpinionNote(activity.id, user, {
      text, color, zone, ...spot, byTeacher: isTeacher, single: noteMode === "single",
    });
  }
  async function saveNote(n, { text, color, zone }) {
    await updateOpinionNote(activity.id, n.id, { text, color });
    // 영역을 바꿨으면 그 영역의 빈자리 쪽으로 — 옮기기와 같은 길
    if (zone && zone !== zoneOfNote(n, zones)) {
      await moveOpinionNote(activity.id, n.id, { zone, ...nextNoteSpot(byZone.get(zone) ?? 0) });
    }
  }
  async function removeNote(n) {
    await deleteOpinionNote(activity.id, n.id);
    setOpenId(null);
  }

  const bookUrl = safeBookUrl(activity.bookUrl);
  const topic = (activity.topic ?? "").trim();
  const prompt = (activity.prompt ?? "").trim();
  const studentTotal = roster.length;

  return (
    <main className="books-main opinion-main">
      <div className="books-head">
        <div className="books-head-title">
          <h1 className="book-group-title">{activity.title}</h1>
          <button type="button" className="btn-ghost" onClick={onBack}>← 활동 목록</button>
          {classTools}
        </div>
        <div className="books-head-row">
          <div className="books-head-main">
            {topic && <span className="book-group-topic">{topic}</span>}
            {classPicker ?? (className && <span className="book-group-class">{className}</span>)}
            <span className="paratext-sum">
              메모 {notes.length}장
              {isTeacher && studentTotal > 0
                ? ` · 쓴 학생 ${rosterWriters} / ${studentTotal}명`
                : !isTeacher && myCount > 0
                  ? ` · 내 메모 ${myCount}장`
                  : ""}
            </span>
            {locked && (
              <span className="book-locked-note book-locked-chip">
                <IconLock size={14} />
                {isTeacher ? " 잠겨 있어 학생은 붙이거나 고칠 수 없어요." : " 지금은 잠겨 있어 읽기만 할 수 있어요."}
              </span>
            )}
          </div>
          {bookUrl && (
            <a className="btn-primary book-info-btn" href={bookUrl} target="_blank" rel="noopener noreferrer">
              <IconBook size={15} /> 도서 정보
            </a>
          )}
        </div>
      </div>

      {/* 함께 생각할 물음 — 교사가 적어 두었을 때만 판 바로 위 한 줄.
          예전에는 이 줄에 안내('메모를 누르면 크게…')·학생 메모 방식·
          '＋ 메모 붙이기'가 늘 섰는데 걷었습니다(선생님 요청) — 붙이는 길은
          영역 머리의 ＋이고, 그것이 곧 '어느 영역에' 붙일지까지 정합니다. */}
      {prompt && (
        <div className="opinion-bar">
          <p className="opinion-prompt">
            <span aria-hidden="true">💭</span> {prompt}
          </p>
        </div>
      )}
      {error && (
        <p className="form-error" role="alert" onClick={() => setError("")}>{error}</p>
      )}

      <section
        className="opinion-board"
        style={{ "--zones": zones.length }}
        aria-label="메모판"
      >
        <div className="opinion-heads">
          {zones.map((z, i) => (
            <div key={z.key} className={`opinion-zone-head tint-${ZONE_TINTS[i % ZONE_TINTS.length]}`}>
              <strong>{z.name}</strong>
              <span className="opinion-zone-count">{byZone.get(z.key) ?? 0}</span>
              {/* 한 장을 이미 붙인 학생은 ＋가 꺼지고 까닭을 툴팁으로 —
                  단추가 그냥 사라지면 고장으로 보입니다. */}
              {(canPost || usedMyOne) && (
                <button
                  type="button"
                  className="opinion-zone-add"
                  onClick={() => canPost && setComposeZone(z.key)}
                  disabled={!canPost}
                  aria-label={canPost ? `‘${z.name}’에 메모 붙이기` : "메모는 한 사람에 한 장이에요"}
                  title={
                    canPost
                      ? `‘${z.name}’에 메모 붙이기`
                      : "메모는 한 사람에 한 장이에요 — 붙인 메모를 눌러 고칠 수 있어요"
                  }
                >
                  ＋
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="opinion-body" ref={bodyRef}>
          {/* 영역 칸 — 배경과 가르는 선만 그립니다. 메모는 그 위 한 겹에
              절대 배치로 섭니다(영역을 넘나들며 끌 수 있게). */}
          {zones.map((z, i) => (
            <div key={z.key} className={`opinion-zone tint-${ZONE_TINTS[i % ZONE_TINTS.length]}`} aria-hidden="true" />
          ))}
          {!loaded ? (
            <p className="opinion-empty">불러오는 중이에요…</p>
          ) : notes.length === 0 ? (
            <p className="opinion-empty">
              아직 붙인 메모가 없어요.
              {canPost && <> 영역 오른쪽의 ＋로 첫 생각을 붙여 보세요.</>}
            </p>
          ) : (
            box.w > 0 &&
            ordered.map((n) => {
              const dragging = drag?.id === n.id;
              const pos = dragging ? drag : pixelsOf(n);
              const c = opinionColor(n.color);
              return (
                <div
                  key={n.id}
                  className={`opinion-note${dragging ? " is-dragging" : ""}${isMine(n) ? " is-mine" : ""}${
                    canMove(n) ? " is-movable" : ""
                  }${n.byTeacher ? " is-teacher" : ""}`}
                  style={{
                    left: pos.left,
                    top: pos.top,
                    "--note-bg": c.bg,
                    "--note-ink": c.ink,
                    "--tilt": `${noteTilt(n.id)}deg`,
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`${labelOf(n)}의 메모 — 눌러서 크게 보기`}
                  onPointerDown={(e) => onNoteDown(e, n)}
                  onPointerMove={onNoteMove}
                  onPointerUp={(e) => onNoteUp(e, n)}
                  onPointerCancel={() => { dragRef.current = null; setDrag(null); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setOpenId(n.id);
                    }
                  }}
                >
                  {isMine(n) && <span className="opinion-note-pin" aria-hidden="true" />}
                  <NoteWho
                    note={n}
                    label={labelOf(n)}
                    real={isRevealed(n) ? realOf(n) : null}
                    onToggle={canReveal(n) ? () => toggleReveal(n) : null}
                  />
                  <p className="opinion-note-text">{n.text}</p>
                </div>
              );
            })
          )}
        </div>
      </section>

      {composeZone && (
        <OpinionNoteModal
          mode="new"
          zones={zones}
          initialZone={composeZone}
          who={
            <NoteWho
              note={isTeacher ? { byTeacher: true } : { anon: true, authorName: user?.displayName, authorEmoji: user?.emoji }}
              label={isTeacher ? "선생님" : noteAuthorLabel({ anon: true, authorName: user?.displayName })}
              className="opinion-modal-who"
            />
          }
          authorLabel={isTeacher ? "선생님" : noteAuthorLabel({ anon: true, authorName: user?.displayName })}
          onSave={async (v) => { await createNote(v); setComposeZone(null); }}
          onClose={() => setComposeZone(null)}
        />
      )}
      {openNote && (
        <OpinionNoteModal
          mode="view"
          note={openNote}
          zones={zones}
          who={
            <NoteWho
              note={openNote}
              label={labelOf(openNote)}
              real={isRevealed(openNote) ? realOf(openNote) : null}
              onToggle={canReveal(openNote) ? () => toggleReveal(openNote) : null}
              className="opinion-modal-who"
            />
          }
          authorLabel={labelOf(openNote)}
          canEdit={canEdit(openNote)}
          canRemove={canRemove(openNote)}
          onSave={(v) => saveNote(openNote, v)}
          onRemove={() => removeNote(openNote)}
          onClose={() => setOpenId(null)}
        />
      )}
    </main>
  );
}

// ─── 크게 보기 · 쓰기 창 ─────────────────────────────────────────
// 메모 한 장을 크게 — 창 자체가 그 메모의 색입니다. 새로 쓸 때도 같은
// 창이라 '쓰던 메모가 그대로 판에 붙는다'로 보입니다.
function OpinionNoteModal({
  mode,
  note = null,
  zones,
  initialZone = null,
  authorLabel,
  who = null,
  canEdit = false,
  canRemove = false,
  onSave,
  onRemove,
  onClose,
}) {
  const isNew = mode === "new";
  const [editing, setEditing] = useState(isNew);
  const [text, setText] = useState(note?.text ?? "");
  const [color, setColor] = useState(note?.color ?? OPINION_COLORS[Math.floor(Math.random() * OPINION_COLORS.length)].key);
  const [zone, setZone] = useState(isNew ? initialZone : zoneOfNote(note, zones));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const textRef = useRef(null);

  // 밖에서 글이 바뀌면(다른 기기에서 고침) 보는 중에는 따라갑니다
  useEffect(() => {
    if (!editing && note) {
      setText(note.text ?? "");
      setColor(note.color);
      setZone(zoneOfNote(note, zones));
    }
  }, [note, editing, zones]);
  useEffect(() => {
    if (editing) textRef.current?.focus();
  }, [editing]);

  const c = opinionColor(editing ? color : note?.color ?? color);
  const zoneName = zones.find((z) => z.key === (editing ? zone : zoneOfNote(note, zones)))?.name ?? "";
  const trimmed = text.trim();

  async function submit() {
    if (!trimmed || saving) return;
    setSaving(true);
    setErr("");
    try {
      await onSave({ text: trimmed, color, zone });
      if (!isNew) setEditing(false);
    } catch (e) {
      setErr(`저장하지 못했어요: ${e?.message ?? "알 수 없는 오류"}`);
    } finally {
      setSaving(false);
    }
  }

  function cancelEdit() {
    if (isNew) { onClose(); return; }
    setText(note.text ?? "");
    setColor(note.color);
    setZone(zoneOfNote(note, zones));
    setEditing(false);
  }

  return (
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      <div
        className="modal opinion-modal"
        role="dialog"
        aria-modal="true"
        aria-label={isNew ? "새 메모 쓰기" : `${authorLabel}의 메모`}
        style={{ "--note-bg": c.bg, "--note-ink": c.ink }}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="opinion-modal-tape" aria-hidden="true" />
        <div className="opinion-modal-head">
          <span className="opinion-modal-zone">{zoneName}</span>
          {who}
          <button type="button" className="btn-close" onClick={onClose} aria-label="닫기">×</button>
        </div>

        {editing ? (
          <>
            <textarea
              ref={textRef}
              className="opinion-modal-input"
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, OPINION_TEXT_MAX))}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="내 생각을 적어 보세요. 왜 그렇게 생각하는지도 함께요."
              maxLength={OPINION_TEXT_MAX}
            />
            <div className="opinion-modal-count">{text.length} / {OPINION_TEXT_MAX}</div>
            <div className="opinion-modal-pick">
              <span>영역</span>
              <div className="opinion-zone-chips">
                {zones.map((z) => (
                  <button
                    key={z.key}
                    type="button"
                    className={`opinion-zone-chip${zone === z.key ? " on" : ""}`}
                    aria-pressed={zone === z.key}
                    onClick={() => setZone(z.key)}
                  >
                    {z.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="opinion-modal-pick">
              <span>색</span>
              <div className="opinion-swatches">
                {OPINION_COLORS.map((o) => (
                  <button
                    key={o.key}
                    type="button"
                    className={`opinion-swatch${color === o.key ? " on" : ""}`}
                    style={{ "--sw": o.bg, "--sw-ink": o.ink }}
                    aria-pressed={color === o.key}
                    aria-label={o.name}
                    title={o.name}
                    onClick={() => setColor(o.key)}
                  />
                ))}
              </div>
            </div>
            {err && <p className="form-error">{err}</p>}
            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={cancelEdit}>취소</button>
              <button type="button" className="btn-primary" onClick={submit} disabled={!trimmed || saving}>
                {saving ? "저장 중…" : isNew ? "메모 붙이기" : "저장"}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="opinion-modal-text">{note.text}</p>
            {(canEdit || canRemove) && (
              <div className="opinion-modal-tools">
                {canRemove && (
                  <button type="button" className="btn-ghost opinion-modal-remove" onClick={() => setConfirmRemove(true)}>
                    떼어 내기
                  </button>
                )}
                {canEdit && (
                  <button type="button" className="btn-primary" onClick={() => setEditing(true)}>
                    고치기
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
      {confirmRemove && (
        <ConfirmModal
          title="이 메모를 떼어 낼까요?"
          preview={note?.text?.slice(0, 60)}
          description="떼어 낸 메모는 되돌릴 수 없어요."
          confirmLabel="떼어 내기"
          danger
          onConfirm={async () => { setConfirmRemove(false); await onRemove(); }}
          onClose={() => setConfirmRemove(false)}
        />
      )}
    </div>
  );
}

// ─── 이름표 — 익명 닉네임 · 교사는 눌러서 실제 학생 ─────────────────
// 질문방의 AuthorBadge와 같은 약속입니다: 학생에게는 익명만, 교사가 누르면
// 🔓와 함께 학번·이름으로 바뀌고 다시 누르면 가려집니다.
// 메모지 위에서는 누르기가 곧 '크게 보기'·끌기라, 이름표를 누른 것은 메모로
// 번지지 않게 막습니다(pointerdown을 멈추면 끌기가 시작되지 않습니다).
function NoteWho({ note, label, real = null, onToggle = null, className = "opinion-note-who" }) {
  const emoji = note?.byTeacher ? null : note?.anon ? note?.authorEmoji : null;
  const body = real ? (
    <>
      <IconUnlock size={12} /> {real}
    </>
  ) : (
    <>
      {emoji && <span className="opinion-who-emoji" aria-hidden="true">{emoji}</span>}
      {label}
    </>
  );
  if (!onToggle) return <span className={className}>{body}</span>;
  return (
    <button
      type="button"
      className={`${className} opinion-who-btn${real ? " is-real" : ""}`}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      title={real ? "눌러서 다시 가리기" : "눌러서 누가 썼는지 보기 (교사 전용)"}
      aria-pressed={!!real}
    >
      {body}
    </button>
  );
}
