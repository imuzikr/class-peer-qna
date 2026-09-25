"use client";

// =============================================================
// 공통 상단 내비게이션
// -------------------------------------------------------------
// 왼쪽: 배움나눔 로고 ｜ 학습 공간 드롭다운(공부방·질문게시판) ｜ 파이썬 실행기 ｜ (리포트|관리자)
// 오른쪽: 역할 전환(개발용) ｜ 손들기 ｜ 공지 ｜ 알림 ｜ 사용자 프로필(로그아웃은 그 메뉴 안)
// =============================================================
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { isAdmin, isTeacher } from "@/lib/user";
import { isFirebaseConfigured } from "@/lib/firebase";
import { backdropClose } from "@/lib/modal";
import StudentRewardTrend from "./StudentRewardTrend";
import { signOutUser } from "@/lib/auth";
import {
  subscribeUserDirectory,
  subscribeMyMemberships,
  subscribeMyClassRewardCount,
  subscribeBroadcast,
  subscribeClass,
  classTaskOf,
  fetchClass,
  stopBroadcast,
  reportPresence,
  PRESENCE_BEAT_MS,
  NOTING_WINDOW_MS,
} from "@/lib/store";
import { getSelectedClassId } from "@/lib/classroom";
import { useCurrentUser } from "@/lib/useCurrentUser";
import UserProfile from "./UserProfile";
import NotificationBell from "./NotificationBell";
import QuestionSignalButton from "./QuestionSignalButton";
import ClassNoticeButton from "./ClassNoticeButton";
import RoleSwitcher from "./RoleSwitcher";
import RoleManagerModal from "./RoleManagerModal";
import PresentationOverlay from "./PresentationOverlay";
import CornellNoteDrawer from "./CornellNoteDrawer";
import RewardCelebration from "./RewardCelebration";
import AppMarquee from "./AppMarquee";
import { useRewardCelebration } from "@/lib/useRewardCelebration";
import { useClassMembers } from "@/lib/useClassRoster";
import { IconReport, IconPythonRunner, IconLogo, IconAnswer, IconBlackboard, IconBook } from "./StatusIcons";

export default function TopNav({ active, onPython, pyActive = false, onStudyExport = null }) {
  const router = useRouter();
  const user = useCurrentUser();
  const admin = user ? isTeacher(user) : false;      // 교사+관리자 (대시보드 접근)
  const isStrictAdmin = user ? isAdmin(user) : false; // 최고 관리자만 (역할 관리)
  const [roleMgrOpen, setRoleMgrOpen] = useState(false);
  const [directory, setDirectory] = useState([]);
  const [fruitTotal, setFruitTotal] = useState(0);
  const [memberships, setMemberships] = useState([]);
  const [membershipsLoaded, setMembershipsLoaded] = useState(false);
  const [sessionClassId, setSessionClassId] = useState(null);
  const [fruitOpen, setFruitOpen] = useState(false); // 과일 뱃지 → 받은 흐름 모달
  // 수업 노트 서랍이 열려 있는지 — 열리면 발표 화면이 그만큼 좁아집니다
  // (덮지 않고 밀어냅니다). `wide`는 서랍이 날개를 편 상태(노트 + 활동
  // 두 칸)로, 그만큼 더 좁아집니다.
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteWide, setNoteWide] = useState(false);
  // 서랍이 이 함수를 effect 의존성으로 들고 있어, 렌더마다 새로 만들면
  // 그 effect가 매번 돕니다 — 한 번만 만들어 넘깁니다.
  const handleNoteOpen = useCallback((open, wide) => {
    setNoteOpen(open);
    setNoteWide(!!wide);
  }, []);

  // 관리자만 사용자 디렉터리를 구독(역할 관리·승인 대기 표시용)
  useEffect(() => {
    if (!isFirebaseConfigured || !isStrictAdmin) return;
    return subscribeUserDirectory(setDirectory);
  }, [isStrictAdmin]);

  // 학생 소속 반 구독 — 공부방 화면과 동일한 기준으로 "지금 보는 반"을 정하기 위함
  //
  // `membershipsLoaded`는 **이번 구독의 첫 답이 왔는가**입니다. 구독을 다시
  // 걸 때마다 거짓으로 되돌립니다 — 아래에서 '아직 안 왔다'와 '정말 반이
  // 없다'를 가르는 데 씁니다. 물어볼 것이 없는 쪽(교사·비로그인·데모)은
  // 곧바로 참입니다.
  useEffect(() => {
    if (!isFirebaseConfigured || admin || !user?.uid) {
      setMemberships([]);
      setMembershipsLoaded(true);
      return;
    }
    setMembershipsLoaded(false);
    return subscribeMyMemberships(user.uid, (list) => {
      setMemberships(list);
      setMembershipsLoaded(true);
    });
  }, [admin, user?.uid]);

  // 공부방에서 세션에 기억해 둔 반 id — 공부방 화면과 같은 값을 봐야
  // 뱃지 숫자와 교사가 관리하는 화면의 숫자가 항상 일치합니다.
  useEffect(() => {
    function sync() { setSessionClassId(getSelectedClassId()); }
    sync();
    window.addEventListener("class-change", sync);
    return () => window.removeEventListener("class-change", sync);
  }, []);

  // 학생만 "지금 보고 있는 반"에서 받은 과일 개수를 구독 — 프로필 옆 뱃지 표시용
  //
  // [답을 기다리는 동안은 알던 반을 붙듭니다]
  // `memberships`는 `[]`로 시작하고, 구독을 다시 걸 때도 잠깐 빕니다. 그 빈
  // 값을 그대로 쓰면 `activeClassId`가 `null`로 떨어지고, 이 값에 걸려 있는
  // 것들이 함께 사라집니다 — 특히 **수업 노트 서랍**이 언마운트되어 학생이
  // 쓰던 화면이 없어졌다 다시 나타나고, 아직 자동 저장(2초)이 안 된 글자가
  // 날아갑니다. 빈 배열은 '반이 없다'가 아니라 '아직 안 왔다'일 수 있습니다
  // (프로젝트 문서 '첫 화면' 절의 그 함정).
  //
  // **놓는 조건은 '첫 답이 왔는데도 비어 있을 때'**입니다. 붙들기만 하면
  // 교사가 반 편성에서 그 학생을 뺐을 때 없는 반을 계속 가리킵니다(규칙이
  // 막아 읽기가 조용히 실패합니다). 그래서 둘을 함께 봅니다 —
  // 답을 기다리는 중이면 붙들고, 답이 왔는데 비었으면 놓습니다.
  const membershipIds = memberships.map((m) => m.classId);
  const resolvedClassId =
    sessionClassId && membershipIds.includes(sessionClassId)
      ? sessionClassId
      : membershipIds[0] ?? null;
  const lastClassIdRef = useRef(null);
  if (resolvedClassId) lastClassIdRef.current = resolvedClassId;
  else if (membershipsLoaded) lastClassIdRef.current = null;
  const activeClassId = resolvedClassId ?? lastClassIdRef.current;
  useEffect(() => {
    if (!isFirebaseConfigured || admin || !activeClassId || !user?.uid) {
      setFruitTotal(0);
      return;
    }
    return subscribeMyClassRewardCount(activeClassId, user.uid, setFruitTotal);
  }, [admin, activeClassId, user?.uid]);

  // 과일을 받은 순간 터지는 축포 — 상단바에서 한 번만 답니다.
  // -------------------------------------------------------------
  // 예전에는 공부방·책방 페이지가 저마다 달고 있었습니다. 그런데 과일을
  // 주는 자리는 그 두 화면뿐이 아닙니다 — 상단바의 손바닥('🍊 확인')은 어느
  // 화면에서든 눌리고, 학생도 질문방·리포트·파이썬 실행기 어디에나 있을 수
  // 있어 축포가 안 터지는 일이 잦았습니다(손들기에 태그·메모가 붙으면서
  // 이 길로 주는 일이 늘어 눈에 띄었습니다).
  // 상단바는 다섯 화면에 모두 떠 있으므로 여기 한 번 달면 어디서 받아도
  // 터집니다. **페이지에는 다시 달지 마세요** — 구독이 둘이 되어 축포가
  // 두 번 겹칩니다.
  const [cheerAmount, clearCheer] = useRewardCelebration(activeClassId, user?.uid, !admin);

  // 발표 강제 전환(방송) 구독 — 학생은 "지금 보고 있는 반", 교사는 자신이
  // 마지막으로 고른 반 기준. 어느 화면에 있든(질문방·책방·리포트 등) 이
  // 상단바가 항상 떠 있으므로 여기서 구독하면 앱 전체에 적용됩니다.
  const [broadcast, setBroadcast] = useState(null);
  const broadcastClassId = admin ? sessionClassId : activeClassId;
  useEffect(() => {
    if (!isFirebaseConfigured || !broadcastClassId) { setBroadcast(null); return; }
    return subscribeBroadcast(broadcastClassId, setBroadcast);
  }, [broadcastClassId]);

  // 반 공지 대상 — 지금 보고 있는 반의 이름과 학생 수. 교사가 '몇 명에게
  // 가는지'를 보고 보내도록 버튼에 함께 띄웁니다(잘못된 반에 보내는 실수를
  // 줄이는 가장 값싼 방법입니다). 실제 받는 사람은 서버가 다시 정합니다.
  const noticeMemberUids = useClassMembers(broadcastClassId, isFirebaseConfigured && admin);
  // 지금 보고 있는 반의 문서 하나 — '오늘의 활동'(`task`)이 여기 들어 있습니다.
  // 교사는 마지막으로 고른 반, 학생은 소속 반.
  //
  // **전광판은 이제 여기서 안 읽습니다.** 반마다 따로였던 것을 배움나눔
  // 전체에 하나로 옮겨(`meta/marquee`), `AppMarquee`가 제 구독을 스스로
  // 겁니다 — 그래서 이 구독은 `task` 하나만을 위해 남습니다.
  const [classDoc, setClassDoc] = useState(null);
  useEffect(() => {
    if (!broadcastClassId) { setClassDoc(null); return; }
    return subscribeClass(broadcastClassId, setClassDoc);
  }, [broadcastClassId]);

  const [noticeClassName, setNoticeClassName] = useState("");
  useEffect(() => {
    if (!admin || !broadcastClassId) { setNoticeClassName(""); return; }
    let alive = true;
    fetchClass(broadcastClassId).then((c) => {
      if (alive) setNoticeClassName(c?.name ?? "");
    });
    return () => { alive = false; };
  }, [admin, broadcastClassId]);
  const noticeMemberCount = noticeMemberUids.length;

  // 발표 중에는 학생 화면이 실제로 보이는지 교사에게 알립니다(전광판용).
  //
  // [무엇을 '보고 있음'으로 볼 것인가]
  // 브라우저에는 '창이 몇 % 가려졌는지' 알려 주는 수단이 없습니다.
  // 그래서 두 가지를 함께 봅니다.
  //   · visibilityState — 탭을 옮기거나 창을 최소화하면 hidden
  //   · hasFocus()      — 다른 프로그램을 클릭하면 false
  // 창이 일부만 가려져 있어도 학생이 그쪽을 쓰고 있으면 포커스가 넘어가므로,
  // 실제 수업에서 문제가 되는 '딴짓'은 이 조합으로 잡힙니다.
  // (브라우저는 보이는데 아무것도 안 누르고 있는 경우까지는 알 수 없습니다)
  //
  // [필기 중 신호]
  // 위 두 값은 '화면이 보이는가'까지만 압니다 — 켜 두고 아무것도 안 하는
  // 학생과 열심히 적는 학생이 같아 보입니다. 수업 노트 서랍이 생기면서
  // '타이핑'이라는 능동 신호가 처음 생겼으므로, 방금 필기했는지를 함께
  // 올려 교사 전광판에 ✍️로 보여 줍니다. 규칙은 presence에 필드 화이트
  // 리스트가 없어 이 필드를 더해도 그대로 통과합니다.
  const broadcasting = !!broadcast;
  const notingRef = useRef(0); // 마지막으로 필기한 시각(ms)
  const markNoting = useCallback(() => { notingRef.current = Date.now(); }, []);
  useEffect(() => {
    if (!isFirebaseConfigured || admin || !broadcasting || !broadcastClassId || !user?.uid) return;
    const send = () =>
      reportPresence(
        user,
        broadcastClassId,
        document.visibilityState === "visible" && document.hasFocus(),
        Date.now() - notingRef.current < NOTING_WINDOW_MS
      );
    send();
    document.addEventListener("visibilitychange", send);
    window.addEventListener("focus", send);
    window.addEventListener("blur", send);
    const beat = setInterval(send, PRESENCE_BEAT_MS);
    return () => {
      document.removeEventListener("visibilitychange", send);
      window.removeEventListener("focus", send);
      window.removeEventListener("blur", send);
      clearInterval(beat);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin, broadcasting, broadcastClassId, user?.uid]);

  const pendingTeacherCount = directory.filter(
    (u) => u.requestedRole === "teacher" && u.role !== "teacher" && u.role !== "admin"
  ).length;

  // 이동 가능성이 높은 라우트를 미리 프리페치 → 클릭 시 즉시 전환
  useEffect(() => {
    router.prefetch("/board");
    router.prefetch("/study");
    router.prefetch("/books");
    router.prefetch(admin ? "/admin" : "/report");
  }, [admin, router]);

  function handlePython() {
    if (onPython) onPython();
    else router.push("/board?py=1");
  }

  function go(path) {
    router.push(path);
  }

  async function handleLogout() {
    if (isFirebaseConfigured) {
      try {
        await signOutUser();
      } catch {
        /* 무시하고 랜딩으로 */
      }
    }
    router.push("/");
  }

  return (
    <>
    {/* 상단바는 두 줄입니다 —
          1행: 로고 · 문구 …… 전광판 …… 손들기·알림·프로필
          2행: 이동 메뉴
        **여기 적힌 차례가 곧 보이는 차례이자 탭 이동 차례**입니다(CSS의
        order는 자리만 바꾸고 탭 순서는 안 바꿉니다). 요소를 더할 때는
        globals.css의 order 값도 함께 맞추세요 — 어긋나면 눈으로 보는
        차례와 키보드로 옮겨 다니는 차례가 갈립니다.
        좁아지면 가운데부터 빠집니다 — 문구는 1180px, 전광판은 768px에서. */}
    <header className="topbar">
      {/* 1행 ① 로고 — 좁은 화면에서도 항상 첫 줄에 남습니다 */}
      <div className="topbar-left">
        {/* 로고 = '처음으로'. 첫 화면이 공부방이 되었으므로 여기도 공부방으로
            갑니다 — 로고만 질문방으로 가면 '처음'이 두 곳이 됩니다. */}
        <button className="logo logo-button" onClick={() => go("/study")}>
          <IconLogo size={30} /> 배움나눔
        </button>
        <span className="topbar-divider" aria-hidden="true" />
      </div>

      {roleMgrOpen && (
        <RoleManagerModal
          directory={directory}
          onClose={() => setRoleMgrOpen(false)}
        />
      )}

      {/* 과일 뱃지를 누르면 — 자기 기록이라 펼친 채로 엽니다. 여러 반에
          속해 있으면 한 흐름으로 합칩니다(리포트와 같은 컴포넌트). */}
      {fruitOpen && (
        <div className="modal-backdrop" {...backdropClose(() => setFruitOpen(false))}>
          <div
            className="modal fruit-trend-modal"
            role="dialog"
            aria-modal="true"
            aria-label="내가 받은 과일"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h3>🍊 내가 받은 과일</h3>
              <button className="btn-close" onClick={() => setFruitOpen(false)} aria-label="닫기">
                ×
              </button>
            </div>
            <StudentRewardTrend
              studentUid={user.uid}
              classIds={membershipIds}
              defaultOpen
              bare
              showToggle={false}
            />
          </div>
        </div>
      )}

      {/* 1행 ② 문구 — 로고와 짝을 이루는 자리라 바로 옆입니다.
          1행에 넷이 서므로 좁아지면 **이것이 먼저** 빠집니다(1180px). */}
      <span className="topbar-tagline">작은 변화로 시작하는 성장의 기록</span>

      {/* 1행 ③ 전광판 — 왼쪽 묶음(로고·문구)과 오른쪽 묶음(아이콘) **사이
          한가운데**입니다. 그 사이 남는 가로를 감싼 칸이 통째로 받고 알약은
          그 안에서 가운데 서므로, 좌우 여백이 늘 같습니다(실측 1920px에서
          408·408 · 1366px에서 131·131).

          **감싼 칸(`.topbar-mq-slot`)을 없애지 마세요.** 알약은 글자만큼만
          차지해야 하는데(`flex-basis: auto`), 그 값이 그대로 flex 항목의
          기준 폭이 되어 **줄바꿈을 부릅니다** — 769px에서 알약이 로고·문구
          아래로 떨어져 상단바가 네 줄이 되었습니다(실측). 줄을 나누는 셈은
          줄인 뒤가 아니라 **기준 폭으로** 하기 때문입니다. 기준 0짜리 칸을
          한 겹 씌우면 줄바꿈은 안 부르면서 남는 가로를 받고, 알약은 그 안에서
          제 글자만큼만 자랍니다.

          반과 무관하므로 `broadcastClassId`에 걸지 않습니다 — 반을 아직 안
          고른 교사, 질문방·리포트처럼 반이 없는 화면에도 그대로 섭니다. */}
      <div className="topbar-mq-slot">
        <AppMarquee isTeacher={admin} />
      </div>

      {/* 1행 ④ 오른쪽 끝: 손들기 + 확성기 + 과일 뱃지 + 알림 + 프로필.
          **늘 눈에 띄어야 하는 것들이라 로고와 같은 줄입니다.** 한때 이동
          메뉴와 함께 2행으로 내렸는데, 그러면 1행 오른쪽이 통째로 비어
          전광판의 '가운데'가 오른쪽으로 치우쳤고 아이콘도 메뉴 줄에 얹혀
          눈에 덜 들어왔습니다(실제 신고). */}
      <div className="user-area">
        {!isFirebaseConfigured && <RoleSwitcher />}
        {/* 손들기 → 반 공지(교사) → 알림 순. 손들기는 반 안의 일이라 확성기
            왼쪽에 두고, 확성기는 그 반에만 보내는 것이라 개인 알림(종) 왼쪽에
            둡니다 — 왼쪽으로 갈수록 범위가 좁습니다. */}
        {user && broadcastClassId && (
          <QuestionSignalButton
            classId={broadcastClassId}
            user={user}
            isTeacher={admin}
            className={noticeClassName}
          />
        )}
        {admin && user && broadcastClassId && (
          <ClassNoticeButton
            classId={broadcastClassId}
            className={noticeClassName}
            memberCount={noticeMemberCount}
          />
        )}
        {/* 눌러서 '언제 얼마나 받았는지'까지 — 숫자만으로는 요즘 어떤지가
            안 보입니다. 학생 리포트에 있는 것과 같은 흐름을 여기서도 바로
            열어 볼 수 있게 합니다. */}
        {!admin && user && (
          <button
            type="button"
            className="fruit-total-chip fruit-total-chip--btn"
            onClick={() => setFruitOpen(true)}
            title="지금까지 받은 과일 — 눌러서 받은 흐름 보기"
          >
            🍊 {fruitTotal}
          </button>
        )}
        {user && isFirebaseConfigured && <NotificationBell uid={user.uid} />}
        {/* 로그아웃은 이 메뉴 안으로 들어갔습니다 — 상단바에 전광판을 두려고
            자리를 비웠고, 하루에 한 번 누를까 말까 한 것이 늘 폭을 차지할
            이유도 없습니다(UserProfile 주석 참고). */}
        <UserProfile
          pendingCount={isStrictAdmin ? pendingTeacherCount : 0}
          onOpenRoleMgr={isStrictAdmin ? () => setRoleMgrOpen(true) : null}
          onOpenAdmin={admin ? () => go("/admin") : null}
          onStudyExport={admin ? onStudyExport : null}
          onLogout={handleLogout}
        />
      </div>

      {/* 줄바꿈 — 폭 100%·높이 0짜리 빈 칸(globals.css의 `.topbar-gap`).
          여기까지가 1행이고 아래가 2행입니다. 예전에는 남는 가로를 받아
          아이콘 줄을 오른쪽으로 밀어내던 칸인데, 지금 그 일은 전광판이
          앉는 칸이 맡고 이 칸은 줄만 가릅니다. */}
      <span className="topbar-gap" aria-hidden="true" />

      {/* 2행 이동 메뉴 — 질문방 · 공부방 · 책방 · 파이썬 실행기 ·
          리포트(학생). 768px 이하에서는 단추가 정사각형 칸으로 바뀝니다. */}
      <nav className="topnav-menu">
        <button
          className={`btn-ghost ${active === "board" ? "nav-active" : ""}`}
          onClick={() => go("/board")}
          title="질문방"
        >
          <IconAnswer size={20} /> <span className="nav-label">질문방</span>
        </button>
        <button
          className={`btn-ghost ${active === "study" ? "nav-active" : ""}`}
          onClick={() => go("/study")}
          title="공부방"
        >
          <IconBlackboard size={20} /> <span className="nav-label">공부방</span>
        </button>
        <button
          className={`btn-ghost ${active === "books" ? "nav-active" : ""}`}
          onClick={() => go("/books")}
          title="책방"
        >
          <IconBook size={20} /> <span className="nav-label">책방</span>
        </button>

        <button
          data-py-toggle
          className={`btn-ghost ${pyActive ? "py-btn-active" : ""}`}
          onClick={handlePython}
          title="파이썬 실행기"
        >
          <IconPythonRunner size={20} /> <span className="nav-label">파이썬 실행기</span>
        </button>
        {/* 교사에게는 여기에 아무것도 없습니다 — '선생님 대시보드'는 프로필
            메뉴로 옮겼습니다(로그아웃과 같은 까닭: 이동 메뉴에서 가장 긴
            단추인데 수업 중에 자주 누르는 것은 아닙니다). 학생의 '학습
            리포트'는 그대로 둡니다 — 학생이 제 기록을 보러 자주 오는 자리라
            한 번에 닿아야 하고, 학생 화면에는 프로필 메뉴에 담을 것도
            대시보드만큼 많지 않습니다. */}
        {!admin && (
          <button
            className={`btn-ghost ${active === "report" ? "nav-active" : ""}`}
            onClick={() => go("/report")}
            title="학습 리포트"
          >
            <IconReport size={20} /> <span className="nav-label">학습 리포트</span>
          </button>
        )}

        {/* 역할 관리는 프로필 메뉴의 '관리자 설정'으로 이동 */}
      </nav>
    </header>

    {/* 학생 화면 — 교사가 방송 중이면 화면 전체를 강제로 덮습니다(학생은 닫을 수 없음) */}
    {!admin && broadcast && (
      <PresentationOverlay broadcast={broadcast} noteOpen={noteOpen} noteWide={noteWide} />
    )}

    {/* 수업 노트 서랍 — 오버레이의 '형제'이고, 방송 조건 바깥입니다.
        학생이 스스로 공부하려고 남기는 기록이라 방송 중·일시정지·수업 밖
        어디서나 같은 자리에서 열려야 합니다. 오버레이 안에 넣으면 선생님이
        잠깐 멈출 때마다(LessonMode가 그때도 방송 문서를 지웁니다) 함께
        사라져 쓰던 자리를 잃습니다. */}
    {!admin && activeClassId && (
      <CornellNoteDrawer
        classId={activeClassId}
        user={user}
        lessonTitle={broadcast?.lessonTitle ?? ""}
        boardId={broadcast?.boardId ?? ""}
        boardTitle={broadcast?.boardTitle ?? ""}
        onOpenChange={handleNoteOpen}
        onType={markNoting}
        /* 선생님이 내보낸 활동 — 위에서 구독해 둔 반 문서에서 그대로
           읽습니다(이 구독이 곧 이것을 위한 것입니다). */
        task={classTaskOf(classDoc)}
      />
    )}

    {/* 과일을 받은 순간 — 학생 화면 어디서든(위 훅 참고) */}
    <RewardCelebration amount={cheerAmount} onDone={clearCheer} />

    {/* 교사 화면 — 자기 반에 방송이 켜져 있으면 어디서든 바로 끌 수 있는 안전장치 */}
    {admin && broadcast && (
      <button
        type="button"
        className="broadcast-stop-pill"
        onClick={() => stopBroadcast(broadcastClassId)}
        title="학생 화면 강제 전환을 종료합니다"
      >
        <span className="broadcast-live-dot" aria-hidden="true" />
        학생 화면 강제 전환 중 · 방송 종료
      </button>
    )}
    </>
  );
}
