"use client";

import { useEffect, useMemo, useState } from "react";
import { backdropClose } from "@/lib/modal";
import {
  subscribeMembersForClasses,
  subscribeAttendanceForClasses,
  toDate,
  todayDateKey,
} from "@/lib/store";
import { summarizeClassAttendance, buildAttendanceDetailRows } from "@/lib/attendanceOverview";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function formatDateLabel(dateKey) {
  if (!dateKey) return "";
  const [year, month, day] = String(dateKey).split("-");
  return `${year}.${month}.${day}`;
}

function formatDateTime(value) {
  const date = toDate(value);
  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toDateKey(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function shiftMonth(cursor, delta) {
  const m = cursor.month + delta;
  if (m < 0) return { year: cursor.year - 1, month: 11 };
  if (m > 11) return { year: cursor.year + 1, month: 0 };
  return { year: cursor.year, month: m };
}

// 출석 기록을 달력으로 보여 줍니다.
//  · total이 있으면(교사) 그날 출석 인원을 "n/total"로, 없으면(학생) 출석한
//    날에만 작은 점으로 표시합니다.
//  · interactive면(교사) 날짜를 눌러 아래 목록의 기준 날짜를 바꿀 수 있습니다.
function AttendanceCalendar({ records, total = 0, selectedDate = "", onSelectDate, interactive = false }) {
  const recordsByDate = useMemo(() => {
    const map = new Map();
    records.forEach((r) => {
      if (!r.date) return;
      if (!map.has(r.date)) map.set(r.date, []);
      map.get(r.date).push(r);
    });
    return map;
  }, [records]);

  const [cursor, setCursor] = useState(() => {
    const anchor = selectedDate || [...recordsByDate.keys()].sort().at(-1) || todayDateKey();
    const [y, m] = anchor.split("-").map(Number);
    return { year: y, month: m - 1 };
  });

  const today = todayDateKey();
  const first = new Date(cursor.year, cursor.month, 1);
  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const startWeekday = first.getDay();
  const cells = Array.from({ length: startWeekday }, () => null).concat(
    Array.from({ length: daysInMonth }, (_, i) => i + 1)
  );

  return (
    <div className="study-attendance-calendar">
      <div className="study-cal-head">
        <button type="button" onClick={() => setCursor((c) => shiftMonth(c, -1))} aria-label="이전 달">
          ‹
        </button>
        <span>{cursor.year}년 {cursor.month + 1}월</span>
        <button type="button" onClick={() => setCursor((c) => shiftMonth(c, 1))} aria-label="다음 달">
          ›
        </button>
      </div>
      <div className="study-cal-weekdays" aria-hidden="true">
        {WEEKDAYS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="study-cal-grid">
        {cells.map((d, i) => {
          if (d === null) return <span key={`blank${i}`} className="study-cal-cell study-cal-cell--blank" />;
          const key = toDateKey(cursor.year, cursor.month, d);
          const dayRecords = recordsByDate.get(key) ?? [];
          const has = dayRecords.length > 0;
          const cls = [
            "study-cal-cell",
            has && "has-record",
            key === selectedDate && "selected",
            key === today && "today",
          ].filter(Boolean).join(" ");
          return (
            <button
              key={key}
              type="button"
              className={cls}
              onClick={interactive ? () => onSelectDate?.(key) : undefined}
              disabled={!interactive}
              title={has ? (total > 0 ? `${dayRecords.length}/${total}명 출석` : "출석함") : undefined}
            >
              <span className="study-cal-day">{d}</span>
              {has && (
                total > 0 ? (
                  <span className="study-cal-count">{dayRecords.length}/{total}</span>
                ) : (
                  <span className="study-cal-dot" aria-hidden="true" />
                )
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// 출석 상세 표 — 목록형(현재 반)과 캘린더형(반별 목록에서 고른 반)이
// 같은 모양({uid, name, studentId, emoji, record})을 쓰므로 공유합니다.
function AttendanceTable({ rows }) {
  return (
    <div className="study-attendance-table-wrap">
      <table className="study-attendance-table">
        <thead>
          <tr>
            <th>학생</th>
            <th>출석 상황</th>
            <th>출석 기록</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((student) => (
            <tr key={student.uid}>
              <td>
                <span className="study-attendance-student">
                  <span aria-hidden="true">{student.emoji || "🙂"}</span>
                  <span>
                    <strong>{student.name || "이름 미설정"}</strong>
                    {student.studentId && <small>{student.studentId}</small>}
                  </span>
                </span>
              </td>
              <td>
                <span className={`study-attendance-status${student.record ? " on" : ""}`}>
                  {student.record ? "출석" : "기록 없음"}
                </span>
              </td>
              <td>
                {student.record
                  ? formatDateTime(student.record.attendedAt || student.record.createdAt)
                  : "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// 캘린더형의 반별 목록 — 날짜 하나를 놓고 반마다 출석/결석 인원을 보여
// 주고, 고른 반만 강조 표시합니다. 실제 상세 표는 그 아래(부모)에서 그립니다.
function ClassAttendanceOverview({ classes, selectedId, onSelect }) {
  return (
    <ul className="attend-class-overview">
      {classes.map((c) => (
        <li key={c.id}>
          <button
            type="button"
            className={`attend-class-row${selectedId === c.id ? " active" : ""}`}
            onClick={() => onSelect(c.id)}
          >
            <span className="attend-class-name">{c.name}</span>
            <span className="attend-class-stat">
              <span className="attend-class-present">출석 {c.present}</span>
              <span className="attend-class-absent">결석 {c.absent}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export default function StudyAttendanceModal({
  isTeacher = false,
  records = [],
  roster = [],
  classId = null,
  attendanceOpenToday = false,
  attendanceBusy = false,
  onStartAttendance = null,
  onStopAttendance = null,
  allClasses = [],
  directory = [],
  onClose,
}) {
  const [viewMode, setViewMode] = useState("list"); // "list" | "calendar"
  const dates = useMemo(
    () => [...new Set(records.map((r) => r.date).filter(Boolean))].sort((a, b) => b.localeCompare(a)),
    [records]
  );
  const [selectedDate, setSelectedDate] = useState("");
  const activeDate = selectedDate || dates[0] || "";

  const byStudent = useMemo(() => {
    const map = new Map();
    records
      .filter((r) => r.date === activeDate)
      .forEach((r) => map.set(r.uid, r));
    return map;
  }, [records, activeDate]);

  const studentRows = useMemo(
    () =>
      roster.map((student) => ({
        ...student,
        record: byStudent.get(student.uid) ?? null,
      })),
    [roster, byStudent]
  );

  // 캘린더형의 '반별 목록' — 날짜를 고르면 지금 반 하나가 아니라 교사가
  // 가진 반 전체를 반별 출석/결석으로 먼저 보여 주고, 그중 하나를 골라야
  // 그 반의 학생별 상세가 아래에 나타납니다. 이 탭을 볼 때만 다른 반들의
  // 소속·출석 기록을 구독합니다(목록형을 보는 동안은 불필요).
  const wantOverview = isTeacher && viewMode === "calendar" && allClasses.length > 0;
  const classIdsKey = allClasses.map((c) => c.id).join(",");

  const [overviewMembers, setOverviewMembers] = useState({});
  useEffect(() => {
    if (!wantOverview) { setOverviewMembers({}); return; }
    return subscribeMembersForClasses(allClasses.map((c) => c.id), setOverviewMembers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantOverview, classIdsKey]);

  const [overviewAttendance, setOverviewAttendance] = useState({});
  useEffect(() => {
    if (!wantOverview) { setOverviewAttendance({}); return; }
    return subscribeAttendanceForClasses(allClasses.map((c) => c.id), setOverviewAttendance);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantOverview, classIdsKey]);

  const [selectedOverviewClassId, setSelectedOverviewClassId] = useState(null);

  const classOverview = useMemo(() => {
    if (!wantOverview || !activeDate) return [];
    return summarizeClassAttendance(allClasses, overviewMembers, overviewAttendance, activeDate);
  }, [wantOverview, activeDate, allClasses, overviewMembers, overviewAttendance]);

  const overviewDetailRows = useMemo(() => {
    if (!wantOverview || !selectedOverviewClassId) return [];
    return buildAttendanceDetailRows(
      overviewMembers[selectedOverviewClassId] ?? [],
      directory,
      overviewAttendance[selectedOverviewClassId] ?? [],
      activeDate
    );
  }, [wantOverview, selectedOverviewClassId, overviewMembers, overviewAttendance, activeDate, directory]);

  return (
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      <div
        className="modal study-attendance-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="study-attendance-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3 id="study-attendance-title">{isTeacher ? "출석 관리" : "내 출석부"}</h3>
          <button className="btn-close" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        {isTeacher && (
          <div className="study-attendance-toolbar">
            <div className="study-attendance-controls">
              <button
                type="button"
                className="btn-primary study-attendance-start"
                onClick={onStartAttendance}
                disabled={attendanceBusy || attendanceOpenToday}
              >
                ▶ 출석 시작
              </button>
              <button
                type="button"
                className="btn-ghost study-attendance-stop"
                onClick={onStopAttendance}
                disabled={attendanceBusy || !attendanceOpenToday}
              >
                ⏹ 출석 종료
              </button>
              <span className={`study-attendance-live${attendanceOpenToday ? " on" : ""}`}>
                {attendanceOpenToday ? "출석 진행 중" : "출석 종료됨"}
              </span>
            </div>
            <span className="study-attendance-count">
              출석 {studentRows.filter((s) => s.record).length} / {studentRows.length}
            </span>
          </div>
        )}

        <div className="study-attendance-view-tabs" role="tablist" aria-label="출석부 보기 방식">
          <button type="button" className={viewMode === "list" ? "active" : ""} onClick={() => setViewMode("list")}>
            목록형
          </button>
          <button
            type="button"
            className={viewMode === "calendar" ? "active" : ""}
            onClick={() => setViewMode("calendar")}
          >
            캘린더형
          </button>
        </div>

        <div className="study-attendance-body">
          {isTeacher ? (
            <>
              {viewMode === "list" ? (
                dates.length > 0 && (
                  <label className="study-attendance-date-picker">
                    날짜
                    <select value={activeDate} onChange={(e) => setSelectedDate(e.target.value)}>
                      {dates.map((date) => (
                        <option key={date} value={date}>
                          {formatDateLabel(date)}
                        </option>
                      ))}
                    </select>
                  </label>
                )
              ) : (
                <AttendanceCalendar
                  records={records}
                  total={studentRows.length}
                  selectedDate={activeDate}
                  onSelectDate={setSelectedDate}
                  interactive
                />
              )}

              {viewMode === "calendar" ? (
                allClasses.length === 0 ? (
                  <p className="lesson-note-empty">아직 만든 반이 없어요.</p>
                ) : !activeDate ? (
                  <p className="lesson-note-empty">달력에서 날짜를 골라 보세요.</p>
                ) : (
                  <>
                    <ClassAttendanceOverview
                      classes={classOverview}
                      selectedId={selectedOverviewClassId}
                      onSelect={setSelectedOverviewClassId}
                    />
                    {selectedOverviewClassId &&
                      (overviewDetailRows.length === 0 ? (
                        <p className="lesson-note-empty">이 반에 입장한 학생이 없어요.</p>
                      ) : (
                        <AttendanceTable rows={overviewDetailRows} />
                      ))}
                  </>
                )
              ) : roster.length === 0 ? (
                <p className="lesson-note-empty">이 반에 입장한 학생이 없어요.</p>
              ) : dates.length === 0 ? (
                <p className="lesson-note-empty">아직 출석 기록이 없어요.</p>
              ) : (
                <AttendanceTable rows={studentRows} />
              )}
            </>
          ) : records.length === 0 ? (
            <p className="lesson-note-empty">아직 출석한 기록이 없어요.</p>
          ) : viewMode === "list" ? (
            <ul className="study-attendance-list">
              {records.map((record) => (
                <li key={record.id}>
                  <strong>{formatDateLabel(record.date)}</strong>
                  <span>출석</span>
                </li>
              ))}
            </ul>
          ) : (
            <AttendanceCalendar records={records} />
          )}
        </div>
      </div>
    </div>
  );
}
