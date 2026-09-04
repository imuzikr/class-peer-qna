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
  addStudyBoard,
  duplicateStudyBoard,
  updateStudyBoard,
  updateStudyCard,
  subscribeStudyCards,
  subscribePresence,
  subscribeQuestionSignals,
  subscribeStudySeatLayout,
  saveStudySeatLayout,
  subscribeStudyGroupAssignment,
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
} from "@/lib/activities";
import { uploadImage, uploadFile } from "@/lib/storageUpload";
import { formatFileSize } from "@/lib/image";
import { getCurrentUser } from "@/lib/user";
import AttendanceBoard from "./AttendanceBoard";
import StudyProgressBoard, { cardProgress } from "./StudyProgressBoard";
import LessonSeatPanel from "./LessonSeatPanel";
// 수업 화면이 상단바를 덮으므로, 상단바의 공지·알림을 여기에도 둡니다.
import ClassNoticeButton from "./ClassNoticeButton";
import NotificationBell from "./NotificationBell";
import { isFirebaseConfigured } from "@/lib/firebase";
import UploadProgress from "./UploadProgress";
import { IconLockState } from "./StatusIcons";

export default function LessonMode({
  lesson,
  mode = "teach",
  classId = null,
  className = "",
  boards = [],          // 수업 준비: 이 반의 공부방 보드 목록(연결 대상)
  otherBoards = [],     // 수업 준비: 다른 반에 만들어 둔 프로젝트(가져오기 대상)
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
  // 다른 반 프로젝트를 통째로 가져오는 중 — 고른 원본은 누를 때까지 안 씁니다
  const [copyingBoard, setCopyingBoard] = useState(false);
  const [copyFrom, setCopyFrom] = useState("");
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

  // 활동 하나의 잠금을 켜고 끕니다(전광판의 자물쇠 버튼).
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
  // 누가 들었는지 바로 보입니다.
  const [seatOpen, setSeatOpen] = useState(false);

  // 알림함은 내 uid로 구독합니다. 로그인 캐시는 인증이 풀린 뒤에 채워지므로
  // 그릴 때 바로 읽지 않고 마운트 뒤에 한 번 읽습니다(서버에서 그릴 때와
  // 처음 그릴 때가 어긋나지 않게).
  const [me, setMe] = useState(null);
  useEffect(() => { setMe(getCurrentUser()); }, []);

  // ── 참여 전광판 (수업 중, 발표하는 동안만) ──
  const [attendOpen, setAttendOpen] = useState(false);
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
    const studentCards = boardCards.filter((c) => !c.authorId?.startsWith("teacher_"));
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

  // 가져올 수 있는 다른 반 프로젝트를 반별로 묶습니다 — 고르는 자리에서
  // 어느 반 것인지 보이지 않으면 이름이 비슷한 프로젝트를 구분할 수 없습니다.
  const importGroups = useMemo(() => {
    const byClass = new Map();
    for (const b of otherBoards) {
      const key = b.className || "반 이름 없음";
      if (!byClass.has(key)) byClass.set(key, []);
      byClass.get(key).push(b);
    }
    return [...byClass];
  }, [otherBoards]);

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
    setAddingBoard(true);
  }
  function cancelAddBoard() {
    setAddingBoard(false);
    setNewBoardName("");
    setDupBoard(null);
  }

  // 이미 있는 프로젝트에 그냥 연결합니다(중복 안내에서 고른 경우).
  async function useExistingBoard(id) {
    await onSaveBoardId?.(id);
    cancelAddBoard();
  }

  // ── 다른 반에서 프로젝트 통째로 가져오기 ─────────────────────
  // 공부방의 '다른 반으로 복제'와 같은 일을 받는 쪽에서 합니다. 보내는 쪽은
  // 복사만 하고 끝나 받는 반 수업 자료에 연결하는 일이 남는데, 그 연결이
  // 필요하다는 것을 깨닫는 자리가 바로 여기(그 반 수업 준비)입니다.
  // 그래서 여기서는 복사와 연결을 한 번에 합니다.
  function startCopyBoard() {
    setCopyFrom("");
    setActError("");
    setDupBoard(null);
    setCopyingBoard(true);
  }
  function cancelCopyBoard() {
    setCopyingBoard(false);
    setCopyFrom("");
  }
  async function handleCopyBoard(e) {
    e.preventDefault();
    const src = otherBoards.find((b) => b.id === copyFrom);
    if (!classId || !src || makingBoard) return;
    setMakingBoard(true);
    setActError("");
    try {
      // 학생 카드는 따라오지 않고, 활동은 전부 잠긴 채로 도착합니다
      // (duplicateStudyBoard 참고 — 받는 반은 진도가 0이므로).
      const id = await duplicateStudyBoard(src, classId, getCurrentUser());
      if (id) await onSaveBoardId?.(id);
      cancelCopyBoard();
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

    // 같은 이름이 이미 있으면 한 번 되묻습니다 — 이 안내를 띄운 그 이름으로
    // 다시 누르면 뜻이 분명하므로 그때는 만듭니다(같은 이름을 정말 원할
    // 수도 있으니 막지는 않습니다).
    const dup = boards.find((b) => (b.title ?? "").trim() === name);
    if (dup && dupBoard?.name !== name) {
      setDupBoard({ name, id: dup.id, acts: dup.activities?.length ?? 0 });
      return;
    }

    setMakingBoard(true);
    setActError("");
    try {
      const id = await addStudyBoard(getCurrentUser(), {
        title: name,
        type: "student",
        description: "",
        classId,
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
      if (e.key === "ArrowLeft") setIdx((i) => Math.max(0, i - 1));
      else if (e.key === "ArrowRight") setIdx((i) => Math.min(total - 1, i + 1));
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
              onClick={() => setAttendOpen(true)}
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
              onClick={() => setSeatOpen(true)}
              title={
                raisedCount > 0
                  ? `${raisedCount}명이 손을 들었어요 — 눌러서 자리표에서 확인`
                  : "손든 학생이 없어요 — 눌러서 자리표 열기"
              }
            >
              <span aria-hidden="true">🖐️</span>
              {/* 0명이면 뱃지를 안 답니다 — 늘 붙어 있으면 신호가 아닙니다.
                  소리로 읽는 쪽에는 아래 sr-only 글로 늘 알려 줍니다. */}
              {raisedCount > 0 && (
                <span className="lesson-hand-badge" aria-hidden="true">{raisedCount}</span>
              )}
              <span className="sr-only">
                손든 학생 {raisedCount}명 — 자리표 열기
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
                <p className="lesson-empty">슬라이드가 없어요.</p>
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
                onClick={() => setIdx((i) => Math.min(total - 1, i + 1))}
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
                    presenting
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
              {/* 연결된 보드의 활동을 하나씩 열어 줍니다. 누르는 즉시 학생
                  카드의 그 활동 입력칸이 열리고/닫힙니다(보드 문서의
                  activityLocks 하나만 보고 판정하므로 화면끼리 따로 놀 일이
                  없습니다). 전광판은 결과만 보는 자리입니다. */}
              {board && boardActs.length > 0 && (
                <section className="lesson-card lesson-locks">
                  <div className="lesson-card-head">
                    <h2>활동 열기</h2>
                    <small>누르면 학생이 그 활동을 쓸 수 있어요</small>
                  </div>
                  <div className="lesson-lock-row">
                    {boardActs.map((a, i) => {
                      const locked = isActivityLocked(board, i);
                      return (
                        <button
                          key={`${a}-${i}`}
                          type="button"
                          className={`lesson-lock-btn${locked ? " locked" : ""}`}
                          onClick={() => toggleActLock(i, !locked)}
                          disabled={lockBusy}
                          title={`${a} — ${locked ? "눌러서 열기" : "눌러서 잠그기"}`}
                          aria-pressed={!locked}
                        >
                          {/* 자물쇠 그림 = 지금 상태(닫힘/열림), 툴팁 =
                              누르면 할 일. 이모지였을 때는 두 그림의 굵기와
                              색이 기기마다 달라 화면에 띄우면 구별이 어려웠고,
                              고리가 열린 쪽이 오히려 작아 보였습니다. */}
                          <IconLockState
                            locked={locked}
                            size={17}
                            className="lesson-lock-icon"
                          />
                          활동 {i + 1}
                        </button>
                      );
                    })}
                  </div>
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
              {/* 보드 선택 + 새 보드 만들기 + 다른 반에서 가져오기 */}
              {copyingBoard ? (
                <form className="lesson-board-pick lesson-board-addform" onSubmit={handleCopyBoard}>
                  <label htmlFor="lesson-board-copy">가져올 프로젝트</label>
                  <select
                    id="lesson-board-copy"
                    className="lesson-board-select"
                    value={copyFrom}
                    onChange={(e) => setCopyFrom(e.target.value)}
                    disabled={makingBoard}
                    autoFocus
                  >
                    <option value="">반과 프로젝트를 고르세요</option>
                    {importGroups.map(([cls, list]) => (
                      <optgroup key={cls} label={cls}>
                        {list.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.title} · 활동 {b.activities?.length ?? 0}개
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="lesson-board-add"
                    disabled={!copyFrom || makingBoard}
                  >
                    {makingBoard ? "가져오는 중…" : "가져오기"}
                  </button>
                  <button
                    type="button"
                    className="lesson-board-cancel"
                    onClick={cancelCopyBoard}
                    disabled={makingBoard}
                  >
                    취소
                  </button>
                  <small className="lesson-board-copy-note">
                    이 반에 같은 프로젝트를 새로 만들어 이 수업에 연결합니다.
                    학생 카드는 따라오지 않고, 활동은 모두 잠긴 채로 들어옵니다.
                  </small>
                </form>
              ) : addingBoard ? (
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
                    {makingBoard ? "만드는 중…" : dupBoard ? "그래도 만들기" : "만들기"}
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
                    value={boardId ?? ""}
                    onChange={(e) => onSaveBoardId?.(e.target.value || null)}
                    disabled={!classId}
                  >
                    <option value="">연결 안 함</option>
                    {/* 제목만 적으면 이름이 같은 프로젝트를 고를 때 어느 쪽인지
                        알 수 없습니다. 활동 개수를 함께 보여 주면 "활동이 든
                        쪽"을 바로 집을 수 있습니다 — 실제로 같은 이름의 빈
                        프로젝트에 연결해 놓고 활동이 사라진 줄 알았던 일이
                        있었습니다. */}
                    {boards.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.title}
                        {b.activities?.length
                          ? ` · 활동 ${b.activities.length}개`
                          : " · 활동 없음"}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="lesson-board-add"
                    onClick={startAddBoard}
                    disabled={!classId}
                  >
                    + 새 프로젝트
                  </button>
                  {importGroups.length > 0 && (
                    <button
                      type="button"
                      className="lesson-board-copy-btn"
                      onClick={startCopyBoard}
                      disabled={!classId}
                      title="다른 반에 만들어 둔 프로젝트를 이 반으로 복사하고 이 수업에 연결합니다"
                    >
                      다른 반에서 가져오기
                    </button>
                  )}
                </div>
              )}

              {/* 같은 이름이 이미 있을 때 — 새로 만들기 전에 한 번 되묻습니다 */}
              {dupBoard && (
                <p className="lesson-board-dup" role="alert">
                  ‘{dupBoard.name}’ 프로젝트가 이미 있어요
                  {dupBoard.acts > 0 ? ` (활동 ${dupBoard.acts}개).` : " (활동 없음)."}{" "}
                  같은 이름을 하나 더 만들면 목록에서 구분하기 어려워요.
                  <button
                    type="button"
                    className="lesson-board-dup-use"
                    onClick={() => useExistingBoard(dupBoard.id)}
                    disabled={makingBoard}
                  >
                    그 프로젝트에 연결하기
                  </button>
                </p>
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
