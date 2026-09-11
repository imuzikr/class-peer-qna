"use client";

// =============================================================
// 수업 노트 서랍의 '활동' 탭 — 선생님이 내보낸 활동을 학생이 쓰는 자리
// -------------------------------------------------------------
// 교사가 수업 모드에서 활동을 내보내면(반 문서의 `task`) 서랍에 이 탭이
// 서고, 학생이 여기서 답을 씁니다. 쓴 것은 그 프로젝트의 **자기 개인 카드**
// 로 들어갑니다 — 공부방에서 쓰던 그 카드 그대로라, 수업이 끝난 뒤 공부방에
// 가면 이어서 고칠 수 있습니다.
//
// [왜 서랍인가 — 덮지 않습니다]
// 수업 중에는 뒤에 선생님 화면이 있습니다. 활동을 모달로 덮으면 학생이 답을
// 쓰는 동안 물음이 안 보이고, 선생님이 슬라이드를 넘겨도 모릅니다. 서랍은
// 발표 화면을 그만큼 좁힐 뿐이라 둘이 나란히 섭니다.
//
// [쓰는 것은 큰 창에서]
// 이 탭에는 지금까지 쓴 것이 미리보기로 서고, 쓰려면 '작성하기'를 눌러
// 큰 창을 엽니다 — 공부방 카드의 활동 칸과 **같은 방식**입니다. 서랍 폭이
// 380px이라 긴 답을 쓰기 좁고, 두 자리의 쓰는 방법이 다르면 학생이 같은
// 활동을 두 가지로 익히게 됩니다.
//
// [읽는 문서]
// 프로젝트 1건(`fetchStudyBoard`) + 내 카드 1건(`fetchStudyCardOnce`).
// 활동이 바뀔 때만 다시 읽습니다. 반 문서는 상단바가 이미 구독하고 있어
// 그대로 받아 씁니다(새 구독 없음).
//
// [모둠 프로젝트는 못 씁니다]
// 규칙이 학생의 카드 **생성**을 막습니다(모둠 카드는 교사가 만들어 둡니다).
// 그래서 아직 카드가 없는 학생은 저장에 실패하는데, 눌러 보고서야 알게 하지
// 않으려고 화면에서 미리 막고 까닭을 적습니다.
// =============================================================
import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchStudyBoard,
  fetchStudyCardOnce,
  addStudyCard,
  updateStudyCard,
} from "@/lib/store";
import {
  parseActivitySections,
  buildActivityHtml,
  isActivityLocked,
} from "@/lib/activities";
import { sanitizeHtml, stripHtml, htmlHasImage } from "@/lib/html";
import RichTextEditor from "./RichTextEditor";

const SAVE_DELAY = 1500;

export default function LessonTaskPanel({ task, user, onType, onWritingChange }) {
  const [board, setBoard] = useState(null);
  const [card, setCard] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [writing, setWriting] = useState(false); // 큰 창
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState("idle"); // idle | saving | saved
  const [error, setError] = useState("");

  const boardId = task?.boardId ?? "";
  const idx = task?.actIndex ?? 0;

  // 프로젝트와 내 카드를 한 번씩 읽습니다. 활동이 바뀌면 다시.
  useEffect(() => {
    if (!boardId || !user?.uid) { setLoaded(true); return undefined; }
    let alive = true;
    setLoaded(false);
    setError("");
    (async () => {
      try {
        const [b, c] = await Promise.all([
          fetchStudyBoard(boardId),
          fetchStudyCardOnce(boardId, user.uid),
        ]);
        if (!alive) return;
        setBoard(b);
        setCard(c);
      } catch (e) {
        if (alive) setError(`활동을 불러오지 못했어요: ${e?.message ?? "알 수 없는 오류"}`);
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => { alive = false; };
  }, [boardId, user?.uid]);

  const acts = Array.isArray(board?.activities) ? board.activities : [];
  const actName = acts[idx] ?? `활동 ${idx + 1}`;
  const locked = board ? isActivityLocked(board, idx) : false;
  const isGroup = board?.type === "group";

  // 카드에서 이 활동 칸의 글만 떠 옵니다. 자리(index)로 읽고 자리로 씁니다 —
  // 제목으로 짝지으면 학생이 카드에서 활동 제목을 고쳤을 때 엉뚱한 칸을
  // 집습니다(파이썬 실행기의 '보내기'에서 실제로 겪은 일).
  const secs = card ? parseActivitySections(card.content) : [];
  const mine = secs[idx]?.content ?? "";
  const written = !!(stripHtml(mine).trim() || htmlHasImage(mine));

  const timerRef = useRef(null);
  const draftRef = useRef("");
  draftRef.current = draft;

  // 저장할 곳을 **연 순간 그대로 붙듭니다.**
  // 학생이 쓰는 사이에 선생님이 다음 활동을 내보낼 수 있습니다('다들 1번
  // 다 썼지? 이제 2번'). 그때 지금 화면의 `idx`로 저장하면 1번에 쓰던 글이
  // 2번 칸에 들어갑니다. 그래서 저장은 **그때 읽어 둔 것**을 씁니다.
  const loadedRef = useRef(null); // { boardId, idx, acts, secs, cardId }
  loadedRef.current = { boardId, idx, acts, secs, cardId: card?.id ?? null };
  const writeRef = useRef(null);  // 큰 창을 연 순간의 loadedRef 사본

  // 저장 — 카드 전체를 다시 짜서 씁니다. **다른 활동 칸은 그대로 옮겨
  // 담습니다**(카드가 한 문서라 이 칸만 따로 쓸 수 없습니다).
  const save = useCallback(async () => {
    const t = writeRef.current ?? loadedRef.current;
    if (!t?.boardId || !user?.uid || locked) return;
    const titles = t.acts.map((a, i) => t.secs[i]?.title || a);
    const contents = t.acts.map((_, i) =>
      i === t.idx ? draftRef.current : t.secs[i]?.content ?? ""
    );
    const html = buildActivityHtml(titles, contents);
    setStatus("saving");
    try {
      if (t.cardId) {
        await updateStudyCard(t.boardId, t.cardId, { content: html });
      } else {
        await addStudyCard(user, t.boardId, { content: html });
      }
      // 방금 쓴 것을 손에 들고 있어야 다음 저장이 이 값을 이어 씁니다
      // (구독이 아니라 한 번 읽기라 서버가 다시 알려 주지 않습니다).
      // 그 사이에 다른 활동이 내보내져 카드가 갈렸으면 건드리지 않습니다.
      if (t.boardId === loadedRef.current?.boardId) {
        setCard((prev) => ({ ...(prev ?? { id: user.uid }), content: html }));
      }
      setStatus("saved");
    } catch (e) {
      setStatus("idle");
      setError(`저장하지 못했어요: ${e?.message ?? "알 수 없는 오류"}`);
    }
  }, [user, locked]);

  // 자동 저장 — 손이 멎으면. 큰 창을 닫을 때도 한 번 더 씁니다.
  function onDraft(html) {
    setDraft(html);
    setStatus("idle");
    onType?.();
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(save, SAVE_DELAY);
  }

  function openWriter() {
    writeRef.current = loadedRef.current;
    setDraft(mine);
    setError("");
    setWriting(true);
  }

  async function closeWriter() {
    clearTimeout(timerRef.current);
    await save();
    writeRef.current = null;
    setWriting(false);
  }

  useEffect(() => () => clearTimeout(timerRef.current), []);

  // 쓰는 사이에 선생님이 **다른 활동을 내보내면** 쓰던 것을 저장하고 창을
  // 닫습니다 — 열어 둔 채로 두면 화면의 활동 이름과 쓰는 칸이 어긋납니다.
  // 저장은 위 `writeRef` 덕에 **원래 쓰던 칸**으로 갑니다.
  useEffect(() => {
    const w = writeRef.current;
    if (!w) return;
    if (w.boardId === boardId && w.idx === idx) return;
    closeWriter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, idx]);

  // 큰 창이 떠 있다는 것을 서랍에 알립니다 — 서랍이 Esc를 비켜 주게
  // (같은 window에 걸린 리스너끼리는 stopPropagation이 안 통합니다).
  useEffect(() => {
    onWritingChange?.(writing);
    return () => onWritingChange?.(false);
  }, [writing, onWritingChange]);

  // 큰 창이 떠 있는 동안 Esc는 **창만** 닫습니다 — 서랍까지 함께 닫히면
  // 쓰던 자리를 잃습니다(노트 크게 보기 창과 같은 처리).
  useEffect(() => {
    if (!writing) return undefined;
    function onKey(e) {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeWriter();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [writing, save]);

  if (!loaded) return <p className="cornell-empty">활동을 불러오는 중이에요…</p>;
  if (!board) {
    return <p className="cornell-empty">선생님이 내보낸 활동을 찾지 못했어요.</p>;
  }

  return (
    <div className="ltask">
      <section className="ltask-head">
        <span className="ltask-tag">선생님이 내보낸 활동</span>
        <strong className="ltask-name">{actName}</strong>
        <span className="ltask-board">{board.title ?? ""}</span>
        {board.description && <p className="ltask-guide">{board.description}</p>}
      </section>

      {/* 쓸 수 없는 경우는 미리 막고 까닭을 적습니다 — 눌러 보고서야 알게
          하지 않으려고요. 규칙이 어차피 막는 자리입니다. */}
      {isGroup ? (
        <p className="ltask-blocked">
          모둠 프로젝트는 여기서 쓸 수 없어요 — 공부방에서 모둠 카드로 써 주세요.
        </p>
      ) : locked ? (
        <p className="ltask-blocked">선생님이 이 활동을 열어 주면 쓸 수 있어요.</p>
      ) : null}

      {/* 지금까지 쓴 것 — 누르면 큰 창입니다(공부방 카드와 같은 방식) */}
      <div
        className="ltask-preview"
        role="button"
        tabIndex={0}
        onClick={openWriter}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openWriter(); }
        }}
        title="눌러서 크게 쓰기"
      >
        {written ? (
          <div
            className="study-card-content ltask-preview-body"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(mine) }}
          />
        ) : (
          <p className="ltask-preview-empty">아직 쓰지 않았어요.</p>
        )}
      </div>

      <button
        type="button"
        className="btn-primary ltask-write"
        onClick={openWriter}
        disabled={isGroup || locked}
      >
        {written ? "이어서 작성하기" : "작성하기"}
      </button>

      <p className="ltask-note">
        쓴 내용은 공부방의 내 카드에 저장돼요 — 수업이 끝난 뒤에도 이어서 쓸 수 있어요.
      </p>
      {error && <p className="form-error" role="alert">{error}</p>}

      {/* ── 크게 쓰기 ──
          학생이 스스로 연 창이라 여기서는 덮어도 됩니다 — 넓게 쓰려고
          연 것이라 그 순간에는 이 창이 할 일의 전부입니다.
          서랍(3001)보다 위에 떠야 해서 z-index는 노트 크게 보기 창과
          같은 층입니다. */}
      {writing && (
        <div className="modal-backdrop ltask-backdrop" onMouseDown={(e) => {
          // 바깥을 눌러 닫습니다. 누르는 순간 사라진 것은 '바깥'이 아닙니다
          // (CLAUDE.md '바깥을 눌러 닫기').
          if (!e.target.isConnected) return;
          if (e.target === e.currentTarget) closeWriter();
        }}>
          <div
            className="modal ltask-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`${actName} 작성`}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h3 className="head-icon">{actName}</h3>
              <button className="btn-close" onClick={closeWriter} aria-label="닫기">×</button>
            </div>
            <RichTextEditor
              className="ltask-rte"
              initialHtml={mine}
              onChange={onDraft}
              placeholder="여기에 답을 써 주세요."
            />
            <div className="ltask-foot">
              <span className="ltask-status">
                {status === "saving" ? "저장 중…" : status === "saved" ? "저장됨" : "쓰는 대로 저장돼요"}
              </span>
              <button type="button" className="btn-primary" onClick={closeWriter}>
                다 썼어요
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
