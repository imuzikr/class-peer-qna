"use client";

// =============================================================
// 참여 전광판 — 발표 중 학생 참여 상태 + 좌석/모둠 보기
// =============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { backdropClose } from "@/lib/modal";
import { PRESENCE_STALE_MS, REWARD_MAX, STUDY_SEAT_COUNT, toDate, todayDateKey } from "@/lib/store";
import { getCurrentUser } from "@/lib/user";
import StudentNotesThread from "./StudentNotesThread";

const DEFAULT_GROUP_COLORS = ["#2563eb", "#16a34a", "#f97316", "#9333ea", "#dc2626", "#0891b2"];

// 학생 한 명의 상태를 'on' | 'away' | 'off'로 판정
export function deskState(presence, nowMs) {
  if (!presence) return "off";
  const t = presence.updatedAt ? toDate(presence.updatedAt).getTime() : 0;
  if (t && nowMs - t > PRESENCE_STALE_MS) return "off";
  return presence.visible ? "on" : "away";
}

function normalizeSeats(seats = [], roster = []) {
  const seen = new Set();
  const base = Array.from({ length: STUDY_SEAT_COUNT }, (_, i) => {
    const uid = typeof seats[i] === "string" && seats[i] ? seats[i] : null;
    if (!uid || seen.has(uid)) return null;
    seen.add(uid);
    return uid;
  });
  let cursor = 0;
  roster.forEach((s) => {
    if (seen.has(s.uid)) return;
    while (cursor < base.length && base[cursor]) cursor += 1;
    if (cursor < base.length) {
      base[cursor] = s.uid;
      seen.add(s.uid);
    }
  });
  return base;
}

function groupMapOf(groupAssignment) {
  const map = new Map();
  (groupAssignment?.groups ?? []).forEach((g, i) => {
    (g.memberUids ?? g.members?.map((m) => m.uid) ?? []).forEach((uid) => {
      map.set(uid, {
        name: g.name || `${g.index ?? i + 1}모둠`,
        color: g.color || DEFAULT_GROUP_COLORS[i % DEFAULT_GROUP_COLORS.length],
        index: g.index ?? i + 1,
      });
    });
  });
  return map;
}

const LABEL = { on: "보는 중", away: "화면 가려짐", off: "미접속", absent: "결석" };

// 컴포넌트 함수 안에 중첩 정의하면 부모가 리렌더될 때마다(5초 타이머 포함)
// 새 함수로 취급되어 이 카드들이 전부 통째로 마운트 해제·재마운트됩니다.
// 드래그 시작 시 dragIndex를 상태로 저장하는데, 그 상태 변경이 리렌더를
// 일으켜 지금 드래그 중인 카드(드롭 대상)의 DOM 노드가 통째로 교체되면
// 브라우저가 진행 중이던 드래그 세션을 놓쳐 drop 자체가 발생하지
// 않았습니다(그래서 처음 한 번은 안 움직이고, 값이 그대로라 리렌더가
// 안 일어나는 재시도에서만 성공). 최상위로 빼서 항상 같은 컴포넌트로
// 유지시켜 리렌더가 나도 이 DOM 노드들이 그대로 재사용되게 합니다.
function StudentCard({
  d,
  draggable = false,
  onDragStart,
  onDragEnd,
  onDropTo,
  onAward,
  onOpenNotes,
  notesActive = false,
}) {
  const groupName = d.group?.name ?? "미배정";
  // 과일 주기·누가기록은 교사가 부모에서 핸들러를 넘겼을 때만 보입니다.
  const showTools = !!(onAward || onOpenNotes);
  const maxed = (d.count ?? 0) >= REWARD_MAX;
  return (
    <div
      className={`attend-desk attend-desk--${d.state}${notesActive ? " attend-desk--noting" : ""}`}
      style={d.group ? { "--group-color": d.group.color } : undefined}
      title={`${d.name} · ${LABEL[d.state]} · ${groupName}`}
      draggable={draggable}
      onDragStart={(e) => {
        if (!draggable) return;
        onDragStart(d.index);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragEnd={() => draggable && onDragEnd()}
      onDragOver={(e) => draggable && e.preventDefault()}
      onDrop={(e) => {
        if (!draggable) return;
        e.preventDefault();
        onDropTo(d.index);
      }}
    >
      <span className="attend-desk-no">{d.studentId || "-"}</span>
      <span className="attend-desk-name">
        {d.name}
        {d.state === "absent" && <em> (결석)</em>}
      </span>
      <span className="attend-desk-group">{groupName}</span>

      {showTools && (
        // draggable=false — 자리 카드가 draggable이라, 버튼을 누른 채 살짝만
        // 움직여도 드래그가 시작돼 클릭이 씹히는 것을 막습니다.
        <span className="attend-desk-tools" draggable={false}>
          {onAward && (
            <button
              type="button"
              className="attend-tool-btn attend-tool-fruit"
              draggable={false}
              onClick={(e) => {
                e.stopPropagation();
                onAward(d.uid, (d.count ?? 0) + 1);
              }}
              disabled={maxed}
              title={maxed ? "과일이 가득 찼어요" : `${d.name}에게 과일 주기`}
              aria-label={`${d.name} 과일 주기`}
            >
              🍎<span className="attend-tool-count">{d.count ?? 0}</span>
            </button>
          )}
          {onOpenNotes && (
            <button
              type="button"
              className="attend-tool-btn attend-tool-note"
              draggable={false}
              onClick={(e) => {
                e.stopPropagation();
                onOpenNotes(d);
              }}
              title={`${d.name} 누가기록`}
              aria-label={`${d.name} 누가기록`}
            >
              📝
            </button>
          )}
        </span>
      )}
    </div>
  );
}

export default function AttendanceBoard({
  roster = [],
  presence = [],
  attendanceRecords = [],
  seatLayout = null,
  dailySeatLayout = null,
  groupAssignment = null,
  classId = null,
  onAward = null,      // 교사만 — 있으면 카드에 과일 주기 버튼이 붙습니다
  onSaveDailySeats,
  onClose,
}) {
  const [now, setNow] = useState(() => Date.now());
  const [viewMode, setViewMode] = useState("seat");
  const [dragIndex, setDragIndex] = useState(null);
  const [notesFor, setNotesFor] = useState(null); // 누가기록 슬라이드 패널 대상
  const notesPanelRef = useRef(null);
  const [seats, setSeats] = useState(() =>
    normalizeSeats(dailySeatLayout?.seats ?? seatLayout?.seats ?? [], roster)
  );

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    setSeats(normalizeSeats(dailySeatLayout?.seats ?? seatLayout?.seats ?? [], roster));
  }, [dailySeatLayout?.id, dailySeatLayout?.updatedAt, seatLayout?.id, seatLayout?.updatedAt, roster]);

  const byUid = useMemo(() => new Map(roster.map((s) => [s.uid, s])), [roster]);
  const presenceByUid = useMemo(() => new Map(presence.map((p) => [p.uid, p])), [presence]);
  const groupsByUid = useMemo(() => groupMapOf(groupAssignment), [groupAssignment]);
  const today = todayDateKey();
  const attendedToday = useMemo(
    () => new Set(attendanceRecords.filter((r) => r.date === today).map((r) => r.uid)),
    [attendanceRecords, today]
  );

  function stateOf(uid) {
    if (!attendedToday.has(uid)) return "absent";
    return deskState(presenceByUid.get(uid), now);
  }

  const desks = seats.map((uid, i) => {
    const s = byUid.get(uid);
    if (!s) return { key: `empty-${i}`, empty: true, index: i, state: "off" };
    const group = groupsByUid.get(s.uid) ?? null;
    return {
      key: s.uid,
      index: i,
      uid: s.uid,
      name: s.name,
      studentId: s.studentId ?? null,
      emoji: s.emoji ?? "🙂",
      count: s.count ?? 0,
      state: stateOf(s.uid),
      group,
    };
  });

  const counts = desks.reduce(
    (acc, d) => {
      if (!d.empty) acc[d.state] += 1;
      return acc;
    },
    { on: 0, away: 0, off: 0, absent: 0 }
  );

  // 좁은 화면에서는 패널이 전광판 아래로 줄바꿈되어 화면 밖에 생깁니다.
  // 열자마자 그 자리로 데려다 줍니다(넓은 화면은 이미 보이므로 무시됨).
  useEffect(() => {
    if (!notesFor) return;
    notesPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [notesFor?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // 같은 학생의 버튼을 다시 누르면 패널을 닫습니다(토글).
  function openNotes(d) {
    setNotesFor((cur) =>
      cur?.uid === d.uid ? null : { uid: d.uid, name: d.name, emoji: d.emoji ?? "🙂" }
    );
  }

  async function moveSeat(from, to) {
    if (from == null || to == null || from === to) return;
    const next = [...seats];
    [next[from], next[to]] = [next[to], next[from]];
    setSeats(next);
    await onSaveDailySeats?.(next, getCurrentUser());
  }

  const groupSections = useMemo(() => {
    const groups = (groupAssignment?.groups ?? []).map((g, i) => ({
      ...g,
      color: g.color || DEFAULT_GROUP_COLORS[i % DEFAULT_GROUP_COLORS.length],
      members: (g.memberUids ?? []).map((uid) => byUid.get(uid)).filter(Boolean),
    }));
    const assigned = new Set(groups.flatMap((g) => g.members.map((m) => m.uid)));
    const unassigned = roster.filter((s) => !assigned.has(s.uid));
    return unassigned.length
      ? [...groups, { id: "ungrouped", name: "미배정", color: "#9ca3af", members: unassigned }]
      : groups;
  }, [groupAssignment, byUid, roster]);

  const notesOpen = !!notesFor;

  return (
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      {/* 전광판과 누가기록 패널을 한 줄로 묶습니다 — 패널이 열리면 전광판
          오른쪽에서 미끄러져 나오고, 둘이 함께 화면 가운데에 놓입니다. */}
      <div className="attend-shell" onClick={(e) => e.stopPropagation()}>
      <div
        className="modal attend-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="attend-title"
      >
        <div className="modal-head">
          <h3 id="attend-title">참여 전광판</h3>
          <button className="btn-close" onClick={onClose} aria-label="닫기">×</button>
        </div>

        <div className="attend-toolbar">
          <div className="attend-mode-tabs" role="tablist" aria-label="전광판 보기 방식">
            <button type="button" className={viewMode === "seat" ? "active" : ""} onClick={() => setViewMode("seat")}>
              자리표 보기
            </button>
            <button
              type="button"
              className={viewMode === "group" ? "active" : ""}
              onClick={() => setViewMode("group")}
              disabled={(groupAssignment?.groups ?? []).length === 0}
            >
              모둠별 보기
            </button>
          </div>
          {viewMode === "seat" && (
            <span className="attend-help">드래그하면 오늘 수업 동안만 위치가 유지됩니다.</span>
          )}
        </div>

        <div className="attend-legend">
          <span className="attend-legend-item"><i className="attend-chip attend-chip--on" /> 보는 중 {counts.on}</span>
          <span className="attend-legend-item"><i className="attend-chip attend-chip--away" /> 화면 가려짐 {counts.away}</span>
          <span className="attend-legend-item"><i className="attend-chip attend-chip--off" /> 미접속 {counts.off}</span>
          <span className="attend-legend-item"><i className="attend-chip attend-chip--absent" /> 결석 {counts.absent}</span>
        </div>

        {roster.length === 0 ? (
          <p className="lesson-note-empty">이 반에 입장한 학생이 없어요. 입장 코드를 알려 주세요.</p>
        ) : viewMode === "group" ? (
          <div className="attend-group-view">
            {groupSections.map((g, i) => (
              <section key={g.id ?? g.index ?? i} className="attend-group-section" style={{ "--group-color": g.color }}>
                <h4>{g.name || `${g.index}모둠`}</h4>
                <div className="attend-group-members">
                  {g.members.length === 0 ? (
                    <span className="seat-empty-note">배정된 학생이 없어요</span>
                  ) : (
                    g.members.map((s) => (
                      <StudentCard
                        key={s.uid}
                        d={{
                          uid: s.uid,
                          name: s.name,
                          studentId: s.studentId ?? null,
                          emoji: s.emoji ?? "🙂",
                          count: s.count ?? 0,
                          state: stateOf(s.uid),
                          group: groupsByUid.get(s.uid) ?? { name: g.name, color: g.color },
                        }}
                        onAward={onAward}
                        onOpenNotes={openNotes}
                        notesActive={notesFor?.uid === s.uid}
                      />
                    ))
                  )}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="attend-grid">
            {desks.map((d) =>
              d.empty ? (
                <div
                  key={d.key}
                  className="attend-desk attend-desk--empty"
                  title="빈 자리"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    moveSeat(dragIndex, d.index);
                  }}
                />
              ) : (
                <StudentCard
                  key={d.key}
                  d={d}
                  draggable
                  onDragStart={setDragIndex}
                  onDragEnd={() => setDragIndex(null)}
                  onDropTo={(toIndex) => moveSeat(dragIndex, toIndex)}
                  onAward={onAward}
                  onOpenNotes={openNotes}
                  notesActive={notesFor?.uid === d.uid}
                />
              )
            )}
          </div>
        )}
      </div>

      {/* ── 누가기록 슬라이드 패널 — 전광판 오른쪽에서 나옵니다 ── */}
      {notesOpen && (
        <aside
          className="attend-notes-panel"
          ref={notesPanelRef}
          aria-label={`${notesFor.name} 누가기록`}
        >
          <div className="modal-head">
            <h3>
              📝 누가기록
              <span className="notes-student">
                {notesFor.emoji} {notesFor.name}
              </span>
            </h3>
            <button
              className="btn-close"
              onClick={() => setNotesFor(null)}
              aria-label="누가기록 닫기"
            >
              ×
            </button>
          </div>
          <StudentNotesThread studentUid={notesFor.uid} classId={classId} />
        </aside>
      )}
      </div>
    </div>
  );
}
