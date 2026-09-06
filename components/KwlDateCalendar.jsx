"use client";

// =============================================================
// KWLS 날짜 달력 — 기록이 있는 날을 초록으로
// -------------------------------------------------------------
// 출석부 달력(StudyAttendanceModal)·수업 메모 달력과 같은 짜임·같은 CSS를
// 씁니다(.study-attendance-calendar). 교사가 이미 그 모양에 익숙하고,
// 격자·요일 머리·달 넘기기를 다시 만들 이유가 없습니다. 다른 점은 칸에
// 채우는 값뿐입니다.
//
// 두 곳이 함께 씁니다 — 교사의 KWLS 전체 화면(그날 **쓴 사람 수**)과
// 학생의 'KWLS 노트' 탭(그날 **내 기록 건수**). 한쪽만 고치면 같은 달력이
// 두 얼굴이 되므로 여기 한 곳에 둡니다.
//
// 기록이 없는 날도 누를 수 있게 둡니다. 이 달력의 쓰임은 '있는 날로
// 건너뛰기'지만, 빈 날을 확인하러 가는 길까지 막을 이유는 없습니다
// (화살표로는 갈 수 있는데 달력에서만 막히면 오히려 고장으로 보입니다).
// 앞날만 막습니다.
// =============================================================
import { useState } from "react";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function toYMD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
const TODAY = toYMD(new Date());

function shiftMonth(cursor, delta) {
  const m = cursor.month + delta;
  if (m < 0) return { year: cursor.year - 1, month: 11 };
  if (m > 11) return { year: cursor.year + 1, month: 0 };
  return { year: cursor.year, month: m };
}

export default function KwlDateCalendar({
  date,
  // { 'YYYY-MM-DD': 개수 } — null이면 '아직 안 읽었다'
  days,
  onPick,
  onClose,
  // 칸에 숫자를 적을까. 학생 화면은 대개 하루 한 건이라 숫자가 뜻이 없습니다.
  showCount = true,
  // 달력 아래 한 줄 — 화면마다 세는 것이 달라 문구를 받습니다.
  foot = "초록 = 쓴 날 · 숫자 = 사람 수",
  loadingText = "기록이 있는 날을 찾는 중이에요…",
  cellTitle = (count) => (count > 0 ? `${count}명이 썼어요` : "기록 없음"),
  // 기록이 없는 날을 눌러도 볼 것이 없는 화면(학생의 '내 KWLS')에서만 켭니다.
  // 교사 화면은 빈 날도 확인하러 가는 자리라 그대로 열어 둡니다.
  disableEmpty = false,
}) {
  const [cursor, setCursor] = useState(() => {
    const [y, m] = String(date || TODAY).split("-").map(Number);
    return { year: y, month: (m || 1) - 1 };
  });

  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const startWeekday = new Date(cursor.year, cursor.month, 1).getDay();
  const cells = Array.from({ length: startWeekday }, () => null).concat(
    Array.from({ length: daysInMonth }, (_, i) => i + 1)
  );
  const loading = days === null;

  return (
    <div className="kwlfs-cal" onClick={(e) => e.stopPropagation()}>
      <div className="study-attendance-calendar">
        <div className="study-cal-head">
          <button type="button" onClick={() => setCursor((c) => shiftMonth(c, -1))} aria-label="이전 달">‹</button>
          <span>{cursor.year}년 {cursor.month + 1}월</span>
          <button type="button" onClick={() => setCursor((c) => shiftMonth(c, 1))} aria-label="다음 달">›</button>
        </div>
        <div className="study-cal-weekdays" aria-hidden="true">
          {WEEKDAYS.map((w) => <span key={w}>{w}</span>)}
        </div>
        <div className="study-cal-grid">
          {cells.map((d, i) => {
            if (d === null) {
              return <span key={`blank${i}`} className="study-cal-cell study-cal-cell--blank" />;
            }
            const key = `${cursor.year}-${String(cursor.month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            const count = days?.[key] ?? 0;
            const cls = [
              "study-cal-cell",
              count > 0 && "has-record",
              key === date && "selected",
              key === TODAY && "today",
            ].filter(Boolean).join(" ");
            return (
              <button
                key={key}
                type="button"
                className={cls}
                onClick={() => onPick(key)}
                disabled={key > TODAY || (disableEmpty && count === 0)}
                title={cellTitle(count)}
              >
                <span className="study-cal-day">{d}</span>
                {showCount && count > 0 && <span className="study-cal-count">{count}</span>}
              </button>
            );
          })}
        </div>
      </div>
      <p className="kwlfs-cal-foot">
        {loading ? (
          loadingText
        ) : (
          <>
            <span className="kwlfs-cal-swatch" aria-hidden="true" />
            {foot}
          </>
        )}
        <button type="button" className="kwlfs-cal-close" onClick={onClose}>닫기</button>
      </p>
    </div>
  );
}
