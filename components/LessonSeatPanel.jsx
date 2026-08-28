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
import { useEffect, useMemo, useState } from "react";
import { subscribeQuestionSignals, todayDateKey } from "@/lib/store";
import { normalizeSeats } from "@/lib/seats";
import { getCurrentUser } from "@/lib/user";
import { deskState } from "./AttendanceBoard";
import { SeatCell, SeatPickGrid, attStateOf } from "./QuestionSeatModal";
import StudentToolsModal from "./StudentToolsModal";
import StudentNotesModal from "./StudentNotesModal";

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
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState("seat"); // 'seat' 개별 보기 | 'group' 모둠 보기
  const [raisedUids, setRaisedUids] = useState(() => new Set());
  const [dragIndex, setDragIndex] = useState(null);
  const [toolsFor, setToolsFor] = useState(null);
  const [notesFor, setNotesFor] = useState(null);
  const [seats, setSeats] = useState(() =>
    normalizeSeats(dailySeatLayout?.seats ?? seatLayout?.seats ?? [], roster)
  );

  useEffect(() => {
    if (!classId) { setRaisedUids(new Set()); return; }
    return subscribeQuestionSignals(classId, (list) =>
      setRaisedUids(new Set(list.map((s) => s.uid).filter(Boolean)))
    );
  }, [classId]);

  useEffect(() => {
    setSeats(normalizeSeats(dailySeatLayout?.seats ?? seatLayout?.seats ?? [], roster));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dailySeatLayout?.updatedAt, seatLayout?.updatedAt, roster]);

  const byUid = useMemo(() => new Map(roster.map((s) => [s.uid, s])), [roster]);
  const presenceByUid = useMemo(() => new Map(presence.map((p) => [p.uid, p])), [presence]);
  const raisedCount = roster.filter((s) => raisedUids.has(s.uid)).length;

  const today = todayDateKey();
  const presentUids = useMemo(() => {
    const todays = attendanceRecords.filter((r) => r.date === today);
    return todays.length ? new Set(todays.map((r) => r.uid)) : null;
  }, [attendanceRecords, today]);

  const liveState = useMemo(() => {
    const map = new Map();
    roster.forEach((s) => map.set(s.uid, deskState(presenceByUid.get(s.uid), now)));
    return map;
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
  const activeView = view === "group" && hasGroups ? "group" : "seat";

  // 머리줄의 '칠판' 자리를 보기 전환 탭이 대신합니다 — 자리표는 늘 교실
  // 앞쪽이 위이므로 칠판 표시가 없어도 방향을 헷갈리지 않고, 그 자리가
  // 패널에서 가장 눈에 띄어 전환 버튼을 두기 좋습니다.
  const viewTabs = (
    <span className="lesson-seat-tabs" role="tablist" aria-label="자리표 보기 방식">
      <button
        type="button"
        role="tab"
        aria-selected={activeView === "seat"}
        className={activeView === "seat" ? "active" : ""}
        onClick={() => setView("seat")}
      >
        개별 보기
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeView === "group"}
        className={activeView === "group" ? "active" : ""}
        onClick={() => setView("group")}
        disabled={!hasGroups}
        title={hasGroups ? undefined : "'반 관리하기 → 자리 배정하기'에서 모둠을 먼저 만들어 주세요"}
      >
        모둠 보기
      </button>
    </span>
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
        <span className="lesson-seat-toggle-icon" aria-hidden="true">🪑</span>
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
        <h2>🪑 자리표</h2>
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
          : "학생을 눌러 과일·누가기록 (자리 이동은 개별 보기에서)"}
      </p>
      {roster.length === 0 ? (
        <p className="lesson-note-empty">이 반에 입장한 학생이 없어요.</p>
      ) : activeView === "group" ? (
        // 모둠 보기 — 모둠끼리 묶어 봅니다. 자리 이동(드래그)은 자리 배치를
        // 바꾸는 일이라 개별 보기에서만 합니다(모둠 보기에는 '자리'가 없어
        // 어디로 옮기는 건지가 성립하지 않습니다).
        <div className="attend-seatmap attend-seatmap--compact">
          <div className="attend-seatmap-head">
            {viewTabs}
            <span className={`attend-seatmap-hands${raisedCount > 0 ? " on" : ""}`}>
              🖐️ {raisedCount}
            </span>
          </div>
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
          headLead={viewTabs}
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
        />
      )}

      {toolsStudent && onAward && (
        <StudentToolsModal
          student={toolsStudent}
          onAward={onAward}
          onOpenNotes={openNotes}
          onClose={() => setToolsFor(null)}
        />
      )}

      {notesFor && (
        <StudentNotesModal
          student={notesFor}
          classId={classId}
          onClose={() => setNotesFor(null)}
        />
      )}
    </section>
  );
}
