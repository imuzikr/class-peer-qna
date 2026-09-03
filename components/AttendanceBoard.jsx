"use client";

// =============================================================
// 참여 전광판 — 발표 중 학생 참여 상태 + 좌석/모둠 보기
// =============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { backdropClose } from "@/lib/modal";
import {
  PRESENCE_STALE_MS,
  subscribeQuestionSignals,
  toDate,
  todayDateKey,
} from "@/lib/store";
import { normalizeSeats } from "@/lib/seats";
import { getCurrentUser } from "@/lib/user";
import StudentNotesThread from "./StudentNotesThread";
import StudentToolsModal from "./StudentToolsModal";

const DEFAULT_GROUP_COLORS = ["#2563eb", "#16a34a", "#f97316", "#9333ea", "#dc2626", "#0891b2"];

// 학생 한 명의 상태를 'on' | 'away' | 'off'로 판정
// 오늘 출석한 학생 uid 집합 — 기록이 하나도 없어도 '빈 집합'입니다(null이 아님).
// 출석부는 '체크되지 않은 사람 = 결석'으로 읽는 자리라, 아무도 체크하지 않았으면
// 반 전체가 결석입니다.
//
// 자리표 패널(LessonSeatPanel)이 같은 화면에 나란히 서 있어 이 함수를 함께
// 씁니다 — 예전엔 각자 계산했고, 그쪽만 '기록이 없으면 null'로 두는 바람에
// 전광판은 반 전체가 결석(주황)인데 옆의 자리표는 아무 색도 없었습니다.
// 한 화면의 두 자리표가 서로 다른 말을 하면 어느 쪽을 믿어야 할지 알 수 없습니다.
export function attendedTodaySet(attendanceRecords, dateKey = todayDateKey()) {
  return new Set(
    (attendanceRecords ?? [])
      .filter((r) => r.date === dateKey)
      .map((r) => r.uid)
      .filter(Boolean)
  );
}

export function deskState(presence, nowMs) {
  if (!presence) return "off";
  const t = presence.updatedAt ? toDate(presence.updatedAt).getTime() : 0;
  if (t && nowMs - t > PRESENCE_STALE_MS) return "off";
  return presence.visible ? "on" : "away";
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
  onOpenTools,
  notesActive = false,
}) {
  const groupName = d.group?.name ?? "미배정";
  // 교사면 카드를 눌러 '과일 주기 / 누가기록' 선택 모달을 엽니다.
  // (예전에는 카드 아래에 버튼 두 개를 늘 펼쳐 놨는데, 자리 칸이 좁아
  //  버튼이 잘게 쪼개져 누르기 어려웠습니다)
  const clickable = !!onOpenTools;
  const count = d.count ?? 0;
  return (
    <div className="attend-desk-wrap">
      <div
        className={`attend-desk attend-desk--${d.state}${notesActive ? " attend-desk--noting" : ""}${clickable ? " attend-desk--clickable" : ""}${d.raised ? " attend-desk--raised" : ""}`}
        style={d.group ? { "--group-color": d.group.color } : undefined}
        title={
          clickable
            ? `${d.name} · ${LABEL[d.state]} · ${groupName} — 눌러서 과일 주기·누가기록`
            : `${d.name} · ${LABEL[d.state]} · ${groupName}`
        }
        role={clickable ? "button" : undefined}
        tabIndex={clickable ? 0 : undefined}
        onClick={clickable ? () => onOpenTools(d) : undefined}
        onKeyDown={
          clickable
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpenTools(d);
                }
              }
            : undefined
        }
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
        {/* 손들기 — 질문이 있는 학생을 자리에서 바로 찾을 수 있게
            카드 모서리에 크게 띄웁니다 */}
        {d.raised && (
          <span className="attend-desk-hand" aria-label="질문 있어요" title="질문 있어요">
            🖐️
          </span>
        )}
        {/* 수업 노트에 필기 중 — '화면은 켜져 있는데 아무것도 안 하는' 학생과
            갈라 보이는 유일한 능동 신호입니다 */}
        {d.noting && (
          <span className="attend-desk-noting" aria-label="필기 중" title="수업 노트에 필기 중">
            ✍️
          </span>
        )}
        <span className="attend-desk-no">{d.studentId || "-"}</span>
        <span className="attend-desk-name">
          {d.name}
          {d.state === "absent" && <em> (결석)</em>}
        </span>
        <span className="attend-desk-group">{groupName}</span>
        {/* 지금까지 받은 과일 수 — 카드 안에 작게 붙여 한눈에 보이게 */}
        {clickable && count > 0 && (
          <span className="attend-desk-fruit" aria-label={`과일 ${count}개`}>
            🍎 {count}
          </span>
        )}
      </div>
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
  onAward = null,      // 교사만 — 있으면 카드를 눌러 과일 주기·누가기록을 엽니다
  onSaveDailySeats,
  onClose,
}) {
  const [now, setNow] = useState(() => Date.now());
  const [viewMode, setViewMode] = useState("seat");
  const [dragIndex, setDragIndex] = useState(null);
  const [notesFor, setNotesFor] = useState(null); // 누가기록 슬라이드 패널 대상
  const [toolsFor, setToolsFor] = useState(null); // 카드 클릭 → 과일/누가기록 선택 모달
  const notesPanelRef = useRef(null);
  const [seats, setSeats] = useState(() =>
    normalizeSeats(dailySeatLayout?.seats ?? seatLayout?.seats ?? [], roster)
  );

  // 손든 학생(언제든 질문하기) — 자리표/모둠 카드에 🖐️로 표시합니다.
  // 상단바의 손들기 버튼과 같은 문서를 보므로 두 곳이 항상 같은 상태입니다.
  const [raisedUids, setRaisedUids] = useState(() => new Set());
  useEffect(() => {
    if (!classId) {
      setRaisedUids(new Set());
      return;
    }
    return subscribeQuestionSignals(classId, (list) =>
      setRaisedUids(new Set(list.map((s) => s.uid).filter(Boolean)))
    );
  }, [classId]);

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
    () => attendedTodaySet(attendanceRecords, today),
    [attendanceRecords, today]
  );

  function stateOf(uid) {
    if (!attendedToday.has(uid)) return "absent";
    return deskState(presenceByUid.get(uid), now);
  }

  // 방금 수업 노트에 필기했는지 — 학생 화면이 보이는 상태일 때만 뜻이 있습니다
  // (자리를 비웠거나 끊긴 학생의 옛 신호가 남아 반짝이지 않게).
  function notingOf(uid) {
    const p = presenceByUid.get(uid);
    return !!(p?.noting && deskState(p, now) === "on");
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
      noting: notingOf(s.uid),
      count: s.count ?? 0,
      state: stateOf(s.uid),
      raised: raisedUids.has(s.uid),
      group,
    };
  });

  // 자리표에 앉은 학생 중 손든 사람 수 (명단에 없는 옛 신호는 세지 않음)
  const raisedCount = roster.filter((s) => raisedUids.has(s.uid)).length;

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

  // 선택 모달에서 '누가기록 열기'를 고르면 모달을 닫고 슬라이드 패널을 엽니다.
  function openNotes(d) {
    setToolsFor(null);
    setNotesFor({ uid: d.uid, name: d.name, emoji: d.emoji ?? "🙂" });
  }

  // 카드 클릭 → 과일/누가기록 선택 모달. 교사(onAward가 있을 때)만 열립니다.
  function openTools(d) {
    setToolsFor(d);
  }

  // 과일을 주면 목록(roster)이 갱신돼 내려오므로, 열려 있는 모달의 숫자도
  // 최신 값으로 따라가게 합니다(모달이 처음 열릴 때 찍힌 값에 머무르지 않게).
  const toolsStudent = toolsFor
    ? { ...toolsFor, count: byUid.get(toolsFor.uid)?.count ?? toolsFor.count ?? 0 }
    : null;

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
      {/* 전광판과 누가기록 패널을 한 줄로 묶습니다 — 전광판은 제자리에
          그대로 있고, 누가기록 패널만 그 오른쪽에서 미끄러져 나옵니다. */}
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
          {raisedCount > 0 && (
            <span className="attend-legend-item attend-legend-item--hand">
              🖐️ 질문 {raisedCount}
            </span>
          )}
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
                          raised: raisedUids.has(s.uid),
                          group: groupsByUid.get(s.uid) ?? { name: g.name, color: g.color },
                        }}
                        onOpenTools={onAward ? openTools : null}
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
                  onOpenTools={onAward ? openTools : null}
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

      {/* ── 카드 클릭 → 과일 주기 / 누가기록 선택 ── */}
      {toolsStudent && onAward && (
        <StudentToolsModal
          student={toolsStudent}
          classId={classId}
          onAward={onAward}
          onOpenNotes={openNotes}
          onClose={() => setToolsFor(null)}
        />
      )}
    </div>
  );
}
