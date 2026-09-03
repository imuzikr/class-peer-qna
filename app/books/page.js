"use client";

// =============================================================
// 책방 — 책을 읽고 함께하는 활동 공간 (반별)
// -------------------------------------------------------------
// 화면 흐름 — 교사와 학생이 다릅니다.
//   교사  활동 목록 → 작업 화면(왼쪽 모둠 목록 · 가운데 모둠 판 · 오른쪽 진행)
//                  → '전체 보기'로 반 전체 집계(학생 화면에 중계 가능)
//   학생  활동 목록 → 내 판(내가 넣은 낱말만 · 입력)
//
// · 활동 목록: 교사가 '닿소리 채우기' 독서 활동을 만듭니다.
// · 교사 작업 화면: 왼쪽에서 모둠을 고르면 가운데가 그 모둠의 판이 되고,
//     모둠원이 넣은 낱말이 사람마다 다른 색으로 표시됩니다.
// · 학생 화면: 활동을 누르면 곧바로 자기 판으로 들어가 낱말을 넣습니다.
//     (아직 모둠이 없으면 모둠 목록을 보여 줘 고르거나 기다리게 합니다)
// =============================================================
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  subscribeBookActivities,
  subscribeBookGroups,
  subscribeMyParatextEntry,
  BOOK_STUDENT_TOPIC_TYPES,
  BOOK_SOLO_TYPES,
  addBookActivity,
  deleteBookActivity,
  restoreBookActivity,
  purgeBookActivity,
  updateBookActivity,
  subscribeClasses,
  subscribeMyMemberships,
  subscribeClassMembers,
  subscribeUserDirectory,
  subscribeStudyGroupAssignment,
  subscribeStudySeatLayout,
  saveStudySeatLayout,
  saveStudyGroupAssignment,
  setStudentReward,
  addStudentReward,
  todayDateKey,
  subscribeStudyBoards,
  subscribeClassStudyAttendance,
} from "@/lib/store";
import { isFirebaseConfigured } from "@/lib/firebase";
import { isAdmin, isTeacher, getCurrentUser } from "@/lib/user";
import { getSelectedClassId, setSelectedClassId } from "@/lib/classroom";
import { useCurrentUser } from "@/lib/useCurrentUser";
import AuthGate from "@/components/AuthGate";
import TopNav from "@/components/TopNav";
import ClassEntry from "@/components/ClassEntry";
import Toast from "@/components/Toast";
import RewardCelebration from "@/components/RewardCelebration";
import { useRewardCelebration } from "@/lib/useRewardCelebration";
import ConfirmModal from "@/components/ConfirmModal";
import BookActivityForm from "@/components/BookActivityForm";
import BookActivityEditModal from "@/components/BookActivityEditModal";
import ClassNotesTools from "@/components/ClassNotesTools";
import StudyActivityPanel from "@/components/StudyActivityPanel";
import KwlPanel from "@/components/KwlPanel";
import TeacherKwlPanel from "@/components/TeacherKwlPanel";
import StudyRewardPanel from "@/components/StudyRewardPanel";
import BookGroupBoard from "@/components/BookGroupBoard";
import ConsonantCanvas from "@/components/ConsonantCanvas";
import ConsonantDashboard from "@/components/ConsonantDashboard";
import ParatextBoard from "@/components/ParatextBoard";
import ParatextForm from "@/components/ParatextForm";
import RaftBoard from "@/components/RaftBoard";
import RaftForm from "@/components/RaftForm";
import KwlsBoard from "@/components/KwlsBoard";
import KwlsForm from "@/components/KwlsForm";
import MindmapBoard from "@/components/MindmapBoard";
import MindmapForm from "@/components/MindmapForm";
import { IconBook, IconTrash } from "@/components/StatusIcons";

// 활동 종류의 이름 — 목록 카드에 '무엇을 하는 활동인가'를 적는 데 씁니다.
// 설명과 '추가하기' 문구는 종류 그리드를 없애면서 함께 뺐습니다. 종류를
// 고르는 자리가 만들기 창 하나로 모였고, 거기에 같은 설명이 이미 있습니다
// (components/BookActivityForm.jsx의 TYPES).
const ACTIVITY_KINDS = [
  { key: "consonant", label: "닿소리 채우기" },
  { key: "paratext", label: "곁텍스트 읽기" },
  { key: "raft", label: "RAFT 글쓰기" },
  { key: "kwls", label: "KWLS로 성찰하기" },
  { key: "mindmap", label: "마인드맵" },
];

const ACTIVITY_KIND_BY_KEY = new Map(ACTIVITY_KINDS.map((k) => [k.key, k]));

function activityTime(activity) {
  const raw = activity?.createdAt;
  if (!raw) return 0;
  if (typeof raw.toMillis === "function") return raw.toMillis();
  if (typeof raw.toDate === "function") return raw.toDate().getTime();
  if (raw instanceof Date) return raw.getTime();
  if (typeof raw === "number") return raw;
  const parsed = new Date(raw).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

// 목록을 세울 때 쓰는 값 — 시각이 없으면 '가장 나중'으로 봅니다.
// 방금 만든 활동은 서버가 createdAt을 채워 줄 때까지 잠깐 비어서 오는데
// (serverTimestamp), 0으로 두면 그 사이 목록 맨 앞으로 튀었다가 제자리인
// 끝으로 내려갑니다. 내려갈 자리에 미리 둡니다.
// (store.js의 toDate도 값이 없으면 '지금'으로 봐서 차례가 같습니다)
function activitySortKey(activity) {
  return activityTime(activity) || Infinity;
}

function activityDateLabel(activity) {
  const time = activityTime(activity);
  if (!time) return "날짜 없음";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(time));
}

export default function BooksPage() {
  // useSearchParams()는 정적 프리렌더 시 Suspense 경계가 필요합니다 —
  // 활동 종류/활동 상세 화면을 브라우저 히스토리(뒤로 가기)와 맞추려고 씁니다.
  return (
    <Suspense fallback={null}>
      <AuthGate>
        <BooksPageInner />
      </AuthGate>
    </Suspense>
  );
}

function BooksPageInner() {
  const user = useCurrentUser();
  const admin = user ? isTeacher(user) : false;
  const superAdmin = user ? isAdmin(user) : false;

  // 활동 목록 → 활동 상세, 두 단계를 URL(?activity=)로 관리합니다. 그래야
  // 브라우저의 '뒤로 가기'가 이 앱의 상태를 한 단계 되돌립니다(최상위
  // 페이지로 곧장 나가버리지 않습니다).
  //
  // 예전에는 '활동 종류 그리드 → 그 종류의 목록 → 활동' 세 단계였습니다.
  // 가운데 단계가 하는 일이 종류를 고르는 것뿐인데, 종류는 활동을 만들 때
  // 어차피 한 번 더 고르므로 같은 선택을 두 번 하는 셈이었습니다. 지금은
  // 반의 활동을 종류 섞어 한 목록에 최신순으로 늘어놓고(카드마다 종류가
  // 적혀 있습니다), 만들기 창에서 종류를 고릅니다.
  //
  // 예전 주소(?kind=…)로 들어와도 그 값은 그냥 무시됩니다 — 목록이 하나뿐이라
  // 갈 곳이 달라지지 않습니다.
  const router = useRouter();
  const searchParams = useSearchParams();
  const openActivityId = searchParams.get("activity");

  function goToList() {
    router.push("/books");
  }
  function goToActivity(activity) {
    router.push(`/books?activity=${activity.id}`);
  }

  const [classes, setClasses] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [localSelectedId, setLocalSelectedId] = useState(null);
  const [teacherClassId, setTeacherClassId] = useState(null);
  const [directory, setDirectory] = useState([]);
  const [memberUids, setMemberUids] = useState([]);
  const [baseGroupAssignment, setBaseGroupAssignment] = useState(null);
  // '멋진 순간' 패널의 자리표 — 공부방과 같은 문서(seatLayouts/default)를 봅니다.
  // 두 화면 중 어디서 자리를 옮기든 서로 어긋나지 않습니다.
  const [seatLayout, setSeatLayout] = useState(null);

  const [activities, setActivities] = useState([]);
  const [openGroups, setOpenGroups] = useState([]);       // 연 활동의 모둠 목록
  const [allView, setAllView] = useState(false);          // 교사: 반 전체 집계 화면
  const [creatingType, setCreatingType] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmPurge, setConfirmPurge] = useState(null);  // 휴지통에서 완전 삭제
  const [trashOpen, setTrashOpen] = useState(false);
  // KWLS 차트 — 공부방과 같은 패널을 왼쪽에서 폭을 벌리며 밀어 넣습니다.
  // 책방에서도 KWLS를 쓰므로(책방 활동의 KWLS는 공부방과 같은 `kwl` 컬렉션에
  // 쌓입니다) '오늘 반이 어디까지 썼나'를 보러 공부방으로 건너가지 않게.
  const [kwlPanelOpen, setKwlPanelOpen] = useState(false);
  // 편집 중인 활동 (교사)
  const [editingActivity, setEditingActivity] = useState(null);
  const [toast, setToast] = useState("");
  // 왼쪽 '오늘' 패널용 — 공부방과 같은 자료를 봅니다(출석·카드·성찰·과일)
  const [studyBoards, setStudyBoards] = useState([]);
  const [attendanceRecords, setAttendanceRecords] = useState([]);

  // 세션에 기억된 반 (공부방과 같은 키를 공유 — 같은 수업 맥락)
  useEffect(() => {
    function sync() { setLocalSelectedId(getSelectedClassId()); }
    sync();
    window.addEventListener("class-change", sync);
    return () => window.removeEventListener("class-change", sync);
  }, []);

  useEffect(() => subscribeClasses(setClasses), []);

  // 학생: 서버 소속 구독
  useEffect(() => {
    if (!user || admin) { setMemberships([]); return; }
    return subscribeMyMemberships(user.uid, setMemberships);
  }, [user?.uid, admin]);

  // 교사: 실명 디렉터리 (모둠 구성에 필요)
  useEffect(() => {
    if (!admin) { setDirectory([]); return; }
    return subscribeUserDirectory(setDirectory);
  }, [admin]);

  const myClasses = useMemo(
    () => (superAdmin ? classes : classes.filter((c) => c.createdBy === user?.uid)),
    [classes, superAdmin, user?.uid]
  );
  const membershipIds = useMemo(() => memberships.map((m) => m.classId), [memberships]);
  const studentClassId =
    localSelectedId && membershipIds.includes(localSelectedId)
      ? localSelectedId
      : membershipIds[0] ?? null;

  // 교사가 고른 반 기억 (없으면 첫 반)
  useEffect(() => {
    if (!admin || myClasses.length === 0) return;
    if (teacherClassId && myClasses.some((c) => c.id === teacherClassId)) return;
    const remembered =
      localSelectedId && myClasses.some((c) => c.id === localSelectedId)
        ? localSelectedId
        : myClasses[0].id;
    setTeacherClassId(remembered);
    if (localSelectedId !== remembered) setSelectedClassId(remembered);
  }, [admin, myClasses, teacherClassId, localSelectedId]);

  const classId = admin ? teacherClassId : studentClassId;
  // 과일을 받은 순간 — 학생 화면에서만 축포를 터뜨립니다(useRewardCelebration 참고)
  const [cheerAmount, clearCheer] = useRewardCelebration(classId, user?.uid, !admin);
  const currentClass = (admin ? myClasses : classes).find((c) => c.id === classId) ?? null;

  useEffect(() => subscribeBookActivities(classId, setActivities), [classId]);

  useEffect(() => {
    if (!admin || !classId) {
      setBaseGroupAssignment(null);
      return;
    }
    return subscribeStudyGroupAssignment(classId, setBaseGroupAssignment);
  }, [classId]);

  useEffect(() => {
    if (!admin || !classId) { setSeatLayout(null); return; }
    return subscribeStudySeatLayout(classId, "default", setSeatLayout);
  }, [admin, classId]);

  // 교사: 모둠 구성용 반 학생 명단
  useEffect(() => {
    if (!admin || !classId) { setMemberUids([]); return; }
    return subscribeClassMembers(classId, setMemberUids);
  }, [admin, classId]);

  // 왼쪽 '오늘' 패널 — 공부방의 그 패널을 그대로 씁니다. 오늘 이 반이 어떻게
  // 움직였는지(출석·카드·성찰·과일)는 책방에서 활동을 하는 동안에도 똑같이
  // 궁금한 것이라, 화면을 옮겨 다니지 않게 여기에도 놓습니다.
  // 프로젝트(studyBoards)와 출석은 공부방 쪽 자료라 여기서 따로 구독합니다.
  useEffect(() => {
    if (!admin) { setStudyBoards([]); return; }
    return subscribeStudyBoards(setStudyBoards);
  }, [admin]);

  useEffect(() => {
    if (!admin || !classId) { setAttendanceRecords([]); return; }
    return subscribeClassStudyAttendance(classId, setAttendanceRecords);
  }, [admin, classId]);

  const classBoards = useMemo(
    () => studyBoards.filter((b) => b.classId === classId),
    [studyBoards, classId]
  );

  const roster = useMemo(() => {
    const dir = new Map(directory.map((d) => [d.uid, d]));
    return memberUids
      .map((uid) => {
        const d = dir.get(uid) ?? {};
        return {
          uid,
          name: d.realName || d.studentId || "이름 미설정",
          studentId: d.studentId || null,
          emoji: d.emoji || "🙂",
        };
      })
      .sort((a, b) => (a.studentId || a.name).localeCompare(b.studentId || b.name, "ko"));
  }, [memberUids, directory]);

  // 오늘 출석한 학생 — 공부방과 같은 기준입니다(app/study/page.js).
  // 출석을 아직 시작하지도, 기록이 하나도 남지도 않았으면 null을 주어 자리를
  // 모두 '확인 전(회색)'으로 둡니다. 출석을 열자마자 반 전체가 결석으로
  // 물드는 일이 없도록, 출석 중이면 기록이 없어도 색을 나눠 줍니다.
  const todayKey = todayDateKey();
  const attendanceOpenToday =
    !!currentClass?.attendanceOpen && currentClass?.attendanceOpenDate === todayKey;
  const todayPresentUids = useMemo(() => {
    if (!admin) return null;
    const todays = attendanceRecords.filter((r) => r.date === todayKey);
    if (!attendanceOpenToday && todays.length === 0) return null;
    return new Set(todays.map((r) => r.uid).filter(Boolean));
  }, [admin, attendanceRecords, todayKey, attendanceOpenToday]);

  // 과일 주기 — 이름표를 함께 넘겨 자리표·이력에 누구인지 남게 합니다.
  function awardReward(uid, count, delta = null) {
    const d = directory.find((x) => x.uid === uid);
    const identity = d
      ? { name: d.realName || d.studentId || d.displayName || "", emoji: d.emoji || "🙂" }
      : null;
  // delta가 함께 오면(＋1·−1 단추) **서버에서 더합니다.** 화면에 보이는
  // 개수는 방금 누른 값이 아직 안 돌아왔을 수 있어, 그걸로 만든 절대값을
  // 보내면 빨리 두 번 누를 때 두 번째가 같은 값이 되어 묻힙니다
  // (addStudentReward는 트랜잭션 안에서 읽은 값에 더합니다).
  // delta가 없는 자리(개수를 직접 맞추는 곳)는 지금까지대로 절대값입니다.
    if (delta) return addStudentReward(classId, uid, delta, identity);
    return setStudentReward(classId, uid, count, identity);
  }

  // 활동을 열어둔 채 목록이 갱신되면 최신 문서로 맞춰줍니다(주제 수정·잠금 반영).
  // 지운 활동은 열려 있어도 더 보여 주지 않습니다 — 다른 기기에서 지웠거나
  // 휴지통에 있는 것을 주소로 바로 열었을 때도 마찬가지입니다.
  const activeActivity = openActivityId
    ? activities.find((a) => a.id === openActivityId && !a.deleted) ?? null
    : null;
  const activeClassId = activeActivity?.classId ?? classId;
  const activeClassName = classes.find((c) => c.id === activeClassId)?.name ?? "";
  // 목록에 늘어놓을 활동 — 종류를 섞어 만든 차례로 놓습니다(오래된 것이 앞).
  // 최신 것을 앞에 두면 활동을 하나 만들 때마다 목록이 통째로 한 칸씩 밀려,
  // 어제 열던 활동이 매번 다른 자리에 있게 됩니다. 수업이 흘러온 차례가
  // 그대로 보이는 편이 찾기 쉽습니다.
  // (구독이 이미 이 차례로 넘겨주지만, 데모 모드와 옛 문서까지 확실히 하려고
  //  여기서 한 번 더 세웁니다 — 목록의 순서가 이 값에 달려 있습니다.)
  const sortedActivities = useMemo(
    () => activities.slice().sort((a, b) => activitySortKey(a) - activitySortKey(b)),
    [activities]
  );
  // 지운 활동은 목록에서 빠지고 휴지통으로 갑니다. 같은 구독을 나누기만
  // 하므로 읽기가 늘지 않습니다(조건을 붙여 따로 질의하면 복합 색인 필요).
  const liveActivities = useMemo(
    () => sortedActivities.filter((a) => !a.deleted),
    [sortedActivities]
  );
  const trashedActivities = useMemo(
    () => sortedActivities.filter((a) => a.deleted),
    [sortedActivities]
  );

  // 개인 활동(곁텍스트 읽기·RAFT·KWLS·마인드맵)은 모둠이 없어 화면 흐름이 따로입니다.
  const isParatext = activeActivity?.type === "paratext";
  const isRaft = activeActivity?.type === "raft";
  const isKwls = activeActivity?.type === "kwls";
  const isMindmap = activeActivity?.type === "mindmap";
  const isSolo = isParatext || isRaft || isKwls || isMindmap;

  // 연 활동의 모둠 — 학생이 '내 판'으로 바로 들어가려면 내 모둠을 알아야 합니다.
  useEffect(() => {
    if (!activeActivity || isSolo) { setOpenGroups([]); return; }
    return subscribeBookGroups(activeActivity.id, setOpenGroups);
  }, [activeActivity?.id, isSolo]);

  const myGroupId = useMemo(
    () => openGroups.find((g) => (g.memberUids ?? []).includes(user?.uid))?.id ?? null,
    [openGroups, user?.uid]
  );

  // 학생은 활동을 열면 자기 판으로 바로 갑니다. 아직 모둠이 없으면(자유 구성
  // 이거나 교사가 아직 배정 전이면) 모둠 목록을 보여 줘 고르거나 기다리게 합니다.
  const studentCanvasGroupId = !admin && activeActivity ? myGroupId : null;

  async function handleCreate(form) {
    // soloMembers — '개별 활동'으로 만들 때 학생마다 판을 하나씩 깔기 위한
    // 반 명단입니다(다른 방식에서는 쓰이지 않습니다).
    await addBookActivity(user, {
      classId,
      ...form,
      baseGroups: baseGroupAssignment?.groups ?? [],
      soloMembers: roster,
    });
    setCreatingType(null);
    setToast("활동을 만들었어요.");
  }

  async function handleDelete() {
    const target = confirmDelete;
    setConfirmDelete(null);
    await deleteBookActivity(target.id);
    if (openActivityId === target.id) goToList();
    setToast("휴지통으로 옮겼어요. 휴지통에서 되돌릴 수 있어요.");
  }

  async function handleRestore(activity) {
    await restoreBookActivity(activity.id);
    setToast("활동을 되돌렸어요.");
  }

  // 완전 삭제 — 여기부터는 되돌릴 수 없습니다.
  async function handlePurge() {
    const target = confirmPurge;
    setConfirmPurge(null);
    await purgeBookActivity(target.id);
    setToast("완전히 삭제했어요.");
  }

  // 누가기록 관리·수업 메모 — 화면마다 다시 만들지 않고 이 한 덩어리를
  // 목록 머리말과 모아보기 화면들의 제목 끝에 나눠 끼웁니다(교사 전용).
  // 활동은 지금 고른 반의 것만 목록에 오르므로 명단(roster)도 그대로 맞습니다.
  const classTools =
    admin && classId ? (
      <ClassNotesTools
        classId={classId}
        className={currentClass?.name ?? ""}
        roster={roster}
        user={user}
      />
    ) : null;

  // ── 학생인데 아직 반에 안 들어왔으면 입장 코드부터 ──
  if (isFirebaseConfigured && !admin && user && membershipIds.length === 0) {
    return (
      <div className="board-shell">
        <TopNav active="books" />
        <ClassEntry />
      </div>
    );
  }

  return (
    <div className="board-shell">
      <TopNav active="books" />

      {/* 왼쪽 '오늘' 패널 + 본문. 공부방과 같은 배치라 패널도 같은 컴포넌트를
          그대로 씁니다(프로젝트를 넘기지 않으면 '오늘' 모습이 됩니다). */}
      <div className="books-body">
        {/* KWLS 차트 — 공부방과 같은 패널·같은 여닫이(폭이 0에서 벌어지며
            오른쪽을 밀어냅니다). 교사는 '반이 어디까지 썼나', 학생은 '내가
            쓰는 곳'이라 담기는 것이 다릅니다. 자리도 공부방과 같은 맨 왼쪽 —
            두 화면을 오갈 때 같은 것이 같은 자리에 있어야 합니다.
            **목록 화면에서만** 답니다. 활동을 열면 그 화면이 가로를 다 쓰는
            데다 여는 단추(머리말)가 사라져 닫을 길이 없어집니다. 열어 둔
            것은 기억해 두어 목록으로 돌아오면 그대로 다시 펴집니다. */}
        {classId && user && !activeActivity && (
          <div
            className={`study-kwl-slot${kwlPanelOpen ? " open" : ""}`}
            aria-hidden={!kwlPanelOpen}
          >
            {kwlPanelOpen &&
              (admin ? (
                <TeacherKwlPanel
                  classId={classId}
                  user={user}
                  roster={roster}
                  onAward={currentClass?.archived ? null : awardReward}
                  onClose={() => setKwlPanelOpen(false)}
                />
              ) : (
                <KwlPanel
                  classId={classId}
                  user={user}
                  isTeacher={false}
                  /* 모바일에선 폭을 벌릴 자리가 없어 떠 있는 패널로 열립니다 */
                  mobileOpen={kwlPanelOpen}
                  onMobileClose={() => setKwlPanelOpen(false)}
                />
              ))}
          </div>
        )}

        {admin && classId && (
          <StudyActivityPanel
            board={null}
            isTeacher={admin}
            classRoster={roster}
            classId={classId}
            boards={classBoards}
            attendanceRecords={attendanceRecords}
            todayNote="오늘 이 반에서 일어난 일이에요. 공부방·책방 어디서든 같은 내용입니다."
          />
        )}

      {/* 마인드맵(개인 활동) — 교사는 왼쪽 학생 목록+오른쪽 마인드맵, 학생은 자기 판 */}
      {isMindmap && admin ? (
        <MindmapBoard
          activity={activeActivity}
          className={activeClassName}
          classId={activeClassId}
          user={user}
          roster={roster}
          onBack={goToList}
          classTools={classTools}
        />
      ) : isMindmap ? (
        <MindmapForm
          activity={activeActivity}
          user={user}
          onBack={goToList}
        />
      ) : /* KWLS로 성찰하기(개인 활동) — 교사는 학생별 카드+칸별 방송, 학생은 4칸 화면 */
      isKwls && admin ? (
        <KwlsBoard
          activity={activeActivity}
          className={activeClassName}
          classId={activeClassId}
          user={user}
          roster={roster}
          onBack={goToList}
          classTools={classTools}
        />
      ) : isKwls ? (
        <KwlsForm
          activity={activeActivity}
          user={user}
          onBack={goToList}
        />
      ) : /* RAFT 글쓰기(개인 활동) — 교사는 학생별 카드+방송, 학생은 4열 화면 */
      isRaft && admin ? (
        <RaftBoard
          activity={activeActivity}
          className={activeClassName}
          classId={activeClassId}
          user={user}
          roster={roster}
          onBack={goToList}
          classTools={classTools}
        />
      ) : isRaft ? (
        <RaftForm
          activity={activeActivity}
          user={user}
          onBack={goToList}
        />
      ) : /* 곁텍스트 읽기(개인 활동) — 교사는 학생별 카드, 학생은 자기 입력 화면 */
      isParatext && admin ? (
        <ParatextBoard
          activity={activeActivity}
          className={activeClassName}
          classId={activeClassId}
          user={user}
          roster={roster}
          onBack={goToList}
          classTools={classTools}
        />
      ) : isParatext ? (
        <ParatextForm
          activity={activeActivity}
          user={user}
          onBack={goToList}
        />
      ) : /* 교사: '전체 보기' — 반 전체 집계. 여기서 학생 화면에 중계할 수 있습니다 */
      admin && allView && activeActivity ? (
        <ConsonantDashboard
          activity={activeActivity}
          classId={activeClassId}
          user={user}
          onClose={() => setAllView(false)}
          classTools={classTools}
        />
      ) : /* 학생: 활동을 열면 자기 판으로 바로 */
      studentCanvasGroupId && activeActivity ? (
        <ConsonantCanvas
          activity={activeActivity}
          groupId={studentCanvasGroupId}
          user={user}
          isTeacher={false}
          viewMode="mine"
          onBack={goToList}
        />
      ) : activeActivity ? (
        <BookGroupBoard
          activity={activeActivity}
          className={
            classes.find((c) => c.id === activeActivity.classId)?.name ?? ""
          }
          user={user}
          isTeacher={admin}
          roster={roster}
          baseGroupAssignment={baseGroupAssignment}
          onOpenAll={() => setAllView(true)}
          onBack={goToList}
          onToast={setToast}
          classTools={classTools}
        />
      ) : (
        <main className="books-main">
          <div className="books-head">
            <div className="books-head-main">
              <h1>
                <IconBook size={26} /> 책방
              </h1>
              {admin && myClasses.length > 0 && (
                <select
                  className="study-class-select"
                  value={classId ?? ""}
                  onChange={(e) => {
                    setTeacherClassId(e.target.value);
                    setSelectedClassId(e.target.value);
                  }}
                >
                  {myClasses.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
              {/* 학생이 여러 반에 속해 있으면 직접 고를 수 있게 (한 반이면 이름만) */}
              {!admin && membershipIds.length > 1 ? (
                <select
                  className="study-class-select"
                  value={classId ?? ""}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                >
                  {membershipIds.map((cid) => (
                    <option key={cid} value={cid}>
                      {classes.find((c) => c.id === cid)?.name ?? "우리 반"}
                    </option>
                  ))}
                </select>
              ) : (
                !admin && currentClass && (
                  <span className="books-class-name">{currentClass.name}</span>
                )
              )}
              {/* 종류는 이 창에서 고릅니다 — 목록을 종류별로 나누지 않게 되면서
                  종류를 고르는 자리가 여기 하나로 모였습니다. */}
              {admin && classId && (
                <button className="btn-primary" onClick={() => setCreatingType("consonant")}>
                  ＋ 독서 활동 만들기
                </button>
              )}
              {/* 공부방 머리말과 같은 자리·같은 이름 — 두 화면에서 같은 것을
                  여는 단추라 순서도 같게 둡니다(KWLS 차트 → 기록 관리). */}
              {classId && user && (
                <button
                  className={`btn-ghost${kwlPanelOpen ? " active" : ""}`}
                  onClick={() => setKwlPanelOpen((v) => !v)}
                  aria-pressed={kwlPanelOpen}
                  title={
                    kwlPanelOpen
                      ? "KWLS 차트를 닫습니다"
                      : admin
                      ? "KWLS 차트를 왼쪽에 펼칩니다 — 작성 현황·궁금한 점 모아보기"
                      : "KWLS 차트를 왼쪽에 펼칩니다"
                  }
                >
                  KWLS 차트
                </button>
              )}
              {classTools}
            </div>
          </div>

          {admin && myClasses.length === 0 ? (
            <p className="empty-note">
              아직 만든 반이 없어요. 공부방에서 반을 먼저 만들어 주세요.
            </p>
          ) : (
            <ActivityList
              activities={liveActivities}
              trashed={admin ? trashedActivities : []}
              trashOpen={trashOpen}
              onToggleTrash={() => setTrashOpen((v) => !v)}
              onRestore={handleRestore}
              onPurge={setConfirmPurge}
              isTeacher={admin}
              uid={user?.uid ?? null}
              onOpen={goToActivity}
              onEdit={setEditingActivity}
              onDelete={setConfirmDelete}
              onToggleLock={(activity) =>
                updateBookActivity(activity.id, { locked: !activity.locked })
              }
            />
          )}
        </main>
      )}

        {/* 오른쪽 '멋진 순간' 패널 — 교사 전용. 공부방의 그것을 그대로 씁니다.
            책방에서 활동을 보다가도 과일을 주고 누가기록을 남기려면 화면을
            옮겨야 했는데, 그 사이에 '지금 이 순간'이 지나갑니다. 자리표·모둠은
            공부방과 같은 문서(seatLayouts/default)라 어디서 옮기든 같습니다.
            보관된 반은 보기 전용이라 내놓지 않습니다(과일 부여는 쓰기). */}
        {admin && classId && currentClass && !currentClass.archived && (
          <StudyRewardPanel
            roster={roster}
            classId={classId}
            seatLayout={seatLayout}
            groupAssignment={baseGroupAssignment}
            presentUids={todayPresentUids}
            onAward={awardReward}
            onSaveSeats={(seats) =>
              saveStudySeatLayout(classId, "default", seats, getCurrentUser())
            }
            onSaveGroups={(groups) =>
              saveStudyGroupAssignment(classId, groups, getCurrentUser())
            }
          />
        )}
      </div>

      {/* KWLS 차트가 모바일에서 떠 있을 때의 배경(누르면 닫힘) — 공부방과 같음 */}
      {kwlPanelOpen && !activeActivity && (
        <div className="kwl-mobile-backdrop" onClick={() => setKwlPanelOpen(false)} />
      )}

      {creatingType && (
        <BookActivityForm
          initialType={creatingType}
          onSave={handleCreate}
          onClose={() => setCreatingType(null)}
          /* '기본 모둠'을 고르면 몇 개를 가져오는지 그 자리에서 보이게 */
          baseGroupCount={baseGroupAssignment?.groups?.length ?? 0}
        />
      )}

      {/* 활동 편집 (이름·주제어·도서 정보) — 진행 중인 활동도 됩니다 */}
      {editingActivity && (
        <BookActivityEditModal
          /* 목록이 갱신되면 최신 문서로 다시 찾습니다 — 열어 둔 채 다른
             곳에서 값이 바뀌어도 옛 값을 붙들고 있지 않게 */
          activity={
            activities.find((a) => a.id === editingActivity.id) ?? editingActivity
          }
          onClose={() => setEditingActivity(null)}
          onDone={() => setToast("활동을 저장했어요.")}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          title="활동 삭제"
          preview={confirmDelete.title}
          description={
            "목록에서 감추고 휴지통으로 옮깁니다.\n" +
            "학생 화면에서도 사라지지만 내용은 그대로 남아 있어,\n" +
            "목록 아래 휴지통에서 되돌릴 수 있어요."
          }
          confirmLabel="휴지통으로"
          onConfirm={handleDelete}
          onClose={() => setConfirmDelete(null)}
        />
      )}

      {/* 완전 삭제 — 휴지통 안에서만. 여기부터는 되돌릴 수 없습니다. */}
      {confirmPurge && (
        <ConfirmModal
          title="완전 삭제"
          preview={confirmPurge.title}
          description={
            confirmPurge.type === "consonant"
              ? "이 활동의 모둠과 모아둔 단어가 모두 지워집니다.\n되돌릴 수 없습니다."
              : "학생들이 쓴 내용이 모두 지워집니다.\n되돌릴 수 없습니다."
          }
          confirmLabel="완전 삭제"
          danger
          onConfirm={handlePurge}
          onClose={() => setConfirmPurge(null)}
        />
      )}

      {/* 과일을 받은 순간의 축포 — 학생 화면에서만. 교사는 자기가 준 것이라
          축하할 일이 아니고, 한 화면에서 여러 번 주다 보면 방해가 됩니다. */}
      <RewardCelebration amount={cheerAmount} onDone={clearCheer} />
      {toast && <Toast message={toast} onDone={() => setToast("")} />}
    </div>
  );
}

// 활동 목록 — 반의 활동을 종류 섞어 최신순으로 늘어놓습니다.
// 예전에는 '종류 그리드 → 그 종류의 목록' 두 화면이었는데, 가운데 화면이
// 하는 일이 종류를 고르는 것뿐이라 만들기 창의 종류 고르기와 겹쳤습니다.
// 종류는 카드마다 적혀 있으니 목록을 나눌 이유가 없습니다.
function ActivityList({
  activities,
  isTeacher,
  uid,
  onOpen,
  onEdit,
  onDelete,
  onToggleLock,
  trashed = [],
  trashOpen = false,
  onToggleTrash,
  onRestore,
  onPurge,
}) {
  return (
    <>
      {activities.length === 0 ? (
        <p className="empty-note">
          {isTeacher
            ? "아직 만든 활동이 없어요. ‘＋ 독서 활동 만들기’로 첫 활동을 열어 보세요."
            : "아직 열린 활동이 없어요. 선생님이 활동을 열면 여기에 나타납니다."}
        </p>
      ) : (
        <div className="book-activity-grid">
          {activities.map((a) => (
            <ActivityCard
              key={a.id}
              activity={a}
              isTeacher={isTeacher}
              uid={uid}
              onOpen={() => onOpen(a)}
              onEdit={() => onEdit(a)}
              onDelete={() => onDelete(a)}
              onToggleLock={() => onToggleLock(a)}
            />
          ))}
        </div>
      )}

      {/* 휴지통 — 지운 활동이 있을 때만 나타납니다. 접어 두는 이유는
          평소에 볼 것이 아니어서이고, 건수를 겉에 적어 두는 이유는
          '지운 게 어디 갔지' 하고 찾아 헤매지 않게 하기 위함입니다. */}
      {isTeacher && trashed.length > 0 && (
        <section className="book-trash">
          <button
            type="button"
            className="book-trash-toggle"
            onClick={onToggleTrash}
            aria-expanded={trashOpen}
          >
            <span className={`memo-caret${trashOpen ? " open" : ""}`} aria-hidden="true">›</span>
            <IconTrash size={14} /> 휴지통 <em>{trashed.length}</em>
          </button>

          {trashOpen && (
            <ul className="book-trash-list">
              {trashed.map((a) => (
                <li key={a.id} className="book-trash-item">
                  <span className="book-trash-name">
                    <strong>{a.topic?.trim() || a.title}</strong>
                    <span className="book-trash-meta">
                      {ACTIVITY_KIND_BY_KEY.get(a.type)?.label ?? "독서 활동"}
                      {" · 만든 날 "}
                      {activityDateLabel(a)}
                    </span>
                  </span>
                  <button type="button" className="btn-ghost" onClick={() => onRestore(a)}>
                    되돌리기
                  </button>
                  <button type="button" className="btn-ghost qa-delete" onClick={() => onPurge(a)}>
                    완전 삭제
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}

// 활동 카드 — 목록에 한 줄씩
function ActivityCard({ activity, isTeacher, uid, onOpen, onEdit, onDelete, onToggleLock }) {
  // 종류 이름 — 목록에 종류가 섞여 있으므로 카드마다 밝혀야 합니다.
  // (예전에는 종류별 목록이라 화면 머리말에 한 번 적혀 있었습니다)
  const kindLabel = ACTIVITY_KIND_BY_KEY.get(activity.type)?.label ?? "독서 활동";
  // 개인 활동(곁텍스트 읽기·RAFT·KWLS·마인드맵)은 모둠이 없습니다.
  const solo = BOOK_SOLO_TYPES.includes(activity.type);
  const [groups, setGroups] = useState([]);
  // 개인 활동은 모둠이 없으므로 모둠 구독 자체를 걸지 않습니다.
  useEffect(() => {
    if (solo) return;
    return subscribeBookGroups(activity.id, setGroups);
  }, [activity.id, solo]);

  // 학생이 제 주제어를 적는 활동(곁텍스트 읽기·RAFT)에서 교사가 주제어를
  // 비워 둔 경우에만 — 학생이 제 카드에 적은 책이름을 카드 제목으로 씁니다
  // (읽고 쓰는 책이 저마다 달라서).
  //
  // 조건을 이렇게 좁게 건 이유: 이건 내 기록 한 건(문서 1개)을 더 읽는 일인데,
  // 목록은 카드가 쌓이는 곳이라 조건 없이 걸면 활동 수만큼 늘어납니다.
  // 주제어가 있는 활동·교사 화면에서는 필요 없는 값이라 아예 걸지 않습니다.
  const needMyTopic =
    !isTeacher &&
    BOOK_STUDENT_TOPIC_TYPES.includes(activity.type) &&
    !(activity.topic ?? "").trim();
  const [myTopic, setMyTopic] = useState("");
  useEffect(() => {
    if (!needMyTopic || !uid) { setMyTopic(""); return; }
    return subscribeMyParatextEntry(activity.id, uid, (e) => setMyTopic(e?.topic ?? ""));
  }, [needMyTopic, activity.id, uid]);

  // 진행률(14칸을 다 채운 학생 수)은 여기가 아니라 활동을 연 화면에 있습니다.
  // 그 값을 내려면 활동의 낱말을 전부 읽어야 하는데, 목록은 카드가 계속
  // 쌓이는 곳이라 카드마다 그 계산을 돌리면 활동 수에 정비례해 무거워집니다
  // (활동 20개면 목록 한 번 여는 데 7천여 건). 반면 작업 화면과 전체 보기는
  // 이미 그 활동의 낱말을 전부 읽고 있어, 거기서는 읽기가 1건도 안 늡니다.

  // 카드에 적히는 방식 이름 — 만들기 창의 이름과 같은 말을 씁니다.
  // (옛 활동의 'teacher'는 '활동 모둠'으로 읽습니다 — 그때도 이 활동만의
  //  모둠을 교사가 짜는 방식이었습니다)
  const modeLabel =
    {
      solo: "개별 활동",
      base: "기본 모둠",
      teacher: "활동 모둠",
      random: "무작위",
      free: "자유 구성",
    }[activity.groupMode] ?? "활동 모둠";
  // 닿소리 '개별 활동'은 '모둠 n개'가 아니라 '학생 n명'으로 읽는 게 맞습니다
  const perStudent = !solo && activity.groupMode === "solo";

  return (
    <div className="book-activity-card">
      <button type="button" className="book-activity-open" onClick={onOpen}>
        {/* 제목에 주제어(도서명)를 씁니다 — 무엇을 하는 활동인지는 아래 줄에
            종류로 적히므로, 큰 글자 자리는 카드끼리 갈라 주는 값, 곧 '어느
            책인가'가 맡습니다. 주제어를 비워 둔 개별 활동에서만 활동 이름을
            대신 씁니다(그때는 학생이 각자 자기 판에 주제를 적습니다). */}
        <strong className="book-activity-title">
          {activity.topic?.trim() || myTopic.trim() || activity.title}
        </strong>
        <span className="book-activity-date">{activityDateLabel(activity)}</span>
        <span className="book-activity-meta">
          {kindLabel}
          {" · "}
          {solo
            ? "개인 활동"
            : perStudent
              ? `학생 ${groups.length}명 · ${modeLabel}`
              : `모둠 ${groups.length}개 · ${modeLabel}`}
          {activity.locked && " · 잠김"}
        </span>
      </button>
      {isTeacher && (
        <div className="book-activity-actions">
          {/* 편집 — 학생이 이미 낱말을 넣은 뒤에도 됩니다.
              낱말은 활동 id로 이어져 있어 이름과 무관합니다. */}
          <button type="button" className="btn-ghost" onClick={onEdit} title="이름·주제어 편집">
            편집
          </button>
          <button type="button" className="btn-ghost" onClick={onToggleLock}>
            {activity.locked ? "잠금 해제" : "잠그기"}
          </button>
          <button type="button" className="btn-ghost qa-delete" onClick={onDelete}>
            <IconTrash size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
