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
// [서랍에는 학생이 쓸 수 있는 것이 다 있고, 보내기는 그중 하나로 눈을 맞춥니다]
// **열린 활동이 모두 섭니다** — 보낸 것은 펼쳐지고, 앞서 열어 둔 것은 한 줄로
// 접혀 위에 있다가 누르면 그 자리에서 펴집니다(책방 곁텍스트와 같은 모양).
// 한때 보낸 활동 하나만 그렸는데, 그러면 앞서 쓴 것을 수업 중에 고치려면
// 공부방으로 건너가야 했습니다. 잠긴 활동은 깔지 않습니다 — 학생이 아직 쓰면
// 안 되는 자리입니다.
//
// [읽는 문서]
// 프로젝트 1건(`fetchStudyBoard`) + 내 카드 1건(`fetchStudyCardOnce`).
// 반 문서는 상단바가 이미 구독하고 있어 그대로 받아 씁니다(새 구독 없음).
// **보낸 활동이 바뀌면 프로젝트를 다시 읽습니다**(1건) — 교사는 보내면서 그
// 활동을 여는데, 같은 프로젝트의 다음 활동을 보내면 프로젝트 id는 그대로라
// 처음 읽기가 다시 돌지 않습니다. 그러면 학생 화면이 방금 연 활동을 아직
// 잠긴 것으로 알고 '선생님이 이 활동을 열어 주면 쓸 수 있어요'에서 멈춥니다
// (실제로 그랬습니다 — 책방 쪽에서 겪은 그 함정과 같습니다).
// **카드는 다시 안 읽습니다** — 지금 화면에 든 것이 더 새것이고, 덮어쓰면
// 방금 친 글자가 날아갑니다.
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

// 한 줄 미리보기 — 접힌 활동에 '무엇을 썼는지' 남깁니다.
function peek(html) {
  const text = stripHtml(html ?? "").replace(/\s+/g, " ").trim();
  if (text) return text;
  return htmlHasImage(html) ? "(그림)" : "";
}

export default function LessonTaskPanel({ task, user, onType }) {
  const [board, setBoard] = useState(null);
  const [card, setCard] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState("idle"); // idle | saving | saved
  const [error, setError] = useState("");
  // 접힌 활동 중 학생이 펴 둔 것 — 보낸 활동은 늘 펼쳐집니다.
  const [openIdx, setOpenIdx] = useState(() => new Set());

  const boardId = task?.boardId ?? "";
  const idx = task?.actIndex ?? 0;

  // 프로젝트와 내 카드를 한 번씩 읽습니다.
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

  // 보낸 활동이 바뀌면 **프로젝트만** 다시 읽습니다(잠금이 방금 열렸을 수
  // 있어서). 프로젝트 자체가 바뀐 경우는 위 효과가 이미 읽으므로 비켜 줍니다.
  const readBoardIdRef = useRef("");
  useEffect(() => {
    const first = readBoardIdRef.current !== boardId;
    readBoardIdRef.current = boardId;
    if (first || !boardId) return undefined;
    let alive = true;
    fetchStudyBoard(boardId)
      .then((b) => { if (alive && b) setBoard(b); })
      .catch(() => {});
    return () => { alive = false; };
  }, [boardId, idx]);

  const acts = Array.isArray(board?.activities) ? board.activities : [];
  // 탭 머리의 '오늘의 활동 N'이 이미 차례를 말하므로, 이름이 기본값
  // ('활동 N')뿐이면 같은 말을 두 번 적지 않습니다.
  const actName = String(acts[idx] ?? "").trim();
  const showName = !!actName && actName !== `활동 ${idx + 1}`;
  const locked = board ? isActivityLocked(board, idx) : false;
  const isGroup = board?.type === "group";
  const canWrite = !!board && !locked && !isGroup;

  // 카드에서 활동 칸들을 떠 옵니다. 자리(index)로 읽고 자리로 씁니다 —
  // 제목으로 짝지으면 학생이 카드에서 활동 제목을 고쳤을 때 엉뚱한 칸을
  // 집습니다(파이썬 실행기의 '보내기'에서 실제로 겪은 일).
  const secs = card ? parseActivitySections(card.content) : [];
  const mine = secs[idx]?.content ?? "";
  const written = !!(stripHtml(mine).trim() || htmlHasImage(mine));
  // 서랍에 깔 활동 — **열린 것만**. 잠긴 것은 학생이 아직 쓰면 안 되는
  // 자리라 접어서도 두지 않습니다.
  const openActs = acts
    .map((name, i) => ({ name, i }))
    .filter(({ i }) => board && !isActivityLocked(board, i));

  const timerRef = useRef(null);
  // 아직 저장 안 된 글 — { t: 쓸 곳, drafts: { 활동자리: 쓴 글 } }.
  // **글자를 칠 때 쓸 곳을 함께 붙들어 둡니다** — 쓰는 사이에 선생님이 다음
  // 활동을 보낼 수 있어, 저장하는 순간의 자리로 쓰면 글이 옆 칸에 들어갑니다.
  // 자리를 **맵으로** 모으는 것은 칸이 여럿 펼쳐질 수 있기 때문입니다 — 한
  // 자리만 들고 있으면 접힌 것을 펴서 고친 글이 다음 저장에 덮입니다.
  const pendingRef = useRef(null);

  const loadedRef = useRef(null);
  loadedRef.current = {
    boardId,
    acts,
    secs,
    cardId: card?.id ?? null,
    isGroup,
  };

  // 저장 — 카드 전체를 다시 짜서 씁니다. **다른 활동 칸은 그대로 옮겨
  // 담습니다**(카드가 한 문서라 이 칸만 따로 쓸 수 없습니다).
  const save = useCallback(async () => {
    clearTimeout(timerRef.current);
    const p = pendingRef.current;
    if (!p || !user?.uid) return;
    pendingRef.current = null;
    const { t, drafts } = p;
    if (!t?.boardId || t.isGroup) return;
    const titles = t.acts.map((a, i) => t.secs[i]?.title || a);
    const contents = t.acts.map((_, i) =>
      Object.prototype.hasOwnProperty.call(drafts, i) ? drafts[i] : t.secs[i]?.content ?? ""
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

  // 자동 저장 — 손이 멎으면. 어느 칸에 쓴 것인지 함께 담습니다.
  function onDraft(i, html) {
    const t = loadedRef.current;
    if (!t?.boardId || t.isGroup) return;
    const prev = pendingRef.current;
    const drafts =
      prev && prev.t.boardId === t.boardId ? { ...prev.drafts } : {};
    drafts[i] = html;
    pendingRef.current = { t, drafts };
    setStatus("idle");
    onType?.();
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { save(); }, SAVE_DELAY);
  }

  // 프로젝트가 바뀌거나 탭을 떠날 때 남은 것을 씁니다. 이 정리는 **바뀌기
  // 전에** 돌아, 붙들어 둔 원래 카드로 저장됩니다.
  useEffect(() => () => { save(); }, [boardId, save]);

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

      {/* 잠겼거나 모둠이면 읽기만 — 지금까지 쓴 것은 그대로 보입니다. */}
      {!canWrite && written && (
        <div
          className="study-card-content ltask-read"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(mine) }}
        />
      )}

      {/* 열린 활동이 모두 섭니다 — 보낸 것은 펼치고 나머지는 접어서.
          누르면 그 자리에서 펴져 앞서 쓴 것을 고칠 수 있습니다(책방
          곁텍스트와 같은 모양). */}
      {!isGroup &&
        openActs.map(({ name, i }) => {
          const on = i === idx;
          const open = on || openIdx.has(i);
          const text = secs[i]?.content ?? "";
          const label = String(name ?? "").trim() || `활동 ${i + 1}`;
          if (open) {
            return (
              <section key={i} className={`ltask-step${on ? " on" : ""}`}>
                {!on && <span className="ltask-step-name">{i + 1}. {label}</span>}
                {/* 쓰는 칸 — 에디터는 비제어라 마운트 때 한 번만 읽습니다.
                    프로젝트가 바뀌면 열쇠가 바뀌어 그 칸의 글로 갈아 끼웁니다. */}
                <RichTextEditor
                  key={`ltask-${boardId}-${i}`}
                  className="ltask-rte"
                  tools={TASK_TOOLS}
                  initialHtml={richHtml(text)}
                  onChange={(html) => onDraft(i, html)}
                  placeholder="여기에 답을 써 주세요."
                />
              </section>
            );
          }
          const line = peek(text);
          return (
            <button
              key={i}
              type="button"
              className="ltask-fold"
              onClick={() => setOpenIdx((prev) => new Set(prev).add(i))}
              title="눌러서 펴고 고치기"
            >
              <span className="ltask-fold-no">{i + 1}</span>
              <span className="ltask-fold-name">{label}</span>
              <span className={`ltask-fold-peek${line ? "" : " empty"}`}>
                {line || "아직 안 썼어요"}
              </span>
              <span className="ltask-fold-caret" aria-hidden="true">▸</span>
            </button>
          );
        })}

      {/* 저장 알림은 쓸 칸이 하나라도 있을 때. 잠긴 활동을 보냈어도 앞서
          열린 활동은 쓸 수 있으므로 `canWrite`만 보지 않습니다. */}
      {!isGroup && openActs.length > 0 && (
        <p className="ltask-status">
          {status === "saving"
            ? "저장 중…"
            : status === "saved"
              ? "저장됨"
              : "쓰는 대로 저장돼요"}
        </p>
      )}

      <p className="ltask-note">
        쓴 내용은 공부방의 내 카드에 저장돼요 — 수업이 끝난 뒤에도 이어서 쓸 수 있어요.
      </p>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}
