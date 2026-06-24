"use client";

// =============================================================
// 공부방 보드(컬럼) 하나 — Trello/Padlet 스타일 세로 컬럼
// -------------------------------------------------------------
// · 수업 안내(type='notice'): 교사만 카드 작성, 학생은 읽기
// · 학생 보드(type='student'): 학생은 카드 1개만 작성
//     viewMode='private'(기본) → 학생은 자기 카드만, 교사는 전부
//     viewMode='shared'        → 모두가 서로의 카드를 봄
//     editMode='locked'        → 작성/수정 잠금(보기 전용)
//
// [레이아웃]
// · 교사 정보 카드: 보드 제목·설명·정렬·설정 — 독립 카드로 고정
// · 학생 카드 영역: 학생이 제출한 카드 목록
// =============================================================
import { useEffect, useState } from "react";
import {
  subscribeStudyCards,
  updateStudyBoard,
  updateStudyCard,
  deleteStudyBoard,
  toDate,
} from "@/lib/store";
import { stripHtml } from "@/lib/html";
import StudyCard from "./StudyCard";
import StudyCardModal from "./StudyCardModal";
import { IconTrash, IconAddFeature } from "./StatusIcons";

function buildActivityTemplate(activities) {
  if (!activities?.length) return "";
  return activities
    .map((act) => `<div class="activity-section"><h4 class="activity-title">${act}</h4><p><br></p></div>`)
    .join("");
}

export default function StudyBoardColumn({
  board,
  user,
  isTeacher,
  questions = [],
  onAsk,
  onModalChange,
}) {
  const [cards, setCards] = useState([]);
  const [selectedCard, setSelectedCard] = useState(null);
  const [creating, setCreating] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [sortKey, setSortKey] = useState("time");
  const [studentIdDir, setStudentIdDir] = useState("asc");
  const [timeDir, setTimeDir] = useState("asc");
  const [activitiesOpen, setActivitiesOpen] = useState(false);
  const [activitiesDraft, setActivitiesDraft] = useState([]);
  const [savingActivities, setSavingActivities] = useState(false);

  useEffect(() => {
    const unsub = subscribeStudyCards(board.id, setCards);
    return unsub;
  }, [board.id]);

  const isNotice = board.type === "notice";
  const locked = board.editMode === "locked";
  const myCard = user ? cards.find((c) => c.authorId === user.uid) : null;

  let visibleCards = cards;
  if (!isTeacher && !isNotice && board.viewMode === "private") {
    visibleCards = myCard ? [myCard] : [];
  }

  const currentSortDir = sortKey === "studentId" ? studentIdDir : timeDir;

  if (isTeacher && !isNotice) {
    visibleCards = [...visibleCards].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "studentId") {
        const aId = a.authorStudentId ?? "";
        const bId = b.authorStudentId ?? "";
        cmp = aId.localeCompare(bId, "ko", { numeric: true });
      } else {
        cmp = toDate(a.createdAt) - toDate(b.createdAt);
      }
      return currentSortDir === "asc" ? cmp : -cmp;
    });
  }

  const canAddNotice = isNotice && isTeacher && !locked;
  const canAddStudent = !isNotice && !locked && !myCard;
  const canAdd = canAddNotice || canAddStudent;

  // 이전 단일 keyword 필드와 새 keywords 배열 모두 지원
  const boardKeywords = Array.isArray(board.keywords)
    ? board.keywords
    : board.keyword
    ? [board.keyword]
    : [];
  const relatedQuestions = boardKeywords.length > 0
    ? questions.filter((q) => boardKeywords.includes(q.keyword))
    : [];

  function canEditCard(card) {
    return !locked && !!user && (card.authorId === user.uid || isTeacher);
  }

  async function handleDeleteBoard() {
    if (!confirm(`'${board.title}' 보드를 삭제할까요? 카드도 함께 삭제됩니다.`)) return;
    await deleteStudyBoard(board.id);
  }

  function openActivitiesModal() {
    setActivitiesDraft(
      board.activities?.length ? [...board.activities] : [""]
    );
    setActivitiesOpen(true);
  }

  async function handleSaveActivities() {
    const newActivities = activitiesDraft.filter((a) => a.trim().length > 0);

    const studentCards = cards.filter(
      (c) => !c.authorId?.startsWith("teacher_")
    );
    const hasContent = studentCards.some(
      (c) => stripHtml(c.content ?? "").trim().length > 0
    );

    if (hasContent) {
      alert(
        "학생이 입력한 내용이 있어서 활동을 변경할 수 없어요.\n모든 학생 카드의 내용을 비운 후 다시 시도해 주세요."
      );
      return;
    }

    setSavingActivities(true);
    try {
      await updateStudyBoard(board.id, { activities: newActivities });

      if (newActivities.length > 0) {
        const templateHtml = buildActivityTemplate(newActivities);
        await Promise.all(
          studentCards.map((c) =>
            updateStudyCard(board.id, c.id, {
              title: c.title ?? "",
              content: templateHtml,
              imageUrl: c.imageUrl ?? null,
              attachments: c.attachments ?? [],
            })
          )
        );
      }

      setActivitiesOpen(false);
    } finally {
      setSavingActivities(false);
    }
  }

  const modalOpen = selectedCard !== null || creating;

  useEffect(() => {
    onModalChange?.(modalOpen);
  }, [modalOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className={`study-column ${isNotice ? "is-notice" : ""}`}>
      {/* ── 교사 관리 영역 (독립 카드) ── */}
      <div className="study-board-info">
        <div
          className={`study-board-info-head${isTeacher && !isNotice ? " clickable" : ""}`}
          onClick={
            isTeacher && !isNotice
              ? () => setPanelOpen((v) => !v)
              : undefined
          }
        >
          <h3>{board.title}</h3>
          {isTeacher && !isNotice && (
            <button
              className={`study-panel-toggle${panelOpen ? " open" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                setPanelOpen((v) => !v);
              }}
              title={panelOpen ? "접기" : "정렬·설정 펼치기"}
              aria-label={panelOpen ? "패널 접기" : "패널 펼치기"}
            >
              <IconAddFeature size={22} />
            </button>
          )}
        </div>

        {board.description && (
          <p className="study-column-desc">{board.description}</p>
        )}

        {/* 정렬·활동·설정 패널 — 제목 카드 클릭 시 한 번에 펼침 */}
        {isTeacher && !isNotice && (
          <div className={`study-board-panel${panelOpen ? " open" : ""}`}>
            <div className="study-sort">
              <button
                className={`study-sort-btn study-sort-btn--studentid${sortKey === "studentId" ? " active" : ""}`}
                onClick={() => {
                  setSortKey("studentId");
                  setStudentIdDir((d) => (d === "asc" ? "desc" : "asc"));
                }}
                title="학번 정렬"
              >
                학번 {studentIdDir === "asc" ? "↑" : "↓"}
              </button>
              <button
                className={`study-sort-btn study-sort-btn--time${sortKey === "time" ? " active" : ""}`}
                onClick={() => {
                  setSortKey("time");
                  setTimeDir((d) => (d === "asc" ? "desc" : "asc"));
                }}
                title="제출 시간 정렬"
              >
                제출 {timeDir === "asc" ? "↑" : "↓"}
              </button>
              <button
                className="study-sort-btn study-sort-btn--activity"
                onClick={openActivitiesModal}
              >
                활동
              </button>
            </div>
            <div className="study-settings">
              <label className="study-setting-row">
                <span>공개 범위</span>
                <button
                  className="study-chip"
                  onClick={() =>
                    updateStudyBoard(board.id, {
                      viewMode:
                        board.viewMode === "shared" ? "private" : "shared",
                    })
                  }
                >
                  {board.viewMode === "shared" ? "👥 함께 보기" : "🔒 나만 보기"}
                </button>
              </label>
              <label className="study-setting-row">
                <span>편집 상태</span>
                <button
                  className="study-chip"
                  onClick={() =>
                    updateStudyBoard(board.id, {
                      editMode: locked ? "open" : "locked",
                    })
                  }
                >
                  {locked ? "🔏 보기 전용" : "✏️ 편집 가능"}
                </button>
              </label>
              <button className="study-chip danger" onClick={handleDeleteBoard}>
                <IconTrash size={15} /> 보드 삭제
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── 학생 카드 목록 ── */}
      <div className="study-column-cards">
        {visibleCards.map((card) => (
          <StudyCard
            key={card.id}
            card={card}
            isTeacher={isTeacher}
            onClick={() => setSelectedCard(card)}
          />
        ))}

        {visibleCards.length === 0 && (
          <p className="study-column-empty">
            {locked
              ? "아직 등록된 카드가 없어요."
              : isNotice
              ? "안내 카드를 추가해 보세요."
              : "내 카드를 작성해 활동을 시작해 보세요."}
          </p>
        )}

        {canAdd && (
          <button className="study-add-card" onClick={() => setCreating(true)}>
            ＋ {isNotice ? "카드 추가" : "내 카드 작성"}
          </button>
        )}
        {!isNotice && myCard && !locked && (
          <p className="study-one-card-note">
            한 보드에는 카드를 하나만 만들 수 있어요.
          </p>
        )}
      </div>

      {/* ── 활동 설정 모달 ── */}
      {activitiesOpen && (
        <div
          className="modal-backdrop"
          onClick={() => setActivitiesOpen(false)}
        >
          <div
            className="study-activity-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="study-activity-modal-head">
              <h3>활동 설정</h3>
              <button
                className="btn-close"
                onClick={() => setActivitiesOpen(false)}
                aria-label="닫기"
              >
                ×
              </button>
            </div>
            <p className="study-activity-hint">
              학생 카드에 제시할 활동 내용을 입력하세요.
            </p>
            <div className="study-activity-list">
              {activitiesDraft.map((act, i) => (
                <div key={i} className="study-activity-item">
                  <span className="study-activity-label">활동 {i + 1}</span>
                  <input
                    className="study-activity-input"
                    value={act}
                    onChange={(e) => {
                      const next = [...activitiesDraft];
                      next[i] = e.target.value;
                      setActivitiesDraft(next);
                    }}
                    placeholder={`활동 ${i + 1} 내용을 입력하세요`}
                  />
                  <button
                    className="study-activity-del"
                    onClick={() =>
                      setActivitiesDraft(activitiesDraft.filter((_, j) => j !== i))
                    }
                    aria-label="삭제"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button
              className="study-activity-add"
              onClick={() => setActivitiesDraft([...activitiesDraft, ""])}
            >
              + 활동 추가
            </button>
            <div className="study-activity-actions">
              <button
                className="btn-ghost"
                onClick={() => setActivitiesOpen(false)}
              >
                취소
              </button>
              <button
                className="btn-primary"
                onClick={handleSaveActivities}
                disabled={savingActivities}
              >
                {savingActivities ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalOpen && (
        <StudyCardModal
          board={board}
          card={creating ? null : selectedCard}
          canEdit={
            creating
              ? canAdd
              : selectedCard
              ? canEditCard(selectedCard)
              : false
          }
          mine={
            creating
              ? true
              : selectedCard
              ? !!(user && (
                  selectedCard.authorId === user.uid ||
                  (isNotice && isTeacher)
                ))
              : false
          }
          relatedQuestions={relatedQuestions}
          onClose={() => {
            setSelectedCard(null);
            setCreating(false);
          }}
          onAsk={onAsk}
        />
      )}
    </section>
  );
}
