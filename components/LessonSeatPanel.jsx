"use client";

// =============================================================
// 수업하기(발표 모드) 안에 끼워 넣는 자리표 — 참여 전광판(AttendanceBoard)을
// 모달로 따로 열지 않아도, 화면 아래쪽에서 바로 출석·시청 확인, 과일 주기,
// 누가기록, 자리 이동까지 할 수 있게 한 축소판입니다.
// -------------------------------------------------------------
// 참여 전광판을 대체하는 게 아니라 나란히 둡니다 — 전광판은 모둠별 보기 등
// 더 큰 화면이 필요할 때 여전히 쓰고, 이 패널은 슬라이드를 보면서 곁눈으로
// 확인하는 상시 자리입니다. 그래서 자리 데이터(자리표·모둠)와 드래그 이동
// 저장은 참여 전광판과 같은 문서(dailySeatLayout)를 그대로 공유합니다 —
// 두 화면 중 어느 쪽에서 옮기든 서로 어긋나지 않습니다.
//
// 손들기 자리 확인(QuestionSeatModal)의 SeatPickGrid를 그대로 씁니다.
// 거기 없는 '실시간 시청 여부'만 liveState로 얹어, 출석(배경색)과 시청
// (자리 칸의 작은 점)을 한 자리에서 함께 보여 줍니다.
//
// 처음엔 버튼 하나로만 보입니다 — 활동 관리 쪽 내용이 짧은 수업(활동이
// 없거나 목표만 몇 줄인 경우)에서 자리표가 항상 펼쳐져 있으면 옆 칸만 유독
// 길어져 화면이 한쪽으로 쏠립니다. 눌러야 펼쳐지게 해 평소엔 균형을 맞추고,
// 필요할 때만 크게 봅니다.
// =============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { subscribeQuestionSignals, todayDateKey } from "@/lib/store";
import { normalizeSeats } from "@/lib/seats";
import { getCurrentUser } from "@/lib/user";
import { deskState, attendedTodaySet } from "./AttendanceBoard";
import { SeatCell, SeatPickGrid, attStateOf } from "./QuestionSeatModal";
import SeatViewToggle from "./SeatViewToggle";
import { useSeatView } from "@/lib/seatView";
import { useTodayRewardCounts } from "@/lib/useTodayRewards";
import RewardTally from "./RewardTally";
import StudentToolsModal from "./StudentToolsModal";
import StudentNotesModal from "./StudentNotesModal";
import { IconChair } from "./StatusIcons";

const GROUP_COLORS = ["#2563eb", "#16a34a", "#f97316", "#9333ea", "#dc2626", "#0891b2"];

export default function LessonSeatPanel({
  roster = [],
  presence = [],
  attendanceRecords = [],
  seatLayout = null,
  dailySeatLayout = null,
  groupAssignment = null,
  classId = null,
  now = Date.now(),
  onAward = null, // 없으면(학생 화면 등) 자리를 눌러도 아무 일도 안 일어남
  onSaveSeats,    // (seats) => Promise — 참여 전광판과 같은 daily 자리표에 저장
  // 손든 학생 — 수업 화면 머리말의 손들기 표시와 같은 값을 봐야 해서
  // 구독을 부모(LessonMode)로 올렸습니다. 안 주면 여기서 직접 구독합니다.
  raisedUids: raisedUidsProp = null,
  // 펼침도 부모가 쥘 수 있게 — 머리말의 손들기를 누르면 열려야 합니다.
  open: openProp = null,
  onOpenChange = null,
}) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = onOpenChange ?? setOpenState;
  // 'seat' 개별 보기 | 'group' 모둠 보기 | 'tally' 궁금한 순간
  // 셋을 위아래로 쌓지 않고 한 자리에서 갈아 끼웁니다 — 수업 중에 보는
  // 화면이라 세로로 길어지면 아래쪽은 스크롤해야 보입니다.
  const [view, setView] = useState("seat");
  // 자리표를 보는 쪽 — 자리표가 나오는 네 화면이 같은 값을 함께 씁니다
  const [teacherView, toggleSeatView] = useSeatView();
  const [ownRaised, setOwnRaised] = useState(() => new Set());
  const raisedUids = raisedUidsProp ?? ownRaised;
  const [dragIndex, setDragIndex] = useState(null);
  const [toolsFor, setToolsFor] = useState(null);
  const [notesFor, setNotesFor] = useState(null);
  const [seats, setSeats] = useState(() =>
    normalizeSeats(dailySeatLayout?.seats ?? seatLayout?.seats ?? [], roster)
  );

  // 탭 자리의 키 — **자리표(개별 보기) 하나만** 기준으로 잡습니다.
  //
  // 처음에는 '지금까지 본 가장 큰 보기'를 바닥으로 깔았는데, 그러면 더 큰
  // 보기를 **처음 여는 그 순간에는** 여전히 페이지가 늘어납니다. 28명 기준으로
  // 재 보니 자리표 474 → 궁금한 순간 583px이라, 첫 전환에서 페이지가 109px
  // 자라 화면이 그만큼 밀렸습니다(두 번째부터는 조용했고요 — 그래서 '가끔
  // 흔들린다'로 보였습니다).
  //
  // 기준을 자리표로 못 박으면 첫 전환부터 키가 한 치도 안 변합니다. 자리표는
  // 기본 보기라 패널을 열면 늘 먼저 그려지고, 명단 수로 키가 정해져 탭과
  // 무관하게 일정합니다. 남는 보기가 더 길면 그 자리 안에서 구릅니다.
  const bodyRef = useRef(null);
  const [bodyH, setBodyH] = useState(0);
  // 명단이 바뀌면 다시 잽니다 — 학생이 빠져 자리표가 짧아졌는데 옛 키가
  // 그대로 남아 빈자리만 넓어지는 일이 없게.
  useEffect(() => { setBodyH(0); }, [roster.length]);

  useEffect(() => {
    if (raisedUidsProp) return;            // 부모가 주면 여기서 또 구독하지 않습니다
    if (!classId) { setOwnRaised(new Set()); return; }
    return subscribeQuestionSignals(classId, (list) =>
      setOwnRaised(new Set(list.map((s) => s.uid).filter(Boolean)))
    );
  }, [classId, raisedUidsProp]);

  useEffect(() => {
    setSeats(normalizeSeats(dailySeatLayout?.seats ?? seatLayout?.seats ?? [], roster));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dailySeatLayout?.updatedAt, seatLayout?.updatedAt, roster]);

  const byUid = useMemo(() => new Map(roster.map((s) => [s.uid, s])), [roster]);
  // 자리 칸의 🍎 뱃지는 오늘 받은 개수(누적 총계는 과일 주기 모달에).
  const todayCountByUid = useTodayRewardCounts(classId);
  const presenceByUid = useMemo(() => new Map(presence.map((p) => [p.uid, p])), [presence]);
  const raisedCount = roster.filter((s) => raisedUids.has(s.uid)).length;

  // 출석 색은 참여 전광판과 '같은 함수'로 냅니다(attendedTodaySet).
  // 예전엔 여기서 따로 세면서 "오늘 기록이 하나도 없으면 null"로 두었는데,
  // 그러면 attStateOf가 전부 unchecked(색 없음)로 읽어 — 옆에 띄운 전광판은
  // 반 전체가 결석(주황)인데 이 자리표만 허옇게 남았습니다.
  const today = todayDateKey();
  const presentUids = useMemo(
    () => attendedTodaySet(attendanceRecords, today),
    [attendanceRecords, today]
  );

  const liveState = useMemo(() => {
    const map = new Map();
    roster.forEach((s) => map.set(s.uid, deskState(presenceByUid.get(s.uid), now)));
    return map;
  }, [roster, presenceByUid, now]);

  // 수업 노트에 방금 필기한 학생 — 화면이 보이는 상태(on)일 때만 뜻이 있습니다
  const notingUids = useMemo(() => {
    const set = new Set();
    roster.forEach((s) => {
      const p = presenceByUid.get(s.uid);
      if (p?.noting && deskState(p, now) === "on") set.add(s.uid);
    });
    return set;
  }, [roster, presenceByUid, now]);

  // 모둠 보기 — 참여 전광판의 '모둠별 보기'와 같은 방식으로, 배정된 모둠을
  // 먼저 늘어놓고 아직 어느 모둠에도 없는 학생을 '미배정'으로 뒤에 붙입니다.
  // 저장된 모둠은 memberUids(uid 배열) 또는 members([{uid,…}])로 오므로 둘 다
  // 받아 줍니다(반 관리에서 만든 모둠과 공부방 패널에서 옮긴 모둠의 모양이
  // 서로 다릅니다).
  const groupSections = useMemo(() => {
    const groups = (groupAssignment?.groups ?? []).map((g, i) => ({
      key: g.id ?? g.index ?? i,
      name: g.name || `${g.index ?? i + 1}모둠`,
      color: g.color || GROUP_COLORS[i % GROUP_COLORS.length],
      members: (g.memberUids ?? g.members?.map((m) => m.uid) ?? [])
        .map((uid) => byUid.get(uid))
        .filter(Boolean),
    }));
    const assigned = new Set(groups.flatMap((g) => g.members.map((m) => m.uid)));
    const unassigned = roster.filter((s) => !assigned.has(s.uid));
    return unassigned.length
      ? [...groups, { key: "ungrouped", name: "미배정", color: "#9ca3af", members: unassigned }]
      : groups;
  }, [groupAssignment, byUid, roster]);

  const hasGroups = (groupAssignment?.groups ?? []).length > 0;
  // 모둠 보기를 켜 둔 채 모둠이 지워지면(반 관리에서 다시 배정하는 중 등)
  // 빈 화면이 남지 않도록 개별 보기로 돌려 둡니다.
  // '궁금한 순간'은 예전에도 교사(onAward가 있을 때)에게만 보였습니다 —
  // 탭으로 옮기면서 범위가 넓어지지 않도록 같은 조건을 답니다.
  const canTally = !!onAward;
  const activeView =
    (view === "group" && !hasGroups) || (view === "tally" && !canTally) ? "seat" : view;

  // 자리표를 보고 있을 때만 잽니다(위 주석 참고). 이 자리에 두는 이유는
  // activeView가 여기서 만들어지기 때문입니다 — const를 선언 전에 읽으면
  // ReferenceError입니다.
  useEffect(() => {
    if (activeView !== "seat") return;
    const el = bodyRef.current;
    if (!el) return;
    // 키를 이미 못 박아 둔 상태에서는 scrollHeight가 그 값 아래로 안 내려가므로,
    // 잴 때만 잠깐 풀었다가 되돌립니다. 같은 프레임 안이라 화면에는 안 보입니다.
    const fixed = el.style.height;
    el.style.height = "auto";
    const h = el.scrollHeight;
    el.style.height = fixed;
    if (h > 0 && h !== bodyH) setBodyH(h);
  });
  const bodyStyle = bodyH > 0 ? { height: bodyH } : undefined;

  // 세 보기를 가르는 탭 — 패널 머리에 한 줄로 둡니다. 예전에는 자리표
  // 머리줄('칠판' 자리)에 끼워 넣었는데, '궁금한 순간'은 자리표가 없는
  // 보기라 그 안에 둘 수 없습니다. 밖으로 꺼내니 자리표는 원래의 칠판
  // 표시를 되찾아 위아래 방향도 다시 분명해집니다.
  const TABS = [
    { key: "seat", label: "개별 보기" },
    { key: "group", label: "모둠 보기" },
    ...(canTally ? [{ key: "tally", label: "궁금한 순간" }] : []),
  ];
  const viewTabs = (
    <div className="lesson-seat-tabrow">
      <span className="lesson-seat-tabs" role="tablist" aria-label="자리표 보기 방식">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={activeView === t.key}
            className={activeView === t.key ? "active" : ""}
            onClick={() => setView(t.key)}
            disabled={t.key === "group" && !hasGroups}
            title={
              t.key === "group" && !hasGroups
                ? "'반 관리하기 → 자리 배정하기'에서 모둠을 먼저 만들어 주세요"
                : undefined
            }
          >
            {t.label}
          </button>
        ))}
      </span>
      {/* 어느 쪽에서 본 배치인가 — '멋진 순간' 패널과 같은 값을 함께 씁니다.
          자리표가 있는 보기(개별)에서만 뜻이 있어 그때만 답니다. */}
      {activeView === "seat" && (
        <SeatViewToggle teacherView={teacherView} onToggle={toggleSeatView} />
      )}
      {/* 손든 인원은 어느 보기에서든 보여야 합니다 — 궁금한 순간을 보는
          동안 손을 든 학생이 있어도 놓치지 않게. */}
      <span className={`attend-seatmap-hands${raisedCount > 0 ? " on" : ""}`}>
        🖐️ {raisedCount}
      </span>
    </div>
  );

  async function moveSeat(from, to) {
    setDragIndex(null);
    if (from == null || to == null || from === to) return;
    const next = [...seats];
    [next[from], next[to]] = [next[to], next[from]];
    setSeats(next);
    await onSaveSeats?.(next, getCurrentUser());
  }

  function openNotes(student) {
    setToolsFor(null);
    setNotesFor({ uid: student.uid, name: student.name, emoji: student.emoji ?? "🙂" });
  }

  // 과일을 주면 roster가 갱신돼 내려오므로, 열려 있는 모달의 숫자도 최신
  // 값으로 따라가게 합니다(모달이 처음 열릴 때 찍힌 값에 머무르지 않게).
  const toolsStudent = toolsFor
    ? { ...toolsFor, count: byUid.get(toolsFor.uid)?.count ?? toolsFor.count ?? 0 }
    : null;

  if (!open) {
    return (
      <button
        type="button"
        className="lesson-seat-toggle"
        onClick={() => setOpen(true)}
      >
        <IconChair size={18} className="lesson-seat-toggle-icon" />
        자리표
        {raisedCount > 0 && (
          <span className="lesson-seat-toggle-hand">🖐️ {raisedCount}</span>
        )}
      </button>
    );
  }

  return (
    <section className="lesson-seat-panel" aria-label="자리표">
      <div className="lesson-card-head">
        <h2 className="head-icon"><IconChair size={19} /> 자리표</h2>
        <button
          type="button"
          className="lesson-seat-collapse-btn"
          onClick={() => setOpen(false)}
          aria-label="자리표 접기"
        >
          접기
        </button>
      </div>
      <p className="lesson-seat-hint">
        {activeView === "seat"
          ? "자리를 눌러 과일·누가기록 · 끌어서 자리 이동"
          : activeView === "group"
            ? "학생을 눌러 과일·누가기록 (자리 이동은 개별 보기에서)"
            : "반 전체가 지금까지 받은 과일 — 많이 받은 순"}
      </p>
      {viewTabs}
      {/* 세 보기의 키가 제각각입니다(25명 기준 자리표 726 · 모둠 535 ·
          궁금한 순간 480px — 재 본 값). 그대로 두면 탭을 누를 때마다 패널이
          200px 넘게 줄었다 늘었다 하고, 그만큼 아래 내용과 스크롤이 튑니다.
          가장 큰 보기의 키를 기억해 바닥으로 깔아 두면 탭만 갈릴 뿐 판은
          그대로 있습니다. */}
      <div className="lesson-seat-body" ref={bodyRef} style={bodyStyle}>
      {roster.length === 0 ? (
        <p className="lesson-note-empty">이 반에 입장한 학생이 없어요.</p>
      ) : activeView === "tally" ? (
        // 궁금한 순간 — 탭이 열려 있는 동안만 붙어 있으므로, 이 컴포넌트의
        // 구독도 탭을 떠나면 저절로 끊깁니다(embedded는 늘 펼친 상태).
        <RewardTally classId={classId} roster={roster} embedded />
      ) : activeView === "group" ? (
        // 모둠 보기 — 모둠끼리 묶어 봅니다. 자리 이동(드래그)은 자리 배치를
        // 바꾸는 일이라 개별 보기에서만 합니다(모둠 보기에는 '자리'가 없어
        // 어디로 옮기는 건지가 성립하지 않습니다).
        <div className="attend-seatmap attend-seatmap--compact">
          {/* 머리줄이 없습니다 — 탭도 손든 인원도 패널 머리로 올라갔습니다. */}
          <div className="lesson-seat-groups">
            {groupSections.map((g) => (
              <section
                key={g.key}
                className="lesson-seat-group"
                style={{ "--group-color": g.color }}
              >
                <h4 className="lesson-seat-group-name">{g.name}</h4>
                <div className="lesson-seat-group-members">
                  {g.members.length === 0 ? (
                    <em className="lesson-seat-group-empty">배정된 학생이 없어요</em>
                  ) : (
                    g.members.map((s) => (
                      <SeatCell
                        key={s.uid}
                        student={s}
                        raised={raisedUids.has(s.uid)}
                        att={attStateOf(s.uid, presentUids)}
                        live={liveState.get(s.uid) ?? null}
                        noting={notingUids.has(s.uid)}
                        todayCount={todayCountByUid.get(s.uid) ?? 0}
                        onPick={onAward ? setToolsFor : undefined}
                      />
                    ))
                  )}
                </div>
              </section>
            ))}
          </div>
        </div>
      ) : (
        <SeatPickGrid
          compact
          seats={seats}
          byUid={byUid}
          raisedUids={raisedUids}
          raisedCount={raisedCount}
          onPick={onAward ? setToolsFor : () => {}}
          onDragStart={setDragIndex}
          onDragEnd={() => setDragIndex(null)}
          onDropTo={(toIndex) => moveSeat(dragIndex, toIndex)}
          presentUids={presentUids}
          liveState={liveState}
          notingUids={notingUids}
          todayCountByUid={todayCountByUid}
          flipped={teacherView}
        />
      )}
      </div>

      {toolsStudent && onAward && (
        <StudentToolsModal
          student={toolsStudent}
          classId={classId}
          onAward={onAward}
          onOpenNotes={openNotes}
          onClose={() => setToolsFor(null)}
        />
      )}

      {notesFor && (
        <StudentNotesModal
          student={notesFor}
          onBack={() => { setNotesFor(null); setToolsFor(notesFor); }}
          classId={classId}
          onClose={() => setNotesFor(null)}
        />
      )}
    </section>
  );
}
