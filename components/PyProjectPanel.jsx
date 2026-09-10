"use client";

// =============================================================
// 파이썬 실행기 2단 — 프로젝트 연계 패널
// -------------------------------------------------------------
// 실행기 오른쪽에 한 칸 더 열려, 지금 짠 코드를 **프로젝트의 활동 칸으로**
// 보냅니다. 실행기와 공부방을 오가며 복사해 붙이던 일이 단추 하나가 됩니다.
//
// [교사가 기본을 정하고, 학생이 바꿀 수 있습니다]
// 교사가 고른 것은 반 문서에 적혀(`setClassPyTarget`) 그 반 학생 실행기의
// **기본 목적지**가 됩니다 — 수업 중에 스물몇 명이 저마다 찾아 들어가지
// 않게 하는 자리입니다. 다만 프로젝트가 여럿 돌아가고 한 프로젝트에 활동도
// 여럿이라, 학생이 지난 활동을 마저 채우려면 바꿀 수 있어야 합니다. 그래서
// 학생의 고름은 **그 화면 안에서만** 삽니다(반 문서는 교사만 씁니다).
//
// [보내는 것은 학생입니다]
// 교사 쪽에는 보내기가 없습니다. 카드는 한 사람에 한 장인데 교사 카드만
// 자동 ID로 생겨(`addStudyCard`), 교사가 누르면 누를 때마다 **새 카드가
// 쌓였습니다**(학생 카드 격자에 '선생님' 카드가 여러 장). 교사에게 이 칸은
// 보낼 곳을 정하고 필요하면 만드는 자리입니다.
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
  // 지금 출력 칸의 결과를 낸 코드 — 고쳐 놓고 다시 안 돌렸으면 결과를
  // 안 붙이는 데 씁니다(lib/pyShare.js).
  getRanCode,
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null); // { kind: 'ok'|'err', text }
  const [making, setMaking] = useState(false); // 새 프로젝트 만들기 폼
  const [newTitle, setNewTitle] = useState("");
  const [newAct, setNewAct] = useState("");
  const [addingAct, setAddingAct] = useState(false); // 활동 추가 폼
  const [actName, setActName] = useState("");
  // 학생이 직접 고른 목적지 — null이면 선생님이 정한 것을 그대로 따릅니다.
  // (반 문서는 교사만 쓸 수 있어 여기 담습니다. 화면을 닫으면 사라지고
  //  다시 선생님 것을 따라갑니다 — 그게 수업의 기본값이라서요.)
  const [myPick, setMyPick] = useState(null);
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

  // 교사는 늘 반 문서를 보고, 학생은 자기가 고른 것이 있으면 그것을 봅니다.
  const chosen = isTeacher ? pyTarget : myPick ?? pyTarget;
  const target = chosen?.boardId ? chosen : null;
  // 고른 프로젝트가 사라졌으면(지워졌거나 다른 반) 없는 것으로 봅니다.
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

  // 교사가 고르면 반 전체의 기본값이 바뀌고, 학생이 고르면 자기 화면만.
  async function pickBoard(boardId) {
    const next = boardId ? { boardId, actIndex: 0 } : null;
    if (isTeacher) await setClassPyTarget(classId, next);
    else setMyPick(next);
  }
  async function pickAct(i) {
    if (!board) return;
    const next = { boardId: board.id, actIndex: Number(i) };
    if (isTeacher) await setClassPyTarget(classId, next);
    else setMyPick(next);
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
    const html = pyShareHtml(getCode?.() ?? "", getLines?.() ?? [], getRanCode?.());
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
    ? "보낼 프로젝트와 활동을 고르세요."
    : boardLocked
      ? "이 프로젝트는 잠겨 있어요."
      : locked
        ? "이 활동은 아직 잠겨 있어요."
        : groupBoard
          ? "모둠 프로젝트에는 보낼 수 없어요."
          : "";

  return (
    <div className="py-project">
      <div className="py-project-head">
        <h4>활동으로 보내기</h4>
        {className && <em className="py-project-scope">{className}</em>}
      </div>

      {/* 고르는 자리 — 교사·학생 **둘 다** 봅니다. 프로젝트가 여럿 돌아가고
          한 프로젝트에 활동도 여럿이라, 어디로 가는지가 늘 화면에 있어야
          합니다. 둘을 한 줄에 나란히 둡니다(칸이 300px이라 이름은 고르개가
          알아서 줄여 적습니다 — 고른 것은 아래 보내기 단추가 되풀이합니다). */}
      <div className="py-project-picks">
        <label className="py-project-pick">
          <span className="py-project-label">프로젝트</span>
          <select
            className="py-project-select"
            value={board?.id ?? ""}
            onChange={(e) => pickBoard(e.target.value)}
            disabled={busy || projects.length === 0}
          >
            <option value="">— 고르지 않음 —</option>
            {projects.map((b) => (
              <option key={b.id} value={b.id}>{b.title}</option>
            ))}
          </select>
        </label>

        <label className="py-project-pick">
          <span className="py-project-label">활동</span>
          <select
            className="py-project-select"
            value={board ? actIndex : ""}
            onChange={(e) => pickAct(e.target.value)}
            disabled={busy || !board || activities.length === 0}
          >
            {!board && <option value="">— 먼저 고르세요 —</option>}
            {activities.map((a, i) => (
              <option key={i} value={i}>
                {i + 1}. {a}{isActivityLocked(board, i) ? " (잠김)" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* 지금 어디로 가는지 한 줄로 되풀이합니다 — 고르개는 폭이 좁아 긴
          이름이 잘립니다. 잠긴 활동이면 그것도 여기서 말합니다. */}
      {board && (
        <p className="py-project-where">
          <strong>{board.title}</strong>
          <span>
            {actIndex + 1}. {actName_}
            {locked && (
              <em className="py-project-lock">
                <IconLockState locked size={13} /> 잠김
              </em>
            )}
          </span>
        </p>
      )}

      {/* 교사만 — 수업 중에 공부방으로 건너갔다 오면 짜던 코드가 없습니다 */}
      {isTeacher && (
        <>
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
      )}

      {/* [보내기는 학생만] 카드는 한 사람에 한 장인데 **교사 카드만 자동
          ID로** 생겨서(`addStudyCard`), 교사가 누르면 다음에 그 카드를 못 찾고
          누를 때마다 새로 만들었습니다 — 학생 카드 격자에 '선생님' 카드가
          여러 장 쌓였습니다. 교사에게 이 칸은 보낼 곳을 정하는 자리입니다. */}
      {isTeacher ? (
        <p className="py-project-why">
          보내는 것은 학생입니다. 여기서 고른 곳이 그 반 학생 실행기의
          기본 목적지가 됩니다.
        </p>
      ) : (
        <>
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
        </>
      )}
      {note && <p className={`py-project-note py-project-note--${note.kind}`}>{note.text}</p>}

      <p className="py-project-hint">
        코드는 코드 블록으로, 실행 결과가 있으면 그 아래에 함께 들어갑니다.
        이미 쓴 내용은 지워지지 않고 뒤에 이어 붙습니다.
      </p>
    </div>
  );
}
