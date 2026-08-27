"use client";

// =============================================================
// 공부방 — 프로젝트 상세 (개인 카드 그리드)
// -------------------------------------------------------------
// 대시보드에서 프로젝트를 누르면 열리는 화면입니다. 반 학생 한 명당
// '개인 카드 자리'가 한 칸씩 미리 깔려 있고, 자기 카드를 누르면 교사가
// 프로젝트를 만들 때 정해 둔 활동을 순서대로 수행합니다.
//
// [카드 자리를 미리 깔아 두는 이유]
// 카드 문서(studyBoards/{id}/cards/{uid})는 학생이 처음 저장할 때 만들어
// 집니다 — 보안 규칙이 카드 생성 시 authorId == 본인을 요구해서, 교사가
// 학생 카드를 대신 만들어 둘 수 없기 때문입니다. 그래서 문서가 아직
// 없어도 화면에는 자리를 먼저 보여 줍니다. 학생 눈에는 '내 카드가 이미
// 준비돼 있고 누르면 바로 활동'으로 보이고, 교사 눈에는 '누가 아직
// 시작도 안 했는지'가 한눈에 들어옵니다.
//
// [공개 범위]
//   private(기본) — 학생은 자기 카드만 열 수 있고, 친구 카드는 잠긴
//                   자리로만 보입니다(이름표만, 내용 없음). 교사는 전부.
//   shared        — 친구 카드도 읽기 전용으로 열립니다.
//
// 모둠 프로젝트는 학생 명단 대신 '모둠 구성'으로 만들어진 모둠 카드가
// 그리드에 놓입니다(모둠당 한 장).
// =============================================================
import { backdropClose } from "@/lib/modal";
import { useEffect, useMemo, useState } from "react";
import {
  subscribeStudyCards,
  subscribeMyGroupCards,
  updateStudyBoard,
  updateStudyCard,
  setCardReaction,
  deleteStudyBoard,
  duplicateStudyBoard,
  getDirectoryUser,
  REWARD_MAX,
} from "@/lib/store";
import {
  isActivityLocked,
  isTeacherAuthoredCard as isTeacherAuthored,
  cardActivitySummary,
} from "@/lib/activities";
import StudyCard from "./StudyCard";
import StudyCardModal from "./StudyCardModal";
import StudyMyActivityCard from "./StudyMyActivityCard";
import StudyPresentModal from "./StudyPresentModal";
import StudyProgressBoard from "./StudyProgressBoard";
import GroupComposer from "./GroupComposer";
import {
  IconTrash,
  IconSettings,
  IconCheck,
  IconLock,
  IconDuplicate,
  IconPen,
  IconPeople,
} from "./StatusIcons";

export default function StudyProjectView({
  board,
  user,
  isTeacher,
  classRoster = [], // 교사: 반 학생 명단 [{uid, name, studentId, emoji, count}]
  onAward,
  baseGroupAssignment = null,
  questions = [],
  classes = [],
  onBack,
  onAsk,
  onModalChange,
  onDeleted,
  onDuplicated,
}) {
  const [cards, setCards] = useState([]);
  const [selectedCard, setSelectedCard] = useState(null);
  const [creating, setCreating] = useState(false);
  // 활동이 있는 프로젝트에서 카드를 열면 모달 대신 이 상세 페이지로 바꿉니다
  // (StudyMyActivityCard) — 학생은 자기 카드만, 교사는 학생이 이미 쓴 카드라면
  // 누구 것이든 이 방식으로 봅니다(학생이 친구 카드를 볼 때만 기존 모달 유지).
  const [detailSeat, setDetailSeat] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState(board.title);
  const [editingTitle, setEditingTitle] = useState(false);
  const [descDraft, setDescDraft] = useState(board.description ?? "");
  const [editingDesc, setEditingDesc] = useState(false);
  const [composing, setComposing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isNotice = board.type === "notice";
  const isGroup = board.activityType === "group";
  const locked = board.editMode === "locked";
  const shared = board.viewMode === "shared";
  const activities = board.activities ?? [];

  useEffect(() => {
    // 모둠 프로젝트 + 학생 + '자기 모둠만': 규칙상 내 모둠 카드만 구독 가능.
    // '함께 보기'면 다른 모둠 카드도 읽기 전용으로 내려받습니다.
    if (isGroup && !isTeacher && !shared) {
      if (!user) return;
      return subscribeMyGroupCards(board.id, user.uid, setCards);
    }
    return subscribeStudyCards(board.id, setCards);
  }, [board.id, isGroup, isTeacher, shared, user?.uid]);

  // 외부에서 제목·설명이 바뀌면 편집 초안도 동기화
  useEffect(() => { setTitleDraft(board.title); }, [board.title]);

  const myCard = user ? cards.find((c) => c.authorId === user.uid) : null;

  // ── 반응(👍❤️😊) 최다 카드 — 테두리 강조 대상 ──
  const cardReactionTotal = (c) =>
    (c.thumbsUpIds?.length ?? 0) + (c.heartIds?.length ?? 0) + (c.smileIds?.length ?? 0);
  const maxReactionTotal = cards.reduce(
    (max, c) => Math.max(max, cardReactionTotal(c)),
    0
  );

  // ── 개인 카드 자리 만들기 ────────────────────────────────────
  // seat: { key, uid, name, studentId, emoji, card, mine, locked, isTeacherCard }
  //   card === null  → 아직 안 쓴 자리(빈 카드)
  //   locked === true → 남의 카드인데 '나만 보기'라 열 수 없는 자리
  const seats = useMemo(() => {
    if (isNotice || isGroup) return null; // 안내·모둠은 카드 목록을 그대로 씀

    const byAuthor = new Map();
    cards.forEach((c) => { if (c.authorId) byAuthor.set(c.authorId, c); });

    if (isTeacher) {
      // 교사: 반 학생 전원의 자리 + 교사가 올린 예시 카드
      const rosterUids = new Set(classRoster.map((s) => s.uid));
      const rows = classRoster.map((s) => ({
        key: s.uid,
        uid: s.uid,
        name: s.name,
        studentId: s.studentId ?? null,
        emoji: s.emoji ?? "🙂",
        card: byAuthor.get(s.uid) ?? null,
        mine: false,
        locked: false,
        isTeacherCard: false,
      }));
      const extras = cards
        .filter((c) => !rosterUids.has(c.authorId))
        .map((c) => ({
          key: c.id,
          uid: c.authorId,
          name: c.authorName ?? "선생님",
          studentId: null,
          emoji: c.authorEmoji ?? "🧑‍🏫",
          card: c,
          mine: c.authorId === user?.uid,
          locked: false,
          isTeacherCard: isTeacherAuthored(c),
        }));
      // 선생님 안내 카드는 항상 맨 앞자리(왼쪽 위) — 학생들이 그리드를 열면
      // 예시·안내부터 보이도록. 명단에 없는 다른 카드는 뒤에 이어 붙입니다.
      return [...extras, ...rows];
    }

    // 학생: 내 자리는 항상 맨 앞(카드가 없어도). 급우도 classRoster로 반
    // 전체 자리를 미리 깔아 둡니다 — 아직 카드를 안 쓴 급우도 자리는
    // 보이되(잠긴 채, "아직 작성 전"), 내용은 볼 수 없습니다. classRoster는
    // app/study/page.js가 fetchClassRosterProfiles로 채워 주는데, 방금
    // 반에 들어와 아직 반영 전이면 비어 있을 수 있어 그런 경우엔 아래
    // extras가 '이미 카드가 있는 급우'만이라도 보여 줍니다(예전과 동일).
    const myUid = user?.uid ?? null;
    const rosterUids = new Set(classRoster.map((s) => s.uid));
    const mine = {
      key: myUid ?? "me",
      uid: myUid,
      name: "내 카드",
      studentId: classRoster.find((s) => s.uid === myUid)?.studentId ?? null,
      emoji: user?.emoji ?? "🙂",
      card: myCard ?? null,
      mine: true,
      locked: false,
      isTeacherCard: false,
    };
    const rosterSeats = classRoster
      .filter((s) => s.uid !== myUid)
      .map((s) => {
        const card = byAuthor.get(s.uid) ?? null;
        return {
          key: s.uid,
          uid: s.uid,
          name: s.name,
          studentId: s.studentId ?? null,
          emoji: s.emoji ?? "🙂",
          card,
          mine: false,
          // 카드가 아직 없으면 '아직 작성 전'일 뿐 잠긴 게 아닙니다 — 카드가
          // 있을 때만, '나만 보기'에서, 교사 자료가 아닌 경우에 잠급니다.
          locked: !!card && !shared && !isTeacherAuthored(card),
          isTeacherCard: card ? isTeacherAuthored(card) : false,
        };
      });
    // classRoster에 아직 안 뜨는 급우의 카드(동기화 전)나 교사 예시 카드는
    // 놓치지 않도록 남은 걸 이어 붙입니다.
    const extras = cards
      .filter((c) => c.authorId !== myUid && !rosterUids.has(c.authorId))
      .map((c) => ({
        key: c.id,
        uid: c.authorId,
        name: c.authorName ?? "친구",
        studentId: null,
        emoji: c.authorEmoji ?? "🙂",
        card: c,
        mine: false,
        // 교사가 올린 자료 카드는 '함께 보기'가 아니어도 모두에게 열어 줍니다
        locked: !shared && !isTeacherAuthored(c),
        isTeacherCard: isTeacherAuthored(c),
      }));
    // 선생님 안내 카드가 맨 앞(왼쪽 위) — 학생이 그리드를 열면 무엇을 어떻게
    // 쓰는지 먼저 보이고, 바로 다음이 자기 카드입니다.
    return [
      ...extras.filter((e) => e.isTeacherCard),
      mine,
      ...rosterSeats,
      ...extras.filter((e) => !e.isTeacherCard),
    ];
  }, [isNotice, isGroup, isTeacher, cards, classRoster, myCard, shared, user?.uid, user?.emoji]);

  // 자리 정렬 (교사만) — 선생님 안내 카드가 맨 앞, 나머지는 학번순 고정
  const sortedSeats = useMemo(() => {
    if (!seats || !isTeacher) return seats;
    return [...seats].sort((a, b) => {
      if (a.isTeacherCard !== b.isTeacherCard) return a.isTeacherCard ? -1 : 1;
      const aId = a.studentId ?? getDirectoryUser(a.uid)?.studentId ?? "";
      const bId = b.studentId ?? getDirectoryUser(b.uid)?.studentId ?? "";
      return String(aId).localeCompare(String(bId), "ko", { numeric: true });
    });
  }, [seats, isTeacher]);

  // 안내(수업 자료)·모둠 프로젝트에서 그리드에 놓을 카드
  const listCards = useMemo(() => {
    if (isGroup) {
      return cards
        .filter((c) => c.groupId && (isTeacher || !c.retired))
        .sort((a, b) => (a.groupIndex ?? 0) - (b.groupIndex ?? 0));
    }
    if (isNotice) return [...cards].reverse(); // 최신 안내가 앞에
    return [];
  }, [cards, isGroup, isNotice, isTeacher]);

  // 발표 모드 대상 — 모둠은 모둠 카드, 개별은 학생 카드만(교사 예시 제외)
  const presentCards = isGroup
    ? listCards.filter((c) => c.groupId && !c.retired)
    : cards.filter((c) => !isTeacherAuthored(c));

  // 교사 요약 — 몇 개 활동이 열려 있는지 (활동 개수·잠금 관리는 왼쪽 활동 패널이 담당)
  const summaryOpenCount = activities.filter((_, i) => !isActivityLocked(board, i)).length;

  // 이전 단일 keyword 필드와 새 keywords 배열 모두 지원
  const boardKeywords = Array.isArray(board.keywords)
    ? board.keywords
    : board.keyword
    ? [board.keyword]
    : [];
  const relatedQuestions =
    boardKeywords.length > 0
      ? questions.filter((q) => boardKeywords.includes(q.keyword))
      : [];

  // 교사는 예시·자료 카드를 여러 장 올릴 수 있습니다(학생 카드는 자리에서 시작).
  const canAddOwnCard = isTeacher && !locked;

  function canEditCard(card) {
    if (locked || !user) return false;
    if (isTeacher) return true;
    if (card.groupId) return !!card.memberUids?.includes(user.uid);
    return card.authorId === user.uid;
  }

  async function handleDeleteBoard() {
    await deleteStudyBoard(board.id);
    onDeleted?.();
  }

  // 제목 저장 — 제목을 따로 입력하지 않아 '프로젝트 제목'을 기본값으로 쓰던
  // 카드들의 제목도 함께 바꿔 줍니다(직접 다른 제목을 단 카드는 그대로 유지).
  async function commitTitle() {
    const newTitle = titleDraft.trim();
    setEditingTitle(false);
    if (!newTitle || newTitle === board.title) {
      setTitleDraft(board.title);
      return;
    }
    const oldTitle = board.title;
    await updateStudyBoard(board.id, { title: newTitle });
    cards.forEach((c) => {
      if ((c.title ?? "") === oldTitle) {
        updateStudyCard(board.id, c.id, { title: newTitle });
      }
    });
  }
  function startEditTitle() { setTitleDraft(board.title); setEditingTitle(true); }
  function cancelEditTitle() { setTitleDraft(board.title); setEditingTitle(false); }

  async function commitDesc() {
    const newDesc = descDraft.trim();
    setEditingDesc(false);
    if (newDesc === (board.description ?? "")) return;
    await updateStudyBoard(board.id, { description: newDesc });
  }
  function startEditDesc() { setDescDraft(board.description ?? ""); setEditingDesc(true); }
  function cancelEditDesc() { setDescDraft(board.description ?? ""); setEditingDesc(false); }

  // 다른 반으로 복제 — 학생 카드는 복사하지 않고 활동·공개범위만 유지
  async function handleDuplicate(targetClass) {
    await duplicateStudyBoard(board, targetClass.id, user);
    setDuplicating(false);
    onDuplicated?.(targetClass.name);
  }
  const otherClasses = classes.filter((c) => c.id !== board.classId);

  // 개별 활동 ↔ 모둠 활동 전환 — 이미 쓴 카드가 있으면 구조가 어긋나 막습니다.
  async function toggleActivityType() {
    if (isGroup) {
      if (cards.length > 0) {
        alert(
          "이미 모둠 카드가 있어서 개별 활동으로 바꿀 수 없어요.\n'모둠 구성'에서 모둠 배정을 먼저 정리한 후 다시 시도해 주세요."
        );
        return;
      }
      await updateStudyBoard(board.id, { activityType: "individual" });
    } else {
      const studentCards = cards.filter((c) => !isTeacherAuthored(c));
      if (studentCards.length > 0) {
        alert(
          "이미 학생이 작성한 개인 카드가 있어서 모둠 활동으로 바꿀 수 없어요.\n학생 카드를 모두 정리한 후 다시 시도해 주세요."
        );
        return;
      }
      await updateStudyBoard(board.id, { activityType: "group" });
    }
  }

  const cardModalOpen = selectedCard !== null || creating;
  const modalOpen = cardModalOpen || presenting || progressOpen || composing;
  useEffect(() => {
    onModalChange?.(modalOpen);
  }, [modalOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // 자리 하나를 눌렀을 때
  //  · 내 자리(활동이 있는 프로젝트) → 상세 페이지(StudyMyActivityCard)
  //  · 교사가 학생 자리를 누른 경우도 같은 상세 페이지로 — 아직 안 쓴
  //    자리라도 진행 상황을 보러 들어갈 수 있어야 하므로. 다만 보안 규칙상
  //    교사가 학생 명의 카드를 대신 만들 수는 없어(authorId는 실제 로그인한
  //    사람과 같아야 함), 카드가 아직 없으면 읽기 전용(canEdit=false)으로 엽니다.
  //  · 그 밖의 카드(활동 없는 프로젝트의 카드, 학생이 보는 친구 카드) → 기존 모달
  //  · 남의 빈 자리(학생 시점) → 아무 일 없음
  function openSeat(seat) {
    if (seat.locked) return;
    if (activities.length > 0 && (seat.mine || isTeacher)) {
      setDetailSeat(seat);
      return;
    }
    if (seat.card) { setSelectedCard(seat.card); return; }
    if (seat.mine && !locked) setCreating(true);
  }

  // 활동이 있는 프로젝트의 카드 상세 — 그리드 대신 이 상세 페이지를 통째로
  // 보여 줍니다. 내 자리면 나 자신 기준, 교사가 학생 자리를 열었으면 그
  // 학생의 카드를 기준으로 편집 권한(canEditCard)을 판단하되, 카드가 아직
  // 없으면(학생이 시작 전) 무조건 읽기 전용입니다.
  if (detailSeat) {
    return (
      <StudyMyActivityCard
        board={board}
        user={user}
        card={detailSeat.mine ? myCard : detailSeat.card}
        canEdit={
          detailSeat.mine
            ? !locked
            : !!detailSeat.card && canEditCard(detailSeat.card)
        }
        canDelete={isTeacher}
        isTeacher={isTeacher}
        writerName={detailSeat.mine ? user?.displayName ?? "" : detailSeat.name}
        onBack={() => setDetailSeat(null)}
        onAsk={onAsk}
        relatedQuestions={relatedQuestions}
      />
    );
  }

  return (
    <section className="study-project-view">
      {/* ── 머리말 — 제목이 맨 위, 그 아래 줄에 뒤로 가기·배지 · 교사 도구 ── */}
      <div className="study-project-head">
        <div className="study-project-head-main">
          {isTeacher && editingTitle ? (
            <div className="study-title-edit-wrap">
              <input
                className="study-title-inline"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); commitTitle(); }
                  else if (e.key === "Escape") { e.preventDefault(); cancelEditTitle(); }
                }}
                maxLength={40}
                placeholder="프로젝트 제목"
                aria-label="프로젝트 제목 수정"
                autoFocus
              />
              <button
                type="button"
                className="study-title-save"
                onMouseDown={(e) => e.preventDefault()}
                onClick={commitTitle}
                title="제목 저장"
                aria-label="제목 저장"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          ) : (
            <h2
              className={isTeacher ? "study-title-h3--editable" : ""}
              onDoubleClick={isTeacher ? startEditTitle : undefined}
              title={isTeacher ? `${board.title} — 더블 클릭해 제목 수정` : board.title}
            >
              {board.title}
            </h2>
          )}

          <div className="study-project-head-badges">
            <button type="button" className="btn-ghost study-project-back" onClick={onBack}>
              ← 프로젝트 목록
            </button>
            {!isNotice && (
              <span className={`study-project-badge${isGroup ? " group" : ""}`}>
                {isGroup ? "👥 모둠 활동" : "🧑‍🎓 개별 활동"}
              </span>
            )}
            {activities.length > 0 && (
              <span className="study-project-badge soft">
                활동 {isTeacher ? `${summaryOpenCount}/${activities.length}` : activities.length}개
              </span>
            )}
            {!isNotice && (
              <span className="study-project-badge soft">
                {shared ? "함께 보기" : isGroup ? "자기 모둠만" : "나만 보기"}
              </span>
            )}
            {locked && <span className="study-project-badge lock">🔒 보기 전용</span>}
          </div>

          {isTeacher && editingDesc ? (
            <div className="study-desc-edit-wrap">
              <textarea
                className="study-desc-inline"
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                onBlur={commitDesc}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitDesc(); }
                  else if (e.key === "Escape") { e.preventDefault(); cancelEditDesc(); }
                }}
                maxLength={200}
                placeholder="활동 안내"
                aria-label="활동 안내 수정"
                autoFocus
              />
            </div>
          ) : (
            (board.description || isTeacher) && (
              <p
                className={`study-project-view-desc${isTeacher ? " study-column-desc--editable" : ""}`}
                onDoubleClick={isTeacher ? startEditDesc : undefined}
                title={isTeacher ? "더블 클릭해 활동 안내 추가·수정" : undefined}
              >
                {board.description || "활동 안내를 적어 주세요."}
              </p>
            )
          )}
        </div>

        {isTeacher && (
          <div className="study-project-tools">
            {!isNotice && (
              <button
                className="study-present-btn"
                onClick={() => presentCards.length > 0 && setPresenting(true)}
                disabled={presentCards.length === 0}
                title={presentCards.length > 0 ? "발표 모드 — 학생 카드를 크게 넘겨보기" : "아직 제출한 카드가 없어요"}
                aria-label="발표 모드"
              >
                ▶
              </button>
            )}
            {!isNotice && !isGroup && (
              <button
                className="study-check-btn"
                onClick={() => setProgressOpen(true)}
                title="공부중 전광판 — 학생별 제출 상태 확인"
                aria-label="공부중 전광판"
              >
                <IconCheck size={20} />
              </button>
            )}
            <button
              className={`study-panel-toggle${panelOpen ? " open" : ""}`}
              onClick={() => setPanelOpen((v) => !v)}
              title={panelOpen ? "설정 접기" : "정렬·설정 펼치기"}
              aria-label={panelOpen ? "설정 접기" : "설정 펼치기"}
            >
              <IconSettings size={20} />
            </button>
          </div>
        )}
      </div>

      {/* ── 교사 설정 패널 ── */}
      {isTeacher && panelOpen && (
        <div className="study-project-panel">
          {!isNotice && (
            <div className="study-sort">
              {isGroup ? (
                <>
                  <button
                    type="button"
                    className="study-sort-btn study-sort-btn--group"
                    onClick={() => setComposing(true)}
                    title="모둠 구성 — 기본 모둠을 쓰거나 이 프로젝트에서만 다르게 구성"
                  >
                    모둠 구성
                  </button>
                  <button
                    type="button"
                    className="study-sort-btn"
                    onClick={toggleActivityType}
                    title="이 프로젝트를 개별 활동으로 바꿉니다(모둠 카드가 아직 없을 때만 가능)"
                  >
                    개별 활동
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="study-sort-btn"
                  onClick={toggleActivityType}
                  title="이 프로젝트를 모둠 활동으로 바꿉니다(학생이 작성한 개인 카드가 없을 때만 가능)"
                >
                  모둠
                </button>
              )}
            </div>
          )}

          <div className="study-settings">
            {!isNotice && (
              <label className="study-setting-row">
                <button
                  className="study-chip"
                  onClick={() =>
                    updateStudyBoard(board.id, {
                      viewMode: shared ? "private" : "shared",
                    })
                  }
                  title={
                    isGroup
                      ? "자기 모둠만: 각 모둠은 자기 카드만 봄 · 함께 보기: 다른 모둠 카드도 읽기 전용으로 공개"
                      : "나만 보기: 학생은 자기 카드만 열 수 있음 · 함께 보기: 친구 카드도 읽기 전용으로 공개"
                  }
                >
                  {shared ? (
                    <><IconPeople size={15} /> 함께 보기</>
                  ) : isGroup ? (
                    <><IconLock size={15} /> 자기 모둠만</>
                  ) : (
                    <><IconLock size={15} /> 나만 보기</>
                  )}
                </button>
              </label>
            )}
            <label className="study-setting-row">
              <button
                className="study-chip"
                onClick={() =>
                  updateStudyBoard(board.id, { editMode: locked ? "open" : "locked" })
                }
              >
                {locked ? (
                  <><IconLock size={15} /> 보기 전용</>
                ) : (
                  <><IconPen size={15} /> 편집 가능</>
                )}
              </button>
            </label>

            {canAddOwnCard && (
              <button
                className="study-chip"
                onClick={() => setCreating(true)}
                title="교사가 올리는 예시·자료 카드를 추가합니다"
              >
                ＋ 카드 추가
              </button>
            )}
            <button
              className="study-chip"
              onClick={() => setDuplicating(true)}
              title="이 프로젝트를 다른 반으로 복제 (학생 기록은 초기화)"
            >
              <IconDuplicate size={15} /> 다른 반으로 복제
            </button>
            {!isNotice && (
              confirmDelete ? (
                <span className="study-project-delete-confirm">
                  <span>카드까지 모두 삭제됩니다.</span>
                  <button className="study-chip danger" onClick={handleDeleteBoard}>
                    정말 삭제
                  </button>
                  <button className="study-chip" onClick={() => setConfirmDelete(false)}>
                    취소
                  </button>
                </span>
              ) : (
                <button className="study-chip danger" onClick={() => setConfirmDelete(true)}>
                  <IconTrash size={15} /> 프로젝트 삭제
                </button>
              )
            )}
          </div>
        </div>
      )}

      {/* ── 개인 카드 그리드 ──
          자리 그리드(개별 활동)는 카드가 많아 한눈에 훑어야 하므로, 학생이
          활동을 시작해도 카드 높이가 빈 자리와 같도록 --seats로 고정합니다. */}
      <div className={`study-project-cards${seats !== null ? " study-project-cards--seats" : ""}`}>
        {/* 안내(수업 자료)·모둠 프로젝트 — 카드 목록을 그대로 */}
        {seats === null &&
          listCards.map((card) => (
            <StudyCard
              key={card.id}
              card={card}
              isTeacher={isTeacher}
              activities={activities}
              onClick={() => setSelectedCard(card)}
              myUid={user?.uid ?? null}
              onReact={
                user &&
                ((kind, active) => setCardReaction(board.id, card.id, kind, user.uid, !active))
              }
              topReacted={maxReactionTotal > 0 && cardReactionTotal(card) === maxReactionTotal}
              rewardCount={classRoster.find((s) => s.uid === card.authorId)?.count ?? 0}
              rewardMax={REWARD_MAX}
              onAward={
                onAward &&
                (() => {
                  const cur = classRoster.find((s) => s.uid === card.authorId)?.count ?? 0;
                  onAward(card.authorId, Math.min(REWARD_MAX, cur + 1));
                })
              }
            />
          ))}

        {/* 개별 프로젝트 — 학생 한 명당 자리 하나 */}
        {sortedSeats?.map((seat) =>
          seat.card && !seat.locked ? (
            <StudyCard
              key={seat.key}
              card={seat.card}
              isTeacher={isTeacher}
              activities={activities}
              onClick={() => openSeat(seat)}
              myUid={user?.uid ?? null}
              onReact={
                user &&
                ((kind, active) =>
                  setCardReaction(board.id, seat.card.id, kind, user.uid, !active))
              }
              topReacted={
                maxReactionTotal > 0 && cardReactionTotal(seat.card) === maxReactionTotal
              }
              rewardCount={classRoster.find((s) => s.uid === seat.uid)?.count ?? 0}
              rewardMax={REWARD_MAX}
              onAward={
                onAward &&
                !seat.isTeacherCard &&
                (() => {
                  const cur = classRoster.find((s) => s.uid === seat.uid)?.count ?? 0;
                  onAward(seat.uid, Math.min(REWARD_MAX, cur + 1));
                })
              }
            />
          ) : (
            <SeatPlaceholder
              key={seat.key}
              seat={seat}
              activities={activities}
              canStart={seat.mine && !locked}
              canPeek={isTeacher && activities.length > 0}
              onClick={() => openSeat(seat)}
            />
          )
        )}

        {seats !== null && sortedSeats.length === 0 && (
          <p className="study-column-empty">
            {isTeacher
              ? "이 반에 아직 학생이 없어요. ‘반 관리하기’에서 입장 코드를 알려 주세요."
              : "아직 카드가 없어요."}
          </p>
        )}
        {seats === null && listCards.length === 0 && (
          <p className="study-column-empty">
            {isNotice
              ? isTeacher
                ? "설정(⚙)에서 ‘＋ 카드 추가’로 수업 자료를 올려 보세요."
                : "아직 올라온 수업 자료가 없어요."
              : isTeacher
              ? "설정(⚙)의 ‘모둠 구성’으로 모둠을 먼저 만들어 주세요."
              : "아직 모둠이 만들어지지 않았어요."}
          </p>
        )}
      </div>

      {cardModalOpen && (
        <StudyCardModal
          board={board}
          card={creating ? null : selectedCard}
          canEdit={
            creating
              ? !locked
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
                  (isNotice && isTeacher) ||
                  (selectedCard.groupId && selectedCard.memberUids?.includes(user.uid))
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

      {composing && (
        <GroupComposer
          board={board}
          roster={classRoster}
          cards={cards}
          baseGroups={baseGroupAssignment?.groups ?? []}
          groupSetName={`${board.title || "공부방 프로젝트"} 활동 모둠`}
          onClose={() => setComposing(false)}
        />
      )}

      {presenting && presentCards.length > 0 && (
        <StudyPresentModal
          board={board}
          cards={presentCards}
          onClose={() => setPresenting(false)}
        />
      )}

      {progressOpen && (
        <StudyProgressBoard
          board={board}
          roster={classRoster}
          cards={cards}
          onClose={() => setProgressOpen(false)}
        />
      )}

      {duplicating && (
        <div className="modal-backdrop" {...backdropClose(() => setDuplicating(false))}>
          <div className="modal modal-duplicate" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>📋 다른 반으로 복제</h3>
              <button className="btn-close" onClick={() => setDuplicating(false)} aria-label="닫기">
                ×
              </button>
            </div>
            <p className="study-link-hint">
              <strong>{board.title}</strong> 프로젝트를 복제할 반을 선택하세요.
              학생이 작성한 카드는 복제되지 않고, 교사가 제시한 활동과 공개 범위만
              그대로 옮겨집니다.
            </p>
            {otherClasses.length === 0 ? (
              <p className="study-column-empty">복제할 다른 반이 없어요. 먼저 반을 만들어 주세요.</p>
            ) : (
              <div className="duplicate-class-list">
                {otherClasses.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="duplicate-class-row"
                    onClick={() => handleDuplicate(c)}
                  >
                    <span className="duplicate-class-icon">📚</span>
                    <strong>{c.name}</strong>
                    <span className="duplicate-class-go">복제 →</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

// 아직 카드가 없는 자리 / 잠겨서 열 수 없는 친구 자리
// canStart: 학생 본인 자리(활동 시작 가능) · canPeek: 교사가 아직 안 쓴
// 학생 자리를 읽기 전용으로 미리 들어가 볼 수 있음(대신 만들어 줄 순 없음)
function SeatPlaceholder({ seat, activities, canStart, canPeek, onClick }) {
  const clickable = canStart || canPeek;
  // 잠긴 자리(친구 카드를 볼 수 없는 경우)는 진행률도 보여주지 않습니다 —
  // 잠금이 '내용은 물론 진행 정도도 안 보여준다'는 뜻이었으므로 유지합니다.
  // 잠기지 않았으면(교사 화면은 항상 이쪽) 카드가 아직 없어도(seat.card는
  // null) cardActivitySummary(null, activities)가 빈(모두 off) 막대를
  // 만들어 줘서, 활동 개수만큼의 막대 칸이 시작 전부터 미리 보입니다.
  const summary =
    !seat.locked && activities?.length > 0
      ? cardActivitySummary(seat.card, activities)
      : null;
  return (
    <article
      className={`study-seat-empty${seat.locked ? " locked" : ""}${
        seat.mine ? " mine" : ""
      }${clickable ? " clickable" : ""}`}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? onClick : undefined}
      onKeyDown={clickable ? (e) => e.key === "Enter" && onClick() : undefined}
      title={
        seat.locked
          ? "이 카드는 본인과 선생님만 볼 수 있어요"
          : canStart
          ? "눌러서 활동을 시작하세요"
          : canPeek
          ? "눌러서 진행 상황을 확인하세요"
          : "아직 작성 전이에요"
      }
    >
      <div className="study-seat-empty-head">
        <span className="avatar avatar-sm" aria-hidden="true">{seat.emoji}</span>
        <div className="study-card-author">
          {seat.studentId && <span className="study-card-studentid">{seat.studentId}</span>}
          <strong>{seat.name}</strong>
        </div>
      </div>

      {summary && (
        <div className="study-card-progress">
          <div className="study-card-progress-bar">
            {summary.segments.map((on, i) => (
              <div key={i} className="study-card-progress-col">
                <span className={`study-card-progress-seg${on ? " on" : ""}`} />
                <span className="study-card-progress-chars">{summary.lengths[i]}자</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="study-seat-empty-note">
        {seat.locked ? "🔒 본인과 선생님만 볼 수 있어요" : canStart ? "＋ 활동 시작하기" : "아직 작성 전"}
      </p>
    </article>
  );
}
