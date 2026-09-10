"use client";

// =============================================================
// 파이썬 실행기 2단 — 프로젝트 연계 패널
// -------------------------------------------------------------
// 실행기 오른쪽에 한 칸 더 열려, 지금 짠 코드를 **프로젝트의 활동 칸으로**
// 보냅니다. 실행기와 공부방을 오가며 복사해 붙이던 일이 단추 하나가 됩니다.
//
// [목적지는 교사가 정합니다]
// 교사가 프로젝트와 활동을 고르면 그것이 반 문서에 적히고(`setClassPyTarget`),
// 그 반 학생의 실행기는 모두 거기로 보냅니다. 학생은 목적지를 못 바꿉니다 —
// 스물몇 명이 저마다 다른 활동에 보내면 교사가 한 화면에서 모아 볼 수
// 없습니다. 교사가 아직 안 정했으면 학생 쪽은 보내기가 잠기고 그렇게
// 적힙니다(단추만 죽어 있으면 고장으로 보입니다).
//
// [읽는 문서가 늘지 않습니다]
// 프로젝트 목록(`boards`)도 반 문서(`pyTarget`)도 공부방·질문방이 **이미
// 구독해 둔 것**을 그대로 받습니다. 이 패널은 아무것도 새로 읽지 않습니다.
//
// [교사는 그 자리에서 만들 수도 있습니다]
// 수업 중에 '아, 여기에 받아야겠다' 싶을 때 공부방으로 건너가 프로젝트를
// 만들고 돌아오면 짜던 코드가 남아 있질 않습니다(실행기는 화면을 옮기면
// 닫힙니다). 그래서 프로젝트 만들기와 활동 추가를 여기 안에 둡니다.
// =============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import {
  addStudyBoard,
  addStudyCard,
  fetchStudyCardOnce,
  setClassPyTarget,
  updateStudyBoard,
  updateStudyCard,
} from "@/lib/store";
import {
  appendToActivity,
  isActivityLocked,
  nextActivityLocks,
} from "@/lib/activities";
import { pyShareHtml } from "@/lib/pyShare";
import { IconLockState } from "./StatusIcons";

export default function PyProjectPanel({
  classId,
  className = "",
  boards = [],
  pyTarget = null,
  user,
  isTeacher = false,
  // 지금 실행기에 있는 것 — 누를 때 읽습니다(매 글자마다 다시 그리지 않게).
  getCode,
  getLines,
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null); // { kind: 'ok'|'err', text }
  const [making, setMaking] = useState(false); // 새 프로젝트 만들기 폼
  const [newTitle, setNewTitle] = useState("");
  const [newAct, setNewAct] = useState("");
  const [addingAct, setAddingAct] = useState(false); // 활동 추가 폼
  const [actName, setActName] = useState("");
  const noteTimer = useRef(null);

  useEffect(() => () => clearTimeout(noteTimer.current), []);

  function say(kind, text) {
    setNote({ kind, text });
    clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(null), 4000);
  }

  // 이 반의 프로젝트만. '수업 자료'(notice)와 휴지통은 뺍니다 — 보낼 곳이
  // 아닙니다(notice는 학생이 카드를 못 만들고, 지운 것은 안 보입니다).
  const projects = useMemo(
    () =>
      boards.filter(
        (b) => b.classId === classId && b.type !== "notice" && b.deleted !== true
      ),
    [boards, classId]
  );

  const target = pyTarget?.boardId ? pyTarget : null;
  const board = target ? projects.find((b) => b.id === target.boardId) ?? null : null;
  const activities = board?.activities ?? [];
  const actIndex = Math.min(target?.actIndex ?? 0, Math.max(0, activities.length - 1));
  const actName_ = activities[actIndex] ?? "";
  const locked = board ? isActivityLocked(board, actIndex) : false;

  // 모둠 프로젝트는 학생이 자기 카드를 만들 수 없습니다(규칙이 막습니다 —
  // 모둠 카드는 교사가 만들어 둡니다). 보내 봐야 거부되므로 미리 막고
  // 까닭을 적습니다.
  const groupBoard = board?.activityType === "group";
  const boardLocked = board?.editMode === "locked";

  async function pickBoard(boardId) {
    if (!isTeacher) return;
    await setClassPyTarget(classId, boardId ? { boardId, actIndex: 0 } : null);
  }
  async function pickAct(i) {
    if (!isTeacher || !board) return;
    await setClassPyTarget(classId, { boardId: board.id, actIndex: Number(i) });
  }

  // ── 그 자리에서 프로젝트 만들기(교사) ─────────────────────
  async function createProject(e) {
    e.preventDefault();
    const title = newTitle.trim();
    const first = newAct.trim();
    if (!title || !first || busy) return;
    setBusy(true);
    try {
      const id = await addStudyBoard(user, {
        title,
        classId,
        activities: [first],
      });
      // 만들자마자 목적지로 잡습니다 — 만드는 까닭이 그것이라서요.
      if (id) await setClassPyTarget(classId, { boardId: id, actIndex: 0 });
      setMaking(false);
      setNewTitle("");
      setNewAct("");
      say("ok", `'${title}' 프로젝트를 만들고 보낼 곳으로 잡았어요.`);
    } catch {
      say("err", "프로젝트를 만들지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  // ── 그 자리에서 활동 추가(교사) ───────────────────────────
  async function addActivity(e) {
    e.preventDefault();
    const name = actName.trim();
    if (!name || !board || busy) return;
    setBusy(true);
    try {
      const next = [...activities, name];
      await updateStudyBoard(board.id, {
        activities: next,
        // 새 활동은 잠긴 채로 시작하는 것이 이 앱의 규칙인데(nextActivityLocks),
        // 여기서 만드는 활동은 **지금 받으려고** 만드는 것이라 열어 둡니다.
        activityLocks: nextActivityLocks(activities, board.activityLocks, next).map(
          (v, i) => (i === next.length - 1 ? false : v)
        ),
      });
      await setClassPyTarget(classId, { boardId: board.id, actIndex: next.length - 1 });
      setAddingAct(false);
      setActName("");
      say("ok", `'${name}' 활동을 더하고 보낼 곳으로 잡았어요.`);
    } catch {
      say("err", "활동을 더하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  // ── 보내기 ────────────────────────────────────────────────
  async function send() {
    if (!board || busy) return;
    const html = pyShareHtml(getCode?.() ?? "", getLines?.() ?? []);
    if (!html) {
      say("err", "보낼 코드가 없어요. 먼저 코드를 적어 주세요.");
      return;
    }
    setBusy(true);
    try {
      // 카드 한 장만 읽어 이어 붙입니다(덮어쓰지 않습니다 — 여러 번 보내는
      // 일이 잦고, 손으로 적어 둔 설명이 함께 지워지면 안 됩니다).
      const cardId = user.uid;
      const card = await fetchStudyCardOnce(board.id, cardId);
      const next = appendToActivity(card, activities, actIndex, html);
      if (next == null) {
        say("err", "그 활동을 찾지 못했어요. 선생님이 활동을 바꿨을 수 있어요.");
        return;
      }
      if (card) await updateStudyCard(board.id, cardId, { content: next });
      else await addStudyCard(user, board.id, { content: next });
      say("ok", `'${actName_}'에 보냈어요.`);
    } catch {
      // 규칙이 막은 경우(잠긴 프로젝트·모둠 카드 등)도 여기로 옵니다.
      say("err", "보내지 못했어요. 활동이 잠겨 있는지 확인해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  const blockedWhy = !board
    ? isTeacher
      ? "보낼 프로젝트와 활동을 고르세요."
      : "선생님이 아직 보낼 곳을 정하지 않았어요."
    : boardLocked
      ? "이 프로젝트는 잠겨 있어요."
      : locked
        ? "이 활동은 아직 잠겨 있어요."
        : groupBoard && !isTeacher
          ? "모둠 프로젝트에는 보낼 수 없어요."
          : "";

  return (
    <div className="py-project">
      <div className="py-project-head">
        <h4>활동으로 보내기</h4>
        {className && <em className="py-project-scope">{className}</em>}
      </div>

      {/* 교사 — 고르는 자리. 여기서 고른 것이 곧 그 반 전체의 목적지입니다. */}
      {isTeacher ? (
        <>
          <label className="py-project-label" htmlFor="py-board">프로젝트</label>
          <select
            id="py-board"
            className="py-project-select"
            value={board?.id ?? ""}
            onChange={(e) => pickBoard(e.target.value)}
            disabled={busy}
          >
            <option value="">— 고르지 않음 —</option>
            {projects.map((b) => (
              <option key={b.id} value={b.id}>{b.title}</option>
            ))}
          </select>

          <label className="py-project-label" htmlFor="py-act">활동</label>
          <select
            id="py-act"
            className="py-project-select"
            value={board ? actIndex : ""}
            onChange={(e) => pickAct(e.target.value)}
            disabled={busy || !board || activities.length === 0}
          >
            {!board && <option value="">— 프로젝트를 먼저 고르세요 —</option>}
            {activities.map((a, i) => (
              <option key={i} value={i}>
                {i + 1}. {a}{isActivityLocked(board, i) ? " (잠김)" : ""}
              </option>
            ))}
          </select>

          <div className="py-project-make">
            {board && !addingAct && !making && (
              <button type="button" className="btn-ghost" onClick={() => setAddingAct(true)}>
                ＋ 활동 추가
              </button>
            )}
            {!making && !addingAct && (
              <button type="button" className="btn-ghost" onClick={() => setMaking(true)}>
                ＋ 새 프로젝트
              </button>
            )}
          </div>

          {making && (
            <form className="py-project-form" onSubmit={createProject}>
              <input
                className="py-project-input"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="프로젝트 이름"
                autoFocus
              />
              <input
                className="py-project-input"
                value={newAct}
                onChange={(e) => setNewAct(e.target.value)}
                placeholder="첫 활동 이름 (예: 반복문 연습)"
              />
              <div className="py-project-form-actions">
                <button type="button" className="btn-ghost" onClick={() => setMaking(false)}>취소</button>
                <button type="submit" className="btn-primary" disabled={busy || !newTitle.trim() || !newAct.trim()}>만들기</button>
              </div>
            </form>
          )}

          {addingAct && (
            <form className="py-project-form" onSubmit={addActivity}>
              <input
                className="py-project-input"
                value={actName}
                onChange={(e) => setActName(e.target.value)}
                placeholder="더할 활동 이름"
                autoFocus
              />
              <div className="py-project-form-actions">
                <button type="button" className="btn-ghost" onClick={() => setAddingAct(false)}>취소</button>
                <button type="submit" className="btn-primary" disabled={busy || !actName.trim()}>추가</button>
              </div>
            </form>
          )}
        </>
      ) : (
        // 학생 — 어디로 가는지만 보여 줍니다(고르지 못합니다).
        <div className="py-project-fixed">
          {board ? (
            <>
              <p className="py-project-where">
                <strong>{board.title}</strong>
                <span>{actIndex + 1}. {actName_}</span>
              </p>
              {locked && (
                <span className="py-project-lock">
                  <IconLockState locked size={14} /> 아직 잠긴 활동이에요
                </span>
              )}
            </>
          ) : (
            <p className="py-project-empty">선생님이 아직 보낼 곳을 정하지 않았어요.</p>
          )}
        </div>
      )}

      <button
        type="button"
        className="btn-primary py-project-send"
        onClick={send}
        disabled={busy || !!blockedWhy}
        title={blockedWhy || `${actName_}에 코드와 실행 결과를 보냅니다`}
      >
        {busy ? "보내는 중…" : "활동으로 보내기"}
      </button>
      {blockedWhy && <p className="py-project-why">{blockedWhy}</p>}
      {note && <p className={`py-project-note py-project-note--${note.kind}`}>{note.text}</p>}

      <p className="py-project-hint">
        코드는 코드 블록으로, 실행 결과가 있으면 그 아래에 함께 들어갑니다.
        이미 쓴 내용은 지워지지 않고 뒤에 이어 붙습니다.
      </p>
    </div>
  );
}
