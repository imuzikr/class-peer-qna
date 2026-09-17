"use client";

import { toDate } from "@/lib/store";
import { normalizeSeats } from "@/lib/seats";
import SeatGrid from "./SeatGrid";
import SeatViewToggle from "./SeatViewToggle";
import { useSeatView } from "@/lib/seatView";

function AttendanceSeat({ student }) {
  const timestamp = student.record?.attendedAt || student.record?.createdAt;
  return (
    <div className={`attendance-seat${student.record ? " attendance-seat--present" : ""}`}>
      {student.studentId && <span className="attendance-seat-number">{student.studentId}</span>}
      <strong>{student.name || "이름 미설정"}</strong>
      <span className={`study-attendance-status${student.record ? " on" : ""}`}>
        {student.record ? "출석" : "기록 없음"}
      </span>
      {timestamp && (
        <time className="attendance-seat-time" dateTime={toDate(timestamp).toISOString()}>
          {toDate(timestamp).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })}
        </time>
      )}
    </div>
  );
}

export default function AttendanceSeatView({ rows, seatLayout }) {
  const [teacherView, toggleSeatView] = useSeatView();
  const byUid = new Map(rows.map((student) => [student.uid, student]));
  const seats = normalizeSeats(seatLayout?.seats ?? [], rows);
  const seated = new Set(seats.filter(Boolean));
  const unseated = rows.filter((student) => !seated.has(student.uid));

  return (
    <section aria-label="좌석별 출석 현황">
      <p className="attendance-seat-help">
        {seatLayout
          ? "현재 반 자리배치 기준입니다. 출석 기록은 선택한 날짜를 따릅니다."
          : "저장된 자리배치가 없어 명단 순으로 표시합니다."}
      </p>
      <div className="attendance-seat-help">
        <SeatViewToggle teacherView={teacherView} onToggle={toggleSeatView} />
      </div>
      <SeatGrid className={`attendance-seat-grid${teacherView ? " seat-flipped" : ""}`} ariaLabel="출석 자리표">
        {seats.map((uid, index) => uid && byUid.has(uid) ? (
          <AttendanceSeat key={uid} student={byUid.get(uid)} />
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
            {unseated.map((student) => <AttendanceSeat key={student.uid} student={student} />)}
          </SeatGrid>
        </>
      )}
    </section>
  );
}
