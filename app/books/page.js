"use client";

// =============================================================
// 책방 — 책을 읽고 함께하는 활동 공간 (반별)
// -------------------------------------------------------------
// 화면 흐름
//   활동 목록 → 모둠 대시보드 → 모둠 판(학생) / 집계 대시보드(교사)
//
// · 활동 목록: 교사가 '닿소리 채우기' 활동을 만듭니다.
// · 모둠 대시보드: 전체 모둠 카드가 보이고, 자기 모둠으로 들어갑니다.
//     교사는 여기서 모둠을 구성하고 집계 화면으로 넘어갑니다.
// · 모둠 판: 3×5 격자에 자음별 단어를 채우는 협동 캔버스.
// · 집계 대시보드: 모든 모둠의 단어를 한 격자에 모아 실시간으로 봅니다.
// =============================================================
import { useEffect, useMemo, useState } from "react";
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
} from "@/lib/store";
import { isFirebaseConfigured } from "@/lib/firebase";
import { isAdmin, isTeacher } from "@/lib/user";
import { getSelectedClassId, setSelectedClassId } from "@/lib/classroom";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { useRequireAuth } from "@/lib/useRequireAuth";
import TopNav from "@/components/TopNav";
import ClassEntry from "@/components/ClassEntry";
import Toast from "@/components/Toast";
import ConfirmModal from "@/components/ConfirmModal";
import BookActivityForm from "@/components/BookActivityForm";
import BookGroupBoard from "@/components/BookGroupBoard";
import ConsonantCanvas from "@/components/ConsonantCanvas";
import ConsonantDashboard from "@/components/ConsonantDashboard";
import { IconBook, IconTrash } from "@/components/StatusIcons";

export default function BooksPage() {
  const user = useCurrentUser();
  useRequireAuth();
  const admin = user ? isTeacher(user) : false;
  const superAdmin = user ? isAdmin(user) : false;

  const [classes, setClasses] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [localSelectedId, setLocalSelectedId] = useState(null);
  const [teacherClassId, setTeacherClassId] = useState(null);
  const [directory, setDirectory] = useState([]);
  const [memberUids, setMemberUids] = useState([]);

  const [activities, setActivities] = useState([]);
  const [openActivity, setOpenActivity] = useState(null); // 모둠 대시보드로 연 활동
  const [openGroupId, setOpenGroupId] = useState(null);   // 캔버스로 연 모둠
  const [dashboardOpen, setDashboardOpen] = useState(false); // 교사 집계 화면
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [toast, setToast] = useState("");

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
  }, [admin, myClasses, teacherClassId, localSelectedId]);

  const classId = admin ? teacherClassId : studentClassId;
  const currentClass = (admin ? myClasses : classes).find((c) => c.id === classId) ?? null;

  useEffect(() => subscribeBookActivities(classId, setActivities), [classId]);

  // 교사: 모둠 구성용 반 학생 명단
  useEffect(() => {
    if (!admin || !classId) { setMemberUids([]); return; }
    return subscribeClassMembers(classId, setMemberUids);
  }, [admin, classId]);

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
  const activeActivity = openActivity
    ? activities.find((a) => a.id === openActivity.id) ?? openActivity
    : null;

  async function handleCreate(form) {
    await addBookActivity(user, { classId, ...form });
    setCreating(false);
    setToast("활동을 만들었어요.");
  }

  async function handleDelete() {
    const target = confirmDelete;
    setConfirmDelete(null);
    await deleteBookActivity(target.id);
    if (openActivity?.id === target.id) setOpenActivity(null);
    setToast("활동을 삭제했어요.");
  }

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

      {/* 집계 대시보드(교사) — 전체 화면을 차지합니다 */}
      {dashboardOpen && activeActivity ? (
        <ConsonantDashboard
          activity={activeActivity}
          onClose={() => setDashboardOpen(false)}
        />
      ) : openGroupId && activeActivity ? (
        <ConsonantCanvas
          activity={activeActivity}
          groupId={openGroupId}
          user={user}
          isTeacher={admin}
          onBack={() => setOpenGroupId(null)}
        />
      ) : activeActivity ? (
        <BookGroupBoard
          activity={activeActivity}
          user={user}
          isTeacher={admin}
          roster={roster}
          onOpenGroup={(gid) => setOpenGroupId(gid)}
          onOpenDashboard={() => setDashboardOpen(true)}
          onBack={() => setOpenActivity(null)}
          onToast={setToast}
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
            </div>
            {admin && classId && (
              <button className="btn-primary" onClick={() => setCreating(true)}>
                ＋ 활동 만들기
              </button>
            )}
          </div>

          <p className="books-intro">
            책을 읽고 떠오른 생각을 모둠 친구들과 함께 모아 보세요.
          </p>

          {admin && myClasses.length === 0 ? (
            <p className="empty-note">
              아직 만든 반이 없어요. 공부방에서 반을 먼저 만들어 주세요.
            </p>
          ) : activities.length === 0 ? (
            <p className="empty-note">
              {admin
                ? "아직 활동이 없어요. ‘활동 만들기’로 첫 활동을 열어 보세요."
                : "아직 열린 활동이 없어요. 선생님이 활동을 열면 여기에 나타납니다."}
            </p>
          ) : (
            <div className="book-activity-grid">
              {activities.map((a) => (
                <ActivityCard
                  key={a.id}
                  activity={a}
                  isTeacher={admin}
                  onOpen={() => setOpenActivity(a)}
                  onDelete={() => setConfirmDelete(a)}
                  onToggleLock={() => updateBookActivity(a.id, { locked: !a.locked })}
                />
              ))}
            </div>
          )}
        </main>
      )}

      {creating && (
        <BookActivityForm onSave={handleCreate} onClose={() => setCreating(false)} />
      )}

      {confirmDelete && (
        <ConfirmModal
          title="활동 삭제"
          preview={confirmDelete.title}
          description={"이 활동의 모둠과 모아둔 단어가\n모두 삭제됩니다. 되돌릴 수 없습니다."}
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

// 활동 카드 — 목록에 한 줄씩
function ActivityCard({ activity, isTeacher, onOpen, onDelete, onToggleLock }) {
  const [groups, setGroups] = useState([]);
  useEffect(() => subscribeBookGroups(activity.id, setGroups), [activity.id]);

  const modeLabel =
    { teacher: "교사 배정", random: "무작위 배정", free: "자유 구성" }[activity.groupMode] ??
    "교사 배정";

  return (
    <div className="book-activity-card">
      <button type="button" className="book-activity-open" onClick={onOpen}>
        <span className="book-activity-topic">{activity.topic || "주제 미정"}</span>
        <strong className="book-activity-title">{activity.title}</strong>
        <span className="book-activity-meta">
          모둠 {groups.length}개 · {modeLabel}
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
