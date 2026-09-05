"use client";

// =============================================================
// 공부방 — 수업의 연장. 반(클래스)별 프로젝트 공간.
//   · 질문 게시판은 전체 공유 공간, 공부방은 "반별" 공간입니다.
//   · 학생: 입장 코드로 반에 들어와 그 반의 프로젝트만 봅니다.
//   · 교사: 상단 드롭다운으로 반을 고르고, 반을 새로 만들 수 있습니다.
//
// [화면 흐름] 프로젝트 대시보드 → 프로젝트 → 개인 카드(활동)
//   교사  공부방에 들어오면 '＋ 프로젝트 만들기'가 있는 카드형 대시보드.
//         프로젝트를 열면 반 학생 전원의 개인 카드가 한 칸씩 깔립니다.
//   학생  교사가 만든 프로젝트가 카드로 보이고, 프로젝트를 열면 자기
//         카드에서 교사가 정해 둔 활동을 순서대로 수행합니다.
//         (개인 카드는 기본적으로 본인과 교사만 볼 수 있습니다)
//
// 어느 프로젝트를 열고 있는지는 URL(?project=<보드 id>)로 관리합니다 —
// 그래야 브라우저 '뒤로 가기'가 공부방을 통째로 벗어나지 않고 대시보드로
// 한 단계만 되돌아갑니다(수업 준비 화면의 ?panel=·?lesson=과 같은 방식).
//
// 키워드를 연계한 프로젝트에서는 카드에서 바로 질문하고(질문하기),
// 관련 질문을 모아 볼 수 있습니다.
// =============================================================
import { backdropClose } from "@/lib/modal";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import {
  subscribeStudyBoards,
  fetchStudyCardsOnce,
  subscribeKeywords,
  subscribeClasses,
  subscribeUserDirectory,
  subscribeMyMemberships,
  subscribeJoinCodes,
  subscribeClassMembers,
  subscribeClassRewards,
  setStudentReward,
  addStudentReward,
  regenerateJoinCode,
  reorderStudyBoards,
  ensureDefaultStudyBoard,
  markStudyAttendance,
  subscribeMyStudyAttendance,
  subscribeClassStudyAttendance,
  startClassAttendance,
  stopClassAttendance,
  todayDateKey,
  subscribeStudyGroupAssignment,
  subscribeStudySeatLayout,
  saveStudySeatLayout,
  saveStudyGroupAssignment,
  subscribeMyLessons,
  ensureClassIdSynced,
  fetchClassRosterProfiles,
  toDate,
} from "@/lib/store";
import { isFirebaseConfigured } from "@/lib/firebase";
import { isAdmin, isTeacher, getCurrentUser } from "@/lib/user";
import { getSelectedClassId, setSelectedClassId } from "@/lib/classroom";
import { useCurrentUser } from "@/lib/useCurrentUser";
import AuthGate from "@/components/AuthGate";
import { codeBlockHtml } from "@/lib/html";
import {
  buildStudyRows,
  downloadStudyCsv,
  downloadStudyWorkbook,
  printStudyPdf,
  printStudyPdfSections,
} from "@/lib/exportStudy";
import TopNav from "@/components/TopNav";
import StudyRewardPanel from "@/components/StudyRewardPanel";
import StudyProjectDashboard from "@/components/StudyProjectDashboard";
import StudyProjectView from "@/components/StudyProjectView";
import StudyProjectForm from "@/components/StudyProjectForm";
import StudyActivityPanel from "@/components/StudyActivityPanel";
import NewQuestionForm from "@/components/NewQuestionForm";
import ClassEntry from "@/components/ClassEntry";
import ClassManagerModal from "@/components/ClassManagerModal";
import Toast from "@/components/Toast";
import RewardCelebration from "@/components/RewardCelebration";
import { useRewardCelebration } from "@/lib/useRewardCelebration";
import KwlPanel from "@/components/KwlPanel";
import TeacherKwlPanel from "@/components/TeacherKwlPanel";
import LessonManagerModal from "@/components/LessonManagerModal";
import StudyAttendanceModal from "@/components/StudyAttendanceModal";
import CornellNoteViewerModal from "@/components/CornellNoteViewerModal";
import SeatGroupSetupModal from "@/components/SeatGroupSetupModal";
import MySeatModal from "@/components/MySeatModal";
import ClassNotesTools from "@/components/ClassNotesTools";
import { IconArchive } from "@/components/StatusIcons";
import { updateLesson } from "@/lib/store";

// 파이썬 실행기(CodeMirror 등)는 무거워 지연 로딩 → 초기 로드/전환 속도 개선
const PythonRunner = dynamic(() => import("@/components/PythonRunner"), {
  ssr: false,
});

// 수업하기(수업 준비·수업 진행) 화면 — 공부방을 여는 사람 대부분은 오늘
// 이걸 쓰지 않는데, 정적 import라 늘 함께 받고 있었습니다. 파이썬 실행기와
// 같은 방식으로 실제로 열 때 받습니다.
//
// 대신 수업 자료 목록을 여는 순간 미리 받아 둡니다(preloadLessonMode).
// 학생들 앞에서 '수업 시작'을 누른 뒤 화면이 늦게 뜨면 곤란한데, 목록을
// 열어 자료를 고르는 사이에 이미 받아 두면 그 순간의 기다림이 없습니다.
const loadLessonMode = () => import("@/components/LessonMode");
const LessonMode = dynamic(loadLessonMode, { ssr: false });

// 수업 자료 목록이 열려 있는 동안 수업하기 화면을 미리 받아 둡니다.
// 그리는 것은 없고(null), 받아 두기만 합니다 — 실패해도 무시합니다.
// 못 받아 두면 열 때 받게 될 뿐이라 동작에는 지장이 없습니다.
function PreloadLessonMode() {
  useEffect(() => {
    loadLessonMode().catch(() => {});
  }, []);
  return null;
}

// 왼쪽 사이드 패널 — 현재는 프로젝트 활동 추가 패널(StudyActivityPanel)이
// KWL 패널 자리를 대신합니다. KWL 패널은 삭제하지 않고 잠시 보관 중이며,
// 이 값을 true로 되돌리면 다시 켤 수 있습니다.
const KWL_PANEL_ENABLED = false;

export default function StudyPage() {
  // useSearchParams()는 정적 프리렌더 시 Suspense 경계가 필요합니다 —
  // 수업 준비 목록/편집/진행 화면을 브라우저 히스토리(뒤로 가기)와 맞추려고 씁니다.
  return (
    <Suspense fallback={null}>
      <AuthGate>
        <StudyPageInner />
      </AuthGate>
    </Suspense>
  );
}

function StudyPageInner() {
  const user = useCurrentUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [classes, setClasses] = useState([]);
  const [boards, setBoards] = useState([]);
  const [keywordDocs, setKeywordDocs] = useState([]);
  // 학생이 입장한 반(세션 선택 + 서버 소속)과 교사가 보고 있는 반(화면 상태)은 별개입니다.
  const [localSelectedId, setLocalSelectedId] = useState(null); // 세션에서 고른 반
  const [memberships, setMemberships] = useState([]); // 서버 소속(기기 무관)
  // 소속 구독의 첫 답이 왔는가 — []가 '소속 없음'인지 '아직 모름'인지 가릅니다
  const [membershipsLoaded, setMembershipsLoaded] = useState(false);
  const [teacherClassId, setTeacherClassId] = useState(null);
  const [joinCodesMap, setJoinCodesMap] = useState({}); // 교사: classId→{code,expiresAt}
  const [regenerating, setRegenerating] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [classManagerOpen, setClassManagerOpen] = useState(false);
  const [showCode, setShowCode] = useState(false); // 입장 코드 표시 토글
  const [attendanceOpen, setAttendanceOpen] = useState(false); // 출석부 모달
  const [noteViewerOpen, setNoteViewerOpen] = useState(false); // 내 수업 노트 크게 보기(학생)
  const [mySeatOpen, setMySeatOpen] = useState(false); // 자리 배치 보기(학생)
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [baseGroupAssignment, setBaseGroupAssignment] = useState(null);
  const [attending, setAttending] = useState(false);
  const [lessons, setLessons] = useState([]); // 교사: 내가 만든 수업 자료 목록
  const [seatSetupOpen, setSeatSetupOpen] = useState(false); // 자리 배정·모둠 설정 모달
  const [seatSetupReturnTo, setSeatSetupReturnTo] = useState(null); // "lessons" | "classManager" | null — 닫을 때 돌아갈 곳
  const [seatLayout, setSeatLayout] = useState(null);
  const [askKeyword, setAskKeyword] = useState(null); // "질문하기"로 새 질문 작성
  const [askCode, setAskCode] = useState(null);     // 파이썬 실행기에서 넘어온 코드
  const [askKwlW, setAskKwlW] = useState(null);    // KWL W칸에서 넘어온 텍스트
  const [pyOpen, setPyOpen] = useState(false);      // 파이썬 실행 패널
  const [cardModalOpen, setCardModalOpen] = useState(false); // StudyProjectView 모달
  const [kwlMobileOpen, setKwlMobileOpen] = useState(false); // 모바일 KWL 패널 (현재 보관 중)
  // 학생용 KWLS 차트 패널 — 왼쪽에서 폭을 벌리며 밀고 들어옵니다(떠 있지 않음)
  const [kwlPanelOpen, setKwlPanelOpen] = useState(false);
  const [activityPanelMobileOpen, setActivityPanelMobileOpen] = useState(false); // 모바일 활동 패널
  const [toast, setToast] = useState("");
  const [directory, setDirectory] = useState([]);   // 교사: uid→실명 등 프로필
  const [memberUids, setMemberUids] = useState([]);  // 현재 반 소속 학생 uid
  const [rewards, setRewards] = useState([]);        // 현재 반 보상(과일) 목록
  const ensuringDefaultBoardRef = useRef(new Set());

  // 공부방 활동 자료 내보내기 (교사) — 상세 선택은 모달에서
  const [exporting, setExporting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  // 한 반의 보드 카드를 모아 행으로 구성
  async function rowsForBoards(boardList, className) {
    const lists = await Promise.all(boardList.map((b) => fetchStudyCardsOnce(b.id)));
    const cardsByBoard = {};
    boardList.forEach((b, i) => { cardsByBoard[b.id] = lists[i]; });
    const dirMap = new Map(directory.map((d) => [d.uid, d]));
    return buildStudyRows({
      className,
      boards: boardList.map((b) => ({ id: b.id, title: b.title })),
      cardsByBoard,
      dirMap,
    });
  }
  // scope: "class"(현재 반) | "all"(전체 반), kind: "csv"|"pdf"|"excel"
  async function handleExport(scope, kind) {
    if (exporting) return;
    setExporting(true);
    try {
      if (scope === "class") {
        const rows = await rowsForBoards(classBoards, currentClass?.name || "");
        if (rows.length === 0) { setToast("내보낼 학생 활동 카드가 아직 없어요."); return; }
        const base = `${currentClass?.name || "공부방"}_활동자료`;
        if (kind === "csv") downloadStudyCsv(rows, `${base}.csv`);
        else printStudyPdf(rows, currentClass?.name || "공부방");
      } else {
        // 전체 반 — 반별로 시트(엑셀)/구역(PDF) 분리
        const sections = await Promise.all(
          myClasses.map(async (c) => ({
            name: c.name,
            className: c.name,
            rows: await rowsForBoards(
              boards.filter((b) => b.classId === c.id),
              c.name
            ),
          }))
        );
        const withRows = sections.filter((s) => s.rows.length > 0);
        if (withRows.length === 0) { setToast("내보낼 학생 활동 카드가 아직 없어요."); return; }
        if (kind === "excel") {
          downloadStudyWorkbook(withRows, "공부방_활동자료_전체.xlsx");
        } else {
          printStudyPdfSections(withRows, "전체 반");
        }
      }
      setExportOpen(false);
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => {
    const unsubC = subscribeClasses(setClasses);
    const unsubB = subscribeStudyBoards(setBoards);
    const unsubK = subscribeKeywords(setKeywordDocs);
    return () => {
      unsubC();
      unsubB();
      unsubK();
    };
  }, []);

  // 세션에서 고른 반을 읽고, 반/역할이 바뀌면 다시 평가합니다
  useEffect(() => {
    const sync = () => setLocalSelectedId(getSelectedClassId());
    sync();
    window.addEventListener("class-change", sync);
    window.addEventListener("role-change", sync);
    return () => {
      window.removeEventListener("class-change", sync);
      window.removeEventListener("role-change", sync);
    };
  }, []);

  const admin = user ? isTeacher(user) : false;      // 교사+최고관리자 (교사 화면)
  const superAdmin = user ? isAdmin(user) : false;   // 최고 관리자 (모든 반 접근)

  // 학생: 서버 소속 구독 — 기기·캐시가 바뀌어도 로그인하면 소속이 따라옵니다.
  //
  // **첫 답이 오기 전까지는 '소속 없음'이 아니라 '아직 모름'입니다.**
  // memberships는 []로 시작하는데, 그 값만 보고 판단하면 로그인 직후
  // 서버 답을 기다리는 몇백 밀리초 동안 반에 이미 든 학생에게도 입장 코드
  // 화면이 번쩍 스쳤습니다(공부방을 첫 화면으로 두면 매번 겪습니다).
  // 그래서 '답이 한 번이라도 왔는가'를 따로 들고, 그 전에는 아래에서
  // 조용히 기다립니다.
  useEffect(() => {
    if (!user || admin) {
      setMemberships([]);
      // 교사·비로그인은 물어볼 것이 없어 곧바로 결론입니다.
      setMembershipsLoaded(true);
      return;
    }
    setMembershipsLoaded(false);
    return subscribeMyMemberships(user.uid, (list) => {
      setMemberships(list);
      setMembershipsLoaded(true);
    });
  }, [user?.uid, admin]);

  // 학생: 프로필의 classIds에 지금 소속된 반이 다 들어 있는지 확인하고,
  // 빠진 게 있으면 채워 넣습니다(공부방 급우 명단 공개 판정 기준). 이 기능이
  // 생기기 전에 이미 가입해 둔 계정은 처음엔 classIds가 비어 있는데,
  // joinClass를 다시 부를 일이 없어도 이 자가 치유가 대신 채워 줍니다.
  useEffect(() => {
    if (!user || admin) return;
    memberships.forEach((m) => {
      if (m.classId) ensureClassIdSynced(user, m.classId);
    });
  }, [user, admin, memberships]);

  // 교사/관리자만 사용자 디렉터리(실명) + 입장 코드 구독.
  // 학생은 보안 규칙상 users·joinCodes 목록을 읽을 수 없으므로 구독하지 않습니다.
  useEffect(() => {
    if (!admin) {
      setDirectory([]);
      return;
    }
    const unsubDir = subscribeUserDirectory(setDirectory);
    // 일반 교사는 본인 코드만(규칙상 소유 코드만 나열 가능), 최고 관리자는 전체
    const unsubCodes = subscribeJoinCodes(setJoinCodesMap, isAdmin(user) ? null : user?.uid);
    return () => {
      unsubDir();
      unsubCodes();
    };
  }, [admin, user?.uid]);

  // 학생이 보고 있는 반: 세션 선택이 내 소속에 있으면 그것, 아니면 첫 소속.
  // 보관된 반은 학생 접근이 막히므로 후보에서 제외합니다.
  const membershipIds = useMemo(() => memberships.map((m) => m.classId), [memberships]);
  const activeMembershipIds = useMemo(
    () => membershipIds.filter((id) => !classes.find((c) => c.id === id)?.archived),
    [membershipIds, classes]
  );
  const studentClassId =
    localSelectedId && activeMembershipIds.includes(localSelectedId)
      ? localSelectedId
      : activeMembershipIds[0] ?? null;

  const keywordNames = useMemo(
    () => keywordDocs.map((k) => k.name),
    [keywordDocs]
  );

  // 교사가 접근 가능한 반 — 일반 교사는 본인 개설 반만, 최고 관리자는 전체.
  // (반 이름 자체는 규칙상 공개 메타데이터라 목록은 여기서 소유자로 걸러냅니다.)
  // myClassesAll: 보관된 반 포함(반 관리하기 모달·보관된 반 보기용)
  // myClasses   : 운영 중인 반만(상단 드롭다운·기본 진입 대상)
  const myClassesAll = useMemo(
    () =>
      superAdmin
        ? classes
        : classes.filter((c) => c.createdBy && c.createdBy === user?.uid),
    [classes, superAdmin, user?.uid]
  );
  const myClasses = useMemo(
    () => myClassesAll.filter((c) => !c.archived),
    [myClassesAll]
  );

  // 교사가 고른 반은 세션에 저장돼 있어(localSelectedId), 새로고침해도 그 반을
  // 이어서 보여줍니다. 저장된 값이 없거나 더 이상 존재하지 않는 반이면
  // 첫 번째(운영 중인) 반으로 폴백합니다. '반 관리하기'에서 보관된 반을
  // 눌러 보는 중일 때는(teacherClassId가 보관된 반이어도) 그대로 둡니다.
  useEffect(() => {
    if (!admin || myClassesAll.length === 0) return;
    const valid = teacherClassId && myClassesAll.some((c) => c.id === teacherClassId);
    if (valid) return;
    const remembered =
      localSelectedId && myClasses.some((c) => c.id === localSelectedId)
        ? localSelectedId
        : myClasses[0]?.id ?? myClassesAll[0].id;
    setTeacherClassId(remembered);
  }, [admin, myClasses, myClassesAll, teacherClassId, localSelectedId]);

  // teacherClassId가 바뀌는 모든 경로(위 자동 대체 포함)를 세션 저장값과
  // 동기화합니다. 이전엔 드롭다운 선택 등 몇몇 호출부에서만 개별적으로
  // setSelectedClassId를 불러, 반이 하나뿐이라 드롭다운을 만질 일이 없는
  // 교사는 이 값이 끝내 비워진 채로 남았습니다 — 그 값을 읽는 TopNav의
  // '언제든 질문하기(손들기)' 구독이 엉뚱한(또는 없는) 반을 보게 되어,
  // 학생이 손을 들어도 교사 화면에 아이콘이 나타나지 않는 원인이었습니다.
  useEffect(() => {
    if (!admin || !teacherClassId) return;
    setSelectedClassId(teacherClassId);
  }, [admin, teacherClassId]);

  const classId = admin ? teacherClassId : studentClassId;
  // 과일을 받은 순간 — 학생 화면에서만 축포를 터뜨립니다(useRewardCelebration 참고)
  const [cheerAmount, clearCheer] = useRewardCelebration(classId, user?.uid, !admin);
  const currentClass =
    (admin ? myClassesAll : classes).find((c) => c.id === classId) ?? null;
  const currentCode = joinCodesMap[classId] ?? null; // { code, expiresAt } | null
  const classBoards = useMemo(
    () => boards.filter((b) => b.classId === classId),
    [boards, classId]
  );
  // 다른 반에 만들어 둔 프로젝트 — 수업 자료 편집의 '다른 반에서 가져오기'가
  // 통째로 복사해 오는 대상입니다. boards는 이미 전체를 구독하고 있어 읽기가
  // 늘지 않습니다. 남의 반이 섞이지 않도록 내 반(보관된 반 포함 — 지난 학기
  // 활동을 그대로 쓰는 일이 흔합니다)으로 한 번 거릅니다.
  // duplicateStudyBoard가 공개 범위·활동 유형까지 읽으므로 보드 문서를 통째로
  // 넘기고 반 이름만 덧붙입니다.
  const otherClassBoards = useMemo(() => {
    if (!admin) return [];
    const names = new Map(myClassesAll.map((c) => [c.id, c.name]));
    return boards
      .filter(
        (b) =>
          b.classId &&
          b.classId !== classId &&
          b.type !== "notice" &&
          names.has(b.classId) &&
          (b.activities?.length ?? 0) > 0
      )
      .map((b) => ({ ...b, className: names.get(b.classId) ?? "" }));
  }, [admin, boards, classId, myClassesAll]);
  const todayAttendanceKey = todayDateKey();
  const attendedToday = !admin && attendanceRecords.some((r) => r.date === todayAttendanceKey);
  // 교사가 '출석 시작'을 오늘 눌렀을 때만 유효 — attendanceOpenDate가 오늘과
  // 다르면(종료를 깜빡 잊고 다음 날로 넘어간 경우) 열려 있어도 오늘은 닫힌
  // 것으로 봅니다. store.js의 startClassAttendance/보안 규칙과 같은 기준.
  const attendanceOpenToday =
    !!currentClass?.attendanceOpen && currentClass?.attendanceOpenDate === todayAttendanceKey;

  // 자리표 색칠용 — 오늘 출석한 학생 집합.
  // 아직 출석을 시작하지도, 기록이 하나도 남지도 않았다면 null을 주어
  // 자리를 모두 '확인 전(회색)'으로 둡니다. 출석을 열자마자 반 전체가
  // 결석(주황)으로 물드는 일이 없도록, 출석 중이면 기록이 없어도 색을
  // 나눠 줍니다(아직 안 누른 학생이 곧 결석 후보라는 뜻).
  const todayPresentUids = useMemo(() => {
    if (!admin) return null;
    const todays = attendanceRecords.filter((r) => r.date === todayAttendanceKey);
    if (!attendanceOpenToday && todays.length === 0) return null;
    return new Set(todays.map((r) => r.uid).filter(Boolean));
  }, [admin, attendanceRecords, todayAttendanceKey, attendanceOpenToday]);


  useEffect(() => {
    if (!classId || !user?.uid) {
      setAttendanceRecords([]);
      return;
    }
    if (admin) return subscribeClassStudyAttendance(classId, setAttendanceRecords);
    return subscribeMyStudyAttendance(classId, user.uid, setAttendanceRecords);
  }, [admin, classId, user?.uid]);

  useEffect(() => {
    if (!admin || !classId) {
      setBaseGroupAssignment(null);
      return;
    }
    return subscribeStudyGroupAssignment(classId, setBaseGroupAssignment);
  }, [admin, classId]);

  // 자리 배정하기 모달용 — 실제 좌석은 반마다 하나("default")만 둡니다
  // (수업 중 자리 흔들기는 별도 daily 레이아웃, AttendanceBoard가 다룸).
  useEffect(() => {
    if (!admin || !classId) {
      setSeatLayout(null);
      return;
    }
    return subscribeStudySeatLayout(classId, "default", setSeatLayout);
  }, [admin, classId]);

  // 교사가 만든 수업 자료 목록 — 수업 준비 목록/편집/진행 화면을 URL(?lesson=&mode=)로
  // 관리하기 위해 여기서 구독합니다. 그래야 브라우저 '뒤로 가기'를 눌렀을 때 이 화면의
  // 상태가 아니라 그 전 페이지(질문방 등)로 곧장 나가버리지 않고 공부방으로 돌아옵니다.
  useEffect(() => {
    if (!admin || !user?.uid) {
      setLessons([]);
      return;
    }
    return subscribeMyLessons(user.uid, setLessons);
  }, [admin, user?.uid]);

  const lessonParam = searchParams.get("lesson");
  const modeParam = searchParams.get("mode");
  const lessonPicker = admin && searchParams.get("panel") === "lessons";
  const activeLesson = lessonParam ? lessons.find((l) => l.id === lessonParam) ?? null : null;
  const editingLesson = modeParam === "edit" ? activeLesson : null;
  const teaching = modeParam === "teach" ? activeLesson : null;

  // ── 프로젝트 열기/닫기 (?project=<보드 id>) ──
  // 열려 있는 프로젝트는 목록이 갱신될 때마다 최신 문서로 다시 찾습니다 —
  // 그래야 교사가 활동을 열거나 제목을 고치면 이 화면도 바로 따라갑니다.
  const projectParam = searchParams.get("project");
  const activeProject = projectParam
    ? classBoards.find((b) => b.id === projectParam) ?? null
    : null;
  function openProject(board) {
    router.push(`/study?project=${board.id}`);
  }
  function closeProject() {
    router.push("/study");
  }

  function openLessonPicker() {
    router.push("/study?panel=lessons");
  }
  function openLessonEdit(lesson) {
    router.push(`/study?lesson=${lesson.id}&mode=edit`);
  }
  function openLessonTeach(lesson) {
    router.push(`/study?lesson=${lesson.id}&mode=teach`);
  }
  function closeLessonNav() {
    router.push("/study");
  }

  // 자리 배정·모둠 설정 모달 — 수업 준비(LessonManagerModal)와 반 관리하기
  // (ClassManagerModal) 양쪽에서 똑같이 열 수 있습니다. 그 뒤에 있던
  // 모달을 먼저 닫고 열어야 두 모달이 겹쳐 보이지 않고, 닫을 때는
  // 원래 있던 곳으로 되돌아갑니다.
  function openSeatSetupFromLessons() {
    setSeatSetupReturnTo("lessons");
    closeLessonNav();
    setSeatSetupOpen(true);
  }
  function openSeatSetupFromClassManager() {
    setSeatSetupReturnTo("classManager");
    setClassManagerOpen(false);
    setSeatSetupOpen(true);
  }
  function closeSeatSetup() {
    setSeatSetupOpen(false);
    if (seatSetupReturnTo === "lessons") openLessonPicker();
    else if (seatSetupReturnTo === "classManager") setClassManagerOpen(true);
    setSeatSetupReturnTo(null);
  }

  useEffect(() => {
    if (!admin || !user || !currentClass || currentClass.archived) return;
    if (classBoards.some((b) => b.type === "notice")) return;
    if (ensuringDefaultBoardRef.current.has(currentClass.id)) return;
    ensuringDefaultBoardRef.current.add(currentClass.id);
    ensureDefaultStudyBoard(user, currentClass.id).catch((err) => {
      ensuringDefaultBoardRef.current.delete(currentClass.id);
      console.warn("[study] 기본 교사용 보드 생성 실패:", err);
    });
  }, [admin, user, currentClass, classBoards]);

  // 현재 반의 보상(과일) 구독 — 교사·학생 공통 (학생은 규칙상 자기 반만 읽기 가능)
  useEffect(() => {
    if (!classId) {
      setRewards([]);
      return;
    }
    return subscribeClassRewards(classId, setRewards);
  }, [classId]);

  // 현재 반의 소속 학생 uid 구독 (반이 바뀌면 재구독) — 교사는 실명 명단을
  // 만드는 데, 학생은 아래에서 급우 이름표(프로필)를 조회하는 데 씁니다.
  useEffect(() => {
    if (!classId) {
      setMemberUids([]);
      return;
    }
    return subscribeClassMembers(classId, setMemberUids);
  }, [classId]);

  // 학생: 급우 uid 목록으로 이름·학번·이모지를 하나씩 조회합니다(교사 전용인
  // subscribeUserDirectory 대신 — 공부방 프로젝트에서 아직 카드를 안 쓴
  // 급우도 자리를 미리 보여주는 데 씁니다. lib/store.js의
  // fetchClassRosterProfiles 참고).
  const [classmateProfiles, setClassmateProfiles] = useState([]);
  useEffect(() => {
    if (admin || memberUids.length === 0) {
      setClassmateProfiles([]);
      return;
    }
    let cancelled = false;
    fetchClassRosterProfiles(memberUids).then((list) => {
      if (!cancelled) setClassmateProfiles(list);
    });
    return () => { cancelled = true; };
  }, [admin, memberUids]);
  // 학생 화면의 개인 프로젝트 자리 채우기용 — StudyProjectView가 교사 쪽과
  // 같은 모양({uid, name, studentId, emoji})으로 받아 처리할 수 있게 맞춥니다.
  const studentClassRoster = useMemo(
    () => classmateProfiles.map((p) => ({ ...p })),
    [classmateProfiles]
  );

  // 보상 명단
  //  · 교사: 소속 학생 전체를 디렉터리(실명)·과일 수와 합쳐 학번순 정렬
  //  · 학생: 보상 문서만으로 구성 — 과일 받은 친구만, 실명 이름표(공부방은 실명 공간)
  const roster = useMemo(() => {
    if (!admin) {
      return rewards
        .filter((r) => (r.count ?? 0) > 0)
        .map((r) => ({
          uid: r.uid,
          name: r.name || "이름 준비 중", // 과거 문서 — 다음 과일 때 실명이 채워짐
          emoji: r.emoji || "🙂",
          count: r.count ?? 0,
        }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ko"));
    }
    const dir = new Map(directory.map((d) => [d.uid, d]));
    const countByUid = {};
    rewards.forEach((r) => { countByUid[r.uid] = r.count ?? 0; });
    return memberUids
      .map((uid) => {
        const d = dir.get(uid) || {};
        return {
          uid,
          name: d.realName || d.studentId || "이름 미설정",
          studentId: d.studentId || null,
          emoji: d.emoji || "🙂",
          email: d.email || null,
          count: countByUid[uid] ?? 0,
        };
      })
      .sort((a, b) =>
        (a.studentId || a.name).localeCompare(b.studentId || b.name, "ko")
      );
  }, [admin, memberUids, directory, rewards]);

  // 개인 카드 그리드에서 결석생의 빈 자리를 회색으로 눕히는 데 씁니다.
  // 위의 todayPresentUids와 조건이 한 가지 다릅니다 — **출석을 끝냈을 때만**
  // 셉니다(attendanceOpenToday가 false). 출석을 받는 중에는 아직 오는 중일 수
  // 있어, 그때 회색으로 눕히면 지각한 학생이 결석으로 보입니다. 자리표는
  // '지금 누가 눌렀나'를 실시간으로 보는 화면이라 진행 중에도 색을 나누지만,
  // 카드 그리드의 회색은 '오늘 결석으로 확정'이라는 뜻입니다.
  const todayAbsentUids = useMemo(() => {
    if (!admin || attendanceOpenToday) return null;
    const todays = attendanceRecords.filter((r) => r.date === todayAttendanceKey);
    if (todays.length === 0) return null; // 오늘 출석을 아예 안 한 날
    const present = new Set(todays.map((r) => r.uid).filter(Boolean));
    return new Set(roster.filter((s) => !present.has(s.uid)).map((s) => s.uid));
  }, [admin, attendanceRecords, todayAttendanceKey, attendanceOpenToday, roster]);

  // 과일 부여 시 실명을 문서에 함께 저장 — 공부방은 실명 참여 공간이라
  // 학생(읽기 전용) 화면에도 실명 이름표를 보여줍니다.
  // (rewards는 규칙상 그 반 소속 학생만 읽을 수 있어 반 밖으로 새지 않음)
  function awardReward(uid, count, delta = null) {
    const d = directory.find((x) => x.uid === uid);
    const identity = d
      ? {
          name: d.realName || d.studentId || d.displayName || "",
          emoji: d.emoji || "🙂",
        }
      : null;
  // delta가 함께 오면(＋1·−1 단추) **서버에서 더합니다.** 화면에 보이는
  // 개수는 방금 누른 값이 아직 안 돌아왔을 수 있어, 그걸로 만든 절대값을
  // 보내면 빨리 두 번 누를 때 두 번째가 같은 값이 되어 묻힙니다
  // (addStudentReward는 트랜잭션 안에서 읽은 값에 더합니다).
  // delta가 없는 자리(개수를 직접 맞추는 곳)는 지금까지대로 절대값입니다.
    if (delta) return addStudentReward(classId, uid, delta, identity);
    return setStudentReward(classId, uid, count, identity);
  }

  // '반 관리하기' 모달에서 새 반을 만들면 그 반으로 전환합니다.
  // (세션 저장값 동기화는 위 teacherClassId 변경 감지 effect가 도맡습니다)
  function handleClassCreated(newClassId) {
    setTeacherClassId(newClassId);
    setClassManagerOpen(false);
  }
  // '반 관리하기'에서 보관된 반의 '보기'를 누르면 그 반을(보기 전용으로) 봅니다.
  function handleViewArchivedClass(id) {
    setTeacherClassId(id);
    setShowCode(false);
    setClassManagerOpen(false);
  }

  // 입장 코드 만료 여부 + 표시용 포맷
  const codeExpired = currentCode?.expiresAt
    ? toDate(currentCode.expiresAt) < new Date()
    : false;
  function formatExpiry(ts) {
    return toDate(ts).toLocaleDateString("ko-KR", {
      month: "long",
      day: "numeric",
    });
  }
  async function handleRegenerate() {
    if (!classId) return;
    setRegenerating(true);
    try {
      await regenerateJoinCode(classId, getCurrentUser());
    } finally {
      setRegenerating(false);
    }
  }
  async function handleAttendance() {
    if (!classId || !user || attending || admin || attendedToday || !attendanceOpenToday) return;
    setAttending(true);
    try {
      await markStudyAttendance(classId, user, todayAttendanceKey);
      setToast("오늘 출석을 기록했어요.");
    } finally {
      setAttending(false);
    }
  }

  // [교사] 출석 시작/종료 — 학생의 '출석하기' 버튼을 켜고 끕니다.
  const [attendanceBusy, setAttendanceBusy] = useState(false);
  async function handleStartAttendance() {
    if (!classId || attendanceBusy) return;
    setAttendanceBusy(true);
    try {
      await startClassAttendance(classId);
      setToast("출석을 시작했어요. 학생들이 출석할 수 있어요.");
    } finally {
      setAttendanceBusy(false);
    }
  }
  async function handleStopAttendance() {
    if (!classId || attendanceBusy) return;
    setAttendanceBusy(true);
    try {
      await stopClassAttendance(classId);
      setToast("출석을 종료했어요.");
    } finally {
      setAttendanceBusy(false);
    }
  }

  // 프로젝트 순서 변경 — 카드를 드래그해 다른 카드 위에 놓으면 그 자리로 이동
  async function handleReorderProjects(dragId, targetId) {
    if (!dragId || dragId === targetId) return;
    const ids = classBoards.map((b) => b.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from === -1 || to === -1) return;
    ids.splice(from, 1);
    ids.splice(to, 0, dragId);
    await reorderStudyBoards(ids);
  }

  // 학생 소속을 아직 확인하는 중 — 입장 화면도 본문도 아직 그리지 않습니다.
  // (AuthGate의 로그인 대기 화면과 같은 모습이라, 학생 눈에는 스피너 하나가
  //  이어지다 제 화면이 뜨는 것으로 보입니다)
  const checkingClass = !!user && !admin && !membershipsLoaded;
  // 학생이 아직 반에 입장하지 않았으면 입장 화면을 보여줍니다.
  // **소속 답이 온 뒤에만** 판단합니다 — 그 전에는 '소속 없음'이 아닙니다.
  const showEntry = user && !admin && membershipsLoaded && !classId;

  return (
    <div className="board-shell study-shell">
      {!isFirebaseConfigured && (
        <div className="demo-banner">
          <span className="demo-banner-full">⚠️ 데모 모드 — Firebase 설정 전이라 데이터가 브라우저에만 임시 저장됩니다 (새로고침 시 초기화). <code>lib/firebase.js</code>에 설정값을 입력하면 Firestore에 저장됩니다.</span>
          <span className="demo-banner-short">⚠️ 데모 모드 — 새로고침 시 초기화됩니다</span>
        </div>
      )}

      <TopNav
        active="study"
        onPython={() => setPyOpen((v) => !v)}
        pyActive={pyOpen}
      />

      {checkingClass ? (
        <div className="auth-gate auth-gate--inline" role="status" aria-live="polite">
          <span className="auth-gate-spinner" aria-hidden="true" />
          <span className="sr-only">반 정보를 불러오는 중</span>
        </div>
      ) : showEntry ? (
        <ClassEntry />
      ) : (
        <main className="study-main">
          {/* 본문 — 왼쪽 사이드 패널(프로젝트 활동 추가) + 보드 컬럼 (사이드바와 동일 높이) */}
          <div className="study-body">
            {KWL_PANEL_ENABLED && (
              <KwlPanel
                classId={classId}
                user={user}
                isTeacher={admin && !currentClass?.archived}
                onAsk={(text) => setAskKwlW(text)}
                mobileOpen={kwlMobileOpen}
                onMobileClose={() => setKwlMobileOpen(false)}
              />
            )}

            {/* KWLS 차트 (학생) — 떠 있는 오버레이가 아니라 플렉스 칸을 차지해,
                폭이 0에서 벌어지며 오른쪽 화면을 밀어냅니다. 칸(슬롯)은 늘
                자리에 있고 폭만 바뀌므로 여닫이가 부드럽게 이어집니다. */}
            {classId && user && (
              <div
                className={`study-kwl-slot${kwlPanelOpen ? " open" : ""}`}
                aria-hidden={!kwlPanelOpen}
              >
                {kwlPanelOpen &&
                  (admin ? (
                    // 교사 — 내가 쓰는 곳이 아니라 '반이 어디까지 썼나'를 봅니다
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
                      onAsk={(text) => setAskKwlW(text)}
                      /* 모바일에선 폭을 벌릴 자리가 없어 예전처럼 떠 있는
                         패널로 열립니다(.kwl-panel--open) */
                      mobileOpen={kwlPanelOpen}
                      onMobileClose={() => setKwlPanelOpen(false)}
                    />
                  ))}
              </div>
            )}
            <StudyActivityPanel
              board={activeProject}
              isTeacher={admin && !currentClass?.archived}
              classRoster={admin ? roster : []}
              classId={classId}
              boards={classBoards}
              attendanceRecords={admin ? attendanceRecords : []}
              mobileOpen={activityPanelMobileOpen}
              onMobileClose={() => setActivityPanelMobileOpen(false)}
            />
            <div className="study-cols-wrap">
              {/* 제목 영역 — cols-wrap 안에 위치해 보드 컬럼과 정렬됨 */}
              <div className="study-head">
                <div className="study-head-main">
                  <div className="study-title-row">
                    <h1>🧩 공부방</h1>
                    {!admin && currentClass && (
                      <>
                        <button
                          className={`btn-ghost study-attend-btn${attendedToday ? " done" : ""}`}
                          onClick={handleAttendance}
                          disabled={attending || attendedToday || !attendanceOpenToday}
                          title={
                            attendedToday
                              ? "오늘 출석이 이미 기록되었습니다"
                              : attendanceOpenToday
                              ? "오늘 출석을 기록합니다"
                              : "선생님이 출석을 아직 시작하지 않았어요"
                          }
                        >
                          {attendedToday ? "출석 완료" : "출석하기"}
                        </button>
                        {/* 자리 배치 — 선생님이 정해 둔 자리에서 내 자리를
                            찾는 창입니다. 출석과는 무관해서(색이 출석/결석이
                            아니라 '내 자리/남의 자리') 출석 단추들 왼쪽이
                            아니라 그 사이에 두지 않고, '출석부 보기' 바로
                            왼쪽에 붙여 '반을 보는 것들'끼리 모읍니다. */}
                        <button
                          className="btn-ghost"
                          onClick={() => setMySeatOpen(true)}
                          title="선생님이 정한 자리 배치에서 내 자리를 봅니다"
                        >
                          자리 배치
                        </button>
                        <button
                          className="btn-ghost"
                          onClick={() => setAttendanceOpen(true)}
                        >
                          출석부 보기
                        </button>
                        {/* 내 수업 노트 — 수업 중에는 오른쪽 서랍에서 쓰지만,
                            지난 노트를 넘겨 보고 PDF로 내려받는 자리가 서랍
                            안에만 있어 찾기 어려웠습니다. 여기서도 같은 창을
                            엽니다(서랍의 '노트 전체 보기'와 같은 것). */}
                        <button
                          className="btn-ghost"
                          onClick={() => setNoteViewerOpen(true)}
                          title="지난 수업 노트를 넘겨 보고 PDF로 저장합니다"
                        >
                          수업 노트
                        </button>
                        <button
                          className={`btn-ghost${kwlPanelOpen ? " active" : ""}`}
                          onClick={() => setKwlPanelOpen((v) => !v)}
                          aria-pressed={kwlPanelOpen}
                          title={
                            kwlPanelOpen
                              ? "KWLS 차트를 닫습니다"
                              : "KWLS 차트를 왼쪽에 펼칩니다"
                          }
                        >
                          KWLS 차트
                        </button>
                      </>
                    )}
                    {admin && currentClass?.archived ? (
                      <span className="study-class-archived-badge" title="보관된 반 — 보기 전용(편집하려면 먼저 복원하세요)">
                        <IconArchive size={15} /> {currentClass.name} · 보관됨
                      </span>
                    ) : (
                      admin && myClasses.length > 0 && (
                        <select
                          className="study-class-select"
                          value={classId ?? ""}
                          onChange={(e) => {
                            setTeacherClassId(e.target.value);
                            setShowCode(false);
                          }}
                          aria-label="반 선택"
                        >
                          {myClasses.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      )
                    )}
                    {admin && currentClass && !currentClass.archived && (
                      <button
                        className="btn-ghost"
                        onClick={() => setShowCode(true)}
                        title="학생에게 알려 줄 입장 코드 크게 보기"
                      >
                        입장 코드
                      </button>
                    )}
                    {admin && currentClass && !currentClass.archived && (
                      <button
                        className="btn-ghost"
                        onClick={openLessonPicker}
                        title="주제·자료·해설·활동을 준비하고 수업을 시작합니다"
                      >
                        수업관리
                      </button>
                    )}
                    {admin && currentClass && !currentClass.archived && (
                      <button
                        className="btn-ghost"
                        onClick={() => setAttendanceOpen(true)}
                      >
                        출석 관리
                      </button>
                    )}
                    {admin && (
                      <button
                        className="btn-ghost"
                        onClick={() => setClassManagerOpen(true)}
                      >
                        반 관리하기
                      </button>
                    )}
                    {admin && currentClass && (
                      <button
                        className={`btn-ghost${kwlPanelOpen ? " active" : ""}`}
                        onClick={() => setKwlPanelOpen((v) => !v)}
                        aria-pressed={kwlPanelOpen}
                        title={
                          kwlPanelOpen
                            ? "KWLS 차트를 닫습니다"
                            : "KWLS 차트를 왼쪽에 펼칩니다 — 작성 현황·궁금한 점 모아보기"
                        }
                      >
                        KWLS 차트
                      </button>
                    )}
                    {/* 누가기록 관리·수업 메모 — 책방 머리말에도 같은 것을
                        끼우므로 버튼과 모달을 한 덩어리로 묶어 씁니다 */}
                    {admin && currentClass && (
                      <ClassNotesTools
                        classId={classId}
                        className={currentClass.name ?? ""}
                        roster={roster}
                        user={user}
                      />
                    )}
                    {admin && currentClass && classBoards.length > 0 && (
                      <button
                        className="btn-ghost"
                        onClick={() => setExportOpen(true)}
                        title="활동 자료 다운로드 (CSV·Excel·PDF)"
                      >
                        다운로드
                      </button>
                    )}
                  </div>

                </div>

                {/* 안내 문구는 제목 줄 오른쪽 끝으로 — 제목 아래를 차지하면
                    바로 밑의 프로젝트 화면이 그만큼 밀려납니다. */}
                {/* 교사에게는 안내 문구를 두지 않습니다 — 매번 같은 설명이라
                    한 번 읽고 나면 자리만 차지합니다. 보관된 반 경고는
                    '지금 편집이 막혀 있다'는 상태라 그대로 둡니다. */}
                {admin ? (
                  currentClass?.archived ? (
                    <p className="study-head-note"><IconArchive size={15} className="inline-icon" /> 보관된 반의 데이터를 보기 전용으로 보고 있어요. 편집하려면 ‘반 관리하기’에서 먼저 복원하세요.</p>
                  ) : null
                ) : currentClass ? (
                  <p className="study-head-note">
                    <strong className="study-class-name">
                      {currentClass.name}
                    </strong>{" "}
                    — 프로젝트를 열어 내 카드에서 활동을 해 보세요.
                  </p>
                ) : (
                  <p className="study-head-note">프로젝트를 열어 내 카드에서 활동을 해 보세요.</p>
                )}
              </div>
              {admin && myClassesAll.length === 0 ? (
                <p className="empty-note">
                  아직 만든 반이 없어요. ‘반 관리하기’로 첫 반을 추가하고 학생에게
                  입장 코드를 알려 주세요.
                </p>
              ) : activeProject ? (
                <StudyProjectView
                  key={activeProject.id}
                  board={activeProject}
                  user={user}
                  isTeacher={admin && !currentClass?.archived}
                  classRoster={admin ? roster : studentClassRoster}
                  onAward={admin && !currentClass?.archived ? awardReward : null}
                  baseGroupAssignment={baseGroupAssignment}
                  classes={myClasses}
                  absentUids={todayAbsentUids}
                  classBoards={admin ? classBoards : []}
                  attendanceRecords={admin ? attendanceRecords : []}
                  onBack={closeProject}
                  onAsk={(kw) => setAskKeyword(kw)}
                  onModalChange={setCardModalOpen}
                  onDeleted={() => {
                    closeProject();
                    // 곧바로 지우지 않고 휴지통으로 보냅니다 — 되돌릴 곳이
                    // 어디인지 함께 알려 줍니다.
                    setToast(`'${activeProject.title}' 프로젝트를 휴지통으로 보냈어요. 프로젝트 목록 아래 '🗑 휴지통'에서 되돌릴 수 있어요.`);
                  }}
                  onDuplicated={(className) =>
                    setToast(`'${activeProject.title}' 프로젝트를 '${className}' 반으로 복제했어요.`)
                  }
                />
              ) : (
                <StudyProjectDashboard
                  boards={classBoards}
                  user={user}
                  classId={classId}
                  isTeacher={admin}
                  readOnly={!!currentClass?.archived}
                  roster={admin ? roster : []}
                  onOpen={openProject}
                  onCreate={() => setCreatingProject(true)}
                  onReorder={handleReorderProjects}
                  onToast={setToast}
                />
              )}
            </div>

            {/* 오른쪽: 멋진 순간 패널 — 교사 전용(과일 주기 관리).
                학생은 상단바 프로필 옆의 총 개수 뱃지로 확인합니다. 보관된
                반은 보기 전용이라 표시하지 않습니다(과일 부여는 쓰기라 막힘). */}
            {currentClass && admin && !currentClass.archived && (
              <StudyRewardPanel
                roster={roster}
                classId={classId}
                seatLayout={seatLayout}
                groupAssignment={baseGroupAssignment}
                presentUids={todayPresentUids}
                attendanceOpen={attendanceOpenToday}
                readOnly={false}
                onAward={awardReward}
                onSaveSeats={(seats) => saveStudySeatLayout(classId, "default", seats, getCurrentUser())}
                onSaveGroups={(groups) => saveStudyGroupAssignment(classId, groups, getCurrentUser())}
              />
            )}
          </div>
        </main>
      )}

      {/* 모바일 KWLS 열기 버튼 (FAB) — KWL 패널과 함께 잠시 보관 중 */}
      {KWL_PANEL_ENABLED && classId && user && !kwlMobileOpen && (
        <button
          className="kwl-fab"
          onClick={() => setKwlMobileOpen(true)}
          aria-label="KWLS 패널 열기"
        >
          📝 KWLS
        </button>
      )}

      {/* 학생 KWLS 차트 — 모바일에서 떠 있을 때의 배경(누르면 닫힘) */}
      {kwlPanelOpen && (
        <div
          className="kwl-mobile-backdrop"
          onClick={() => setKwlPanelOpen(false)}
        />
      )}

      {/* KWLS 패널 열릴 때 배경 오버레이 */}
      {KWL_PANEL_ENABLED && kwlMobileOpen && (
        <div
          className="kwl-mobile-backdrop"
          onClick={() => setKwlMobileOpen(false)}
        />
      )}

      {/* 모바일 프로젝트 활동 패널 열기 버튼 (FAB) — 교사 전용 */}
      {admin && currentClass && !currentClass.archived && !activityPanelMobileOpen && (
        <button
          className="study-activity-fab"
          onClick={() => setActivityPanelMobileOpen(true)}
          aria-label="프로젝트 활동 패널 열기"
        >
          🧩 활동
        </button>
      )}

      {/* 활동 패널 열릴 때 배경 오버레이 */}
      {activityPanelMobileOpen && (
        <div
          className="study-activity-mobile-backdrop"
          onClick={() => setActivityPanelMobileOpen(false)}
        />
      )}

      {/* 입장 코드 크게 보기 모달 — 학생들이 멀리서도 볼 수 있게 */}
      {showCode && currentClass && (
        <div className="modal-backdrop" {...backdropClose(() => setShowCode(false))}>
          <div
            className="modal modal-joincode"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="btn-close joincode-close"
              onClick={() => setShowCode(false)}
              aria-label="닫기"
            >
              ×
            </button>
            <p className="joincode-class">{currentClass.name}</p>
            <p className="joincode-label">입장 코드</p>
            <p className="joincode-value">{currentCode?.code ?? "—"}</p>
            <p className="joincode-hint">
              공부방 입장 화면에서 이 코드를 입력하세요
            </p>
            {currentCode?.expiresAt && (
              <p className={`joincode-expiry${codeExpired ? " expired" : ""}`}>
                {codeExpired
                  ? "⚠️ 만료된 코드예요 — 재발급해 주세요"
                  : `${formatExpiry(currentCode.expiresAt)}까지 유효`}
              </p>
            )}
            <button
              className="joincode-regen"
              onClick={handleRegenerate}
              disabled={regenerating}
            >
              {regenerating ? "재발급 중…" : "🔄 코드 재발급"}
            </button>
          </div>
        </div>
      )}

      {/* 반 만들기 모달 */}
      {/* 활동 자료 다운로드 모달 — 범위·형식은 여기서 선택 */}
      {exportOpen && (
        <div className="modal-backdrop" {...backdropClose(() => setExportOpen(false))}>
          <div className="modal modal-export" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>⬇ 활동 자료 다운로드</h3>
              <button
                className="btn-close"
                onClick={() => setExportOpen(false)}
                aria-label="닫기"
              >
                ×
              </button>
            </div>
            <p className="export-desc">
              클래스·주제·학번·이름·작성시각·제목·내용 순으로 정리해 내려받아요.
            </p>

            <div className="export-group">
              <div className="export-group-title">{currentClass?.name}</div>
              <div className="export-actions">
                <button
                  className="study-export-btn"
                  onClick={() => handleExport("class", "csv")}
                  disabled={exporting}
                >
                  CSV
                </button>
                <button
                  className="study-export-btn"
                  onClick={() => handleExport("class", "pdf")}
                  disabled={exporting}
                >
                  PDF
                </button>
              </div>
            </div>

            {myClasses.length > 1 && (
              <div className="export-group">
                <div className="export-group-title">전체 반</div>
                <div className="export-actions">
                  <button
                    className="study-export-btn"
                    onClick={() => handleExport("all", "excel")}
                    disabled={exporting}
                    title="반별 시트로 나눈 엑셀(.xlsx)"
                  >
                    Excel (반별 시트)
                  </button>
                  <button
                    className="study-export-btn"
                    onClick={() => handleExport("all", "pdf")}
                    disabled={exporting}
                    title="반별 페이지로 나눈 PDF"
                  >
                    PDF (반별 페이지)
                  </button>
                </div>
              </div>
            )}

            <p className="export-hint">
              PDF는 인쇄 창이 열리면 대상에서 ‘PDF로 저장’을 선택하세요.
            </p>
          </div>
        </div>
      )}

      {attendanceOpen && currentClass && (
        <StudyAttendanceModal
          isTeacher={admin}
          records={attendanceRecords}
          roster={admin ? roster : []}
          className={currentClass.name ?? ""}
          attendanceOpenToday={attendanceOpenToday}
          attendanceBusy={attendanceBusy}
          onStartAttendance={admin ? handleStartAttendance : null}
          onStopAttendance={admin ? handleStopAttendance : null}
          onClose={() => setAttendanceOpen(false)}
        />
      )}

      {/* 내 수업 노트 크게 보기 (학생) — 서랍의 '노트 전체 보기'가 여는 것과
          같은 창입니다. 여기서 PDF로 저장합니다. */}
      {noteViewerOpen && classId && user && (
        <CornellNoteViewerModal
          classId={classId}
          user={user}
          className={currentClass?.name ?? ""}
          onClose={() => setNoteViewerOpen(false)}
        />
      )}

      {/* 자리 배치 보기 (학생) — 자리표 문서 둘만 읽습니다. 이름·학번은
          이미 받아 둔 급우 명단을 그대로 넘겨 새로 읽지 않습니다. */}
      {mySeatOpen && classId && user && (
        <MySeatModal
          classId={classId}
          myUid={user.uid}
          roster={studentClassRoster}
          onClose={() => setMySeatOpen(false)}
        />
      )}

      {seatSetupOpen && currentClass && (
        <SeatGroupSetupModal
          roster={roster}
          seatLayout={seatLayout}
          groupAssignment={baseGroupAssignment}
          onSaveSeats={(seats) => saveStudySeatLayout(classId, "default", seats, getCurrentUser())}
          onSaveGroups={(groups) => saveStudyGroupAssignment(classId, groups, getCurrentUser())}
          onClose={closeSeatSetup}
        />
      )}

      {classManagerOpen && (
        <ClassManagerModal
          classes={myClassesAll}
          user={getCurrentUser()}
          onClose={() => setClassManagerOpen(false)}
          onCreated={handleClassCreated}
          onViewClass={handleViewArchivedClass}
          onToast={setToast}
          onOpenSeatSetup={openSeatSetupFromClassManager}
          seatSetupDisabled={roster.length === 0}
        />
      )}

      {creatingProject && currentClass && (
        <StudyProjectForm
          keywords={keywordNames}
          classId={currentClass.id}
          onClose={() => setCreatingProject(false)}
          // 만들자마자 그 프로젝트로 들어가 활동을 이어서 손보게 합니다
          onCreated={(newId) => router.push(`/study?project=${newId}`)}
        />
      )}

      {(askKeyword !== null || askCode !== null || askKwlW !== null) && (
        <NewQuestionForm
          defaultKeyword={askKeyword ?? ""}
          keywords={keywordNames}
          initialContent={
            askCode ? codeBlockHtml(askCode) :
            askKwlW ? `<p>${askKwlW}</p>` :
            ""
          }
          onClose={(submitted) => {
            setAskKeyword(null);
            setAskCode(null);
            setAskKwlW(null);
            if (submitted === true) {
              setToast("질문이 게시판에 등록됐어요. 공부방에서 계속 활동하세요!");
            }
          }}
        />
      )}

      <PythonRunner
        open={pyOpen}
        onClose={() => setPyOpen(false)}
        onAskQuestion={(code) => {
          setAskCode(code);
          setAskKeyword(null);
        }}
        hasModalOpen={cardModalOpen || classManagerOpen || creatingProject || attendanceOpen || seatSetupOpen || (askKeyword !== null || askCode !== null)}
      />

      {/* ── 수업 준비 (목록 · 새로 만들기) ──
          목록·편집·진행 화면은 모두 URL(?panel=lessons, ?lesson=&mode=)로
          관리합니다. 그래야 브라우저 '뒤로 가기'를 눌렀을 때 이 화면들의
          상태가 아니라 그 전 페이지로 곧장 나가버리지 않고, 공부방으로 한
          단계씩 되돌아갑니다. */}
      {lessonPicker && <PreloadLessonMode />}
      {lessonPicker && (
        <LessonManagerModal
          onClose={closeLessonNav}
          onEdit={(lesson) => openLessonEdit(lesson)}
          onStart={(lesson) => {
            if ((lesson.slides ?? []).length === 0) {
              setToast("슬라이드가 없는 자료예요.");
              return;
            }
            openLessonTeach(lesson);
          }}
          onOpenSeatSetup={openSeatSetupFromLessons}
          seatSetupDisabled={roster.length === 0}
        />
      )}

      {/* 수업 준비 — 장별 해설과 활동 안내를 미리 적어 둡니다(방송하지 않음) */}
      {editingLesson && (
        <LessonMode
          lesson={editingLesson}
          mode="edit"
          classId={classId}
          roster={admin ? roster : []}
          // 학생이 카드를 쓰는 보드만 연결 대상 — '선생님 보드'(공지용)는 제외
          boards={classBoards.filter((b) => b.type !== "notice")}
          otherBoards={otherClassBoards}
          // 연결은 **반마다 따로** 기억합니다 — 한 자료를 여러 반에서 쓰기
          // 때문입니다(LessonMode의 boardIds 주석 참고). 점 표기 경로
          // ({ "boardIds.xxx": … })는 Mock의 Object.assign에서 문자열 키가
          // 그대로 박히므로, 두 구현이 같게 동작하도록 지도 전체를 다시 씁니다.
          onSaveBoardId={(boardId) =>
            classId
              ? updateLesson(editingLesson.id, {
                  boardIds: {
                    ...(editingLesson.boardIds ?? {}),
                    [classId]: boardId ?? null,
                  },
                })
              : Promise.resolve()
          }
          // patch = { note, noteTitle } — 해설의 제목과 본문을 함께 받습니다.
          // 예전 자료에는 noteTitle이 없는데, 없던 필드가 빈 문자열로 채워질
          // 뿐이라 기존 note 내용은 그대로 남습니다.
          onSaveNote={(index, patch) => {
            const slides = (editingLesson.slides ?? []).map((s, i) =>
              i === index ? { ...s, ...patch } : s
            );
            return updateLesson(editingLesson.id, { slides });
          }}
          onSaveActivities={(activities) => updateLesson(editingLesson.id, { activities })}
          onStart={() => {
            if ((editingLesson.slides ?? []).length === 0) {
              setToast("슬라이드가 없는 자료예요.");
              return;
            }
            openLessonTeach(editingLesson);
          }}
          onClose={closeLessonNav}
        />
      )}

      {/* 수업 진행 — '프레젠테이션'을 눌러야 학생 화면이 전환됩니다 */}
      {teaching && (
        <LessonMode
          lesson={teaching}
          mode="teach"
          classId={classId}
          className={currentClass?.name ?? ""}
          roster={admin ? roster : []}
          attendanceRecords={admin ? attendanceRecords : []}
          // 참여 전광판 카드에서 바로 과일을 줍니다(보관된 반은 쓰기 불가)
          onAward={admin && !currentClass?.archived ? awardReward : null}
          // '공부중' 전광판이 연결된 수업 보드를 찾는 데 씁니다
          boards={classBoards.filter((b) => b.type !== "notice")}
          // 프레젠테이션이 안 될 때도 수업 자료를 바로 고치러 갈 수 있게
          onEdit={() => openLessonEdit(teaching)}
          onClose={closeLessonNav}
        />
      )}

      {/* 과일을 받은 순간의 축포 — 학생 화면에서만. 교사는 자기가 준 것이라
          축하할 일이 아니고, 한 화면에서 여러 번 주다 보면 방해가 됩니다. */}
      <RewardCelebration amount={cheerAmount} onDone={clearCheer} />
      <Toast message={toast} onDone={() => setToast("")} />
    </div>
  );
}
