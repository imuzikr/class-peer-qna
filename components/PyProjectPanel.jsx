"use client";

// =============================================================
// 파이썬 실행기 2단 — 프로젝트 연계 패널 (**교사만**)
// -------------------------------------------------------------
// 실행기 오른쪽에 한 칸 더 열려, 수업 중에 코드를 받을 프로젝트·활동을
// 고르고 그 자리에서 만듭니다.
//
// [학생에게는 이 칸이 없습니다] 예전에는 학생이 여기서 짠 코드를 활동 칸으로
// '보냈습니다'. 지금 학생은 카드의 활동 칸에서 '파이썬 실행기'를 누르면
// **오른쪽 수업 노트 서랍**에 그 활동 칸이 열리고(CornellNoteDrawer의
// '프로젝트 활동'), 거기서 곧바로 쓰고 돌리고 결과를 붙입니다 — 보내는
// 단계가 없어 보낼 곳을 고를 일도 없습니다. 보내기에서 나던 탈(엉뚱한 칸에
// 들어가기 · 카드가 늦게 들여오기 · 잠긴 활동으로 보내기)도 함께 사라졌습니다.
//
// [교사가 고르면 그 활동이 열립니다] 아래 openIfLocked. 고른 곳은 지금까지처럼
// 반 문서(`pyTarget`)에 적어 두어 다음에 열어도 그 자리입니다 — 학생 화면은
// 이제 이 값을 읽지 않습니다.
//
// [읽는 문서가 늘지 않습니다]
// 프로젝트 목록(`boards`)도 반 문서(`pyTarget`)도 공부방·질문방이 **이미
// 구독해 둔 것**을 그대로 받습니다. 이 패널은 아무것도 새로 읽지 않습니다.
//
// [그 자리에서 만들 수도 있습니다]
// 수업 중에 '아, 여기에 받아야겠다' 싶을 때 공부방으로 건너가 프로젝트를
// 만들고 돌아오면 짜던 코드가 남아 있질 않습니다(실행기는 화면을 옮기면
// 닫힙니다). 그래서 프로젝트 만들기와 활동 추가를 여기 안에 둡니다.
// =============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createStudyProjectInClass,
  syncTemplateActivities,
  setClassPyTarget,
  updateStudyBoard,
} from "@/lib/store";
import { isActivityLocked, nextActivityLocks } from "@/lib/activities";
import { IconLockState } from "./StatusIcons";
import { findSameNameProject, loadSameNameProject } from "@/lib/projectNames";
import ProjectNameDupModal from "./ProjectNameDupModal";

export default function PyProjectPanel({
  classId,
  className = "",
  boards = [],
  templates = [], // 내 원본 — 새 프로젝트 이름이 겹치는지 보는 데만
  pyTarget = null,
  user,
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null); // { kind: 'ok'|'err', text }
  const [making, setMaking] = useState(false); // 새 프로젝트 만들기 폼
  const [newTitle, setNewTitle] = useState("");
  // 활동 이름들 — 한 번에 여럿을 적어 만들 수 있습니다(빈 칸은 건너뜀).
  const [newActs, setNewActs] = useState([""]);
  const [dup, setDup] = useState(null); // 같은 이름이 있을 때 { name, hit }
  const newTitleRef = useRef(null);
  const [addingAct, setAddingAct] = useState(false); // 활동 추가 폼
  const [actName, setActName] = useState("");
  const noteTimer = useRef(null);

  useEffect(() => () => clearTimeout(noteTimer.current), []);

  function say(kind, text) {
    setNote({ kind, text });
    clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(null), 4000);
  }

  // 이 반의 프로젝트만. '수업 자료'(notice)와 휴지통은 뺍니다 — 코드를 받을
  // 곳이 아닙니다(notice는 학생이 카드를 못 만들고, 지운 것은 안 보입니다).
  const projects = useMemo(
    () =>
      boards.filter(
        (b) => b.classId === classId && b.type !== "notice" && b.deleted !== true
      ),
    [boards, classId]
  );

  const target = pyTarget?.boardId ? pyTarget : null;
  // 고른 프로젝트가 사라졌으면(지워졌거나 다른 반) 없는 것으로 봅니다.
  const board = target ? projects.find((b) => b.id === target.boardId) ?? null : null;
  const activities = board?.activities ?? [];
  const actIndex = Math.min(target?.actIndex ?? 0, Math.max(0, activities.length - 1));
  const actName_ = activities[actIndex] ?? "";
  const locked = board ? isActivityLocked(board, actIndex) : false;
  // 모둠 프로젝트는 학생이 서랍에서 쓸 수 없습니다(규칙이 학생의 카드 생성을
  // 막습니다) — 고를 수는 있지만 한 줄로 알립니다.
  const groupBoard = board?.activityType === "group";

  // [교사가 고르면 그 활동을 연다] 여기서 고르는 뜻은 '지금 이걸
  // 쓰세요'입니다 — 수업 모드의 '내보내기'가 잠긴 활동을 함께 여는 것과 같은
  // 까닭입니다. 실행기 안에는 활동을 여는 칩이 없어, 안 열면 학생 쪽에 '잠긴
  // 활동'만 뜨고 선생님은 공부방으로 건너가야 합니다. 새로 만든 프로젝트가
  // 첫 활동만 열린 채 들어오므로(둘째부터 잠김) 특히 필요합니다.
  async function openIfLocked(b, i) {
    if (!b || !isActivityLocked(b, i)) return;
    const locks = (b.activities ?? []).map((_, k) => isActivityLocked(b, k));
    locks[i] = false;
    try {
      await updateStudyBoard(b.id, { activityLocks: locks });
      say("ok", `잠겨 있던 ‘${b.activities?.[i] ?? `활동 ${i + 1}`}’을 열었어요.`);
    } catch {
      say("err", "활동을 열지 못했어요.");
    }
  }

  async function pickBoard(boardId) {
    const next = boardId ? { boardId, actIndex: 0 } : null;
    await setClassPyTarget(classId, next);
    await openIfLocked(projects.find((b) => b.id === boardId), 0);
  }
  async function pickAct(i) {
    if (!board) return;
    await setClassPyTarget(classId, { boardId: board.id, actIndex: Number(i) });
    await openIfLocked(board, Number(i));
  }

  // ── 그 자리에서 프로젝트 만들기(교사) ─────────────────────
  async function createProject(e) {
    e.preventDefault();
    const title = newTitle.trim();
    const acts = newActs.map((a) => a.trim()).filter(Boolean);
    if (!title || acts.length === 0 || busy) return;
    // 프로젝트 이름은 서로 달라야 합니다(lib/projectNames.js) — 있으면
    // 만들지 않고 '이전 프로젝트 불러오기'를 권합니다.
    const hit = findSameNameProject(title, { classId, boards, templates });
    if (hit) {
      setDup({ name: title, hit });
      return;
    }
    setBusy(true);
    try {
      // 수업 중에 만들어도 **원본**으로 만들고 이 반에 불러옵니다 — 공부방
      // '＋ 프로젝트 만들기'와 같은 규칙(lib/store.js의 createStudyProjectInClass).
      // 불러온 복사본은 첫 활동만 열린 채입니다(둘째부터는 잠김 — 새로 만드는
      // 프로젝트의 규칙). 둘째 활동은 선생님이 여기서 고를 때 열립니다
      // (openIfLocked).
      // 실행기에서 만드는 프로젝트는 코드를 받으려는 것이라 **실행기 연계를
      // 켠 채로** 만듭니다 — 학생 카드에도 '파이썬 실행기' 단추가 섭니다.
      const { boardId: id } = await createStudyProjectInClass(user, classId, {
        title,
        activities: acts,
        pyLinked: true,
      });
      // 만들자마자 골라 둡니다 — 만드는 까닭이 그것이라서요.
      if (id) await setClassPyTarget(classId, { boardId: id, actIndex: 0 });
      setMaking(false);
      setNewTitle("");
      setNewActs([""]);
      say("ok", `'${title}' 프로젝트를 만들어 골라 두었어요.`);
    } catch {
      say("err", "프로젝트를 만들지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  // 같은 이름 안내에서 '이전 프로젝트 불러오기' — 이 반에 불러와 골라
  // 둡니다(새로 만들 때와 같은 끝모습). 실패하면 창이 오류를 적도록 던집니다.
  async function loadDup() {
    if (!dup) return;
    const id = await loadSameNameProject(dup.hit, { classId, boards, user });
    if (id) await setClassPyTarget(classId, { boardId: id, actIndex: 0 });
    const t = dup.hit.item.title;
    setDup(null);
    setMaking(false);
    setNewTitle("");
    setNewActs([""]);
    say("ok", `'${t}' 프로젝트를 불러와 골라 두었어요.`);
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
      // 원본에서 불러온 프로젝트면 원본의 활동 목록도 맞춥니다(다른 반 복사본은 그대로).
      await syncTemplateActivities(board, next);
      await setClassPyTarget(classId, { boardId: board.id, actIndex: next.length - 1 });
      setAddingAct(false);
      setActName("");
      say("ok", `'${name}' 활동을 더해 골라 두었어요.`);
    } catch {
      say("err", "활동을 더하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="py-project">
      <div className="py-project-head">
        <h4>프로젝트 연계</h4>
        {className && <em className="py-project-scope">{className}</em>}
      </div>

      {/* 고르는 자리 — 둘을 한 줄에 나란히 둡니다(칸이 300px이라 이름은
          고르개가 알아서 줄여 적습니다 — 고른 것은 아래 한 줄이 되풀이합니다). */}
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

      {/* 고른 곳을 한 줄로 되풀이합니다 — 고르개는 폭이 좁아 긴 이름이
          잘립니다. 잠긴 활동이면 그것도 여기서 말합니다. */}
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

      {/* 수업 중에 공부방으로 건너갔다 오면 짜던 코드가 없습니다 */}
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
            ref={newTitleRef}
            className="py-project-input"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="프로젝트 이름"
            autoFocus
          />
          {/* 활동을 한 번에 여럿 — 만들기 창(StudyProjectForm)과 같은 '활동 n'
              목록입니다. '＋ 활동 추가'는 입력칸 옆이 아니라 목록 아래 제
              줄에 둡니다(칸이 300px라 옆에 두면 입력칸이 좁아집니다). */}
          {newActs.map((a, i) => (
            <div key={i} className="py-project-actrow">
              <input
                className="py-project-input"
                value={a}
                onChange={(e) =>
                  setNewActs((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))
                }
                placeholder={i === 0 ? "활동 1 이름 (예: 반복문 연습)" : `활동 ${i + 1} 이름`}
                aria-label={`활동 ${i + 1} 이름`}
              />
              {/* 첫 칸은 뺄 수 없지만, 칸이 여럿일 때는 ✕ 자리를 비워 두어
                  입력칸들이 같은 폭으로 섭니다. */}
              {i === 0 && newActs.length > 1 && (
                <span className="py-project-actdel py-project-actdel--gap" aria-hidden="true" />
              )}
              {i > 0 && (
                <button
                  type="button"
                  className="py-project-actdel"
                  onClick={() => setNewActs((prev) => prev.filter((_, j) => j !== i))}
                  aria-label={`활동 ${i + 1} 빼기`}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            className="py-project-actadd"
            onClick={() => setNewActs((prev) => [...prev, ""])}
          >
            ＋ 활동 추가
          </button>
          <div className="py-project-form-actions">
            <button type="button" className="btn-ghost" onClick={() => setMaking(false)}>취소</button>
            <button
              type="submit"
              className="btn-primary"
              disabled={busy || !newTitle.trim() || !newActs.some((a) => a.trim())}
            >
              만들기
            </button>
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

      {groupBoard && (
        <p className="py-project-why">
          모둠 프로젝트는 학생이 서랍에서 쓸 수 없어요 — 모둠 카드로 써 주세요.
        </p>
      )}
      {note && <p className={`py-project-note py-project-note--${note.kind}`}>{note.text}</p>}

      <p className="py-project-hint">
        여기서 고른 활동은 곧바로 열려요. 학생은 카드의 활동 칸에서
        ‘파이썬 실행기’를 눌러 오른쪽 서랍에서 코드를 쓰고 돌립니다.
        여기서 만든 프로젝트는 파이썬 실행기와 연계된 채로 만들어져요.
      </p>

      {dup && (
        <ProjectNameDupModal
          name={dup.name}
          hit={dup.hit}
          onCancel={() => {
            setDup(null);
            requestAnimationFrame(() => {
              newTitleRef.current?.focus();
              newTitleRef.current?.select();
            });
          }}
          onLoad={loadDup}
        />
      )}
    </div>
  );
}
