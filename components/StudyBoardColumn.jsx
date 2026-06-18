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
  deleteStudyBoard,
  toDate,
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
  const [selectedCard, setSelectedCard] = useState(null);
  const [creating, setCreating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sortKey, setSortKey] = useState("time");
  const [sortDir, setSortDir] = useState("asc");

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
      return sortDir === "asc" ? cmp : -cmp;
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

  function setSortKeyDir(key, dir) {
    setSortKey(key);
    setSortDir(dir);
  }

  const modalOpen = selectedCard !== null || creating;

  return (
    <section className={`study-column ${isNotice ? "is-notice" : ""}`}>
      {/* ── 교사 관리 영역 (독립 카드) ── */}
      <div className="study-board-info">
        <div className="study-board-info-head">
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

        {/* 교사 전용 정렬 버튼 */}
        {isTeacher && !isNotice && (
          <div className="study-sort">
            <button
              className={`study-sort-btn${sortKey === "studentId" && sortDir === "asc" ? " active" : ""}`}
              onClick={() => setSortKeyDir("studentId", "asc")}
              title="학번 오름차순"
            >학번↑</button>
            <button
              className={`study-sort-btn${sortKey === "studentId" && sortDir === "desc" ? " active" : ""}`}
              onClick={() => setSortKeyDir("studentId", "desc")}
              title="학번 내림차순"
            >학번↓</button>
            <button
              className={`study-sort-btn${sortKey === "time" && sortDir === "asc" ? " active" : ""}`}
              onClick={() => setSortKeyDir("time", "asc")}
              title="제출 빠른 순"
            >제출↑</button>
            <button
              className={`study-sort-btn${sortKey === "time" && sortDir === "desc" ? " active" : ""}`}
              onClick={() => setSortKeyDir("time", "desc")}
              title="제출 늦은 순"
            >제출↓</button>
          </div>
        )}

        {/* 교사 설정 패널 */}
        {settingsOpen && isTeacher && !isNotice && (
          <div className="study-settings">
            <label className="study-setting-row">
              <span>공개 범위</span>
              <button
                className="study-chip"
                onClick={() =>
                  updateStudyBoard(board.id, {
                    viewMode: board.viewMode === "shared" ? "private" : "shared",
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
