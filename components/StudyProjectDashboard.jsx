"use client";

// =============================================================
// 공부방 — 프로젝트 대시보드 (교사·학생 공통)
// -------------------------------------------------------------
// 공부방에 들어오면 가장 먼저 보이는 화면입니다. 반의 프로젝트가 카드로
// 깔리고, 카드를 누르면 그 프로젝트의 개인 카드 화면으로 들어갑니다.
//
//   교사  ＋ 프로젝트 만들기 / 카드를 끌어 순서 바꾸기 / 반 전체 제출 현황
//   학생  교사가 만든 프로젝트만 보이고, 카드마다 '내 진행'이 표시됨
//
// 맨 앞에 있던 '선생님 보드'(type: 'notice') 카드는 뺐습니다 — 수업에 쓸
// 자료는 프로젝트를 만들 때 함께 붙이는 방식으로 옮길 예정이라, 프로젝트와
// 성격이 다른 카드가 목록 맨 앞에 하나 더 놓일 이유가 없어졌습니다.
// (보드 문서 자체는 그대로 두어 예전 자료가 사라지지 않게 합니다.)
// =============================================================
import { useCallback, useEffect, useState } from "react";
import {
  subscribeStudyCards,
  subscribeMyGroupCards,
  fetchTrashedStudyBoards,
  restoreStudyBoard,
  purgeStudyBoard,
  toDate,
} from "@/lib/store";
import { cardActivitySummary, isActivityLocked } from "@/lib/activities";
import { IconLock } from "./StatusIcons";

function dateLabel(value) {
  const d = value ? toDate(value) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export default function StudyProjectDashboard({
  boards = [],
  user,
  classId = null,   // 휴지통을 가져올 반
  isTeacher = false,
  readOnly = false, // 보관된 반 — 보기 전용(만들기·순서 변경 없음)
  roster = [],      // 교사: 반 학생 명단(제출 현황의 분모)
  onOpen,
  onCreate,
  onReorder,        // (draggedId, targetId) => void
  onToast,
}) {
  const [draggingId, setDraggingId] = useState(null);
  const [trashOpen, setTrashOpen] = useState(false);
  const [trashed, setTrashed] = useState([]);
  const [trashBusy, setTrashBusy] = useState(false);
  // 완전 삭제는 되돌릴 수 없어 그 카드에서 한 번 더 묻습니다.
  const [confirmPurge, setConfirmPurge] = useState(null);

  const projects = boards.filter((b) => b.type !== "notice");
  const canManage = isTeacher && !readOnly;

  // 휴지통은 열었을 때만 읽습니다 — 평소엔 볼 일이 없는 목록이라 늘 구독하면
  // studyBoards를 한 벌 더 읽게 됩니다.
  const loadTrash = useCallback(async () => {
    if (!classId) { setTrashed([]); return; }
    setTrashed(await fetchTrashedStudyBoards(classId));
  }, [classId]);

  useEffect(() => {
    if (!trashOpen) return;
    loadTrash();
  }, [trashOpen, loadTrash]);
  // 반을 바꾸면 접어 둡니다 — 다른 반의 휴지통이 펼쳐진 채로 남지 않게.
  useEffect(() => { setTrashOpen(false); setConfirmPurge(null); }, [classId]);

  async function handleRestore(board) {
    if (trashBusy) return;
    setTrashBusy(true);
    try {
      await restoreStudyBoard(board.id);
      await loadTrash();
      onToast?.(`‘${board.title}’ 프로젝트를 되돌렸어요.`);
    } finally {
      setTrashBusy(false);
    }
  }

  async function handlePurge(board) {
    if (trashBusy) return;
    setTrashBusy(true);
    try {
      await purgeStudyBoard(board.id);
      setConfirmPurge(null);
      await loadTrash();
      onToast?.(`‘${board.title}’ 프로젝트를 완전히 지웠어요.`);
    } finally {
      setTrashBusy(false);
    }
  }

  return (
    <div className="study-project-dash">
      <div className="study-project-dash-head">
        <p className="study-project-intro">
          {isTeacher
            ? "프로젝트를 만들면 반 학생마다 개인 카드가 한 장씩 생깁니다. 카드를 열면 여기서 정한 활동을 학생이 순서대로 수행해요."
            : "선생님이 연 프로젝트예요. 카드를 누르면 내 개인 카드에서 활동을 시작할 수 있어요."}
        </p>
        {canManage && (
          <button type="button" className="btn-primary" onClick={onCreate}>
            ＋ 프로젝트 만들기
          </button>
        )}
      </div>

      {projects.length === 0 ? (
        <p className="empty-note">
          {isTeacher
            ? "아직 만든 프로젝트가 없어요. ‘＋ 프로젝트 만들기’로 첫 프로젝트를 열어 보세요."
            : "아직 열린 프로젝트가 없어요. 선생님이 프로젝트를 열면 여기에 나타납니다."}
        </p>
      ) : (
        <div className="study-project-grid">
          {projects.map((board) => (
            <ProjectCard
              key={board.id}
              board={board}
              user={user}
              isTeacher={isTeacher}
              rosterCount={roster.length}
              onOpen={() => onOpen?.(board)}
              draggable={canManage}
              isDragging={draggingId === board.id}
              onDragStart={() => setDraggingId(board.id)}
              onDragEnd={() => setDraggingId(null)}
              onDrop={() => {
                const from = draggingId;
                setDraggingId(null);
                if (from && from !== board.id) onReorder?.(from, board.id);
              }}
            />
          ))}
        </div>
      )}

      {/* 휴지통 — 교사만. 지운 프로젝트에는 반 학생 전원의 카드가 달려 있어
          되돌릴 자리가 필요합니다. 평소엔 접혀 있고, 열 때만 읽습니다. */}
      {canManage && (
        <div className="study-trash">
          <button
            type="button"
            className={`study-trash-toggle${trashOpen ? " on" : ""}`}
            onClick={() => setTrashOpen((v) => !v)}
            aria-expanded={trashOpen}
          >
            🗑 휴지통
            <span className="study-trash-caret" aria-hidden="true">
              {trashOpen ? "▲" : "▼"}
            </span>
          </button>

          {trashOpen && (
            trashed.length === 0 ? (
              <p className="study-trash-empty">휴지통이 비어 있어요.</p>
            ) : (
              <ul className="study-trash-list">
                {trashed.map((b) => (
                  <li key={b.id} className="study-trash-row">
                    <span className="study-trash-name">
                      <strong>{b.title}</strong>
                      <small>
                        활동 {b.activities?.length ?? 0}개
                        {dateLabel(b.deletedAt) ? ` · ${dateLabel(b.deletedAt)} 삭제` : ""}
                      </small>
                    </span>
                    {confirmPurge === b.id ? (
                      <>
                        <span className="study-trash-warn">
                          학생 카드까지 되돌릴 수 없이 지웁니다.
                        </span>
                        <button
                          type="button"
                          className="study-trash-btn danger"
                          onClick={() => handlePurge(b)}
                          disabled={trashBusy}
                        >
                          정말 삭제
                        </button>
                        <button
                          type="button"
                          className="study-trash-btn"
                          onClick={() => setConfirmPurge(null)}
                          disabled={trashBusy}
                        >
                          취소
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="study-trash-btn"
                          onClick={() => handleRestore(b)}
                          disabled={trashBusy}
                        >
                          되돌리기
                        </button>
                        <button
                          type="button"
                          className="study-trash-btn danger"
                          onClick={() => setConfirmPurge(b.id)}
                          disabled={trashBusy}
                        >
                          완전 삭제
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )
          )}
        </div>
      )}
    </div>
  );
}

// 프로젝트 카드 한 장 — 카드마다 자기 프로젝트의 카드를 구독해 진행 상황을
// 계산합니다(반에 프로젝트가 몇 개뿐이라 구독 수가 문제되지 않습니다).
function ProjectCard({
  board,
  user,
  isTeacher,
  rosterCount,
  onOpen,
  draggable,
  isDragging,
  onDragStart,
  onDragEnd,
  onDrop,
}) {
  const [cards, setCards] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const isGroup = board.activityType === "group";
  const activities = board.activities ?? [];
  const locked = board.editMode === "locked";
  const shared = board.viewMode === "shared";

  useEffect(() => {
    // 모둠 프로젝트 + 학생 + '자기 모둠만': 규칙상 내 모둠 카드만 읽을 수 있어
    // 전체 구독을 걸면 권한 오류가 납니다(StudyProjectView와 같은 판단).
    if (isGroup && !isTeacher && !shared) {
      if (!user) return;
      return subscribeMyGroupCards(board.id, user.uid, setCards);
    }
    return subscribeStudyCards(board.id, setCards);
  }, [board.id, isGroup, isTeacher, shared, user?.uid]);

  // 교사: 활동을 하나라도 제출한 학생 수 / 학생: 내 카드의 활동 진행
  const studentCards = cards.filter(
    (c) => !(c.authorId?.startsWith?.("teacher_") || c.authorName === "선생님")
  );
  const myCard = user
    ? cards.find((c) =>
        isGroup ? c.memberUids?.includes(user.uid) : c.authorId === user.uid
      )
    : null;
  const mySummary =
    !isTeacher && activities.length > 0 ? cardActivitySummary(myCard, activities) : null;

  // 교사 요약 — 활동이 있으면 '활동을 하나라도 제출한 인원', 없으면 카드 수
  const submitted = isGroup
    ? studentCards.filter((c) => c.groupId && !c.retired).length
    : studentCards.filter((c) =>
        activities.length > 0
          ? cardActivitySummary(c, activities).filled > 0
          : true
      ).length;

  // 교사: 막대는 **어디까지 열어 줬는가**를 그립니다.
  // -------------------------------------------------------------
  // 예전에는 칸마다 '그 활동을 낸 학생 비율'만큼 채웠습니다. 목록 화면에서는
  // 그 정밀함이 쓸모가 없었습니다 — 카드가 여럿 늘어선 자리에서 교사가 알고
  // 싶은 건 '이 프로젝트가 몇 번째 활동까지 진행됐나'이지, 칸마다 몇 %인가가
  // 아니기 때문입니다(그 세부는 프로젝트를 열면 '활동 열기' 칩 줄과 진척도
  // 목록에 그대로 있습니다). 지금은 열린 활동 수만큼 칸을 채웁니다.
  //
  // 제출 정도는 숫자 하나(학급 평균)로 충분합니다 — 막대와 숫자가 서로 다른
  // 것을 말하므로, 한 눈에 '어디까지 열렸나 · 얼마나 냈나'가 함께 읽힙니다.
  const classSummary = (() => {
    if (!isTeacher || activities.length === 0) return null;
    const targets = isGroup
      ? studentCards.filter((c) => c.groupId && !c.retired)
      : studentCards;
    const denom = isGroup ? targets.length : Math.max(rosterCount, targets.length);
    if (denom === 0) return null;
    const counts = new Array(activities.length).fill(0);
    targets.forEach((c) => {
      cardActivitySummary(c, activities).segments.forEach((on, i) => {
        if (on) counts[i] += 1;
      });
    });
    const ratios = counts.map((n) => n / denom);
    return {
      total: activities.length,
      // 열린 활동 — 잠기지 않은 칸입니다. 활동 열기 칩 줄과 같은 판정을
      // 쓰므로(isActivityLocked) 두 화면이 어긋날 수 없습니다.
      openCount: activities.filter((_, i) => !isActivityLocked(board, i)).length,
      // 학생 한 명이 평균 몇 개 칸을 냈는가 (칸 비율의 합과 같습니다)
      avgFilled: ratios.reduce((sum, r) => sum + r, 0),
    };
  })();

  return (
    <article
      className={`study-project-card${isDragging ? " dragging" : ""}${dragOver ? " drag-over" : ""}`}
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
      onDragEnd={draggable ? () => { setDragOver(false); onDragEnd?.(); } : undefined}
      onDragOver={draggable ? (e) => { e.preventDefault(); setDragOver(true); } : undefined}
      onDragLeave={draggable ? () => setDragOver(false) : undefined}
      onDrop={draggable ? (e) => { e.preventDefault(); setDragOver(false); onDrop?.(); } : undefined}
      title={draggable ? "끌어서 순서 바꾸기" : undefined}
    >
      <button type="button" className="study-project-open" onClick={onOpen}>
        <span className="study-project-badges">
          <span className={`study-project-badge${isGroup ? " group" : ""}`}>
            {isGroup ? "👥 모둠" : "🧑‍🎓 개별"}
          </span>
          {activities.length > 0 && (
            <span className="study-project-badge soft">활동 {activities.length}개</span>
          )}
          {shared && <span className="study-project-badge soft">함께 보기</span>}
          {locked && (
            <span className="study-project-badge lock">
              <IconLock size={13} /> 보기 전용
            </span>
          )}
        </span>

        <strong className="study-project-title">{board.title}</strong>
        <span className="study-project-desc">
          {board.description || (isTeacher ? "활동 안내가 아직 없어요." : "")}
        </span>

        {/* 학생: 내 카드의 활동별 진행(초록 = 제출 인정) */}
        {mySummary && (
          <span className="study-project-progress">
            <span className="study-project-progress-bar">
              {mySummary.segments.map((on, i) => (
                <span key={i} className={`study-project-seg${on ? " on" : ""}`} />
              ))}
            </span>
            <span className="study-project-progress-label">
              내 활동 {mySummary.filled}/{mySummary.total}
            </span>
          </span>
        )}

        {/* 교사: 막대 = 열어 준 활동, 숫자 = 학급 평균 제출 */}
        {classSummary && (
          <span
            className="study-project-progress"
            title={`활동 ${classSummary.total}개 중 ${classSummary.openCount}개를 열어 뒀어요 · 학생 한 명이 평균 ${classSummary.avgFilled.toFixed(1)}칸 제출`}
          >
            <span className="study-project-progress-bar">
              {Array.from({ length: classSummary.total }, (_, i) => (
                <span
                  key={i}
                  className={`study-project-seg${i < classSummary.openCount ? " on" : ""}`}
                />
              ))}
            </span>
            {/* 라벨은 평균만 말합니다 — 몇 개를 열어 뒀나는 막대가 칸으로
                이미 보여 주므로, 글자로 되풀이하면 같은 말이 두 번입니다. */}
            <span className="study-project-progress-label">
              학급 평균 {classSummary.avgFilled.toFixed(1)}/{classSummary.total}
            </span>
          </span>
        )}

        <span className="study-project-meta">
          {isTeacher
            ? isGroup
              ? `모둠 카드 ${submitted}개`
              : `제출 ${submitted}/${rosterCount}명`
            : myCard
            ? "작성 중인 내 카드가 있어요"
            : "아직 시작하지 않았어요"}
          {board.createdAt && ` · ${dateLabel(board.createdAt)}`}
        </span>
      </button>
    </article>
  );
}
