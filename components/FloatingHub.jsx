"use client";

// =============================================================
// 떠 있는 동그라미 — 메신저와 자주 여는 기능을 한 손에
// -------------------------------------------------------------
// 화면 오른쪽 아래의 작은 동그라미(56px). 누르면 **큰 원으로 펼쳐지며**
// 기능 여섯 개가 둘레에 섭니다 — 메신저 · KWLS · 수업 노트 · 출석 · 리포트 ·
// 과일 바구니(교사는 메신저 · KWLS 차트 · 출석 관리 · 수업 관리 · 학생 분석 ·
// 과일 바구니).
//
// [모양은 둘 — 피자 조각 · 행성 궤도]
// 어느 쪽이 나을지 아직 정하지 않아, 가운데 원 아래의 작은 전환으로 둘을
// 오갑니다(이 기기에 기억 — `hub_style`). 각도·자리는 같고 그리는 모양만
// 다릅니다. 하나로 정하면 전환과 다른 쪽 CSS를 걷으면 됩니다.
//
// [기능은 '그 자리로 데려다 주기']
// 메신저만 이 자리에서 창을 엽니다. 나머지는 이미 공부방에 있는 창을
// 주소로 엽니다(`/study?open=kwl|notes|attendance|fruit` — 공부방이 열고
// 주소를 지웁니다). 같은 창을 여기에 한 벌 더 만들면 두 곳이 어긋납니다.
//
// [읽는 문서]
// 안 읽은 말 배지 때문에 반을 고른 동안은 늘 구독합니다 — 학생은 제 방 둘
// (등호 질의 둘) + 모둠 문서 + 읽음 표시, 교사는 반의 최근 말 300개 + 모둠
// 문서 + 읽음 표시. 교사의 학생 명단은 **메신저를 열었을 때만** 읽습니다.
// =============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  subscribeClassChat,
  subscribeRoomsChat,
  subscribeChatReads,
  subscribeStudyGroupAssignment,
} from "@/lib/store";
import { dmRoom, groupRoom, totalUnread } from "@/lib/messenger";
import MessengerWindow from "./MessengerWindow";

const STYLE_KEY = "hub_style";

const STUDENT_ITEMS = [
  { key: "msg", icon: "💬", label: "메신저", hint: "선생님 · 우리 모둠과 대화해요" },
  { key: "kwl", icon: "📝", label: "KWLS", hint: "KWLS 차트를 펼쳐요", href: "/study?open=kwl" },
  { key: "notes", icon: "📓", label: "수업 노트", hint: "지난 수업 노트를 넘겨 봐요", href: "/study?open=notes" },
  { key: "attend", icon: "✅", label: "출석 확인", hint: "내 출석 기록을 봐요", href: "/study?open=attendance" },
  { key: "report", icon: "📊", label: "리포트", hint: "나의 학습 리포트로 가요", href: "/report" },
  { key: "fruit", icon: "🧺", label: "과일 바구니", hint: "과일을 담고 이벤트에 응모해요", href: "/study?open=fruit" },
];
const TEACHER_ITEMS = [
  { key: "msg", icon: "💬", label: "메신저", hint: "학생 · 모둠과 대화해요" },
  { key: "kwl", icon: "📝", label: "KWLS 차트", hint: "반의 KWLS 현황을 펼쳐요", href: "/study?open=kwl" },
  { key: "attend", icon: "✅", label: "출석 관리", hint: "출석을 시작하고 기록을 봐요", href: "/study?open=attendance" },
  { key: "lessons", icon: "🗂️", label: "수업 관리", hint: "수업 · 프로젝트 · 자리 배치", href: "/study?panel=lessons" },
  { key: "admin", icon: "📊", label: "학생 분석", hint: "선생님 대시보드로 가요", href: "/admin" },
  { key: "fruit", icon: "🧺", label: "과일 바구니", hint: "바구니 합계와 이벤트 현황", href: "/study?open=fruit" },
];

// 원판 크기(px) — CSS의 `.hub-disc` 폭·높이와 같아야 합니다.
const DISC = 300;
const C = DISC / 2;
const R_OUT = 146;
const R_IN = 56;
const R_LABEL = 101; // 조각 · 궤도 모두 이 반지름에 항목이 섭니다

const rad = (deg) => (deg * Math.PI) / 180;
const pt = (r, deg) => [C + r * Math.cos(rad(deg)), C + r * Math.sin(rad(deg))];

// 고리 모양 조각 하나의 SVG 경로(바깥 호 → 안쪽 호).
function slicePath(a0, a1) {
  const gap = 1.2; // 조각 사이 틈(도)
  const s = a0 + gap / 2;
  const e = a1 - gap / 2;
  const [x0, y0] = pt(R_OUT, s);
  const [x1, y1] = pt(R_OUT, e);
  const [x2, y2] = pt(R_IN, e);
  const [x3, y3] = pt(R_IN, s);
  const large = e - s > 180 ? 1 : 0;
  return `M${x0} ${y0} A${R_OUT} ${R_OUT} 0 ${large} 1 ${x1} ${y1} L${x2} ${y2} A${R_IN} ${R_IN} 0 ${large} 0 ${x3} ${y3}Z`;
}

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

export default function FloatingHub({ classId, user, isTeacher, lifted = false }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [msgOpen, setMsgOpen] = useState(false);
  const [hover, setHover] = useState(null);
  const [style, setStyle] = useState("pie");
  const rootRef = useRef(null);
  const fabRef = useRef(null);
  const myUid = user?.uid;

  useEffect(() => {
    try {
      const v = localStorage.getItem(STYLE_KEY);
      if (v === "pie" || v === "orbit") setStyle(v);
    } catch { /* 저장소를 못 쓰면 기본 모양 */ }
  }, []);
  function changeStyle(next) {
    setStyle(next);
    try { localStorage.setItem(STYLE_KEY, next); } catch { /* 무시 */ }
  }

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
    if (!classId || !myUid) { setMessages([]); return undefined; }
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
  }, [menuOpen]);

  // 반(이나 역할)이 바뀌면 접습니다 — 열려 있던 방은 앞 반의 것입니다.
  useEffect(() => {
    setMsgOpen(false);
    setMenuOpen(false);
  }, [classId, isTeacher]);

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
        className={`hub-disc hub-disc--${style}${menuOpen ? " is-open" : ""}`}
        // 접힌 동안은 CSS가 visibility: hidden으로 감춰 안의 단추에 초점이 안 갑니다
        aria-hidden={!menuOpen}
      >
        {style === "pie" ? (
          <svg className="hub-pie" width={DISC} height={DISC} viewBox={`0 0 ${DISC} ${DISC}`} aria-hidden="true">
            {items.map((it, i) => (
              <path
                key={it.key}
                d={slicePath(angleOf(i) - step / 2, angleOf(i) + step / 2)}
                className={`hub-slice${hover === i ? " is-hover" : ""}`}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover((h) => (h === i ? null : h))}
                onClick={() => pick(it)}
              />
            ))}
          </svg>
        ) : (
          <svg className="hub-orbit" width={DISC} height={DISC} viewBox={`0 0 ${DISC} ${DISC}`} aria-hidden="true">
            <circle cx={C} cy={C} r={R_LABEL} className="hub-orbit-ring" />
            <circle cx={C} cy={C} r={R_OUT - 4} className="hub-orbit-ring hub-orbit-ring--far" />
          </svg>
        )}

        {items.map((it, i) => {
          const [x, y] = pt(R_LABEL, angleOf(i));
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
              <span className="hub-item-icon" aria-hidden="true">{it.icon}</span>
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
          <div className="hub-style-switch" role="radiogroup" aria-label="펼침 모양">
            <button
              type="button"
              role="radio"
              aria-checked={style === "pie"}
              className={style === "pie" ? "on" : ""}
              onClick={() => changeStyle("pie")}
            >
              조각
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={style === "orbit"}
              className={style === "orbit" ? "on" : ""}
              onClick={() => changeStyle("orbit")}
            >
              궤도
            </button>
          </div>
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
