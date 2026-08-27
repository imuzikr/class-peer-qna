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
// 맨 앞의 '수업 자료' 카드는 반마다 하나씩 자동으로 만들어지는 선생님
// 보드(type: 'notice')입니다 — 학생 개인 카드가 아니라 교사가 올린 안내·
// 자료를 모아 두는 곳이라 다른 프로젝트와 구분해 보여 줍니다.
// =============================================================
import { useEffect, useState } from "react";
import {
  subscribeStudyCards,
  subscribeMyGroupCards,
  toDate,
} from "@/lib/store";
import { cardActivitySummary } from "@/lib/activities";

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
  isTeacher = false,
  readOnly = false, // 보관된 반 — 보기 전용(만들기·순서 변경 없음)
  roster = [],      // 교사: 반 학생 명단(제출 현황의 분모)
  onOpen,
  onCreate,
  onReorder,        // (draggedId, targetId) => void
}) {
  const [draggingId, setDraggingId] = useState(null);

  const notice = boards.find((b) => b.type === "notice") ?? null;
  const projects = boards.filter((b) => b.type !== "notice");
  const canManage = isTeacher && !readOnly;

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

      {notice && (
        <NoticeCard board={notice} isTeacher={isTeacher} onOpen={() => onOpen?.(notice)} />
      )}

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
    </div>
  );
}

// 수업 자료(선생님 보드) — 프로젝트 그리드 위에 넓은 한 줄로
function NoticeCard({ board, isTeacher, onOpen }) {
  const [cards, setCards] = useState([]);
  useEffect(() => subscribeStudyCards(board.id, setCards), [board.id]);

  return (
    <button type="button" className="study-notice-card" onClick={onOpen}>
      <span className="study-notice-icon" aria-hidden="true">📌</span>
      <span className="study-notice-main">
        <strong>{board.title}</strong>
        <span className="study-notice-desc">
          {board.description ||
            (isTeacher
              ? "수업 자료와 안내를 올려 두는 곳이에요."
              : "선생님이 올린 수업 자료와 안내를 볼 수 있어요.")}
        </span>
      </span>
      <span className="study-notice-count">자료 {cards.length}개</span>
    </button>
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

  // 교사: 학급 전체의 제출 상태를 평균해 막대로 — 활동 칸마다 '그 활동을
  // 낸 학생 비율'만큼 채웁니다(한 명이라도 안 냈으면 칸이 덜 찹니다).
  // 분모는 반 명단 인원이라, 아직 카드를 만들지 않은 학생도 0으로 셉니다
  // (모둠 프로젝트는 명단 대신 살아 있는 모둠 카드 수가 분모).
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
      ratios,
      total: activities.length,
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
          {locked && <span className="study-project-badge lock">🔒 보기 전용</span>}
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

        {/* 교사: 학급 전체 평균 — 칸마다 제출한 학생 비율만큼 채워집니다 */}
        {classSummary && (
          <span className="study-project-progress">
            <span className="study-project-progress-bar">
              {classSummary.ratios.map((r, i) => (
                <span key={i} className="study-project-seg">
                  <span
                    className="study-project-seg-fill"
                    style={{ width: `${Math.round(r * 100)}%` }}
                  />
                </span>
              ))}
            </span>
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
