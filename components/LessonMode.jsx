"use client";

// =============================================================
// 수업하기 — 교사용 수업 페이지
// -------------------------------------------------------------
// 위아래로 스크롤되는 '페이지'입니다. 슬라이드 카드와 해설 카드 두 장이
// 2열로 놓여 있고, 그 아래(수업 중)엔 왼쪽에 활동 관리, 오른쪽에 자리표를
// 나란히 둡니다. 앞으로 수업 관련 기능도 이 아래에 섹션으로 계속 덧붙일
// 수 있습니다.
//
// 같은 화면을 두 가지 모드로 씁니다.
//  · mode="edit"  — 수업 전, 장마다 해설을 적어 두는 화면(자동 저장)
//  · mode="teach" — 수업 중. 넘길 때마다 그 반 학생 화면이 같은 장으로
//                   강제 전환됩니다(학생에겐 슬라이드만, 해설은 교사 전용).
//
// [스크롤과 학생 화면은 무관합니다]
// 방송은 '지금 몇 번째 장인지'가 바뀔 때만 씁니다(아래 useEffect의 의존성).
// 교사가 페이지를 아무리 위아래로 굴려도 그 값은 변하지 않으므로, 학생
// 화면은 교사가 슬라이드를 넘기기 전까지 계속 같은 장에 머뭅니다.
//
// 이전 / 다음 / 종료 — 종료하면 방송이 꺼져 학생 화면도 원래대로 돌아갑니다.
// =============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import {
  startBroadcast,
  stopBroadcast,
  duplicateStudyBoard,
  startStudyTemplateInClass,
  createStudyProjectInClass,
  syncTemplateActivities,
  updateStudyBoard,
  updateStudyCard,
  subscribeStudyCards,
  subscribePresence,
  subscribeQuestionSignals,
  subscribeStudySeatLayout,
  saveStudySeatLayout,
  subscribeStudyGroupAssignment,
  subscribeClass,
  setClassTask,
  classTaskOf,
  fetchBookActivities,
  updateBookActivity,
  dailySeatLayoutId,
  todayDateKey,
  PRESENCE_STALE_MS,
  toDate,
} from "@/lib/store";
import { stripHtml, htmlHasImage } from "@/lib/html";
import {
  buildActivityTemplate,
  nextActivityLocks,
  isActivityLocked,
  boardMaterials,
  MATERIAL_ACCEPT,
  isMaterialImage,
  materialSizeLimit,
  isTeacherAuthoredCard,
} from "@/lib/activities";
import { isSectionLocked, sectionLocksWith } from "@/lib/paratext";
import {
  bookPushSteps,
  isPushableBookActivity,
  bookKindLabel,
} from "@/lib/bookPush";
import { uploadImage, uploadFile } from "@/lib/storageUpload";
import { formatFileSize } from "@/lib/image";
import { getCurrentUser } from "@/lib/user";
import { findSameNameProject, loadSameNameProject, projectNameKey } from "@/lib/projectNames";
import ProjectNameDupModal from "./ProjectNameDupModal";
import AttendanceBoard from "./AttendanceBoard";
import StudyProgressBoard, { cardProgress } from "./StudyProgressBoard";
import LessonSeatPanel from "./LessonSeatPanel";
import LessonAnswerPanel from "./LessonAnswerPanel";
// 수업 화면이 상단바를 덮으므로, 상단바의 공지·알림을 여기에도 둡니다.
import ClassNoticeButton from "./ClassNoticeButton";
import NotificationBell from "./NotificationBell";
import { isFirebaseConfigured } from "@/lib/firebase";
import UploadProgress from "./UploadProgress";

export default function LessonMode({
  lesson,
  mode = "teach",
  classId = null,
  className = "",
  boards = [],          // 수업 준비: 이 반의 공부방 보드 목록(연결 대상)
  otherBoards = [],     // 수업 준비: 다른 반에 만들어 둔 프로젝트(가져오기 대상)
  templates = [],       // 수업 준비: 내 프로젝트 원본(가져오기 목록의 맨 앞)
                        //   [{ id, title, className, activities[] }]
  roster = [],          // 수업 중: 이 반 학생 명단(참여 전광판 자리 배치용)
  attendanceRecords = [],
  onAward,              // 수업 중: 참여 전광판 카드에서 과일 주기(교사만)
  onSaveNote,
  onSaveActivities,
  onSaveBoardId,        // 수업 준비: 연결한 보드 id를 수업 자료에 저장
  onStart,              // 수업 준비: '수업 시작하기' — 있어야 버튼이 보임
  onEdit,               // 수업 중: 프레젠테이션이 안 될 때도 수업 자료를 편집하러 감
  onClose,
}) {
  const slides = lesson.slides ?? [];
  const total = slides.length;
  const [idx, setIdx] = useState(0);
  const [note, setNote] = useState(slides[0]?.note ?? "");
  // 해설 제목 — 예전 자료에는 이 필드가 없습니다. 그때는 note 하나에 다
  // 적었으므로, 없으면 빈 제목으로 두고 본문은 그대로 둡니다(내용 손실 없음).
  const [noteTitle, setNoteTitle] = useState(slides[0]?.noteTitle ?? "");
  const [saved, setSaved] = useState(false);
  // 프레젠테이션 중일 때만 학생 화면이 전환됩니다(수업하기로 들어온 것만으론 안 바뀜)
  const [presenting, setPresenting] = useState(false);
  // 일시정지 — 방송만 잠깐 끄고 발표 모드 자체는 유지합니다.
  // '종료'와 다른 점이 요점입니다: 종료하면 이 화면을 나갔다 들어오는 흐름이
  // 되어 몇 번째 장을 보던 중이었는지 매번 처음부터 찾아야 했습니다.
  // 일시정지는 idx를 그대로 둔 채 학생 화면만 풀어 줍니다.
  const [paused, setPaused] = useState(false);
  // 해설을 학생 슬라이드 위에 잠깐 띄워 두었는지 — 이 장에서만 유효합니다.
  // 해설은 그 장에 딸린 이야기라, 장을 넘기면 저절로 내려갑니다(아래 참조).
  const [notePushed, setNotePushed] = useState(false);
  const [acts, setActs] = useState((lesson.activities ?? []).join("\n"));
  const editing = mode === "edit";

  // ── 공부방 보드 연동 (수업 준비에서만) ──
  // 수업 자료는 반이 아니라 '만든 선생님'에게 딸려 있어(lessons.ownerId) 같은
  // 자료 한 장을 여러 반에서 씁니다. 그래서 연결한 프로젝트도 **반마다 따로**
  // 기억합니다 — boardIds = { 반id: 프로젝트id }.
  //   예전에는 boardId 한 칸뿐이었습니다. B반 프로젝트에 연결해 두면 C반에서는
  //   그 id가 이 반 목록(boards는 이미 반으로 걸러져 옵니다)에 없어 board가
  //   null이 되고 '활동 열기'가 통째로 사라졌습니다. 게다가 boardId 자체는
  //   값이 있어 카드 구독은 그대로 돌아, '공부중'이 남의 반 카드를 이 반
  //   명단으로 세느라 0명이 됐습니다.
  const boardIdMap = lesson.boardIds ?? null;
  // 옛 자료 호환 — boardIds가 생기기 전의 boardId에는 어느 반 것인지 적혀 있지
  // 않으므로 '이 반의 프로젝트일 때만' 씁니다. 그리고 이 반에서 한 번이라도
  // 골랐으면('연결 안 함'으로 비운 것 포함) 그 선택이 이기도록, 값이 아니라
  // **키가 있는지**로 판정합니다(비운 것을 옛 값으로 되살리면 안 되므로).
  const boardId =
    classId && boardIdMap && Object.prototype.hasOwnProperty.call(boardIdMap, classId)
      ? boardIdMap[classId] || null
      : boards.some((b) => b.id === lesson.boardId)
        ? lesson.boardId
        : null;
  const board = boards.find((b) => b.id === boardId) ?? null;
  // 다른 반에는 연결해 두었는데 이 반만 비어 있는가 — 수업 중 안내에 씁니다.
  const linkedElsewhere =
    !board &&
    (!!lesson.boardId || Object.values(boardIdMap ?? {}).some(Boolean));
  const [boardCards, setBoardCards] = useState([]);
  const [newAct, setNewAct] = useState("");
  const actInputRef = useRef(null); // 한글 조합 중 글자까지 읽기 위한 입력칸 참조
  // 이름을 고치는 중인 활동 — { i, name } | null
  const [editAct, setEditAct] = useState(null);
  const editActInputRef = useRef(null);
  // 순서 바꾸기(끌어 놓기) — 집어 든 줄과 지금 올려 둔 줄
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);
  const [actBusy, setActBusy] = useState(false);
  const [actError, setActError] = useState("");
  const [makingBoard, setMakingBoard] = useState(false);
  // '+ 수업 보드 추가'는 누르자마자 만들지 않고 이름 입력창을 먼저 엽니다.
  // (예전엔 클릭 즉시 수업 자료 제목으로 빈 보드를 만들어 버려서, 원치
  // 않으면 취소할 방법 없이 빈 보드가 그대로 남았습니다 — 닫았다 다시
  // 열어도 이미 만들어진 보드라 계속 보였습니다)
  const [addingBoard, setAddingBoard] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  // '수업 프로젝트' 고르개의 둘째 묶음(이 반으로 가져올 프로젝트)에서 고른 것 —
  // `t:<원본 id>` 또는 `b:<프로젝트 id>`. 고르는 순간 만들지 않고 아래 확인 줄의
  // '가져오기'를 눌러야 씁니다(아래 importPick 설명).
  const [importFrom, setImportFrom] = useState("");
  const newBoardInputRef = useRef(null);
  // 이름이 같은 프로젝트가 이미 있을 때의 확인 — { name, id, acts } | null.
  // 이름 칸이 수업 자료 제목으로 미리 채워져 있어, 연결하려던 손이 '만들기'로
  // 미끄러지면 같은 이름의 빈 프로젝트가 하나 더 생깁니다. 목록에서는 제목만
  // 보이니 둘을 구분할 수 없고, 빈 쪽에 연결되면 '활동이 사라진' 것처럼
  // 보입니다(학생은 원래 프로젝트를 계속 쓰므로 그쪽엔 그대로 보임).
  const [dupBoard, setDupBoard] = useState(null);
  const boardActs = board?.activities ?? [];

  // 학습 자료 — 연결한 프로젝트 전체에서 쓰는 파일(올리는 중 진행률·오류)
  const [fileBusy, setFileBusy] = useState(null); // 업로드 진행률 0~1 | null
  const [fileError, setFileError] = useState("");

  // ── 공부중 전광판 (수업 중) ──
  // 발표 중에는 학생 화면이 슬라이드로 덮여 활동을 쓸 수 없으므로, 이 도구는
  // 발표 여부와 상관없이 보드만 연결돼 있으면 쓸 수 있어야 합니다.
  const [progressOpen, setProgressOpen] = useState(false);
  const [lockBusy, setLockBusy] = useState(false);
  const [seatLayout, setSeatLayout] = useState(null);
  const [dailySeatLayout, setDailySeatLayout] = useState(null);
  const [groupAssignment, setGroupAssignment] = useState(null);
  const todayLayoutId = dailySeatLayoutId(todayDateKey());

  useEffect(() => {
    if (!classId) { setSeatLayout(null); return; }
    return subscribeStudySeatLayout(classId, "default", setSeatLayout);
  }, [classId]);

  useEffect(() => {
    if (!classId || editing) { setDailySeatLayout(null); return; }
    return subscribeStudySeatLayout(classId, todayLayoutId, setDailySeatLayout);
  }, [classId, editing, todayLayoutId]);

  useEffect(() => {
    if (!classId) { setGroupAssignment(null); return; }
    return subscribeStudyGroupAssignment(classId, setGroupAssignment);
  }, [classId]);

  // ── 활동 내보내기 ──────────────────────────────────────────
  // 배포한 활동은 반 문서의 `task` 한 필드에 적힙니다(`lib/store.js` 설명
  // 참고 — 방송 문서에 두면 일시정지마다 사라집니다). 여기서는 '지금 무엇을
  // 내보내는 중인가'를 보여 주려고 그 문서 **하나**를 구독합니다.
  const [cls, setCls] = useState(null);
  useEffect(() => {
    if (!classId) { setCls(null); return; }
    return subscribeClass(classId, setCls);
  }, [classId]);
  const task = classTaskOf(cls);
  const taskActIndex =
    task?.kind === "study" && task.boardId === board?.id ? task.actIndex : null;
  const [pushBusy, setPushBusy] = useState(false);
  // 고른 독서 활동 — 단계 칩을 그 활동 것으로 채웁니다. 아직 아무것도 안
  // 골랐으면 **지금 내보내는 중인 활동**을 봅니다(수업 모드를 다시 열어도
  // 이어서 다음 단계를 누를 수 있게).
  const [pickBook, setPickBook] = useState(null);

  // 반의 독서 활동 목록 — **한 번만** 읽습니다(구독 아님). 수업 모드가 떠
  // 있는 내내 연결을 살려 둘 만한 자리가 아닙니다. 잠긴 활동은 아예 안
  // 세웁니다 — 보내 봐야 규칙이 학생 저장을 거부합니다. 지운 것도 뺍니다.
  // 지금 보낼 수 있는 것은 곁텍스트 읽기와 RAFT 글쓰기입니다(닿소리는 판이
  // 열네 칸 격자라 서랍 폭에 안 들어갑니다).
  const [bookActs, setBookActs] = useState(null); // null = 아직 안 읽음
  useEffect(() => {
    if (!classId) { setBookActs([]); return undefined; }
    let alive = true;
    fetchBookActivities(classId)
      .then((list) => {
        if (!alive) return;
        setBookActs(
          list.filter(isPushableBookActivity)
        );
      })
      .catch(() => { if (alive) setBookActs([]); });
    return () => { alive = false; };
  }, [classId]);

  const bookPickId = pickBook ?? (task?.kind === "book" ? task.activityId : null);
  const pickedBook = bookPickId
    ? (bookActs ?? []).find((a) => a.id === bookPickId) ?? null
    : null;
  // 고른 활동에서 보낼 수 있는 칸들 — 곁텍스트는 여덟 단계, RAFT는 네 요소와
  // 글쓰기. 줄 하나에 칩으로 늘어놓습니다.
  const pickedSteps = bookPushSteps(pickedBook);
  // 지금 내보내는 중인 책방 단계 — 머리줄에 이름을 적는 데 씁니다
  const taskBook =
    task?.kind === "book"
      ? (() => {
          const a = (bookActs ?? []).find((x) => x.id === task.activityId) ?? null;
          return {
            activity: a,
            step: bookPushSteps(a).find((s) => s.key === task.sectionKey) ?? null,
          };
        })()
      : null;

  // 내보내기는 **열기까지 함께** 합니다 — 잠긴 활동을 내보내면 학생 화면에
  // 칸만 뜨고 못 쓰는데, 교사가 그 단추를 누르는 순간의 뜻은 '지금 이걸
  // 쓰세요'입니다. 자물쇠 줄은 그대로 남아 따로 잠글 수 있습니다.
  async function pushActivity(i) {
    if (!board || pushBusy) return;
    setPushBusy(true);
    setActError("");
    try {
      if (isActivityLocked(board, i)) await toggleActLock(i, false);
      await setClassTask(classId, { kind: "study", boardId: board.id, actIndex: i });
    } catch (e) {
      setActError(`활동을 내보내지 못했어요: ${e?.message ?? "알 수 없는 오류"}`);
    } finally {
      setPushBusy(false);
    }
  }

  // 책방 — 독서 활동의 단계 하나를 보냅니다. 잠긴 단계는 **함께 엽니다**
  // (공부방 활동과 같은 이유 — 누르는 순간의 뜻이 '지금 이걸 쓰세요'입니다).
  // 활동 전체 잠금은 다릅니다: 그건 '수업 끝'이라 규칙이 저장을 막으므로
  // 위 목록에서 아예 빼 두었습니다.
  async function pushBookStep(activity, sectionKey) {
    if (!activity || pushBusy) return;
    setPushBusy(true);
    setActError("");
    try {
      // 단계 잠금은 곁텍스트에만 있습니다. RAFT는 네 칸 어느 것도 잠기지
      // 않아 열 것이 없고, 잠금 맵을 써 넣으면 없던 개념이 문서에 생깁니다.
      if (activity.type === "paratext" && isSectionLocked(activity, sectionKey)) {
        const next = sectionLocksWith(activity, sectionKey, false);
        await updateBookActivity(activity.id, { sectionLocks: next });
        // 방금 연 것을 손에 들고 있어야 이어서 보낼 때 또 열지 않습니다
        // (목록은 한 번 읽고 마는 값이라 서버가 다시 알려 주지 않습니다).
        setBookActs((prev) =>
          (prev ?? []).map((a) => (a.id === activity.id ? { ...a, sectionLocks: next } : a))
        );
      }
      await setClassTask(classId, { kind: "book", activityId: activity.id, sectionKey });
    } catch (e) {
      setActError(`독서 활동을 내보내지 못했어요: ${e?.message ?? "알 수 없는 오류"}`);
    } finally {
      setPushBusy(false);
    }
  }

  async function stopPush() {
    if (pushBusy) return;
    setPushBusy(true);
    try {
      await setClassTask(classId, null);
    } catch (e) {
      setActError(`내보내기를 멈추지 못했어요: ${e?.message ?? "알 수 없는 오류"}`);
    } finally {
      setPushBusy(false);
    }
  }

  // 활동 하나의 잠금을 켜고 끕니다. 수업 모드에서 부르는 곳은 내보내기 하나
  // 뿐입니다(잠긴 활동을 보내면서 여는 자리) — 칩에 있는 자물쇠는 지금 상태를
  // 말하는 그림일 뿐, 누르는 자리가 아닙니다. 다시 잠그는 일은 수업이 다 끝난
  // 뒤 활동 설정에서 합니다.
  async function toggleActLock(i, locked) {
    if (!board || lockBusy) return;
    setLockBusy(true);
    setActError("");
    try {
      const next = boardActs.map((_, j) =>
        j === i ? locked : board.activityLocks?.[j] === true
      );
      await updateStudyBoard(board.id, { activityLocks: next });
    } catch (e) {
      setActError(`활동 잠금을 바꾸지 못했어요: ${e?.message ?? "알 수 없는 오류"}`);
    } finally {
      setLockBusy(false);
    }
  }

  // ── 손들기 ──
  // 자리표(LessonSeatPanel)가 갖고 있던 구독을 여기로 올렸습니다. 머리말의
  // 손들기 표시와 자리표가 같은 값을 봐야 하는데, 각자 구독하면 같은
  // 컬렉션에 리스너가 둘이 됩니다. 자리표는 이 화면에서만 쓰므로 위로
  // 올려도 다른 데 영향이 없습니다.
  const [raisedUids, setRaisedUids] = useState(() => new Set());
  useEffect(() => {
    if (!classId) { setRaisedUids(new Set()); return; }
    return subscribeQuestionSignals(classId, (list) =>
      setRaisedUids(new Set(list.map((s) => s.uid).filter(Boolean)))
    );
  }, [classId]);
  const raisedCount = roster.filter((s) => raisedUids.has(s.uid)).length;
  // 자리표 펼침도 여기서 쥡니다 — 머리말의 손들기를 누르면 자리표가 열려야
  // 누가 들었는지 바로 보입니다. 보고 있는 탭도 함께 쥡니다: 활동보기를 보던
  // 중에 손들기를 누르면 **자리표 탭으로 돌아와야** 합니다(안 그러면 손들기를
  // 눌렀는데 학생 답이 떠 있습니다).
  const [seatOpen, setSeatOpen] = useState(false);
  const [seatView, setSeatView] = useState("seat");

  // 알림함은 내 uid로 구독합니다. 로그인 캐시는 인증이 풀린 뒤에 채워지므로
  // 그릴 때 바로 읽지 않고 마운트 뒤에 한 번 읽습니다(서버에서 그릴 때와
  // 처음 그릴 때가 어긋나지 않게).
  const [me, setMe] = useState(null);
  useEffect(() => { setMe(getCurrentUser()); }, []);

  // ── 참여 전광판 (수업 중, 발표하는 동안만) ──
  const [attendOpen, setAttendOpen] = useState(false);
  const [attendFocusRequest, setAttendFocusRequest] = useState(0);
  // 실제로 방송이 나가는 상태 — 발표 중이면서 일시정지가 아닐 때뿐입니다.
  // 방송·학생 상태를 보는 자리는 모두 이 값을 씁니다(presenting이 아니라).
  const live = presenting && !paused;
  const [presence, setPresence] = useState([]);
  const [presenceNow, setPresenceNow] = useState(() => Date.now());
  useEffect(() => {
    if (editing || !live || !classId) { setPresence([]); return; }
    return subscribePresence(classId, setPresence);
  }, [editing, live, classId]);
  // 학생 신호가 끊기면 스냅샷이 더 오지 않으므로, 시간만 흘러도 숫자가
  // 갱신되도록 주기적으로 다시 셉니다.
  useEffect(() => {
    if (editing || !live) return;
    const t = setInterval(() => setPresenceNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, [editing, live]);

  // 헤더 버튼에 보여 줄 '보는 중' 인원
  const watchingCount = roster.reduce((n, s) => {
    const p = presence.find((x) => x.uid === s.uid);
    if (!p || !p.visible) return n;
    const t = p.updatedAt ? toDate(p.updatedAt).getTime() : 0;
    if (t && presenceNow - t > PRESENCE_STALE_MS) return n;
    return n + 1;
  }, 0);

  // 헤더 버튼에 보여 줄 '활동을 하나라도 쓴' 인원
  // 모둠 보드는 카드 한 장을 모둠원 여럿이 공유하므로 memberUids로 찾음
  const isGroupBoard = board?.activityType === "group";
  const studyingCount = roster.reduce((n, s) => {
    const card = boardCards.find((c) =>
      isGroupBoard ? c.memberUids?.includes(s.uid) : c.authorId === s.uid
    );
    return cardProgress(card, boardActs).some(Boolean) ? n + 1 : n;
  }, 0);

  const cur = slides[Math.min(idx, total - 1)];

  // 연결한 보드의 학생 카드 —
  //  · 수업 준비: 이미 학생이 쓴 내용이 있으면 활동을 바꾸지 않도록 확인
  //  · 수업 중  : '공부중' 전광판에 활동별 작성 현황을 그리는 데 사용
  useEffect(() => {
    if (!boardId) { setBoardCards([]); return; }
    return subscribeStudyCards(boardId, setBoardCards);
  }, [boardId]);

  // 활동이 늘거나 줄면(또는 프로젝트를 바꾸면) 고치던 창을 닫습니다 —
  // 자리 번호로 기억하고 있어, 앞의 활동이 지워지면 엉뚱한 줄을 고치게 됩니다.
  const actsLen = boardActs.length;
  useEffect(() => { setEditAct(null); }, [boardId, actsLen]);

  // 활동 목록을 프로젝트에 저장하고, 학생 카드의 작성 틀도 함께 맞춥니다.
  // locksOverride — 잠금 배열을 직접 지정합니다(이름만 고치는 경우).
  // nextActivityLocks는 '이름이 같은 활동'을 찾아 잠금을 이어받는데, 이름을
  // 고치면 짝을 못 찾아 새 활동으로 보고 다시 잠가 버립니다. 자리는 그대로고
  // 이름만 바뀐 것이므로, 그때는 지금 잠금을 자리 그대로 넘깁니다.
  // 저장에 성공하면 true — 부르는 쪽이 실패했을 때 입력을 지우지 않게 합니다.
  async function saveBoardActs(next, locksOverride = null) {
    if (!board) return false;
    setActError("");
    // 교사 카드(안내·예시)는 빼고 봅니다. 예전에는 "teacher_" 접두만 봤는데
    // 그건 데모 모드의 uid 규칙이라 **실서비스 교사 uid는 안 걸립니다** —
    // 프로젝트를 만들 때 깔리는 안내 카드의 본문이 활동 이름을 담고 있어
    // '학생이 이미 쓴 내용'으로 잡혔고, 그 결과 아무도 안 썼는데도 교사가
    // 활동 목록을 영영 못 고쳤습니다.
    const studentCards = boardCards.filter((c) => !isTeacherAuthoredCard(c));
    // 학생이 이미 쓴 내용을 활동 틀로 덮어쓰면 안 됩니다. 텍스트 없이
    // 붙여넣은 이미지만 있는 카드도 '이미 쓴 내용'입니다 — stripHtml만 보면
    // <img>만 있는 카드가 빈 카드로 보여, 그 이미지를 덮어써 버릴 뻔했습니다.
    if (studentCards.some((c) => {
      const html = c.content ?? "";
      return stripHtml(html).trim().length > 0 || htmlHasImage(html);
    })) {
      setActError("학생이 이미 작성한 내용이 있어 활동을 바꿀 수 없어요. 공부방에서 카드 내용을 비운 뒤 다시 시도해 주세요.");
      return false;
    }
    setActBusy(true);
    try {
      // 새로 추가한 활동은 잠긴 채로 시작합니다 — 수업 중 '공부중' 전광판에서
      // 하나씩 열어 주는 흐름이라, 미리 만들어 둔 활동이 곧바로 열리면 안 됩니다.
      await updateStudyBoard(board.id, {
        activities: next,
        activityLocks:
          locksOverride ??
          nextActivityLocks(boardActs, board.activityLocks ?? [], next),
      });
      // 원본에서 불러온 프로젝트면 원본의 활동 목록도 맞춥니다 — 다른 반
      // 복사본은 그대로(lib/store.js의 syncTemplateActivities).
      await syncTemplateActivities(board, next);
      if (next.length > 0) {
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
      }
      return true;
    } catch (e) {
      setActError(`활동을 저장하지 못했어요: ${e?.message ?? "알 수 없는 오류"}`);
      return false;
    } finally {
      setActBusy(false);
    }
  }

  async function handleAddAct(e) {
    e.preventDefault();
    // 한글은 마지막 글자가 아직 '조합 중'일 수 있습니다. 조합 중 글자는
    // React state(newAct)에 늦게 반영돼, 버튼을 누른 시점에는 끝 글자가
    // 빠진 값이 들어가곤 했습니다("마무리하기" → "마무").
    // 입력칸의 실제 값에는 조합 중 글자까지 들어 있으므로 그쪽을 씁니다.
    const name = (actInputRef.current?.value ?? newAct).trim();
    if (!name || !board || actBusy) return;
    const ok = await saveBoardActs([...boardActs, name]);
    if (!ok) return; // 실패하면 쓴 글자를 지우지 않습니다
    setNewAct("");
  }

  // ── '수업 프로젝트' 고르개의 두 묶음 ─────────────────────────
  // 고르개 하나에 묶음(optgroup)이 둘입니다.
  //   · **이 반의 프로젝트** — 이 반에 이미 있는 것. 고르면 곧바로 이 수업에
  //     연결합니다(지금까지와 같습니다).
  //   · **이 반으로 가져올 프로젝트** — 아직 이 반에 없는 내 원본과, 원본 없는
  //     다른 반의 옛 프로젝트. 고르면 이 반에 하나 열어 연결합니다.
  // 한때 둘째 묶음이 '프로젝트 가져오기' 단추 뒤의 따로 선 고르개였는데, 두
  // 목록이 같은 자리에 번갈아 서서 '무엇이 어디에 있나'를 두 번 찾아야 했고,
  // 원본의 복사본이 이미 이 반에 있으면 두 목록에 같은 이름이 함께 섰습니다.
  //
  // 원본의 복사본이 이 반에 이미 있으면 그 원본은 둘째 묶음에 세우지 않습니다 —
  // 첫째 묶음의 그 프로젝트가 곧 그것이고, 두 번 열면 같은 이름이 이 반에 둘이
  // 되어 원본을 둔 까닭이 도로 무너집니다.
  const templateInstance = useMemo(() => {
    const m = new Map();
    for (const b of boards) {
      if (b.templateId && !m.has(b.templateId)) m.set(b.templateId, b);
    }
    return m;
  }, [boards]);

  // 그 뒤는 **원본 없는** 옛 프로젝트 — 이 구조가 생기기 전에 만든 것들입니다
  // (자료를 옮기지 않았습니다). 원본과 **같은 모양으로 이름만** 한 줄씩 섭니다.
  // 한때 '원본 없는 프로젝트 · 반이름'으로 반별로 묶었는데, 앞으로는 다
  // 원본으로 만들어지므로 선생님에게 그 구분은 쓸모가 없었고, 같은 프로젝트가
  // 반 수만큼 되풀이되는 것도 그대로였습니다.
  //   · 원본이 살아 있는 복사본은 뺍니다 — 원본 줄이 이미 그것을 대신합니다.
  //   · **같은 이름은 한 줄로 접습니다.** 반마다 복제해 쓰던 것이라 이름이
  //     같으면 대개 같은 프로젝트입니다. 그중 활동이 가장 많은 것(같으면 가장
  //     최근 것)을 가져옵니다 — 학생 카드는 따라오지 않으므로 어느 반 것을
  //     고르든 가져오는 것은 활동 목록과 안내뿐입니다.
  //   · 원본과 이름이 같은 옛 프로젝트도 뺍니다 — 원본 줄이 그 이름을 이미
  //     말하고, 같은 이름이 두 줄이면 무엇이 다른지 알 수 없습니다.
  //   · **이 반에 같은 이름이 이미 있는 것도 뺍니다.** 그것은 첫째 묶음에서
  //     연결하면 되는 것이라, 여기서 고르면 같은 이름이 이 반에 하나 더 생길
  //     뿐입니다(두 목록에 같은 이름이 함께 보이던 실제 신고).
  const hereTitles = useMemo(
    () => new Set(boards.map((b) => projectNameKey(b.title))),
    [boards]
  );
  const importTemplates = useMemo(
    () =>
      templates.filter(
        (t) => !templateInstance.has(t.id) && !hereTitles.has(projectNameKey(t.title))
      ),
    [templates, templateInstance, hereTitles]
  );
  const importOld = useMemo(() => {
    const live = new Set(templates.map((t) => t.id));
    const tplTitles = new Set(templates.map((t) => projectNameKey(t.title)));
    const byTitle = new Map();
    const stamp = (b) => (b.createdAt ? toDate(b.createdAt).getTime() : 0);
    for (const b of otherBoards) {
      if (b.templateId && live.has(b.templateId)) continue;
      const key = projectNameKey(b.title);
      if (!key || tplTitles.has(key) || hereTitles.has(key)) continue;
      const prev = byTitle.get(key);
      const n = b.activities?.length ?? 0;
      const pn = prev?.activities?.length ?? 0;
      if (!prev || n > pn || (n === pn && stamp(b) > stamp(prev))) byTitle.set(key, b);
    }
    return [...byTitle.values()].sort((a, b) =>
      (a.title ?? "").localeCompare(b.title ?? "", "ko", { numeric: true })
    );
  }, [otherBoards, templates, hereTitles]);

  // ── 학습 자료 ────────────────────────────────────────────────
  // 연결한 프로젝트 전체에서 쓰는 파일입니다. 공부방 왼쪽 패널의 '자료 제공'과
  // 같은 곳(보드 문서의 materials)에 담기므로, 학생 활동 화면 맨 위의 자료
  // 상자에 그대로 나타납니다. 여기서 올리는 것은 활동을 가리지 않는 공통
  // 자료라 actIndex를 null('전체 활동')로 둡니다.
  const boardFiles = board
    ? boardMaterials(board).filter((m) => m.actIndex == null && (m.file?.url || m.image))
    : [];

  async function saveMaterials(next) {
    // 예전 단일 자료 필드는 목록으로 옮겨졌으니 함께 비웁니다(중복 표시 방지)
    await updateStudyBoard(board.id, {
      materials: next,
      materialText: "",
      materialImage: null,
    });
  }

  async function handleUploadMaterial(e) {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    if (files.length === 0 || !board) return;

    setFileError("");
    const added = [];
    try {
      for (const file of files) {
        const limit = materialSizeLimit(file);
        if (file.size > limit) {
          setFileError(
            `‘${file.name}’은 ${formatFileSize(limit)}를 넘어요. (지금 ${formatFileSize(file.size)})`
          );
          continue;
        }
        setFileBusy(0);
        // 사진은 화면에 그대로 펼쳐 보여 주려고 줄여서 올리고, PDF·PPTX 등은
        // 원본이 그대로 가야 열립니다.
        if (isMaterialImage(file)) {
          const image = await uploadImage(file, { onProgress: setFileBusy });
          added.push({ id: `m${Date.now()}_${added.length}`, actIndex: null, text: "", image, file: null });
        } else {
          const url = await uploadFile(file, { onProgress: setFileBusy });
          added.push({
            id: `m${Date.now()}_${added.length}`,
            actIndex: null,
            text: "",
            image: null,
            file: { url, name: file.name, type: file.type || "", size: file.size },
          });
        }
      }
      if (added.length > 0) await saveMaterials([...boardMaterials(board), ...added]);
    } catch (err) {
      setFileError(
        err?.code === "storage/unauthorized"
          ? "이 종류의 파일은 올릴 수 없어요. 사진·PDF·PPT·워드·엑셀·CSV·텍스트만 됩니다."
          : "파일을 올리지 못했어요. 잠시 후 다시 시도해 주세요."
      );
    } finally {
      setFileBusy(null);
    }
  }

  async function handleRemoveMaterial(id) {
    if (!board) return;
    setFileError("");
    try {
      await saveMaterials(boardMaterials(board).filter((m) => m.id !== id));
    } catch (err) {
      setFileError(`자료를 지우지 못했어요: ${err?.message ?? "알 수 없는 오류"}`);
    }
  }

  // 활동 순서 바꾸기 — from번째를 뽑아 to번째 자리에 끼워 넣습니다.
  // (자리를 맞바꾸지 않는 이유: 목록에서 끌어 놓는 몸짓은 '여기로 옮긴다'이지
  //  '이 둘을 맞바꾼다'가 아니라, 맞바꾸면 사이에 있던 활동들이 엉뚱하게 튑니다)
  async function moveAct(from, to) {
    setDragIdx(null);
    setOverIdx(null);
    if (from == null || to == null || from === to) return;
    if (to < 0 || to >= boardActs.length) return;
    // 고치던 창은 자리 번호로 기억하고 있어, 줄이 움직이면 엉뚱한 줄을
    // 가리키게 됩니다.
    setEditAct(null);

    const next = [...boardActs];
    const [movedName] = next.splice(from, 1);
    next.splice(to, 0, movedName);

    // 잠금은 활동을 '따라' 움직입니다 — 열어 둔 활동이 자리를 옮겼다고
    // 다시 잠기면, 쓰고 있던 학생의 입력칸이 갑자기 닫힙니다.
    const locks = boardActs.map((_, j) => board.activityLocks?.[j] === true);
    const [movedLock] = locks.splice(from, 1);
    locks.splice(to, 0, movedLock);

    await saveBoardActs(next, locks);
  }

  // 활동 이름 고치기 — 자리는 그대로 두고 이름만 바꿉니다.
  async function handleSaveEditAct(e) {
    e.preventDefault();
    if (!editAct || actBusy) return;
    // 한글 마지막 글자는 조합 중일 수 있어 실제 입력값을 먼저 읽습니다.
    const name = (editActInputRef.current?.value ?? editAct.name).trim();
    const { i } = editAct;
    if (!name) return;
    if (name === boardActs[i]) { setEditAct(null); return; } // 바뀐 게 없으면 그냥 닫기
    // 자리가 그대로이므로 잠금도 그대로 넘깁니다(위 saveBoardActs 설명 참고).
    const ok = await saveBoardActs(
      boardActs.map((a, j) => (j === i ? name : a)),
      boardActs.map((_, j) => board.activityLocks?.[j] === true)
    );
    if (ok) setEditAct(null); // 실패하면 고치던 이름을 그대로 둡니다
  }

  // '+ 새 프로젝트' 클릭 — 바로 만들지 않고 이름 입력창을 엽니다.
  function startAddBoard() {
    setNewBoardName(lesson.title || "");
    setActError("");
    setDupBoard(null);
    setImportFrom("");
    setAddingBoard(true);
  }
  function cancelAddBoard() {
    setAddingBoard(false);
    setNewBoardName("");
    setDupBoard(null);
  }

  // 같은 이름 안내에서 '이전 프로젝트 불러오기'를 고른 경우 — 그것을 이 반에
  // 불러와(이미 있으면 그대로) 이 수업에 연결합니다. 실패하면 창이 오류를
  // 적도록 던집니다.
  async function loadDupBoard() {
    if (!dupBoard || !classId) return;
    const all = [...boards, ...otherBoards];
    const id = await loadSameNameProject(dupBoard.hit, {
      classId,
      boards: all,
      user: getCurrentUser(),
    });
    if (id) await onSaveBoardId?.(id);
    cancelAddBoard();
  }

  // 같은 이름 안내의 '취소' — 창만 닫고 이름 칸으로 돌아가 고쳐 쓰게 합니다.
  function closeDupBoard() {
    setDupBoard(null);
    requestAnimationFrame(() => {
      const el = newBoardInputRef.current;
      if (el) {
        el.focus();
        el.select();
      }
    });
  }

  // ── 고르개에서 고르기 ─────────────────────────────────────────
  // 첫째 묶음(이 반의 프로젝트)이나 '연결 안 함'은 고르는 즉시 연결합니다.
  // 둘째 묶음(이 반으로 가져올 프로젝트)은 **고르기만 하고** 아래 확인 줄의
  // '가져오기'를 눌러야 이 반에 만듭니다. 닫힌 고르개에서 방향키를 누르면
  // 브라우저가 한 칸 옮길 때마다 change를 보내는데, 그때마다 가져오면 훑어
  // 내려가는 것만으로 이 반에 프로젝트가 줄줄이 생깁니다.
  async function pickBoard(value) {
    setActError("");
    if (value.startsWith("t:") || value.startsWith("b:")) {
      setImportFrom(value);
      return;
    }
    setImportFrom("");
    const id = value || null;
    await onSaveBoardId?.(id);
    const b = id ? boards.find((x) => x.id === id) : null;
    // 원본의 복사본인데 **활동이 하나도 없으면** 원본의 활동을 채웁니다.
    // 원본에는 활동이 있는데 이 반 복사본만 빈 일이 실제로 있었고(연결하면
    // '활동 없음'), 그러면 불러와도 아무것도 안 들어온 것으로 보입니다.
    // **빈 사본에만** 하므로 선생님이 이 반에서 활동을 고쳐 둔 사본은
    // 건드리지 않습니다. 잠금은 새로 시작할 때와 같은 모양(첫 활동만 열림).
    if (b?.templateId && (b.activities?.length ?? 0) === 0) {
      const tpl = templates.find((t) => t.id === b.templateId);
      const tplActs = (tpl?.activities ?? []).map((x) => String(x).trim()).filter(Boolean);
      if (tplActs.length > 0) {
        try {
          await updateStudyBoard(b.id, {
            activities: tplActs,
            activityLocks: tplActs.map((_, i) => i > 0),
          });
        } catch (e) {
          setActError(`원본의 활동을 채우지 못했어요: ${e?.message ?? "알 수 없는 오류"}`);
        }
      }
    }
  }
  function cancelImport() {
    setImportFrom("");
  }
  // 반이 바뀌면(페이지에서 반을 옮김) 고르던 것을 놓습니다 — 앞 반 기준으로
  // 고른 것이라 새 반에서는 이미 있는 것일 수 있습니다.
  useEffect(() => {
    setImportFrom("");
  }, [classId]);

  // 고른 값은 `t:<원본 id>` 또는 `b:<프로젝트 id>` — 두 목록이 한 묶음에
  // 섞여 서므로 앞머리로 가릅니다.
  const importPick = (() => {
    if (importFrom.startsWith("t:")) {
      const t = templates.find((x) => x.id === importFrom.slice(2));
      return t ? { kind: "template", template: t } : null;
    }
    if (importFrom.startsWith("b:")) {
      const b = otherBoards.find((x) => x.id === importFrom.slice(2));
      return b ? { kind: "board", board: b } : null;
    }
    return null;
  })();

  // 가져오기 — 이 반에 하나 열고 곧바로 이 수업에 연결합니다. 공부방의 '다른
  // 반으로 복제'와 같은 일을 받는 쪽에서 하는 것인데, 연결이 필요하다는 것을
  // 깨닫는 자리가 바로 여기(그 반 수업 준비)라 복사와 연결을 한 번에 합니다.
  async function handleImport() {
    if (!classId || !importPick || makingBoard) return;
    setMakingBoard(true);
    setActError("");
    try {
      const id =
        importPick.kind === "template"
          ? await startStudyTemplateInClass(importPick.template, classId, getCurrentUser())
          : // 원본 없는 옛 프로젝트 — 예전처럼 통째로 복제합니다. 학생 카드는
            // 따라오지 않고, 첫 활동만 열린 채로 도착합니다(duplicateStudyBoard).
            await duplicateStudyBoard(importPick.board, classId, getCurrentUser());
      if (id) await onSaveBoardId?.(id);
      setImportFrom("");
    } catch (e2) {
      setActError(`프로젝트를 가져오지 못했어요: ${e2?.message ?? "알 수 없는 오류"}`);
    } finally {
      setMakingBoard(false);
    }
  }

  // 입력한 이름으로 새 프로젝트를 만들고 바로 연결합니다(취소하면 아무것도 안 만듭니다).
  async function handleAddBoard(e) {
    e.preventDefault();
    // 한글 마지막 글자는 조합 중일 수 있어 실제 입력값을 먼저 읽습니다.
    const name = (newBoardInputRef.current?.value ?? newBoardName).trim();
    if (!classId || !name || makingBoard) return;

    // 프로젝트 이름은 서로 달라야 합니다 — 같은 이름이 이 반·내 원본·다른 반의
    // 옛 프로젝트 어디에든 있으면 만들지 않고 '이전 프로젝트 불러오기'를
    // 권합니다(lib/projectNames.js). 한때 '그래도 만들기'로 같은 이름을 하나
    // 더 만들 수 있었는데, 그러면 원본 목록에서 둘을 가를 수 없습니다.
    const hit = findSameNameProject(name, {
      classId,
      boards: [...boards, ...otherBoards],
      templates,
    });
    if (hit) {
      setDupBoard({ name, hit });
      return;
    }

    setMakingBoard(true);
    setActError("");
    try {
      // 수업 중에 만들어도 **원본**으로 만들고 이 반에 불러옵니다(누름은 한 번).
      // 반에 곧바로 만들면 가져오기 목록에 '원본 없는 프로젝트'가 생겨,
      // 공부방 '＋ 프로젝트 만들기'와 규칙이 갈립니다.
      const { boardId: id } = await createStudyProjectInClass(getCurrentUser(), classId, {
        title: name,
      });
      if (id) await onSaveBoardId?.(id);
      cancelAddBoard();
    } catch (e2) {
      setActError(`프로젝트를 만들지 못했어요: ${e2?.message ?? "알 수 없는 오류"}`);
    } finally {
      setMakingBoard(false);
    }
  }

  // 장을 넘기면 그 장의 해설을 불러옵니다.
  useEffect(() => {
    setNote(slides[idx]?.note ?? "");
    setNoteTitle(slides[idx]?.noteTitle ?? "");
    // 앞 장의 해설이 새 슬라이드 위에 남아 있으면 학생이 엉뚱한 설명을
    // 보게 됩니다. 장을 넘기는 순간 내립니다.
    setNotePushed(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, lesson.id]);

  // 활동 안내 자동 저장 — 한 줄에 항목 하나
  useEffect(() => {
    if (!editing) return;
    const next = acts.split("\n").map((s) => s.trim()).filter(Boolean);
    if (next.join("\n") === (lesson.activities ?? []).join("\n")) return;
    const t = setTimeout(() => onSaveActivities?.(next), 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acts, editing]);

  // 메모 자동 저장 — 입력이 0.8초 멈추면 저장(편집 모드에서만).
  // 제목과 본문을 한 번에 저장합니다 — 따로 저장하면 슬라이드 배열을 각각
  // 다시 쓰게 되어, 두 저장이 겹칠 때 먼저 것이 덮여 사라질 수 있습니다.
  useEffect(() => {
    if (!editing) return;
    const sameNote = note === (slides[idx]?.note ?? "");
    const sameTitle = noteTitle === (slides[idx]?.noteTitle ?? "");
    if (sameNote && sameTitle) return;
    const t = setTimeout(async () => {
      await onSaveNote?.(idx, { note, noteTitle });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note, noteTitle, idx, editing]);

  // 프레젠테이션 중일 때만 현재 장을 방송해 학생 화면을 같은 장으로 맞춥니다.
  // (수업하기로 들어오기만 해서는 학생 화면이 바뀌지 않습니다 — 교사가 미리
  //  자료를 훑어보며 준비할 수 있게)
  useEffect(() => {
    if (editing || !live || !classId || !cur) return;
    startBroadcast(getCurrentUser(), classId, {
      mode: "lesson",
      lessonTitle: lesson.title ?? "",
      // 연결한 프로젝트 — 학생 수업 노트가 제목을 여기서 가져오고(코넬 노트의
      // 맨 윗줄), 그 프로젝트의 학습 자료를 노트에 함께 걸어 둡니다.
      // id와 이름을 둘 다 싣는 이유: 이름은 곧바로 쓰고, id는 자료를 찾는 데
      // 씁니다(자료 목록 자체를 싣지 않는 것은 방송 문서가 슬라이드를 넘길
      // 때마다 통째로 덮어써지기 때문 — 매번 실어 나르면 쓰기가 커집니다).
      boardId: board?.id ?? "",
      boardTitle: board?.title ?? "",
      imageUrl: cur.imageUrl,
      slideIndex: idx,
      slideCount: total,
      // 해설 띄우기 — 교사가 누른 동안만 담깁니다. 방송 문서는 매번 통째로
      // 덮어쓰므로(startBroadcast), 내릴 때는 빈 값으로 다시 쓰면 됩니다.
      // 해설은 서식 없는 글이라(제목 input + textarea) 그대로 실어도
      // 방송에 텍스트만 담는다는 원칙을 벗어나지 않습니다.
      noteTitle: notePushed ? noteTitle : "",
      noteText: notePushed ? note : "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, live, classId, cur?.imageUrl, idx, total, notePushed, noteTitle, note]);

  // 방송이 멈추는 모든 경우에 문서를 지웁니다 — 종료, 일시정지, 화면을
  // 벗어남. 학생 화면은 문서가 사라지는 순간 곧바로 풀립니다.
  useEffect(() => {
    if (editing || !live || !classId) return;
    return () => { stopBroadcast(classId); };
  }, [editing, live, classId]);

  // 키보드 ← → 로 넘기기 (메모를 쓰는 중에는 방해하지 않음)
  useEffect(() => {
    function onKey(e) {
      if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT") return;
      // 0장인 수업(슬라이드 없이 만들기)에서 → 를 누르면 total - 1이 -1이라
      // 자리가 -1로 떨어집니다 — 0 아래로는 안 내려가게 붙듭니다.
      if (e.key === "ArrowLeft") setIdx((i) => Math.max(0, i - 1));
      else if (e.key === "ArrowRight") setIdx((i) => Math.max(0, Math.min(total - 1, i + 1)));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [total]);

  // 편집/수업 중 두 레이아웃(아래)에서 그대로 재사용 — 내용은 editing으로
  // 이미 스스로 갈립니다.
  const activityGoalsSection = (
    <section className="lesson-card lesson-activity">
      <div className="lesson-card-head">
        <h2>오늘의 수업 목표!</h2>
        {editing && <small>한 줄에 하나씩 · 자동 저장</small>}
      </div>
      <div className="lesson-activity-body">
        {editing ? (
          <textarea
            className="lesson-activity-input"
            value={acts}
            onChange={(e) => setActs(e.target.value)}
            placeholder={"한 줄에 목표 하나씩 적어 주세요.\n예) 이온 결합과 공유 결합의 차이를 설명할 수 있다"}
          />
        ) : (lesson.activities ?? []).length > 0 ? (
          <ul className="lesson-activity-list">
            {(lesson.activities ?? []).map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        ) : (
          <p className="lesson-note-empty">아직 등록한 목표가 없어요.</p>
        )}
      </div>
    </section>
  );

  return (
    <div className="lesson-mode">
      <div className="lesson-head">
        <strong className="lesson-title">{lesson.title}</strong>
        {/* 상태 배지 — 좁은 화면에서는 긴 설명 대신 짧은 말로 바뀝니다.
            (자리를 아껴서 반 이름이 잘리지 않게. 어느 반에 발표 중인지가
             '프레젠테이션 중'이라는 말보다 더 알아야 할 정보입니다) */}
        {editing ? (
          <span className="lesson-badge lesson-badge--edit">수업 관리</span>
        ) : paused ? (
          // 멈춘 동안 '발표 중'이라고 두면 화면이 거짓말을 합니다. 슬라이드
          // 위 안내문을 뺐으므로(아래 참고) 멈췄다는 말은 여기서 합니다 —
          // 배지는 늘 같은 자리에 있어 글자가 바뀌어도 판이 안 밀립니다.
          <span className="lesson-badge lesson-badge--edit">
            <span className="lesson-badge-long">발표 대기 · 학생 자유 활동</span>
            <span className="lesson-badge-short">발표 대기</span>
            {className && <span className="lesson-badge-class">{className}</span>}
          </span>
        ) : presenting ? (
          <span className="lesson-badge">
            <span className="broadcast-live-dot" aria-hidden="true" />
            <span className="lesson-badge-long">프레젠테이션 중</span>
            <span className="lesson-badge-short">발표 중</span>
            {className && <span className="lesson-badge-class">{className}</span>}
          </span>
        ) : (
          <span className="lesson-badge lesson-badge--edit">
            <span className="lesson-badge-long">학생 화면 그대로</span>
            <span className="lesson-badge-short">대기 중</span>
            {className && <span className="lesson-badge-class">{className}</span>}
          </span>
        )}
        {/* 수업 도구 — 두 버튼 모두 항상 자리를 지킵니다(있다 없다 하면
            어디를 눌러야 할지 매번 찾게 되므로). 지금 쓸 수 없는 도구는
            비활성으로 두고, 왜 잠겼는지 툴팁으로 알려 줍니다.
            · 발표중: 발표 전에도 열립니다 — 참여 전광판에는 실시간 시청
              여부만이 아니라 출석부(attendanceRecords)도 함께 보이므로,
              슬라이드를 띄우기 전에 출석 상태부터 확인하는 용도로도
              씁니다(이때 시청 인원은 신호가 없어 0/전체로 보입니다).
            · 공부중: 교사 화면은 발표에 가려지지 않으므로 언제든 열어
              활동을 관리할 수 있습니다. 보드가 연결돼 있어야 합니다. */}
        {!editing && (
          <div className="lesson-tools">
            <button
              type="button"
              className="lesson-tool-btn"
              onClick={() => {
                setAttendOpen(true);
                setAttendFocusRequest((n) => n + 1);
              }}
              title={
                presenting
                  ? "학생들이 화면을 보고 있는지 확인합니다"
                  : "출석부를 확인합니다 (발표 전이라 시청 인원은 0명으로 보여요)"
              }
            >
              👀 발표중 {watchingCount}/{roster.length}
            </button>
            <button
              type="button"
              className="lesson-tool-btn"
              onClick={() => setProgressOpen(true)}
              disabled={!board}
              title={
                board
                  ? "학생들이 활동을 채워 가는 상황을 확인하고, 활동을 하나씩 열어 줍니다"
                  : "‘수업관리 → 공부방 프로젝트 연동’에서 프로젝트를 연결하면 활동 현황을 볼 수 있어요"
              }
            >
              ✍️ 공부중 {studyingCount}/{roster.length}
            </button>
          </div>
        )}
        <span className="lesson-count">{total === 0 ? 0 : idx + 1} / {total}</span>
        {/* 수업 화면은 화면 전체를 덮어(position: fixed) 위쪽 상단바를
            가립니다. 그래서 수업 중에는 반 공지도 알림도 손이 닿지 않았고,
            손든 학생은 자리표를 펼쳐야만 보였습니다. 상단바의 그 자리를
            여기에 똑같이 둡니다 — 손들기 · 반 공지 · 알림 차례로. */}
        {!editing && classId && (
          <span className="lesson-nav-tools">
            <button
              type="button"
              className="lesson-hand-chip"
              onClick={() => { setSeatView("seat"); setSeatOpen(true); }}
              title={
                raisedCount > 0
                  ? `${raisedCount}명이 손을 들었어요 — 눌러서 '우리는 공부중'에서 확인`
                  : "손든 학생이 없어요 — 눌러서 '우리는 공부중' 열기"
              }
            >
              <span aria-hidden="true">🖐️</span>
              {/* 0명이면 뱃지를 안 답니다 — 늘 붙어 있으면 신호가 아닙니다.
                  소리로 읽는 쪽에는 아래 sr-only 글로 늘 알려 줍니다. */}
              {raisedCount > 0 && (
                <span className="lesson-hand-badge" aria-hidden="true">{raisedCount}</span>
              )}
              <span className="sr-only">
                손든 학생 {raisedCount}명 — '우리는 공부중' 열기
              </span>
            </button>
            <ClassNoticeButton classId={classId} memberCount={roster.length} />
            {me?.uid && isFirebaseConfigured && <NotificationBell uid={me.uid} />}
          </span>
        )}
        {/* 수업 준비를 마치고 곧바로 수업 화면으로 — 목록으로 돌아가 다시
            '수업 시작'을 누르는 한 단계를 줄입니다. */}
        {editing && onStart && (
          <button type="button" className="lesson-start-btn" onClick={onStart}>
            수업 시작하기 ›
          </button>
        )}
        {/* 프레젠테이션이 먹통일 때도 수업 자료를 고치러 갈 수 있어야 합니다 */}
        {!editing && onEdit && (
          <button type="button" className="lesson-edit-btn" onClick={onEdit}>
            수업 편집
          </button>
        )}
        <button type="button" className="lesson-exit" onClick={onClose}>
          {editing ? "닫기" : "수업 종료"}
        </button>
      </div>

      {attendOpen && (
        <AttendanceBoard
          key={classId}
          className={className}
          broadcastStatus={live ? "방송 중" : presenting ? "방송 일시정지" : "방송 대기"}
          focusRequest={attendFocusRequest}
          roster={roster}
          presence={presence}
          attendanceRecords={attendanceRecords}
          seatLayout={seatLayout}
          dailySeatLayout={dailySeatLayout}
          groupAssignment={groupAssignment}
          classId={classId}
          onAward={onAward}
          onSaveDailySeats={(seats, user) =>
            saveStudySeatLayout(classId, todayLayoutId, seats, user, { date: todayDateKey() })
          }
          onClose={() => setAttendOpen(false)}
        />
      )}

      {progressOpen && board && (
        <StudyProgressBoard
          board={board}
          roster={roster}
          cards={boardCards}
          // 오늘 결석한 학생의 빈 칸을 '안 씀'(주황)이 아니라 회색으로
          // 구분하는 데 씁니다 — 여기서 안 넘기면 그 구분이 통째로 꺼집니다.
          attendanceRecords={attendanceRecords}
          onClose={() => setProgressOpen(false)}
        />
      )}

      {/* 수업 페이지 본문 — 위아래로 스크롤됩니다. 스크롤은 이 화면 안의
          일일 뿐이라 학생 화면과는 아무 상관이 없습니다(아래 주석 참고). */}
      <div className="lesson-page">
        {/* 주제 — 수업준비에서 미리 입력해 둔 이름 */}
        <h1 className="lesson-page-title">{lesson.title}</h1>

        <div className="lesson-deck">
          {/* ── 슬라이드 카드 ── */}
          <section className="lesson-card lesson-card--slide">
            <div className="lesson-card-head">
              <h2>슬라이드</h2>
            </div>

            <div className="lesson-stage">
              {cur ? (
                <img className="lesson-slide-img" src={cur.imageUrl} alt={`슬라이드 ${idx + 1}`} />
              ) : (
                // '슬라이드 없이 만들기'로 만든 수업이 여기로 옵니다. 고장이
                // 아니라 고른 모습이므로, 무엇이 없고 무엇을 할 수 있는지
                // 함께 적습니다(빈 화면만 두면 '안 올라갔나'로 읽힙니다).
                <p className="lesson-empty">
                  <strong>슬라이드 없이 만든 수업이에요.</strong>
                  <br />
                  학생 화면에는 아무것도 안 뜨고, 아래에서 활동을 내보내며 수업합니다.
                  {/* 내보낼 것이 하나도 없으면 아래 칸이 아예 안 섭니다 — 그때
                      '아래에서'만 적어 두면 가리키는 곳이 비어 있어 막힌 것처럼
                      보입니다. 어디서 채우는지까지 적습니다. 독서 활동을 아직
                      읽는 중(null)이면 곧 설 수 있으니 말하지 않습니다. */}
                  {!(board && boardActs.length > 0) && bookActs !== null && bookActs.length === 0 && (
                    <>
                      <br />
                      <span className="lesson-empty-hint">
                        지금은 내보낼 활동이 없어요 —{" "}
                        {editing
                          ? "아래 ‘공부방 프로젝트 연동’에서 프로젝트를 연결해 주세요."
                          : "‘수업 편집’에서 공부방 프로젝트를 연결해 주세요."}
                      </span>
                    </>
                  )}
                </p>
              )}
            </div>

            {/* 넘기기 버튼은 슬라이드와 한 카드에 둡니다 — 아래에 다른 수업
                기능이 붙어도 슬라이드와 조작이 떨어지지 않게.
                일시정지 안내문은 뺐습니다 — 멈출 때마다 한 줄이 끼어들어
                아래가 통째로 밀렸습니다. 멈췄다는 것은 머리말 배지와
                '▶ 이어서' 버튼이 이미 말해 줍니다(둘 다 자리가 고정이라
                켜고 꺼도 판이 움직이지 않습니다). */}
            <div className="lesson-card-foot">
              <button
                type="button"
                className="lesson-ctrl-btn"
                onClick={() => setIdx((i) => Math.max(0, i - 1))}
                disabled={idx === 0}
              >
                ‹ 이전
              </button>
              {total > 0 && total <= 24 && (
                <span className="lesson-dots" aria-hidden="true">
                  {slides.map((_, i) => (
                    <i key={i} className={i === idx ? "on" : ""} />
                  ))}
                </span>
              )}
              <button
                type="button"
                className="lesson-ctrl-btn"
                onClick={() => setIdx((i) => Math.max(0, Math.min(total - 1, i + 1)))}
                disabled={idx >= total - 1}
              >
                다음 ›
              </button>

              {/* 이걸 눌러야 학생 화면이 이 슬라이드로 바뀝니다.
                  발표 중에는 '일시정지'가 함께 나옵니다 — 학생에게 잠깐
                  활동할 틈을 줄 때 종료까지 갈 필요가 없습니다. */}
              {!editing && presenting && (
                <button
                  type="button"
                  // 빨강(.on)은 '멈추는 동작'이라는 신호로 써 왔습니다.
                  // '이어서'는 시작하는 버튼이라 빨강이 아닙니다.
                  className="lesson-ctrl-btn"
                  onClick={() => setPaused((v) => !v)}
                  title={
                    paused
                      ? "이 슬라이드부터 방송을 다시 시작합니다"
                      : "방송만 잠깐 멈춥니다 — 슬라이드 위치는 그대로 두고 학생은 자유롭게 활동합니다"
                  }
                >
                  {paused ? "▶ 이어서" : "❙❙ 일시정지"}
                </button>
              )}
              {!editing && (
                <button
                  type="button"
                  // 발표 중이면 멈춘 상태여도 이 버튼은 '나가는 동작'이라
                  // 빨강을 유지합니다.
                  className={`lesson-ctrl-btn${presenting ? " on" : ""}`}
                  onClick={() => {
                    // 종료할 때 일시정지도 함께 풉니다 — 다음에 '시작'을
                    // 누르면 멈춘 상태로 켜지는 일이 없게.
                    if (presenting) { setPresenting(false); setPaused(false); }
                    else setPresenting(true);
                  }}
                  disabled={total === 0}
                  title={
                    // 꺼져 있을 때는 까닭까지 적습니다 — 회색 단추만 두면
                    // 고장으로 보입니다('🍊 다 함께'와 같은 규칙).
                    total === 0
                      ? "슬라이드 없이 만든 수업이라 띄울 것이 없어요 — 활동 내보내기로 수업합니다"
                      : presenting
                        ? "학생 화면을 원래대로 되돌립니다"
                        : "지금 이 슬라이드를 학생 화면에 띄웁니다"
                  }
                >
                  {presenting ? "종료" : "시작"}
                </button>
              )}
            </div>
          </section>

          {/* ── 해설 카드 ── */}
          <section className="lesson-card lesson-card--note">
            {/* 해설은 전자칠판에 비친 이 화면으로 학생들과 함께 봅니다
                (학생 기기에는 슬라이드만 전송되므로 방송 내용은 그대로).
                제목 라벨 없이 내용부터 바로 — 슬라이드 카드와 윗줄 높이를
                맞추기 위해 빈 헤더 자리는 남겨 둡니다. */}
            <div className="lesson-card-head">
              {editing && saved && <em className="lesson-saved">✓ 저장됨</em>}
              {editing && <small>자동 저장</small>}
              {/* 해설 띄우기 — 발표 중에만. 학생 기기에는 원래 슬라이드만
                  가므로, 정리한 문장을 그대로 보여 주고 싶을 때가 있습니다.
                  띄우는 동안 학생 화면은 슬라이드 위에 이 해설이 덮이고,
                  다시 누르면 내려갑니다(장을 넘겨도 내려갑니다). */}
              {!editing && live && (noteTitle.trim() || note.trim()) && (
                <button
                  type="button"
                  className={`lesson-note-push${notePushed ? " is-on" : ""}`}
                  onClick={() => setNotePushed((v) => !v)}
                >
                  {notePushed ? "해설 내리기" : "학생 화면에 띄우기"}
                </button>
              )}
            </div>

            <div className="lesson-note-body">
              {editing ? (
                <>
                  {/* 제목과 본문을 나눠 받습니다. 전자칠판에 이 화면을 띄워
                      놓고 이야기하므로, 지금 무슨 이야기인지가 한눈에 보여야
                      합니다 — 한 칸에 다 적으면 첫 줄이 제목인지 본문인지
                      화면에서 구분되지 않습니다. */}
                  <input
                    type="text"
                    className="lesson-note-title-input"
                    value={noteTitle}
                    onChange={(e) => setNoteTitle(e.target.value)}
                    placeholder="제목 — 이 장에서 다룰 것 (예: 디지털의 본뜻)"
                  />
                  <textarea
                    className="lesson-note-input"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="내용 — 할 이야기, 발문, 활동 안내를 적어 두세요."
                  />
                </>
              ) : noteTitle.trim() || note.trim() ? (
                <>
                  {noteTitle.trim() && (
                    <h4 className="lesson-note-title">{noteTitle}</h4>
                  )}
                  {note.trim() && <div className="lesson-note-text">{note}</div>}
                </>
              ) : (
                <p className="lesson-note-empty">이 장에는 해설이 없어요.</p>
              )}
            </div>
          </section>
        </div>

        {/* ── 활동 열기 / 오늘의 수업 목표 / 자리표 ──
            수업 중(!editing)에는 왼쪽에 활동 관리, 오른쪽에 자리표를 나란히
            둡니다. 자리표(LessonSeatPanel)는 참여 전광판과 같은 자리·과일·
            누가기록 문서를 공유하는 축소판이라, 전광판을 열지 않고도 슬라이드
            아래에서 바로 출석·시청 확인, 과일 주기, 자리 이동을 할 수
            있습니다(전광판은 그대로 남겨 둡니다 — 모둠별 큰 화면이 필요할 때). */}
        {editing ? (
          activityGoalsSection
        ) : (
          <div className="lesson-lower">
            <div className="lesson-lower-main">
              {/* ── 학생에게 내보내기 ──
                  칩 하나가 '지금 이걸 쓰세요'입니다 — 누르면 그 반 학생의
                  수업 노트 서랍에 활동 탭이 서고 저절로 열립니다. 잠겨 있으면
                  함께 열립니다(누르는 순간의 뜻이 '지금 이걸 쓰세요'라, 칸만
                  뜨고 못 쓰면 안 됩니다).

                  예전에는 '활동 열기' 칩 줄 아래에 고르개 둘 + 단추 하나짜리
                  내보내기 줄이 따로 있었습니다. 활동을 여는 일이 곧 내보내는
                  일이 되면서 두 줄이 같은 것을 두 번 묻게 되어, 칩 하나로
                  합쳤습니다.

                  **칩에 자물쇠를 달지 않습니다.** 수업의 흐름은 '처음엔
                  잠김 → 내보내면 열림' 하나뿐이고, 다시 잠그는 일은 공부방
                  '활동 설정'의 활동별 잠금 토글에서 합니다(공부방 프로젝트에는
                  통째로 잠그는 길이 화면에 없습니다 — `editMode`는 자료와
                  규칙에만 남아 있고 남은 잠금은 교사가 열면 저절로 풀립니다).
                  누르는 자리가 둘이면 열려고 누른 손이 학생 화면 스물몇 대를
                  바꿉니다.

                  독서 활동도 같은 모양입니다 — 활동 칩을 누르면 그 아래로
                  단계 칩이 서고, 단계를 누르면 그것이 나갑니다. */}
              {((board && boardActs.length > 0) || (bookActs ?? []).length > 0) && (
                <section className="lesson-card lesson-locks">
                  <div className="lesson-card-head">
                    <h2>학생에게 내보내기</h2>
                    <small>누르면 학생 화면에 바로 떠요 — 살구빛이 지금까지 내보낸 것</small>
                  </div>

                  {/* ── 공부방 활동 — 세로로 쌓은 목록 ──
                      예전에는 가로 칩 한 줄이라 `활동 1 … 활동 5`만 보이고
                      활동 이름이 아예 안 떴습니다(칩이 `활동 {i+1}`만 찍었고,
                      이름을 넣으면 다섯 개가 한 줄에 안 섰습니다). 그래서
                      선생님이 무엇을 내보내는지 번호로만 짚어야 했습니다.
                      세로로 쌓으면 한 줄이 통째로 한 활동이라 이름을 넉넉히
                      적을 수 있습니다.
                      **책방 쪽은 칩 줄 그대로 둡니다** — 곁텍스트 단계는
                      이름이 짧고(표지·목차·머리말…) 여덟이라, 세로로 세우면
                      이 카드만 유독 길어집니다. */}
                  {board && boardActs.length > 0 && (
                    <div className="lesson-act-list">
                      {boardActs.map((a, i) => {
                        const locked = isActivityLocked(board, i);
                        const live = taskActIndex === i;
                        // 이름을 안 고친 활동은 배열에 기본값 `활동 N`이 그대로
                        // 들어 있습니다. 그대로 그리면 `활동 1 · 활동 1`이라
                        // 같은 말이 두 번이라, 그때는 이름 줄을 안 그립니다
                        // (학생 서랍 머리말이 이미 쓰는 방식입니다).
                        const name = String(a ?? "").trim();
                        const named = name && name !== `활동 ${i + 1}`;
                        return (
                          <button
                            key={`${a}-${i}`}
                            type="button"
                            className={`lesson-act-item${locked ? " locked" : ""}${live ? " live" : ""}`}
                            onClick={() => pushActivity(i)}
                            disabled={pushBusy}
                            title={`${named ? name : `활동 ${i + 1}`} — 학생 화면으로 보내기${locked ? " (잠긴 활동은 함께 열려요)" : ""}`}
                          >
                            {/* **자물쇠를 달지 마세요.** 이 줄에서 알아야 할
                                것은 '어디까지 내보냈나'뿐이고 그건 줄 색이
                                이미 말합니다 — 살구빛이 내보낸 것, 회색이
                                아직입니다. 자물쇠를 더하면 줄마다 그림이
                                하나씩 붙어 정작 지금 나가 있는 줄의 점이
                                묻힙니다. */}
                            <span className="lesson-act-item-no">
                              {live && (
                                <span className="broadcast-live-dot" aria-hidden="true" />
                              )}
                              활동 {i + 1}
                            </span>
                            {named && <span className="lesson-act-item-name">{name}</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {(bookActs ?? []).length > 0 && (
                    <div className="lesson-book-push">
                      <div className="lesson-push-sub">책방 독서 활동</div>
                      <div className="lesson-lock-row">
                        {bookActs.map((a) => {
                          const on = pickedBook?.id === a.id;
                          return (
                            <button
                              key={`b-${a.id}`}
                              type="button"
                              className={`lesson-book-chip${on ? " on" : ""}`}
                              onClick={() => setPickBook(a.id)}
                              title={`${a.title || a.topic || "이름 없는 활동"} — 단계를 고릅니다`}
                              aria-pressed={on}
                            >
                              <span className="lesson-book-kind">{bookKindLabel(a)}</span>
                              <span className="lesson-book-name">
                                {a.title || a.topic || "이름 없는 활동"}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      {pickedBook && (
                        <div className="lesson-lock-row lesson-step-row">
                          {pickedSteps.map((s, i) => {
                            // 단계 잠금은 곁텍스트에만 있습니다 — RAFT는 네 칸
                            // 어느 것도 잠기지 않아 늘 '열림' 색입니다.
                            const locked =
                              pickedBook.type === "paratext" &&
                              isSectionLocked(pickedBook, s.key);
                            const live =
                              task?.kind === "book" &&
                              task.activityId === pickedBook.id &&
                              task.sectionKey === s.key;
                            return (
                              <button
                                key={s.key}
                                type="button"
                                className={`lesson-act-chip lesson-step-chip${locked ? " locked" : ""}${live ? " live" : ""}`}
                                onClick={() => pushBookStep(pickedBook, s.key)}
                                disabled={pushBusy}
                                title={`${s.ko} — 학생 화면으로 보내기${locked ? " (잠긴 단계는 함께 열려요)" : ""}`}
                              >
                                {live && (
                                  <span className="broadcast-live-dot" aria-hidden="true" />
                                )}
                                {i + 1}. {s.ko}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 무엇이 나가 있는지 한 줄로 — 보낸 것이 지금 이 화면에
                      안 보이는 칩일 수 있어(다른 프로젝트의 활동, 안 고른
                      독서 활동) 이름을 적어 둡니다. 거두는 길도 여기뿐입니다. */}
                  {task != null && (
                    <div className="lesson-push-row">
                      <span className="lesson-push-live">
                        <span className="broadcast-live-dot" aria-hidden="true" />
                        {task.kind === "book"
                          ? `${taskBook?.step?.ko ?? "이 칸"} 내보내는 중`
                          : `활동 ${(taskActIndex ?? task.actIndex) + 1} 내보내는 중`}
                      </span>
                      <span className="lesson-push-name">
                        {task.kind === "book"
                          ? taskBook?.activity?.title ?? ""
                          : taskActIndex == null
                            ? "다른 프로젝트의 활동"
                            : boardActs[taskActIndex] ?? ""}
                      </span>
                      <button
                        type="button"
                        className="lesson-push-btn lesson-push-btn--stop"
                        onClick={stopPush}
                        disabled={pushBusy}
                        title="학생 화면에서 활동 탭을 내립니다 — 쓴 글은 그대로 남습니다"
                      >
                        그만 보내기
                      </button>
                    </div>
                  )}
                  {actError && <p className="form-error" role="alert">{actError}</p>}
                </section>
              )}

              {/* 다른 반에는 프로젝트를 연결해 두었는데 이 반만 비어 있는 경우 —
                  화면에서는 '활동 열기'가 그냥 없어 보여 왜 반마다 다른지 알 수
                  없습니다. 한 번도 연결한 적 없는 자료에는 띄우지 않습니다. */}
              {linkedElsewhere && (
                <p className="lesson-link-hint">
                  이 반에는 연결된 공부방 프로젝트가 없어요 — 수업 자료는 반마다
                  따로 연결합니다.
                  {onEdit && (
                    <button type="button" className="lesson-link-hint-btn" onClick={onEdit}>
                      수업 자료 편집에서 연결하기
                    </button>
                  )}
                </p>
              )}

              {activityGoalsSection}
            </div>

            {classId && (
              <div className="lesson-lower-side">
                <LessonSeatPanel
                  roster={roster}
                  presence={presence}
                  attendanceRecords={attendanceRecords}
                  seatLayout={seatLayout}
                  dailySeatLayout={dailySeatLayout}
                  groupAssignment={groupAssignment}
                  classId={classId}
                  now={presenceNow}
                  onAward={onAward}
                  // 손들기 구독과 펼침은 머리말과 나눠 쓰므로 위에서 내려 줍니다.
                  raisedUids={raisedUids}
                  open={seatOpen}
                  onOpenChange={setSeatOpen}
                  view={seatView}
                  onViewChange={setSeatView}
                  // 활동보기 — 지금 내보낸 활동에 학생들이 쓴 답. 이 화면이
                  // 이미 구독해 둔 카드(boardCards)를 그대로 넘기므로 읽는
                  // 문서가 하나도 안 늡니다. 책방 활동을 내보낸 중이면 그
                  // 칸이 스스로 '책방에서 보세요'라고 적습니다.
                  answerView={
                    <LessonAnswerPanel
                      task={task}
                      taskActIndex={taskActIndex}
                      boardActs={boardActs}
                      cards={boardCards}
                      roster={roster}
                    />
                  }
                  onSaveSeats={(seats, user) =>
                    saveStudySeatLayout(classId, todayLayoutId, seats, user, { date: todayDateKey() })
                  }
                />
              </div>
            )}
          </div>
        )}

        {/* ── 공부방 연동 ── 수업 준비에서만 보입니다.
            수업 중에는 이미 준비가 끝난 상태이고, 활동을 바꾸면 학생이
            쓰던 카드가 흔들리므로 아예 노출하지 않습니다. */}
        {editing && (
          <section className="lesson-card lesson-board">
            <div className="lesson-card-head">
              <h2>공부방 프로젝트 연동</h2>
              <small>여기서 만든 활동이 학생 카드의 작성 항목이 됩니다</small>
            </div>

            <div className="lesson-board-body">
              {/* 보드 선택(이 반의 것 · 가져올 것) + 새 보드 만들기 */}
              {addingBoard ? (
                <form className="lesson-board-pick lesson-board-addform" onSubmit={handleAddBoard}>
                  <label htmlFor="lesson-board-newname">새 프로젝트 이름</label>
                  <input
                    id="lesson-board-newname"
                    ref={newBoardInputRef}
                    type="text"
                    className="lesson-board-select"
                    value={newBoardName}
                    onChange={(e) => setNewBoardName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); cancelAddBoard(); } }}
                    placeholder="예) 디지털 사회의 진로"
                    maxLength={40}
                    autoFocus
                  />
                  {/* 조합 중인 한글은 state에 늦게 들어오므로 입력값으로
                      버튼을 잠그지 않습니다(빈 값은 handleAddBoard가 거릅니다) */}
                  <button type="submit" className="lesson-board-add" disabled={makingBoard}>
                    {makingBoard ? "만드는 중…" : "만들기"}
                  </button>
                  <button
                    type="button"
                    className="lesson-board-cancel"
                    onClick={cancelAddBoard}
                    disabled={makingBoard}
                  >
                    취소
                  </button>
                </form>
              ) : (
                <div className="lesson-board-pick">
                  <label htmlFor="lesson-board-select">수업 프로젝트</label>
                  <select
                    id="lesson-board-select"
                    className="lesson-board-select"
                    value={importFrom || boardId || ""}
                    onChange={(e) => pickBoard(e.target.value)}
                    disabled={!classId || makingBoard}
                  >
                    <option value="">연결 안 함</option>
                    {/* 제목만 적으면 이름이 같은 프로젝트를 고를 때 어느 쪽인지
                        알 수 없습니다. 활동 개수를 함께 보여 주면 "활동이 든
                        쪽"을 바로 집을 수 있습니다 — 실제로 같은 이름의 빈
                        프로젝트에 연결해 놓고 활동이 사라진 줄 알았던 일이
                        있었습니다. */}
                    {boards.length > 0 && (
                      <optgroup label="이 반의 프로젝트">
                        {boards.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.title}
                            {b.activities?.length
                              ? ` · 활동 ${b.activities.length}개`
                              : " · 활동 없음"}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {/* 원본이 앞, 원본 없는 옛 프로젝트가 뒤 — 같은 모양으로
                        이름만 섭니다(앞으로는 다 원본이라 그 구분은 고를 때
                        쓸모가 없습니다). */}
                    {(importTemplates.length > 0 || importOld.length > 0) && (
                      <optgroup label="이 반으로 가져올 프로젝트">
                        {importTemplates.map((t) => (
                          <option key={t.id} value={`t:${t.id}`}>
                            {t.title}
                            {t.activities?.length
                              ? ` · 활동 ${t.activities.length}개`
                              : " · 활동 없음"}
                          </option>
                        ))}
                        {importOld.map((b) => (
                          <option key={b.id} value={`b:${b.id}`}>
                            {b.title}
                            {b.activities?.length
                              ? ` · 활동 ${b.activities.length}개`
                              : " · 활동 없음"}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  {importPick ? (
                    <>
                      <button
                        type="button"
                        className="lesson-board-add"
                        onClick={handleImport}
                        disabled={makingBoard}
                      >
                        {makingBoard ? "가져오는 중…" : "가져오기"}
                      </button>
                      <button
                        type="button"
                        className="lesson-board-cancel"
                        onClick={cancelImport}
                        disabled={makingBoard}
                      >
                        취소
                      </button>
                      {/* 누르기 전에 무엇이 일어나는지 — 이 반에 새로 생기는
                          것이라 말해 둡니다. */}
                      <small className="lesson-board-import-note">
                        {importPick.kind === "template"
                          ? "이 반에 원본의 복사본을 하나 열어 이 수업에 연결합니다. 학생 카드는 반마다 따로 쌓이고, 첫 활동만 열린 채로 시작합니다."
                          : "다른 반의 이 프로젝트를 이 반에 새로 만들어 연결합니다. 학생 카드는 따라오지 않고, 첫 활동만 열린 채로 들어옵니다."}
                      </small>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="lesson-board-add"
                      onClick={startAddBoard}
                      disabled={!classId}
                    >
                      + 새 프로젝트
                    </button>
                  )}
                </div>
              )}

              {/* 같은 이름이 이미 있을 때 — 만들지 않고 되묻습니다 */}
              {dupBoard && (
                <ProjectNameDupModal
                  name={dupBoard.name}
                  hit={dupBoard.hit}
                  onCancel={closeDupBoard}
                  onLoad={loadDupBoard}
                />
              )}

              {!classId && (
                <p className="lesson-note-empty">
                  공부방에서 반을 먼저 선택하면 프로젝트를 연결할 수 있어요.
                </p>
              )}

              {/* 학습 자료 — 활동 목록 위. 이 프로젝트 전체에서 쓰는 파일이라
                  특정 활동에 매이지 않습니다(활동별 자료는 공부방 왼쪽 패널의
                  '자료 제공'에서 활동을 골라 올립니다). */}
              {board && (
                <div className="lesson-board-files">
                  <div className="lesson-board-files-head">
                    <span className="lesson-board-files-title">학습 자료</span>
                    <small>
                      이 프로젝트 전체에서 쓰는 파일 — 학생 활동 화면 맨 위에 나타납니다
                    </small>
                  </div>

                  {boardFiles.length > 0 && (
                    <ul className="lesson-board-file-list">
                      {boardFiles.map((m) => (
                        <li key={m.id} className="lesson-board-file">
                          {m.image ? (
                            <>
                              <img className="lesson-board-file-thumb" src={m.image} alt="" />
                              <span className="lesson-board-file-name">이미지 자료</span>
                            </>
                          ) : (
                            <>
                              <span className="lesson-board-file-icon" aria-hidden="true">📎</span>
                              <a
                                className="lesson-board-file-name"
                                href={m.file.url}
                                target="_blank"
                                rel="noreferrer"
                                title={m.file.name}
                              >
                                {m.file.name}
                              </a>
                              <span className="lesson-board-file-size">
                                {formatFileSize(m.file.size)}
                              </span>
                            </>
                          )}
                          <button
                            type="button"
                            className="lesson-board-act-del"
                            onClick={() => handleRemoveMaterial(m.id)}
                            aria-label="자료 삭제"
                          >
                            ✕
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  <label className="lesson-board-file-add">
                    + 자료 올리기
                    <small>사진 · PDF · PPT · 워드 · 엑셀 · CSV · 텍스트</small>
                    <input
                      type="file"
                      accept={MATERIAL_ACCEPT}
                      multiple
                      onChange={handleUploadMaterial}
                      hidden
                    />
                  </label>

                  <UploadProgress pct={fileBusy} />
                  {fileError && <p className="form-error" role="alert">{fileError}</p>}
                </div>
              )}

              {/* 활동 목록 — 연결한 프로젝트의 활동을 그대로 편집합니다.
                  이름을 누르면 그 자리에서 고칠 수 있습니다. */}
              {board && (
                <>
                  {boardActs.length > 0 ? (
                    <ol className="lesson-board-acts">
                      {boardActs.map((a, i) => (
                        <li
                          key={`${a}-${i}`}
                          className={
                            (dragIdx === i ? " is-dragging" : "") +
                            (overIdx === i && dragIdx !== i
                              // 놓으면 그 줄의 번호를 가져갑니다 — 위로
                              // 끌면 그 줄 앞, 아래로 끌면 그 줄 뒤에 들어가므로
                              // 선도 그쪽에 긋습니다.
                              ? dragIdx > i
                                ? " is-over is-over--up"
                                : " is-over is-over--down"
                              : "")
                          }
                          onDragOver={
                            dragIdx == null
                              ? undefined
                              : (e) => { e.preventDefault(); setOverIdx(i); }
                          }
                          onDrop={
                            dragIdx == null
                              ? undefined
                              : (e) => { e.preventDefault(); moveAct(dragIdx, i); }
                          }
                        >
                          {/* 끌기 손잡이 — 이름 자체는 눌러서 고치는 버튼이라,
                              끌기까지 겹치면 고치려던 손이 줄을 옮겨 버립니다.
                              그래서 끄는 자리를 따로 뒀습니다.
                              마우스가 없어도 옮길 수 있게 ↑↓ 키도 받습니다. */}
                          <button
                            type="button"
                            className="lesson-board-act-drag"
                            draggable={!actBusy}
                            onDragStart={(e) => {
                              setDragIdx(i);
                              e.dataTransfer.effectAllowed = "move";
                              // 파이어폭스는 데이터가 없으면 끌기를 시작하지 않습니다
                              e.dataTransfer.setData("text/plain", String(i));
                            }}
                            onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
                            onKeyDown={(e) => {
                              if (e.key === "ArrowUp") { e.preventDefault(); moveAct(i, i - 1); }
                              if (e.key === "ArrowDown") { e.preventDefault(); moveAct(i, i + 1); }
                            }}
                            disabled={actBusy}
                            aria-label={`활동 ${i + 1} 순서 바꾸기`}
                            title="끌어서 순서 바꾸기 (↑↓ 키로도 옮길 수 있어요)"
                          >
                            ⠿
                          </button>
                          {/* 학생 카드에 붙는 번호와 같은 순서를 여기서도 보여 줍니다 */}
                          <span className="lesson-board-act-no">활동 {i + 1}</span>
                          {editAct?.i === i ? (
                            // ── 이름 고치는 중 — 같은 자리에서 바로 고칩니다 ──
                            <form
                              className="lesson-board-act-edit"
                              onSubmit={handleSaveEditAct}
                            >
                              <input
                                ref={editActInputRef}
                                type="text"
                                value={editAct.name}
                                onChange={(e) =>
                                  setEditAct({ i, name: e.target.value })
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Escape") {
                                    e.preventDefault();
                                    setEditAct(null);
                                  }
                                }}
                                aria-label={`활동 ${i + 1} 이름`}
                                autoFocus
                              />
                              {/* 조합 중인 한글은 state에 늦게 들어오므로
                                  입력값으로 버튼을 잠그지 않습니다 */}
                              <button type="submit" disabled={actBusy}>
                                {actBusy ? "저장 중…" : "저장"}
                              </button>
                              <button
                                type="button"
                                className="lesson-board-act-editcancel"
                                onClick={() => setEditAct(null)}
                                disabled={actBusy}
                              >
                                취소
                              </button>
                            </form>
                          ) : (
                            <>
                              {/* 이름을 눌러도 열립니다 — 고칠 곳이 곧 그
                                  글자라, 옆의 작은 버튼을 겨누게 하는 것보다
                                  손이 가는 대로 맞습니다. */}
                              <button
                                type="button"
                                className="lesson-board-act-name"
                                onClick={() => setEditAct({ i, name: a })}
                                disabled={actBusy}
                                title="눌러서 이름 고치기"
                              >
                                {a}
                              </button>
                              <button
                                type="button"
                                className="lesson-board-act-del"
                                onClick={() => saveBoardActs(boardActs.filter((_, j) => j !== i))}
                                disabled={actBusy}
                                aria-label={`${a} 활동 삭제`}
                              >
                                ✕
                              </button>
                            </>
                          )}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="lesson-note-empty">
                      아직 활동이 없어요. 아래에서 추가하면 ‘{board.title}’ 프로젝트에 바로 반영됩니다.
                    </p>
                  )}

                  <form className="lesson-board-actadd" onSubmit={handleAddAct}>
                    <input
                      ref={actInputRef}
                      type="text"
                      value={newAct}
                      onChange={(e) => setNewAct(e.target.value)}
                      placeholder="예) 실험 결과 정리하기"
                      /* 글자 수를 막지 않습니다 — 활동 이름이 곧 학생 카드의
                         질문이 되는 자리라, "…중 가장 중요하다고 생각되는 한
                         가지를 선택해 보세요" 같은 한 문장이 흔합니다.
                         (40자에서 잘려 문장을 끝맺지 못하는 일이 있었습니다) */
                      aria-label="추가할 활동 이름"
                    />
                    {/* 조합 중인 한글은 state에 늦게 들어오므로 입력값으로
                        버튼을 잠그지 않습니다(빈 값은 handleAddAct가 거릅니다) */}
                    <button type="submit" disabled={actBusy}>
                      {actBusy ? "저장 중…" : "+ 활동 추가"}
                    </button>
                  </form>
                </>
              )}

              {actError && <p className="form-error" role="alert">{actError}</p>}
            </div>
          </section>
        )}

      </div>
    </div>
  );
}
