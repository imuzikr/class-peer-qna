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
  addBookActivity,
  deleteBookActivity,
  updateBookActivity,
  subscribeClasses,
  subscribeMyMemberships,
  subscribeClassMembers,
  subscribeUserDirectory,
  subscribeStudyGroupAssignment,
  subscribeStudyBoards,
  subscribeClassStudyAttendance,
} from "@/lib/store";
import { isFirebaseConfigured } from "@/lib/firebase";
import { isAdmin, isTeacher } from "@/lib/user";
import { getSelectedClassId, setSelectedClassId } from "@/lib/classroom";
import { useCurrentUser } from "@/lib/useCurrentUser";
import AuthGate from "@/components/AuthGate";
import TopNav from "@/components/TopNav";
import ClassEntry from "@/components/ClassEntry";
import Toast from "@/components/Toast";
import ConfirmModal from "@/components/ConfirmModal";
import BookActivityForm from "@/components/BookActivityForm";
import ClassNotesTools from "@/components/ClassNotesTools";
import StudyActivityPanel from "@/components/StudyActivityPanel";
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

const ACTIVITY_KINDS = [
  {
    key: "consonant",
    label: "닿소리 채우기",
    desc: "모둠이 함께 자음 칸을 낱말로 채웁니다",
    addLabel: "닿소리 활동 추가하기",
  },
  {
    key: "paratext",
    label: "곁텍스트 읽기",
    desc: "표지·제목·목차를 보고 내용을 짐작합니다",
    addLabel: "곁텍스트 활동 추가하기",
  },
  {
    key: "raft",
    label: "RAFT 글쓰기",
    desc: "역할·청중·형식·주제를 정해 글을 씁니다",
    addLabel: "RAFT 활동 추가하기",
  },
  {
    key: "kwls",
    label: "KWLS로 성찰하기",
    desc: "읽기 전후 생각을 K-W-L-S로 정리합니다",
    addLabel: "KWLS 활동 추가하기",
  },
  {
    key: "mindmap",
    label: "마인드맵",
    desc: "주제에서 가지를 뻗어 생각을 펼칩니다",
    addLabel: "마인드맵 추가하기",
  },
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

  // 활동 종류 그리드 → 종류별 목록 → 활동 상세, 이 세 단계를 URL(?kind=&activity=)
  // 로 관리합니다. 그래야 브라우저의 '뒤로 가기'를 눌렀을 때 이 앱의 상태가
  // 아니라 그 전 최상위 페이지로 곧장 나가버리지 않고, 한 단계씩 되돌아갑니다.
  const router = useRouter();
  const searchParams = useSearchParams();
  const openKind = searchParams.get("kind");
  const openActivityId = searchParams.get("activity");

  function goToGrid() {
    router.push("/books");
  }
  function goToKind(kindKey) {
    router.push(kindKey ? `/books?kind=${kindKey}` : "/books");
  }
  function goToActivity(activity) {
    router.push(`/books?kind=${activity.type}&activity=${activity.id}`);
  }

  const [classes, setClasses] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [localSelectedId, setLocalSelectedId] = useState(null);
  const [teacherClassId, setTeacherClassId] = useState(null);
  const [directory, setDirectory] = useState([]);
  const [memberUids, setMemberUids] = useState([]);
  const [baseGroupAssignment, setBaseGroupAssignment] = useState(null);

  const [activities, setActivities] = useState([]);
  const [openGroups, setOpenGroups] = useState([]);       // 연 활동의 모둠 목록
  const [allView, setAllView] = useState(false);          // 교사: 반 전체 집계 화면
  const [creatingType, setCreatingType] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
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
  const currentClass = (admin ? myClasses : classes).find((c) => c.id === classId) ?? null;

  useEffect(() => subscribeBookActivities(classId, setActivities), [classId]);

  useEffect(() => {
    if (!admin || !classId) {
      setBaseGroupAssignment(null);
      return;
    }
    return subscribeStudyGroupAssignment(classId, setBaseGroupAssignment);
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

  // 활동을 열어둔 채 목록이 갱신되면 최신 문서로 맞춰줍니다(주제 수정·잠금 반영).
  const activeActivity = openActivityId
    ? activities.find((a) => a.id === openActivityId) ?? null
    : null;
  const activeClassId = activeActivity?.classId ?? classId;
  const activeClassName = classes.find((c) => c.id === activeClassId)?.name ?? "";
  const openKindInfo = openKind ? ACTIVITY_KIND_BY_KEY.get(openKind) ?? null : null;
  const activitiesByKind = useMemo(() => {
    return ACTIVITY_KINDS.map((kind) => {
      const items = activities
        .filter((a) => a.type === kind.key)
        .sort((a, b) => activityTime(a) - activityTime(b));
      return { ...kind, items };
    });
  }, [activities]);
  const openKindActivities =
    activitiesByKind.find((kind) => kind.key === openKind)?.items ?? [];

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
    if (openActivityId === target.id) goToKind(target.type);
    setToast("활동을 삭제했어요.");
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
          onBack={() => goToKind(activeActivity.type)}
          classTools={classTools}
        />
      ) : isMindmap ? (
        <MindmapForm
          activity={activeActivity}
          user={user}
          onBack={() => goToKind(activeActivity.type)}
        />
      ) : /* KWLS로 성찰하기(개인 활동) — 교사는 학생별 카드+칸별 방송, 학생은 4칸 화면 */
      isKwls && admin ? (
        <KwlsBoard
          activity={activeActivity}
          className={activeClassName}
          classId={activeClassId}
          user={user}
          roster={roster}
          onBack={() => goToKind(activeActivity.type)}
          classTools={classTools}
        />
      ) : isKwls ? (
        <KwlsForm
          activity={activeActivity}
          user={user}
          onBack={() => goToKind(activeActivity.type)}
        />
      ) : /* RAFT 글쓰기(개인 활동) — 교사는 학생별 카드+방송, 학생은 4열 화면 */
      isRaft && admin ? (
        <RaftBoard
          activity={activeActivity}
          className={activeClassName}
          classId={activeClassId}
          user={user}
          roster={roster}
          onBack={() => goToKind(activeActivity.type)}
          classTools={classTools}
        />
      ) : isRaft ? (
        <RaftForm
          activity={activeActivity}
          user={user}
          onBack={() => goToKind(activeActivity.type)}
        />
      ) : /* 곁텍스트 읽기(개인 활동) — 교사는 학생별 카드, 학생은 자기 입력 화면 */
      isParatext && admin ? (
        <ParatextBoard
          activity={activeActivity}
          className={activeClassName}
          classId={activeClassId}
          user={user}
          roster={roster}
          onBack={() => goToKind(activeActivity.type)}
          classTools={classTools}
        />
      ) : isParatext ? (
        <ParatextForm
          activity={activeActivity}
          user={user}
          onBack={() => goToKind(activeActivity.type)}
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
          onBack={() => goToKind(activeActivity.type)}
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
          onBack={() => goToKind(activeActivity.type)}
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
              {/* 돌아가기는 제목 바로 뒤 — 화면을 한 단계 되돌리는 것이라
                  '어느 반이냐'(반 고르기)보다 앞섭니다. 제목 줄에 두면
                  제목·설명과 뒤섞여 눈이 한 번 더 더듬습니다. */}
              {openKindInfo && (
                <button
                  type="button"
                  className="btn-ghost books-head-btn"
                  onClick={goToGrid}
                >
                  ← 활동 종류
                </button>
              )}
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
              {admin && classId && !openKindInfo && (
                <button className="btn-primary" onClick={() => setCreatingType("consonant")}>
                  ＋ 독서 활동 만들기
                </button>
              )}
              {classTools}
            </div>
          </div>

          {admin && myClasses.length === 0 ? (
            <p className="empty-note">
              아직 만든 반이 없어요. 공부방에서 반을 먼저 만들어 주세요.
            </p>
          ) : openKindInfo ? (
            <ActivityKindDashboard
              kind={openKindInfo}
              activities={openKindActivities}
              isTeacher={admin}
              onAdd={() => setCreatingType(openKindInfo.key)}
              onOpen={goToActivity}
              onDelete={setConfirmDelete}
              onToggleLock={(activity) =>
                updateBookActivity(activity.id, { locked: !activity.locked })
              }
            />
          ) : (
            <ActivityKindGrid kinds={activitiesByKind} onOpen={goToKind} />
          )}
        </main>
      )}
      </div>

      {creatingType && (
        <BookActivityForm
          initialType={creatingType}
          fixedType={!!openKindInfo}
          onSave={handleCreate}
          onClose={() => setCreatingType(null)}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          title="활동 삭제"
          preview={confirmDelete.title}
          description={
            confirmDelete.type === "consonant"
              ? "이 활동의 모둠과 모아둔 단어가\n모두 삭제됩니다. 되돌릴 수 없습니다."
              : "학생들이 쓴 내용이 모두 삭제됩니다.\n되돌릴 수 없습니다."
          }
          confirmLabel="삭제"
          danger
          onConfirm={handleDelete}
          onClose={() => setConfirmDelete(null)}
        />
      )}

      {toast && <Toast message={toast} onDone={() => setToast("")} />}
    </div>
  );
}

function ActivityKindGrid({ kinds, onOpen }) {
  return (
    <div className="book-kind-grid">
      {kinds.map((kind) => {
        const latest = kind.items[kind.items.length - 1] ?? null;
        return (
          <button
            key={kind.key}
            type="button"
            className="book-kind-card"
            onClick={() => onOpen(kind.key)}
          >
            <span className="book-kind-count">{kind.items.length}개</span>
            <strong>{kind.label}</strong>
            <em>{kind.desc}</em>
            <span className="book-kind-meta">
              {latest ? `최근 활동 ${activityDateLabel(latest)}` : "아직 만든 활동 없음"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ActivityKindDashboard({
  kind,
  activities,
  isTeacher,
  onAdd,
  onOpen,
  onDelete,
  onToggleLock,
}) {
  return (
    <section className="book-kind-dashboard">
      {/* 한 줄: 제목 · 설명 · (교사) 만들기. 설명을 제목 아래 두 줄로 두면
          그만큼 활동 카드가 밀려 내려갑니다 — 한 번 읽으면 되는 문장이라
          제목 옆에 눕힙니다. '← 활동 종류'는 위쪽 머리말 줄에 있습니다. */}
      <div className="book-kind-head">
        <h2>{kind.label}</h2>
        <p>{kind.desc}</p>
        {isTeacher && (
          <button type="button" className="btn-primary book-kind-add" onClick={onAdd}>
            ＋ {kind.addLabel}
          </button>
        )}
      </div>

      {activities.length === 0 ? (
        <p className="empty-note">
          아직 만든 {kind.label} 활동이 없어요.
          {isTeacher ? ` ‘${kind.addLabel}’로 첫 활동을 열어 보세요.` : " 선생님이 활동을 열면 여기에 나타납니다."}
        </p>
      ) : (
        <div className="book-activity-grid">
          {activities.map((a) => (
            <ActivityCard
              key={a.id}
              activity={a}
              isTeacher={isTeacher}
              onOpen={() => onOpen(a)}
              onDelete={() => onDelete(a)}
              onToggleLock={() => onToggleLock(a)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// 활동 카드 — 목록에 한 줄씩
function ActivityCard({ activity, isTeacher, onOpen, onDelete, onToggleLock }) {
  // 개인 활동(곁텍스트 읽기·RAFT·KWLS·마인드맵)은 모둠이 없습니다.
  const soloLabel = {
    paratext: "곁텍스트 읽기 · 개인 활동",
    raft: "RAFT 글쓰기 · 개인 활동",
    kwls: "KWLS로 성찰하기 · 개인 활동",
    mindmap: "마인드맵 · 개인 활동",
  }[activity.type];
  const [groups, setGroups] = useState([]);
  // 개인 활동은 모둠이 없으므로 모둠 구독 자체를 걸지 않습니다.
  useEffect(() => {
    if (soloLabel) return;
    return subscribeBookGroups(activity.id, setGroups);
  }, [activity.id, soloLabel]);

  // 진행률(14칸을 다 채운 학생 수)은 여기가 아니라 활동을 연 화면에 있습니다.
  // 그 값을 내려면 활동의 낱말을 전부 읽어야 하는데, 목록은 카드가 계속
  // 쌓이는 곳이라 카드마다 그 계산을 돌리면 활동 수에 정비례해 무거워집니다
  // (활동 20개면 목록 한 번 여는 데 7천여 건). 반면 작업 화면과 전체 보기는
  // 이미 그 활동의 낱말을 전부 읽고 있어, 거기서는 읽기가 1건도 안 늡니다.

  const modeLabel =
    { solo: "개별 활동", teacher: "교사 배정", random: "무작위 배정", free: "자유 구성" }[
      activity.groupMode
    ] ?? "교사 배정";
  // 개별 활동은 '모둠 n개'가 아니라 '학생 n명'으로 읽는 게 맞습니다
  const perStudent = activity.groupMode === "solo";

  return (
    <div className="book-activity-card">
      <button type="button" className="book-activity-open" onClick={onOpen}>
        {/* 제목에 주제어(도서명)를 씁니다 — 활동 이름은 이 화면에 오기까지
            거친 종류 카드·머리말('닿소리 채우기')에 이미 두 번 적혀 있어,
            카드마다 또 적으면 정작 구분해야 할 '어느 책인가'가 작은 알약
            하나로 밀려납니다. 주제어를 비워 둔 개별 활동에서만 활동 이름을
            대신 씁니다(그때는 학생이 각자 자기 판에 주제를 적습니다). */}
        <strong className="book-activity-title">
          {activity.topic?.trim() || activity.title}
        </strong>
        <span className="book-activity-date">{activityDateLabel(activity)}</span>
        <span className="book-activity-meta">
          {soloLabel ??
            (perStudent
              ? `학생 ${groups.length}명 · ${modeLabel}`
              : `모둠 ${groups.length}개 · ${modeLabel}`)}
          {activity.locked && " · 잠김"}
        </span>
      </button>
      {isTeacher && (
        <div className="book-activity-actions">
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
