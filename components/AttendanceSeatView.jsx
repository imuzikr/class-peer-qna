"use client";

import { useEffect, useState } from "react";
import { dailySeatLayoutId, subscribeStudySeatLayout, toDate } from "@/lib/store";
import { normalizeSeats } from "@/lib/seats";
import SeatGrid from "./SeatGrid";

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

export default function AttendanceSeatView({ rows, classId, date, seatLayout }) {
  const layoutKey = `${classId || ""}:${date}`;
  const [daily, setDaily] = useState(null);
  useEffect(() => {
    if (!classId || !date) return undefined;
    let active = true;
    const unsubscribe = subscribeStudySeatLayout(classId, dailySeatLayoutId(date), (layout) => {
      if (active) setDaily({ key: layoutKey, layout });
    });
    return () => { active = false; unsubscribe(); };
  }, [classId, date, layoutKey]);

  if (classId && date && daily?.key !== layoutKey) {
    return <p className="lesson-note-empty" role="status">자리배치를 불러오는 중이에요.</p>;
  }

  const datedLayout = daily?.key === layoutKey ? daily.layout : null;
  const layout = datedLayout ?? seatLayout;
  const byUid = new Map(rows.map((student) => [student.uid, student]));
  // 저장된 빈자리는 조회 중 자동 배정하지 않습니다.
  const seats = normalizeSeats(
    (layout?.seats ?? []).map((uid) => byUid.has(uid) ? uid : null),
    layout ? [] : rows,
  );
  const seated = new Set(seats.filter(Boolean));
  const unseated = rows.filter((student) => !seated.has(student.uid));

  return (
    <section aria-label="좌석별 출석 현황">
      <p className="attendance-seat-help">
        {datedLayout ? "선택한 날짜의 자리배치" : layout ? "기본 자리배치" : "저장된 자리배치가 없어 명단 순으로 표시합니다."}
        {layout && " 기준입니다."}
      </p>
      <SeatGrid className="attendance-seat-grid" ariaLabel="출석 자리표">
        {seats.map((uid, index) => uid ? (
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
