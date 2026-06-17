"use client";

// =============================================================
// 공부방 보드(컬럼) 하나 — Trello/Padlet 스타일 세로 컬럼
// -------------------------------------------------------------
// · 수업 안내(type='notice'): 교사만 카드 작성, 학생은 읽기
// · 학생 보드(type='student'): 학생은 카드 1개만 작성
//     viewMode='private'(기본) → 학생은 자기 카드만, 교사는 전부
//     viewMode='shared'        → 모두가 서로의 카드를 봄
//     editMode='locked'        → 작성/수정 잠금(보기 전용)
// 교사는 ⚙️로 보기/편집 모드를 바꾸고 보드를 삭제할 수 있습니다.
// =============================================================
import { useEffect, useState } from "react";
import {
  subscribeStudyCards,
  updateStudyBoard,
  deleteStudyBoard,
} from "@/lib/store";
import StudyCard from "./StudyCard";
import StudyCardModal from "./StudyCardModal";

export default function StudyBoardColumn({
  board,
  user,
  isTeacher,
  questions = [],
  onAsk,
}) {
  const [cards, setCards] = useState([]);
  const [selectedCard, setSelectedCard] = useState(null); // 클릭한 기존 카드
  const [creating, setCreating] = useState(false);        // 새 카드 작성 모드
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const unsub = subscribeStudyCards(board.id, setCards);
    return unsub;
  }, [board.id]);

  const isNotice = board.type === "notice";
  const locked = board.editMode === "locked";
  const myCard = user ? cards.find((c) => c.authorId === user.uid) : null;

  // 화면에 보일 카드 결정
  let visibleCards = cards;
  if (!isTeacher && !isNotice && board.viewMode === "private") {
    visibleCards = myCard ? [myCard] : [];
  }

  // 카드 추가 가능 여부
  const canAddNotice = isNotice && isTeacher && !locked;
  const canAddStudent = !isNotice && !locked && !myCard;
  const canAdd = canAddNotice || canAddStudent;

  // 연계 키워드의 관련 질문
  const relatedQuestions = board.keyword
    ? questions.filter((q) => q.keyword === board.keyword)
    : [];

  // 기존 카드를 클릭했을 때 canEdit 계산
  function canEditCard(card) {
    return !locked && !!user && (card.authorId === user.uid || isTeacher);
  }

  async function handleDeleteBoard() {
    if (
      !confirm(
        `'${board.title}' 보드를 삭제할까요? 카드도 함께 삭제됩니다.`
      )
    )
      return;
    await deleteStudyBoard(board.id);
  }

  const modalOpen = selectedCard !== null || creating;

  return (
    <section className={`study-column ${isNotice ? "is-notice" : ""}`}>
      <header className="study-column-head">
        <div className="study-column-title">
          <h3>{board.title}</h3>
          {isTeacher && !isNotice && (
            <button
              className="study-gear"
              onClick={() => setSettingsOpen((v) => !v)}
              title="보드 설정"
              aria-label="보드 설정"
            >
              ⚙️
            </button>
          )}
        </div>
        {board.description && (
          <p className="study-column-desc">{board.description}</p>
        )}
        <div className="study-column-tags">
          {board.keyword && (
            <span className="keyword-chip"># {board.keyword}</span>
          )}
          {!isNotice && (
            <span className={`study-mode-chip ${board.viewMode}`}>
              {board.viewMode === "shared" ? "👥 함께 보기" : "🔒 나만 보기"}
            </span>
          )}
          {locked && (
            <span className="study-mode-chip locked">🔏 보기 전용</span>
          )}
        </div>

        {/* 교사 설정 패널 */}
        {settingsOpen && isTeacher && !isNotice && (
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
              🗑 보드 삭제
            </button>
          </div>
        )}
      </header>

      <div className="study-column-cards">
        {visibleCards.map((card) => (
          <StudyCard
            key={card.id}
            card={card}
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

      {/* 카드 클릭 → 통합 모달 */}
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
              ? user && selectedCard.authorId === user.uid
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
