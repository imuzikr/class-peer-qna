"use client";

// =============================================================
// 수업 노트 서랍의 '오늘의 활동' 탭 — 선생님이 보낸 활동을 학생이 쓰는 자리
// -------------------------------------------------------------
// 교사가 수업 모드에서 활동을 보내면(반 문서의 `task`) 서랍에 이 탭이
// 서고, 학생이 여기서 답을 씁니다. 쓴 것은 그 프로젝트의 **자기 개인 카드**
// 로 들어갑니다 — 공부방에서 쓰던 그 카드 그대로라, 수업이 끝난 뒤 공부방에
// 가면 이어서 고칠 수 있습니다.
//
// [왜 서랍인가 — 덮지 않습니다]
// 수업 중에는 뒤에 선생님 화면이 있습니다. 활동을 모달로 덮으면 학생이 답을
// 쓰는 동안 물음이 안 보이고, 선생님이 슬라이드를 넘겨도 모릅니다. 서랍은
// 발표 화면을 그만큼 좁힐 뿐이라 둘이 나란히 섭니다.
//
// [쓰는 칸이 곧 이 탭입니다]
// 한때는 '작성하기'를 눌러 큰 창을 열게 했습니다(공부방 카드와 같은 방식).
// 한 번에 활동 하나만 내려오므로 서랍 한 칸이 답 하나에 넉넉하고, 큰 창은
// 발표 화면을 덮어 쓰는 동안 선생님 화면이 안 보였습니다. 지금은 탭을 열면
// 곧바로 쓰는 칸입니다 — 누르는 단계가 없고 발표 화면이 계속 보입니다.
//
// [저장은 자동입니다]
// 손이 멎으면 조용히 저장하고, 탭을 옮기거나 화면을 벗어날 때 한 번 더
// 씁니다. **저장할 곳은 글자를 칠 때 붙들어 둡니다** — 쓰는 사이에 선생님이
// 다음 활동을 보낼 수 있어('다들 1번 다 썼지? 이제 2번'), 그때 화면의
// 자리로 저장하면 1번에 쓰던 글이 2번 칸에 들어갑니다.
//
// [읽는 문서]
// 프로젝트 1건(`fetchStudyBoard`) + 내 카드 1건(`fetchStudyCardOnce`).
// 활동이 바뀔 때만 다시 읽습니다. 반 문서는 상단바가 이미 구독하고 있어
// 그대로 받아 씁니다(새 구독 없음).
//
// [모둠 프로젝트는 못 씁니다]
// 규칙이 학생의 카드 **생성**을 막습니다(모둠 카드는 교사가 만들어 둡니다).
// 그래서 아직 카드가 없는 학생은 저장에 실패하는데, 써 보고서야 알게 하지
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
import { sanitizeHtml, stripHtml, htmlHasImage, richHtml } from "@/lib/html";
import RichTextEditor from "./RichTextEditor";

const SAVE_DELAY = 1500;

// 서랍이 좁아 서식은 수업 노트 필기 칸과 같은 넷으로 둡니다 — 한 서랍
// 안에서 탭만 바꿔 오가는 자리라 툴바가 서로 다르면 다른 도구로 보입니다.
const TASK_TOOLS = ["bold", "underline", "insertUnorderedList", "insertOrderedList"];

export default function LessonTaskPanel({ task, user, onType }) {
  const [board, setBoard] = useState(null);
  const [card, setCard] = useState(null);
  const [loaded, setLoaded] = useState(false);
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
  // 탭 머리의 '오늘의 활동 N'이 이미 차례를 말하므로, 이름이 기본값
  // ('활동 N')뿐이면 같은 말을 두 번 적지 않습니다.
  const actName = String(acts[idx] ?? "").trim();
  const showName = !!actName && actName !== `활동 ${idx + 1}`;
  const locked = board ? isActivityLocked(board, idx) : false;
  const isGroup = board?.type === "group";
  const canWrite = !!board && !locked && !isGroup;

  // 카드에서 이 활동 칸의 글만 떠 옵니다. 자리(index)로 읽고 자리로 씁니다 —
  // 제목으로 짝지으면 학생이 카드에서 활동 제목을 고쳤을 때 엉뚱한 칸을
  // 집습니다(파이썬 실행기의 '보내기'에서 실제로 겪은 일).
  const secs = card ? parseActivitySections(card.content) : [];
  const mine = secs[idx]?.content ?? "";
  const written = !!(stripHtml(mine).trim() || htmlHasImage(mine));

  const timerRef = useRef(null);
  // 아직 저장 안 된 글 — { t: 쓸 곳, html: 쓸 것 }.
  // **글자를 칠 때 쓸 곳을 함께 붙들어 둡니다.**
  const pendingRef = useRef(null);

  const loadedRef = useRef(null);
  loadedRef.current = {
    boardId,
    idx,
    acts,
    secs,
    cardId: card?.id ?? null,
    locked,
    isGroup,
  };

  // 저장 — 카드 전체를 다시 짜서 씁니다. **다른 활동 칸은 그대로 옮겨
  // 담습니다**(카드가 한 문서라 이 칸만 따로 쓸 수 없습니다).
  const save = useCallback(async () => {
    clearTimeout(timerRef.current);
    const p = pendingRef.current;
    if (!p || !user?.uid) return;
    pendingRef.current = null;
    const { t, html: text } = p;
    if (!t?.boardId || t.locked || t.isGroup) return;
    const titles = t.acts.map((a, i) => t.secs[i]?.title || a);
    const contents = t.acts.map((_, i) => (i === t.idx ? text : t.secs[i]?.content ?? ""));
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
      // 그 사이에 다른 프로젝트가 내려와 카드가 갈렸으면 건드리지 않습니다.
      if (t.boardId === loadedRef.current?.boardId) {
        setCard((prev) => ({ ...(prev ?? { id: user.uid }), content: html }));
      }
      // 쓰는 사이에 또 고쳤으면 '저장됨'이 아닙니다 — 곧 다시 저장됩니다.
      setStatus(pendingRef.current ? "idle" : "saved");
    } catch (e) {
      setStatus("idle");
      setError(`저장하지 못했어요: ${e?.message ?? "알 수 없는 오류"}`);
    }
  }, [user]);

  // 자동 저장 — 손이 멎으면.
  function onDraft(html) {
    const t = loadedRef.current;
    if (!t?.boardId || t.locked || t.isGroup) return;
    pendingRef.current = { t, html };
    setStatus("idle");
    onType?.();
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { save(); }, SAVE_DELAY);
  }

  // 활동이 바뀌거나(선생님이 다음 것을 보냄) 탭을 떠날 때 남은 것을 씁니다.
  // 이 정리는 **바뀌기 전에** 돌아, 붙들어 둔 원래 칸으로 저장됩니다.
  useEffect(() => () => { save(); }, [boardId, idx, save]);

  // 화면을 벗어나거나 탭을 닫을 때 마지막으로 한 번 더
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden") save(); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", save);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", save);
    };
  }, [save]);

  if (!loaded) return <p className="cornell-empty">활동을 불러오는 중이에요…</p>;
  if (!board) {
    return <p className="cornell-empty">오늘의 활동을 찾지 못했어요.</p>;
  }

  return (
    <div className="ltask">
      <section className="ltask-head">
        <span className="ltask-tag">오늘의 활동 {idx + 1}</span>
        {showName && <strong className="ltask-name">{actName}</strong>}
        <span className="ltask-board">{board.title ?? ""}</span>
        {board.description && <p className="ltask-guide">{board.description}</p>}
      </section>

      {/* 쓸 수 없는 경우는 미리 막고 까닭을 적습니다 — 써 보고서야 알게
          하지 않으려고요. 규칙이 어차피 막는 자리입니다. */}
      {isGroup ? (
        <p className="ltask-blocked">
          모둠 프로젝트는 여기서 쓸 수 없어요 — 공부방에서 모둠 카드로 써 주세요.
        </p>
      ) : locked ? (
        <p className="ltask-blocked">선생님이 이 활동을 열어 주면 쓸 수 있어요.</p>
      ) : null}

      {canWrite ? (
        <>
          {/* 쓰는 칸 — 에디터는 비제어라 마운트 때 한 번만 읽습니다.
              활동이 바뀌면 열쇠가 바뀌어 그 칸의 글로 갈아 끼웁니다. */}
          <RichTextEditor
            key={`ltask-${boardId}-${idx}`}
            className="ltask-rte"
            tools={TASK_TOOLS}
            initialHtml={richHtml(mine)}
            onChange={onDraft}
            placeholder="여기에 답을 써 주세요."
          />
          <p className="ltask-status">
            {status === "saving"
              ? "저장 중…"
              : status === "saved"
                ? "저장됨"
                : "쓰는 대로 저장돼요"}
          </p>
        </>
      ) : written ? (
        // 잠겼거나 모둠이면 읽기만 — 지금까지 쓴 것은 그대로 보입니다.
        <div
          className="study-card-content ltask-read"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(mine) }}
        />
      ) : null}

      <p className="ltask-note">
        쓴 내용은 공부방의 내 카드에 저장돼요 — 수업이 끝난 뒤에도 이어서 쓸 수 있어요.
      </p>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}
