"use client";

import { toDate, formatClockMs } from "@/lib/store";
import { normalizeSeats, seatOrder } from "@/lib/seats";
import SeatGrid from "./SeatGrid";
import SeatViewToggle from "./SeatViewToggle";
import { useSeatView } from "@/lib/seatView";

// 출결 수정 중(editing)이면 칸이 단추가 되어, 누르면 출석 ↔ 결석이 바뀝니다.
// 선생님이 남긴 기록(manualBy)은 '출석 · 수정'으로 적어 학생이 직접 찍은
// 것과 가립니다(시각 줄에 붙이면 칸 폭을 넘칩니다 — 실측).
function AttendanceSeat({ student, editing = false, busy = false, onToggle }) {
  const timestamp = student.record?.attendedAt || student.record?.createdAt;
  const present = !!student.record;
  const manual = !!student.record?.manualBy;
  const cls = [
    "attendance-seat",
    present && "attendance-seat--present",
    editing && "attendance-seat--editable",
    busy && "is-busy",
  ].filter(Boolean).join(" ");
  const body = (
    <>
      {student.studentId && <span className="attendance-seat-number">{student.studentId}</span>}
      <strong>{student.name || "이름 미설정"}</strong>
      <span className={`study-attendance-status${present ? " on" : ""}`}>
        {present ? (manual ? "출석 · 수정" : "출석") : "기록 없음"}
      </span>
      {/* 밀리초까지 — 칸이 좁아 시각만 적습니다(날짜는 위 머리줄이 말합니다).
          `dateTime`에는 ISO 그대로 넣어 두어 기계가 읽는 값도 정밀합니다. */}
      {formatClockMs(timestamp) && (
        <time className="attendance-seat-time" dateTime={toDate(timestamp).toISOString()}>
          {formatClockMs(timestamp)}
        </time>
      )}
    </>
  );
  if (!editing) return <div className={cls}>{body}</div>;
  return (
    <button
      type="button"
      className={cls}
      onClick={() => onToggle?.(student, !present)}
      disabled={busy}
      aria-pressed={present}
      title={present ? "누르면 결석(기록 없음)으로 바꿉니다" : "누르면 출석으로 바꿉니다"}
    >
      {body}
    </button>
  );
}

export default function AttendanceSeatView({ rows, seatLayout, editing = false, busyUids = null, onToggle = null }) {
  const [teacherView, toggleSeatView] = useSeatView();
  const byUid = new Map(rows.map((student) => [student.uid, student]));
  const seats = normalizeSeats(seatLayout?.seats ?? [], rows);
  const seated = new Set(seats.filter(Boolean));
  const unseated = rows.filter((student) => !seated.has(student.uid));

  return (
    <section aria-label="좌석별 출석 현황">
      <p className="attendance-seat-help">
        {editing
          ? "출결 수정 중 — 자리를 누르면 출석 ↔ 결석이 바뀌고 곧바로 저장됩니다."
          : seatLayout
          ? "현재 반 자리배치 기준입니다. 출석 기록은 선택한 날짜를 따릅니다."
          : "저장된 자리배치가 없어 명단 순으로 표시합니다."}
      </p>
      <div className="attendance-seat-help">
        <SeatViewToggle teacherView={teacherView} onToggle={toggleSeatView} />
      </div>
      <SeatGrid className="attendance-seat-grid" ariaLabel="출석 자리표">
        {/* 선생님 보기는 차례만 거꾸로 — 그림을 돌리면 글자가 흐려집니다(lib/seats.js) */}
        {seatOrder(seats.length, teacherView).map((index, pos) => index == null ? (
          <div key={`pad-${pos}`} className="attend-seat-pad" aria-hidden="true" />
        ) : seats[index] && byUid.has(seats[index]) ? (
          <AttendanceSeat
            key={seats[index]}
            student={byUid.get(seats[index])}
            editing={editing}
            busy={!!busyUids?.has(seats[index])}
            onToggle={onToggle}
          />
        ) : (
          <div key={`empty-${index}`} className="attendance-seat attendance-seat--empty" aria-label={`${index + 1}번 빈자리`}>
            <span>빈자리</span>
          </div>
        ))}
      </SeatGrid>
      {unseated.length > 0 && (
        <>
          <h4 className="attendance-seat-help">미배치 학생 {unseated.length}명</h4>
          <SeatGrid className="attendance-seat-grid" ariaLabel="미배치 학생 출석 현황">
            {unseated.map((student) => (
              <AttendanceSeat
                key={student.uid}
                student={student}
                editing={editing}
                busy={!!busyUids?.has(student.uid)}
                onToggle={onToggle}
              />
            ))}
          </SeatGrid>
        </>
      )}
    </section>
  );
}
