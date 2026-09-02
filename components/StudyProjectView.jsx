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
  subscribeQuestionsByKeywords,
  updateStudyBoard,
  updateStudyCard,
  setCardReaction,
  deleteStudyBoard,
  duplicateStudyBoard,
  getDirectoryUser,
  todayDateKey,
  REWARD_MAX,
} from "@/lib/store";
import { stripHtml, htmlHasImage } from "@/lib/html";
import {
  buildActivityTemplate,
  isActivityLocked,
  isTeacherAuthoredCard as isTeacherAuthored,
  cardActivitySummary,
  matchActivitySections,
} from "@/lib/activities";
import StudyCard from "./StudyCard";
import StudyCardModal from "./StudyCardModal";
import StudyMyActivityCard from "./StudyMyActivityCard";
import StudyPresentModal from "./StudyPresentModal";
import StudyProgressBoard from "./StudyProgressBoard";
import StudyActivityWall from "./StudyActivityWall";
import GroupComposer from "./GroupComposer";
import {
  IconTrash,
  IconCheck,
  IconLock,
  IconDuplicate,
  IconPen,
  IconPeople,
  IconSettings,
} from "./StatusIcons";

// 테스트용 학생 계정(test01~test05, 이메일에 포함) — 실제 학생이 아니라
// 화면 확인용 더미 계정이라, 교사가 보는 학생 카드 목록에서 정렬 기준·
// 방향과 무관하게 항상 맨 뒤로 보냅니다(sortedSeats 참고).
function isTestAccountEmail(email) {
  return /test0[1-5]/i.test(email ?? "");
}

// 아직 안 쓴 학생의 자리를 발표에서도 한 장으로 세웁니다.
// 모달이 필요로 하는 것만 채웁니다 — 이름·이모지는 머리말에, authorId는
// 그 자리에서 과일을 주는 데 씁니다(setStudentReward). 내용은 비워 두면
// 모달이 '아직 작성한 내용이 없어요'를 보여 줍니다.
// id는 실제 카드와 겹치지 않게 접두사를 붙입니다(카드 id는 작성자 uid).
function emptyPresentCard(seat) {
  return {
    id: `empty_${seat.uid}`,
    authorId: seat.uid,
    authorName: seat.name,
    authorEmoji: seat.emoji ?? "🙂",
    title: "",
    content: "",
  };
}

export default function StudyProjectView({
  board,
  user,
  isTeacher,
  classRoster = [], // 교사: 반 학생 명단 [{uid, name, studentId, emoji, count}]
  onAward,
  baseGroupAssignment = null,
  classes = [],
  // 오늘 출석을 끝낸 결과 결석으로 확인된 학생 uid 집합.
  // null이면 아직 판단할 근거가 없습니다(출석을 안 했거나 진행 중).
  absentUids = null,
  // 공부중 전광판의 학생 정보창에서 쓰는 반 단위 자료
  classBoards = [],
  attendanceRecords = [],
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
  const [duplicating, setDuplicating] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState(board.title);
  const [editingTitle, setEditingTitle] = useState(false);
  const [descDraft, setDescDraft] = useState(board.description ?? "");
  const [composing, setComposing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // 보드 설정·현황 패널 — 예전 '⚙ 설정'을 되살린 자리
  const [settingsOpen, setSettingsOpen] = useState(false);
  // 활동 모아보기 — 그 활동에 대한 반 전체의 답을 한 화면에 (활동 번호)
  const [wallIndex, setWallIndex] = useState(null);
  // 활동 순서 바꾸기(끌어 놓기) — 집어 든 줄과 지금 올려 둔 줄
  const [dragActIdx, setDragActIdx] = useState(null);
  const [overActIdx, setOverActIdx] = useState(null);
  const [actMoveError, setActMoveError] = useState("");

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
  // 활동 안내는 설정 패널에서 그 자리에 쓰고 포커스를 떼면 저장합니다.
  // 다른 곳에서 값이 바뀌면(다른 기기·다른 교사) 초안도 따라 맞춥니다.
  useEffect(() => { setDescDraft(board.description ?? ""); }, [board.description]);

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
        email: s.email ?? getDirectoryUser(s.uid)?.email ?? null,
        card: byAuthor.get(s.uid) ?? null,
        mine: false,
        locked: false,
        isTeacherCard: false,
        absent: !!absentUids?.has(s.uid),
      }));
      const extras = cards
        .filter((c) => !rosterUids.has(c.authorId))
        .map((c) => ({
          key: c.id,
          uid: c.authorId,
          name: c.authorName ?? "선생님",
          studentId: null,
          emoji: c.authorEmoji ?? "🧑‍🏫",
          email: getDirectoryUser(c.authorId)?.email ?? null,
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
  }, [isNotice, isGroup, isTeacher, cards, classRoster, myCard, shared, user?.uid, user?.emoji, absentUids]);

  // 자리 정렬 (교사만) — 선생님 안내 카드가 맨 앞, 테스트 계정(test01~test05)은
  // 맨 뒤, 나머지는 학번순 고정
  const sortedSeats = useMemo(() => {
    if (!seats || !isTeacher) return seats;
    return [...seats].sort((a, b) => {
      if (a.isTeacherCard !== b.isTeacherCard) return a.isTeacherCard ? -1 : 1;
      const aTest = isTestAccountEmail(a.email ?? getDirectoryUser(a.uid)?.email);
      const bTest = isTestAccountEmail(b.email ?? getDirectoryUser(b.uid)?.email);
      if (aTest !== bTest) return aTest ? 1 : -1;
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

  // 발표 모드 대상 — 모둠은 모둠 카드, 개별은 화면 격자와 같은 차례로.
  // -------------------------------------------------------------
  // 예전에는 cards를 그대로 썼습니다. 그 배열은 구독이 준 순서, 곧 카드를
  // 저장한 차례(orderBy createdAt)라 명단과 어긋났습니다 — 20104보다 20107이
  // 먼저 저장했으면 발표도 20107부터 시작했습니다. 화면 격자는 학번 순인데
  // 발표만 다른 순서로 도니 교실에서 번호대로 넘길 수가 없었습니다.
  // 그래서 격자와 같은 sortedSeats를 그대로 따릅니다(교사 전용 화면이라
  // 이 값이 늘 있습니다).
  //
  // 아직 안 쓴 학생도 빈 카드로 함께 넘깁니다. 건너뛰면 순서가 명단과
  // 어긋나고, 넘기다 보면 누가 아직 안 썼는지가 그 자리에서 보입니다.
  // 모달은 내용이 없으면 '아직 작성한 내용이 없어요'를 보여 줍니다.
  const presentCards = useMemo(() => {
    if (isGroup) return listCards.filter((c) => c.groupId && !c.retired);
    return (sortedSeats ?? [])
      .filter((s) => !s.isTeacherCard)
      .map((s) => s.card ?? emptyPresentCard(s));
  }, [isGroup, listCards, sortedSeats]);

  // 버튼을 열지 말지는 '실제로 쓴 카드'로 판정합니다 — 빈 카드까지 세면
  // 아무도 안 썼는데도 발표가 열려, 넘길 것 없는 화면만 스물여덟 장입니다.
  const hasWrittenCard = isGroup
    ? presentCards.length > 0
    : cards.some((c) => !isTeacherAuthored(c));

  // 교사 요약 — 몇 개 활동이 열려 있는지 (활동 개수·잠금 관리는 왼쪽 활동 패널이 담당)
  const summaryOpenCount = activities.filter((_, i) => !isActivityLocked(board, i)).length;

  // 모아보기에 넘길 답 — 한 활동 칸만 뽑아 학생별로 정리합니다.
  // (열려 있을 때만 계산 — 활동이 여럿이면 매번 파싱할 이유가 없습니다)
  const wallRows = useMemo(() => {
    if (wallIndex === null) return [];
    return classRoster.map((s) => {
      const card = cards.find((c) =>
        isGroup ? c.memberUids?.includes(s.uid) : c.authorId === s.uid
      );
      const html = card
        ? matchActivitySections(card, activities)[wallIndex]?.content ?? ""
        : "";
      const text = stripHtml(html).trim();
      return {
        uid: s.uid,
        name: s.name,
        studentId: s.studentId ?? null,
        count: s.count ?? 0,
        html,
        text,
        chars: text.length,
        at: card?.updatedAt ?? card?.createdAt ?? null,
      };
    });
  }, [wallIndex, classRoster, cards, activities, isGroup]);

  // ── 보드 설정 패널의 '현황' 대시보드 ──
  // 반 명단을 분모로 삼습니다(카드를 아직 안 만든 학생도 0으로 세야 실제
  // 진행률이 나옵니다). 출석은 '오늘 기록이 하나라도 있는가'로 판단해,
  // 출석을 아직 확인하지 않은 날에 0/28로 잘못 보이지 않게 합니다.
  const stats = useMemo(() => {
    if (isNotice || activities.length === 0 || classRoster.length === 0) return null;
    const total = classRoster.length;
    const rows = classRoster.map((s) => {
      const c = cards.find((x) =>
        isGroup ? x.memberUids?.includes(s.uid) : x.authorId === s.uid
      );
      return cardActivitySummary(c, activities);
    });
    const perAct = activities.map((_, i) => rows.filter((r) => r.segments[i]).length);
    const filledSum = rows.reduce((sum, r) => sum + r.filled, 0);
    const avgFilled = filledSum / total;
    const todayKey = todayDateKey();
    const presentToday = attendanceRecords.filter((r) => r.date === todayKey).length;
    return {
      total,
      perAct,
      started: rows.filter((r) => r.filled > 0).length,
      doneAll: rows.filter((r) => r.filled === activities.length).length,
      avgFilled,
      avgPct: Math.round((avgFilled / activities.length) * 100),
      presentToday,
      attendanceKnown: presentToday > 0,
    };
  }, [isNotice, activities, classRoster, cards, isGroup, attendanceRecords]);

  // 이전 단일 keyword 필드와 새 keywords 배열 모두 지원
  const boardKeywords = useMemo(
    () =>
      Array.isArray(board.keywords)
        ? board.keywords
        : board.keyword
        ? [board.keyword]
        : [],
    [board.keywords, board.keyword]
  );
  // 관련 질문 — 예전에는 공부방 화면이 학교 전체 질문을 받아 두고 여기서
  // 키워드로 걸렀습니다. 공부방은 가장 자주 여는 화면이라 질문이 쌓일수록
  // 그 부담이 그대로 커집니다. 이제 이 프로젝트의 키워드에 걸린 질문만
  // 서버에 요청합니다 — 거르는 조건이 같으니 보이는 목록도 같습니다.
  const [relatedQuestions, setRelatedQuestions] = useState([]);
  useEffect(() => {
    if (boardKeywords.length === 0) { setRelatedQuestions([]); return; }
    return subscribeQuestionsByKeywords(boardKeywords, setRelatedQuestions);
  }, [boardKeywords]);

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
    if (newDesc === (board.description ?? "")) return;
    await updateStudyBoard(board.id, { description: newDesc });
  }

  // 다른 반으로 복제 — 학생 카드는 복사하지 않고 활동·공개범위만 유지
  async function handleDuplicate(targetClass) {
    await duplicateStudyBoard(board, targetClass.id, user);
    setDuplicating(false);
    onDuplicated?.(targetClass.name);
  }
  const otherClasses = classes.filter((c) => c.id !== board.classId);

  // 활동 하나를 열고 잠급니다 — 왼쪽 활동 패널·수업 진행 화면과 같은 보드
  // 문서(activityLocks)를 쓰므로, 어느 화면에서 눌러도 같은 상태를 봅니다.
  async function toggleActivityLock(i, lockedNext) {
    const next = activities.map((_, j) =>
      j === i ? lockedNext : board.activityLocks?.[j] === true
    );
    await updateStudyBoard(board.id, { activityLocks: next });
  }

  // 앞에서부터 openCount개만 열어 둡니다 — 곁텍스트 읽기의 '모두 열기 /
  // 1단계만 남기기'와 같은 규칙입니다(lib/paratext.js의 sectionLocksUpTo).
  async function setActivityLocksUpTo(openCount) {
    const next = activities.map((_, j) => j >= openCount);
    await updateStudyBoard(board.id, { activityLocks: next });
  }

  // 활동 순서 바꾸기 — from번째를 뽑아 to번째 자리에 끼워 넣습니다(수업 준비
  // 화면과 같은 방식). 자리를 맞바꾸지 않는 이유: 목록에서 끌어 놓는 몸짓은
  // '여기로 옮긴다'이지 '이 둘을 맞바꾼다'가 아니라, 맞바꾸면 사이에 있던
  // 활동들이 엉뚱하게 튑니다.
  async function moveActivity(from, to) {
    setDragActIdx(null);
    setOverActIdx(null);
    if (from == null || to == null || from === to) return;
    if (to < 0 || to >= activities.length) return;

    // 학생이 이미 쓴 내용이 있으면 순서를 바꿀 수 없습니다 — 활동 칸이 학생
    // 카드의 실제 입력 칸이라, 순서가 바뀌면 이미 쓴 답이 다른 활동 칸에
    // 붙어 버립니다(활동 이름을 고칠 때와 같은 이유·같은 검사).
    const studentCards = cards.filter((c) => !isTeacherAuthored(c));
    const hasContent = studentCards.some((c) => {
      const html = c.content ?? "";
      return stripHtml(html).trim().length > 0 || htmlHasImage(html);
    });
    if (hasContent) {
      setActMoveError(
        "학생이 이미 작성한 내용이 있어 활동 순서를 바꿀 수 없어요. 카드 내용을 비운 뒤 다시 시도해 주세요."
      );
      return;
    }

    const next = [...activities];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);

    // 잠금은 활동을 '따라' 움직입니다 — 열어 둔 활동이 자리를 옮겼다고
    // 다시 잠기면, 쓰고 있던 학생의 입력칸이 갑자기 닫힙니다.
    const locks = activities.map((_, j) => board.activityLocks?.[j] === true);
    const [movedLock] = locks.splice(from, 1);
    locks.splice(to, 0, movedLock);

    setActMoveError("");
    try {
      await updateStudyBoard(board.id, { activities: next, activityLocks: locks });
      // 학생 카드의 작성 틀도 새 순서로 맞춥니다(위에서 빈 카드만 남는 것을
      // 확인했으므로 덮어써도 잃을 내용이 없습니다).
      const html = buildActivityTemplate(next);
      await Promise.all(
        studentCards.map((c) =>
          updateStudyCard(board.id, c.id, {
            title: c.title ?? "",
            content: html,
            imageUrl: c.imageUrl ?? null,
            attachments: c.attachments ?? [],
          })
        )
      );
    } catch (e) {
      setActMoveError(`활동 순서를 바꾸지 못했어요: ${e?.message ?? "알 수 없는 오류"}`);
    }
  }

  // 개별 ↔ 모둠 전환 버튼은 없앴습니다 — 활동 유형은 프로젝트를 만들 때
  // 고르며, 이미 쓴 카드가 있으면 되돌릴 수 없어 나중에 바꾸는 길을 열어
  // 두면 사고가 납니다.

  const cardModalOpen = selectedCard !== null || creating;
  const modalOpen =
    cardModalOpen || presenting || progressOpen || composing || wallIndex !== null;
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
        // 카드에서 곧바로 공부방 첫 화면으로 — '프로젝트로'를 거쳐 다시
        // '프로젝트 목록으로'를 누르는 두 단계를 한 번으로 줄입니다.
        onBackToList={onBack}
        onAsk={onAsk}
        relatedQuestions={relatedQuestions}
      />
    );
  }

  return (
    <section className="study-project-view">
      {/* ── 머리말 — 한 줄에 모읍니다 ──
          [제목] [← 프로젝트 목록으로] … [발표 · 전광판 · 설정]
          예전에는 제목 / 뒤로 가기+도구 / 활동 안내가 세 줄로 쌓여, 학생
          카드가 시작되기까지 화면 위쪽을 크게 차지했습니다. 안내 문구는
          내용이 있을 때만 보여 주고(쓰는 곳은 설정 패널), 빈 자리를
          카드에 돌려줍니다. */}
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

          {/* 돌아가는 길은 제목 뒤에 — 활동 상세 화면과 같은 자리입니다 */}
          <button type="button" className="btn-ghost study-project-back" onClick={onBack}>
            ← 프로젝트 목록으로
          </button>

          {/* 제목 옆 — 학생은 상태 배지, 교사는 도구. 둘 다 제목과 같은 줄에
              놓이고, 남는 자리는 제목이 가져갑니다. */}
          <div className="study-project-head-badges">
            {/* 학생 — 바꿀 수 있는 게 없으니 지금 상태를 배지로 그대로 봅니다.
                (교사는 이 배지들이 '프로젝트 설정' 안으로 들어갑니다) */}
            {!isTeacher && (
              <>
                {!isNotice && (
                  <span className={`study-project-badge${isGroup ? " group" : ""}`}>
                    {isGroup ? "👥 모둠 활동" : "🧑‍🎓 개별 활동"}
                  </span>
                )}
                {activities.length > 0 && (
                  <span className="study-project-badge soft">활동 {activities.length}개</span>
                )}
                {!isNotice && (
                  <span className="study-project-badge soft">
                    {shared ? "함께 보기" : isGroup ? "자기 모둠만" : "나만 보기"}
                  </span>
                )}
                {locked && <span className="study-project-badge lock">🔒 보기 전용</span>}
              </>
            )}

            {/* 교사 — 이 줄에는 도구만. 상태 배지와 설정은 아래 패널로 */}
            {isTeacher && (
              <span className="study-project-live-tools">
                {!isNotice && (
                  <button
                    className="study-present-btn"
                    onClick={() => hasWrittenCard && setPresenting(true)}
                    disabled={!hasWrittenCard}
                    title={hasWrittenCard ? "발표 모드 — 학번 순으로 넘겨보기" : "아직 제출한 카드가 없어요"}
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
                  type="button"
                  className={`study-panel-toggle${settingsOpen ? " open" : ""}`}
                  onClick={() => setSettingsOpen((v) => !v)}
                  aria-expanded={settingsOpen}
                  title={settingsOpen ? "프로젝트 설정 접기" : "프로젝트 설정·현황 펼치기"}
                  aria-label={settingsOpen ? "프로젝트 설정 접기" : "프로젝트 설정 펼치기"}
                >
                  <IconSettings size={20} />
                </button>
              </span>
            )}
          </div>

        </div>
      </div>

      {/* 활동 안내 — 적어 둔 내용이 있을 때만. 비어 있으면 아무것도 그리지
          않아, 예전의 '활동 안내를 적어 주세요' 자리가 통째로 사라집니다
          (교사는 설정(⚙) 패널의 '활동 안내'에서 씁니다). */}
      {board.description && (
        <p className="study-project-view-desc">{board.description}</p>
      )}

      {/* ── 보드 설정 — 접었다 펴는 패널 ──
          예전엔 이 설정들이 머리말 한 줄에 모두 늘어서서 제목보다 길었습니다.
          지금은 '현황'(대시보드)과 '설정'을 이 안에 함께 담아, 필요할 때만
          펼쳐 보고 관리합니다. */}
      {isTeacher && settingsOpen && (
        <div className="study-board-panel">
          {/* 현황 — 활동 진척도 · 학생 진행률 · 출석 */}
          {stats && (
            <section className="study-board-section">
              <h3 className="study-board-section-title">현황</h3>

              <div className="study-board-stats">
                <div className="study-board-stat">
                  <span className="study-board-stat-label">시작한 학생</span>
                  <strong>{stats.started}</strong>
                  <small>/ {stats.total}명</small>
                </div>
                <div className="study-board-stat">
                  <span className="study-board-stat-label">모두 제출</span>
                  <strong>{stats.doneAll}</strong>
                  <small>/ {stats.total}명</small>
                </div>
                <div className="study-board-stat">
                  <span className="study-board-stat-label">평균 진행률</span>
                  <strong>{stats.avgPct}%</strong>
                  <small>{stats.avgFilled.toFixed(1)} / {activities.length}칸</small>
                </div>
                <div className="study-board-stat">
                  <span className="study-board-stat-label">오늘 출석</span>
                  {stats.attendanceKnown ? (
                    <>
                      <strong>{stats.presentToday}</strong>
                      <small>/ {stats.total}명</small>
                    </>
                  ) : (
                    <small className="study-board-stat-none">아직 확인 전</small>
                  )}
                </div>
              </div>

              {/* 활동 열기 — 곁텍스트 읽기의 '단계 열기'와 같은 모양·같은
                  생각입니다. 칩 하나가 학생이 보는 활동 하나라 '지금 어디까지
                  열렸나'가 한 줄에 들어옵니다. 예전에는 아래 목록의 줄마다
                  '편집/잠김' 알약을 눌러 여닫았는데, 여덟 줄을 훑어야 전체
                  상태가 보였습니다. 여닫는 일은 이 줄이 도맡고 아래 목록은
                  진척도만 보여 줍니다 — 같은 일을 두 자리에서 하면 어느 쪽이
                  진짜인지 헷갈립니다. */}
              {activities.length > 0 && (
                <div className="section-gate study-act-gate">
                  <span className="section-gate-label">
                    활동 열기 <b>{summaryOpenCount} / {activities.length}</b>
                  </span>
                  <div className="section-gate-chips">
                    {activities.map((act, i) => {
                      const chipLocked = isActivityLocked(board, i);
                      return (
                        <button
                          key={`gate-${i}`}
                          type="button"
                          className={`section-gate-chip${chipLocked ? "" : " open"}`}
                          onClick={() => toggleActivityLock(i, !chipLocked)}
                          title={`${i + 1}. ${act} — ${chipLocked ? "눌러서 열기" : "눌러서 잠그기"}`}
                          aria-pressed={!chipLocked}
                        >
                          <span className="section-gate-letter">{i + 1}</span>
                          <span className="section-gate-ko">{act}</span>
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    className="btn-ghost section-gate-all"
                    onClick={() =>
                      setActivityLocksUpTo(
                        summaryOpenCount === activities.length ? 1 : activities.length
                      )
                    }
                  >
                    {summaryOpenCount === activities.length ? "1번만 남기기" : "모두 열기"}
                  </button>
                </div>
              )}

              {/* 활동별 진척도 — 활동마다 몇 명이 냈는지 */}
              <ul className="study-board-acts">
                {activities.map((act, i) => {
                  const n = stats.perAct[i];
                  const pct = stats.total > 0 ? Math.round((n / stats.total) * 100) : 0;
                  return (
                    <li
                      key={i}
                      className={
                        "study-board-act" +
                        (dragActIdx === i ? " is-dragging" : "") +
                        (overActIdx === i && dragActIdx !== i
                          // 놓으면 그 줄의 번호를 가져갑니다 — 위로 끌면 그 줄
                          // 앞, 아래로 끌면 그 줄 뒤에 들어가므로 선도 그쪽에.
                          ? dragActIdx > i
                            ? " is-over is-over--up"
                            : " is-over is-over--down"
                          : "")
                      }
                      onDragOver={
                        dragActIdx == null
                          ? undefined
                          : (e) => { e.preventDefault(); setOverActIdx(i); }
                      }
                      onDrop={
                        dragActIdx == null
                          ? undefined
                          : (e) => { e.preventDefault(); moveActivity(dragActIdx, i); }
                      }
                    >
                      {/* 끌기 손잡이 — 줄 자체는 눌러서 열고 잠그는 버튼이라,
                          끌기까지 겹치면 잠그려던 손이 줄을 옮겨 버립니다.
                          마우스가 없어도 옮길 수 있게 ↑↓ 키도 받습니다. */}
                      <button
                        type="button"
                        className="study-board-act-drag"
                        draggable
                        onDragStart={(e) => {
                          setDragActIdx(i);
                          e.dataTransfer.effectAllowed = "move";
                          // 파이어폭스는 데이터가 없으면 끌기를 시작하지 않습니다
                          e.dataTransfer.setData("text/plain", String(i));
                        }}
                        onDragEnd={() => { setDragActIdx(null); setOverActIdx(null); }}
                        onKeyDown={(e) => {
                          if (e.key === "ArrowUp") { e.preventDefault(); moveActivity(i, i - 1); }
                          if (e.key === "ArrowDown") { e.preventDefault(); moveActivity(i, i + 1); }
                        }}
                        aria-label={`활동 ${i + 1} 순서 바꾸기`}
                        title="끌어서 순서 바꾸기 (↑↓ 키로도 옮길 수 있어요)"
                      >
                        ⠿
                      </button>
                      {/* 여닫기는 위 '활동 열기' 줄이 도맡습니다 — 여기서는
                          이름과 진척도만 읽습니다(단추가 아니라 글입니다). */}
                      <span className="study-board-act-toggle">
                        <span className="study-board-act-no">활동 {i + 1}</span>
                        <span className="study-board-act-name" title={act}>{act}</span>
                      </span>
                      <span className="study-board-act-bar">
                        <span
                          className="study-board-act-fill"
                          style={{ width: `${pct}%` }}
                        />
                      </span>
                      <span className="study-board-act-count">
                        {n}/{stats.total}
                      </span>
                      <button
                        type="button"
                        className="study-board-act-wall"
                        onClick={() => setWallIndex(i)}
                        disabled={n === 0}
                        title={
                          n === 0
                            ? "아직 이 활동을 쓴 학생이 없어요"
                            : "이 활동의 답을 모두 한 화면에 모아 봅니다"
                        }
                      >
                        모아보기
                      </button>
                    </li>
                  );
                })}
              </ul>

              {actMoveError && (
                <p className="form-error" role="alert">{actMoveError}</p>
              )}
            </section>
          )}

          {/* 설정 — 공개 범위 · 편집 상태 · 관리 */}
          <section className="study-board-section">
            <h3 className="study-board-section-title">설정</h3>

            <div className="study-board-rows">
              {/* 유형 — 바꾸는 값이 아니라 '지금 이런 프로젝트'라는 표시.
                  공개 범위·편집 상태는 바로 아래 버튼이 색으로 보여 주므로
                  여기서 배지로 되풀이하지 않습니다. */}
              <div className="study-board-row">
                <span className="study-board-row-label">유형</span>
                <span className="study-board-row-actions">
                  {!isNotice && (
                    <span className={`study-project-badge${isGroup ? " group" : ""}`}>
                      {isGroup ? "👥 모둠 활동" : "🧑‍🎓 개별 활동"}
                    </span>
                  )}
                  {activities.length > 0 && (
                    <span className="study-project-badge soft">
                      활동 {summaryOpenCount}/{activities.length}개 열림
                    </span>
                  )}
                </span>
              </div>

              {/* 활동 안내 — 머리말에서 자리를 빼는 대신 쓰는 곳을 여기로
                  옮겼습니다. 포커스를 떼면 저장됩니다(제목과 같은 방식). */}
              <div className="study-board-row study-board-row--desc">
                <span className="study-board-row-label">활동 안내</span>
                <textarea
                  className="study-board-desc-field"
                  value={descDraft}
                  onChange={(e) => setDescDraft(e.target.value)}
                  onBlur={commitDesc}
                  maxLength={200}
                  placeholder="학생에게 보일 안내를 적어 주세요. (선택)"
                  aria-label="활동 안내"
                />
              </div>

              {!isNotice && (
                <div className="study-board-row">
                  <span className="study-board-row-label">공개 범위</span>
                  <span className="study-seg" role="group" aria-label="공개 범위">
                    <button
                      type="button"
                      className={`study-seg-btn${!shared ? " on lock" : ""}`}
                      aria-pressed={!shared}
                      onClick={() => shared && updateStudyBoard(board.id, { viewMode: "private" })}
                      title={
                        isGroup
                          ? "각 모둠은 자기 카드만 봅니다"
                          : "학생은 자기 카드만 열 수 있습니다"
                      }
                    >
                      <IconLock size={14} /> {isGroup ? "자기 모둠만" : "나만 보기"}
                    </button>
                    <button
                      type="button"
                      className={`study-seg-btn${shared ? " on" : ""}`}
                      aria-pressed={shared}
                      onClick={() => !shared && updateStudyBoard(board.id, { viewMode: "shared" })}
                      title={
                        isGroup
                          ? "다른 모둠 카드도 읽기 전용으로 공개합니다"
                          : "친구 카드도 읽기 전용으로 공개합니다"
                      }
                    >
                      <IconPeople size={14} /> 함께 보기
                    </button>
                  </span>
                </div>
              )}

              <div className="study-board-row">
                <span className="study-board-row-label">편집 상태</span>
                <span className="study-seg" role="group" aria-label="편집 상태">
                  <button
                    type="button"
                    className={`study-seg-btn${!locked ? " on" : ""}`}
                    aria-pressed={!locked}
                    onClick={() => locked && updateStudyBoard(board.id, { editMode: "open" })}
                    title="학생이 카드를 쓰고 고칠 수 있습니다"
                  >
                    <IconPen size={14} /> 편집 가능
                  </button>
                  <button
                    type="button"
                    className={`study-seg-btn${locked ? " on lock" : ""}`}
                    aria-pressed={locked}
                    onClick={() => !locked && updateStudyBoard(board.id, { editMode: "locked" })}
                    title="학생은 읽기만 할 수 있습니다"
                  >
                    <IconLock size={14} /> 보기 전용
                  </button>
                </span>
              </div>

              <div className="study-board-row">
                <span className="study-board-row-label">관리</span>
                <span className="study-board-row-actions">
                  {isGroup && (
                    <button
                      type="button"
                      className="study-chip"
                      onClick={() => setComposing(true)}
                      title="모둠 구성 — 기본 모둠을 쓰거나 이 프로젝트에서만 다르게 구성"
                    >
                      <IconPeople size={15} /> 모둠 구성
                    </button>
                  )}
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
                        {/* 곧바로 지우지 않고 휴지통으로 갑니다 — 되묻는 자리에서
                            그 사실을 알려야 '되돌릴 수 없다'고 오해하지 않습니다. */}
                        <span>휴지통으로 보냅니다(되돌릴 수 있어요).</span>
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
                </span>
              </div>
            </div>
          </section>
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

      {presenting && hasWrittenCard && presentCards.length > 0 && (
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
          classBoards={classBoards}
          attendanceRecords={attendanceRecords}
          groupAssignment={baseGroupAssignment}
          // 전광판에서 바로 그 학생 카드로 — 닫고 자리 상세를 엽니다
          onOpenStudent={(uid) => {
            const seat = (sortedSeats ?? []).find((s) => s.uid === uid);
            setProgressOpen(false);
            if (seat) openSeat(seat);
          }}
          onClose={() => setProgressOpen(false)}
        />
      )}

      {wallIndex !== null && (
        <StudyActivityWall
          classId={board.classId}
          user={user}
          label={`활동 ${wallIndex + 1}`}
          title={activities[wallIndex] ?? `활동 ${wallIndex + 1}`}
          castKey={`act:${wallIndex}`}
          rows={wallRows}
          onAward={onAward}
          onClose={() => setWallIndex(null)}
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
              그대로 옮겨집니다. 활동은 <strong>모두 잠긴 채로</strong> 도착하니
              수업 중에 하나씩 열어 주세요.
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
      }${seat.absent ? " absent" : ""}${clickable ? " clickable" : ""}`}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? onClick : undefined}
      onKeyDown={clickable ? (e) => e.key === "Enter" && onClick() : undefined}
      title={
        seat.absent
          ? `${seat.name} — 오늘 결석이라 아직 작성 전이에요`
          : seat.locked
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
            {/* 숫자만 — StudyCard와 같은 이유(활동 수만큼 되풀이되는 자리) */}
            {summary.segments.map((on, i) => (
              <div
                key={i}
                className="study-card-progress-col"
                title={`활동 ${i + 1} — ${summary.lengths[i]}자${on ? " · 제출 인정" : ""}`}
              >
                <span className={`study-card-progress-seg${on ? " on" : ""}`} />
                <span className="study-card-progress-chars">{summary.lengths[i]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="study-seat-empty-note">
        {seat.locked
          ? "🔒 본인과 선생님만 볼 수 있어요"
          : canStart
          ? "＋ 활동 시작하기"
          : seat.absent
          ? "오늘 결석"
          : "아직 작성 전"}
      </p>
    </article>
  );
}
