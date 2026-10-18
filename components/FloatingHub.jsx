"use client";

// =============================================================
// 떠 있는 동그라미 — 메신저와 자주 여는 기능을 한 손에
// -------------------------------------------------------------
// 화면 오른쪽 아래의 작은 동그라미(56px). 누르면 **큰 원으로 펼쳐지며**
// 기능 여섯 개가 둘레에 섭니다 — 메신저 · KWLS · 수업 노트 · 출석 · 리포트 ·
// 과일 바구니(교사는 메신저 · KWLS 차트 · 출석 관리 · 수업 관리 · 학생 분석 ·
// 과일 바구니).
//
// [모양은 행성 궤도]
// 가운데 해(고른 기능의 설명) 둘레의 궤도에 작은 행성(동그라미) 여섯이
// 섭니다. 한때 '피자 조각'과 둘 다 두고 전환으로 오갔는데, 선생님이 궤도로
// 정하셔서 조각 모양과 전환을 걷었습니다.
//
// [그림은 앱의 아이콘 그대로]
// 이모지 대신 이미 그 기능을 가리키는 그림을 씁니다(components/StatusIcons.jsx)
// — 메신저는 로고(말풍선 둘), 수업 노트는 IconRecord, 리포트는 IconReport,
// 학생 분석은 '선생님 대시보드'의 IconTeacher, 수업 관리는 IconBlackboard,
// KWLS는 K · W · L 세 칸, 출석은 IconCheck. 과일 바구니는 바구니 창의 그림
// (`public/fruit-basket.webp`)을 작게 — 원을 펼쳤을 때만 그려 처음 화면에서
// 그림을 받지 않습니다.
//
// [기능은 '그 자리로 데려다 주기']
// 메신저만 이 자리에서 창을 엽니다. 나머지는 이미 공부방에 있는 창을
// 주소로 엽니다(`/study?open=kwl|notes|attendance|fruit` — 공부방이 열고
// 주소를 지웁니다). 같은 창을 여기에 한 벌 더 만들면 두 곳이 어긋납니다.
//
// [읽는 문서]
// 안 읽은 말 배지 때문에 반을 고른 동안은 늘 구독합니다 — 학생은 제 방 둘
// (등호 질의 둘) + 모둠 문서 + 읽음 표시, 교사는 반의 최근 말 300개 + 모둠
// 문서 + 읽음 표시(+ 교사는 반 목록). 교사의 학생 명단은 **메신저를 열었을
// 때만** 읽습니다. 교사의 배지는 메신저 창에서 고른 반(처음엔 공부방의 반)의 것입니다.
// =============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  subscribeClasses,
  subscribeClassChat,
  subscribeRoomsChat,
  subscribeChatReads,
  subscribeStudyGroupAssignment,
} from "@/lib/store";
import { dmRoom, groupRoom, totalUnread } from "@/lib/messenger";
import { isFirebaseConfigured } from "@/lib/firebase";
import MessengerWindow from "./MessengerWindow";
import {
  IconLogo,
  IconRecord,
  IconReport,
  IconTeacher,
  IconBlackboard,
  IconCheck,
  IconKwlK,
  IconKwlW,
  IconKwlL,
} from "./StatusIcons";

// KWLS — 앱에 'KWLS' 한 장짜리 그림이 없어 K · W · L 세 칸을 겹쳐 세웁니다.
function KwlStack() {
  return (
    <span className="hub-kwl-stack">
      <IconKwlK size={17} />
      <IconKwlW size={17} />
      <IconKwlL size={17} />
    </span>
  );
}
function FruitBasketPic({ show }) {
  if (!show) return <span className="hub-basket-pic" />;
  return <img className="hub-basket-pic" src="/fruit-basket.webp" alt="" width={36} height={24} />;
}
const ICONS = {
  msg: () => <IconLogo size={28} />,
  kwl: () => <KwlStack />,
  notes: () => <IconRecord size={26} />,
  attend: () => <IconCheck size={24} className="hub-icon-check" />,
  report: () => <IconReport size={26} />,
  admin: () => <IconTeacher size={28} />,
  lessons: () => <IconBlackboard size={27} />,
  fruit: ({ show }) => <FruitBasketPic show={show} />,
};

const STUDENT_ITEMS = [
  { key: "msg", label: "메신저", hint: "선생님 · 우리 모둠과 대화해요" },
  { key: "kwl", label: "KWLS", hint: "KWLS 차트를 펼쳐요", href: "/study?open=kwl" },
  { key: "notes", label: "수업 노트", hint: "지난 수업 노트를 넘겨 봐요", href: "/study?open=notes" },
  { key: "attend", label: "출석 확인", hint: "내 출석 기록을 봐요", href: "/study?open=attendance" },
  { key: "report", label: "리포트", hint: "나의 학습 리포트로 가요", href: "/report" },
  { key: "fruit", label: "과일 바구니", hint: "과일을 담고 이벤트에 응모해요", href: "/study?open=fruit" },
];
const TEACHER_ITEMS = [
  { key: "msg", label: "메신저", hint: "학생 · 모둠과 대화해요" },
  { key: "kwl", label: "KWLS 차트", hint: "반의 KWLS 현황을 펼쳐요", href: "/study?open=kwl" },
  { key: "attend", label: "출석 관리", hint: "출석을 시작하고 기록을 봐요", href: "/study?open=attendance" },
  { key: "lessons", label: "수업 관리", hint: "수업 · 프로젝트 · 자리 배치", href: "/study?panel=lessons" },
  { key: "admin", label: "학생 분석", hint: "선생님 대시보드로 가요", href: "/admin" },
  { key: "fruit", label: "과일 바구니", hint: "바구니 합계와 이벤트 현황", href: "/study?open=fruit" },
];

// 원판 크기(px) — CSS의 `.hub-disc` 폭·높이와 같아야 합니다.
const DISC = 300;
const C = DISC / 2;
const R_OUT = 146;
const R_ORBIT = 101; // 행성(항목)이 서는 궤도

const rad = (deg) => (deg * Math.PI) / 180;
const pt = (r, deg) => [C + r * Math.cos(rad(deg)), C + r * Math.sin(rad(deg))];

function ChatIcon({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 11.5C4 7.36 7.58 4 12 4s8 3.36 8 7.5S16.42 19 12 19c-1.02 0-2-.18-2.9-.5L5 20l1.2-3.4C4.83 15.27 4 13.47 4 11.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="8.6" cy="11.5" r="1.1" fill="currentColor" />
      <circle cx="12" cy="11.5" r="1.1" fill="currentColor" />
      <circle cx="15.4" cy="11.5" r="1.1" fill="currentColor" />
    </svg>
  );
}

// classId — 지금 보는 반(교사는 공부방에서 고른 반, 학생은 소속 반).
// 교사의 메신저는 이와 따로 **창 맨 위에서 반을 고릅니다**(chatClassId) —
// 어느 화면에서든 원하는 반과 대화하고, 공부방의 반은 안 바뀝니다.
export default function FloatingHub({ classId: pageClassId, user, isTeacher, lifted = false }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [msgOpen, setMsgOpen] = useState(false);
  const [hover, setHover] = useState(null);
  // 한 번이라도 펼쳤나 — 바구니 그림은 그때부터 받습니다(닫히는 동안에도 남게).
  const [opened, setOpened] = useState(false);
  const rootRef = useRef(null);
  const fabRef = useRef(null);
  const myUid = user?.uid;

  // ── 교사 — 내가 맡은 반(보관 안 된 것, 이름순) ──
  // 규칙이 메신저를 **반을 만든 교사**에게만 열어 두어(ownsClass) 최고 관리자도
  // 제 반만 셉니다. 반 목록은 문서 수가 적어 늘 구독해도 가볍습니다.
  // 데모 모드는 접속마다 uid가 새로 나와 '내가 만든 반'이 없으므로 보이는 반 전부.
  const [teacherClasses, setTeacherClasses] = useState([]);
  useEffect(() => {
    if (!isTeacher || !myUid) { setTeacherClasses([]); return undefined; }
    return subscribeClasses((list) =>
      setTeacherClasses(
        list
          .filter((c) => !c.archived && (!isFirebaseConfigured || c.createdBy === myUid))
          .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? ""), "ko", { numeric: true }))
      )
    );
  }, [isTeacher, myUid]);

  // 교사의 메신저 반 — 처음엔 공부방에서 고른 반(없으면 첫 반). 창이 닫혀 있는
  // 동안은 공부방의 반을 따라가고, 창에서 고른 반은 창이 떠 있는 동안 지킵니다.
  const [chatClassId, setChatClassId] = useState(null);
  const msgOpenRef = useRef(false);
  useEffect(() => {
    if (!isTeacher) return;
    const valid = (id) => id && teacherClasses.some((c) => c.id === id);
    setChatClassId((cur) => {
      if (msgOpenRef.current && valid(cur)) return cur;
      if (valid(pageClassId)) return pageClassId;
      if (valid(cur)) return cur;
      return teacherClasses[0]?.id ?? pageClassId ?? null;
    });
  }, [isTeacher, pageClassId, teacherClasses]);
  const classId = isTeacher ? chatClassId : pageClassId;

  // ── 모둠 · 말 · 읽음 표시 ──
  const [groups, setGroups] = useState([]);
  useEffect(() => {
    if (!classId) { setGroups([]); return undefined; }
    return subscribeStudyGroupAssignment(classId, (d) => setGroups(d?.groups ?? []));
  }, [classId]);

  const myGroup = useMemo(
    () => (isTeacher ? null : groups.find((g) => (g.memberUids ?? []).includes(myUid)) ?? null),
    [groups, isTeacher, myUid]
  );
  // 학생의 방 — 선생님 1:1 · 우리 모둠(있으면). 열쇠를 글자로 묶어 의존성에 씁니다.
  const studentRoomsKey = !isTeacher && myUid
    ? [dmRoom(myUid), myGroup?.id ? groupRoom(myGroup.id) : null].filter(Boolean).join("|")
    : "";

  const [messages, setMessages] = useState([]);
  useEffect(() => {
    setMessages([]); // 앞 반의 말이 새 반 목록에 한 박자 남지 않게
    if (!classId || !myUid) return undefined;
    if (isTeacher) return subscribeClassChat(classId, setMessages);
    return subscribeRoomsChat(classId, studentRoomsKey.split("|").filter(Boolean), setMessages);
  }, [classId, myUid, isTeacher, studentRoomsKey]);

  const [seen, setSeen] = useState({});
  useEffect(() => {
    if (!classId || !myUid) { setSeen({}); return undefined; }
    return subscribeChatReads(classId, myUid, setSeen);
  }, [classId, myUid]);

  // 배지 — 교사는 반의 모든 방, 학생은 제 방들.
  const unread = useMemo(() => {
    if (!myUid) return 0;
    const rooms = isTeacher
      ? [...new Set(messages.map((m) => m.room))]
      : studentRoomsKey.split("|").filter(Boolean);
    return totalUnread(messages, rooms, myUid, seen);
  }, [messages, seen, myUid, isTeacher, studentRoomsKey]);

  const items = isTeacher ? TEACHER_ITEMS : STUDENT_ITEMS;
  const step = 360 / items.length;
  // 첫 조각(메신저)의 가운데가 맨 위에 오게.
  const angleOf = (i) => -90 + i * step;

  // ── 닫기 — 바깥 누르기 · Esc ──
  useEffect(() => {
    if (!menuOpen) return undefined;
    function onDown(e) {
      // 누르는 순간 사라진 것은 '바깥'이 아닙니다(프로젝트 문서 '바깥을 눌러 닫기').
      if (!e.target.isConnected) return;
      if (rootRef.current?.contains(e.target)) return;
      setMenuOpen(false);
    }
    function onKey(e) {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      setMenuOpen(false);
      fabRef.current?.focus();
    }
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) setHover(null);
    else setOpened(true);
  }, [menuOpen]);

  useEffect(() => {
    msgOpenRef.current = msgOpen;
  }, [msgOpen]);

  // 학생의 반(이나 역할)이 바뀌면 접습니다 — 열려 있던 방은 앞 반의 것입니다.
  // 교사는 창 안에서 반을 바꾸므로 접지 않습니다(창이 방을 반과 짝으로 듭니다).
  useEffect(() => {
    if (isTeacher) return;
    setMsgOpen(false);
    setMenuOpen(false);
  }, [pageClassId, isTeacher]);

  function pick(item) {
    setMenuOpen(false);
    if (item.key === "msg") {
      setMsgOpen(true);
      return;
    }
    if (item.href) router.push(item.href);
  }

  function onFab() {
    if (msgOpen) { setMsgOpen(false); return; }
    setMenuOpen((v) => !v);
  }

  if (!user || !classId) return null;

  const shown = hover != null ? items[hover] : null;
  const fabOpen = menuOpen || msgOpen;

  return (
    <div ref={rootRef} className={`hub-root${lifted ? " is-lifted" : ""}`}>
      {/* 큰 원 — 접혀 있을 때도 그려 두고 크기만 0에 가깝게(펼침 움직임) */}
      <div
        className={`hub-disc${menuOpen ? " is-open" : ""}`}
        // 접힌 동안은 CSS가 visibility: hidden으로 감춰 안의 단추에 초점이 안 갑니다
        aria-hidden={!menuOpen}
      >
        <svg className="hub-orbit" width={DISC} height={DISC} viewBox={`0 0 ${DISC} ${DISC}`} aria-hidden="true">
          <circle cx={C} cy={C} r={R_ORBIT} className="hub-orbit-ring" />
          <circle cx={C} cy={C} r={R_OUT - 4} className="hub-orbit-ring hub-orbit-ring--far" />
        </svg>

        {items.map((it, i) => {
          const [x, y] = pt(R_ORBIT, angleOf(i));
          const Icon = ICONS[it.key];
          return (
            <button
              key={it.key}
              type="button"
              className={`hub-item${hover === i ? " is-hover" : ""}`}
              style={{ left: x, top: y, "--i": i }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover((h) => (h === i ? null : h))}
              onFocus={() => setHover(i)}
              onBlur={() => setHover((h) => (h === i ? null : h))}
              onClick={() => pick(it)}
              title={it.hint}
            >
              <span className="hub-item-icon" aria-hidden="true">{Icon ? <Icon show={opened} /> : null}</span>
              <span className="hub-item-label">{it.label}</span>
              {it.key === "msg" && unread > 0 && (
                <span className="hub-item-badge" aria-label={`안 읽은 말 ${unread}개`}>
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </button>
          );
        })}

        {/* 가운데 — 고른 기능의 설명, 아무것도 안 고르면 이름 */}
        <div className="hub-center">
          <strong>{shown ? shown.label : "배움나눔"}</strong>
          <span>{shown ? shown.hint : "무엇을 열까요?"}</span>
        </div>
      </div>

      {/* 작은 동그라미 — 펼친 동안은 닫기(×) */}
      <button
        ref={fabRef}
        type="button"
        className={`hub-fab${fabOpen ? " is-open" : ""}`}
        onClick={onFab}
        aria-expanded={menuOpen}
        aria-label={msgOpen ? "메신저 닫기" : menuOpen ? "메뉴 닫기" : "메신저와 바로가기 열기"}
        title={msgOpen ? "메신저 닫기" : menuOpen ? "닫기" : "메신저 · 바로가기"}
      >
        <span className="hub-fab-icon" aria-hidden="true">
          {fabOpen ? <span className="hub-fab-x">×</span> : <ChatIcon />}
        </span>
        {!fabOpen && unread > 0 && (
          <span className="hub-fab-badge" aria-label={`안 읽은 말 ${unread}개`}>
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {msgOpen && (
        <MessengerWindow
          classId={classId}
          classes={isTeacher ? teacherClasses : []}
          onClassChange={setChatClassId}
          user={user}
          isTeacher={isTeacher}
          groups={groups}
          messages={messages}
          seen={seen}
          onClose={() => { setMsgOpen(false); fabRef.current?.focus(); }}
        />
      )}
    </div>
  );
}
