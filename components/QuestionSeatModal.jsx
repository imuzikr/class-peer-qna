"use client";

// =============================================================
// 손들기 자리 확인 — 누가 손을 들었는지 자리표에서 찾습니다
// -------------------------------------------------------------
// 상단바의 🖐️ 목록은 이름만 보여 줘서, 교실에서 실제로 누가 손을 든
// 건지 눈으로 찾기 어려웠습니다. 여기서는 참여 전광판과 같은 자리표에
// 손든 학생을 🖐️로 표시해, 앉은 자리를 보고 바로 찾을 수 있게 합니다.
//
// 자리를 누르면 참여 전광판과 똑같이 과일 주기·누가기록 창이 그 자리 옆에
// 뜹니다(StudentToolsPopover를 공유). 자리 배치는 참여 전광판과 같은 문서를 보되
// 여기서는 옮기지 않습니다 — 자리 바꾸기는 전광판·출석 관리에서 합니다.
//
// 자리표 부품(SeatCell · SeatPickGrid)은 돌발 퀴즈 창도 함께 쓰므로
// `SeatPickGrid.jsx`에 따로 있습니다.
// =============================================================
import { useEffect, useMemo, useState } from "react";
import { backdropClose } from "@/lib/modal";
import {
  dailySeatLayoutId,
  setStudentReward,
  addStudentReward,
  subscribeClassRewards,
  subscribeQuestionSignals,
  subscribeStudySeatLayout,
  subscribeUserDirectory,
  todayDateKey,
} from "@/lib/store";
import { normalizeSeats } from "@/lib/seats";
import { useSeatView } from "@/lib/seatView";
import { useTodayRewardCounts } from "@/lib/useTodayRewards";
import { useClassRoster } from "@/lib/useClassRoster";
import SeatViewToggle from "./SeatViewToggle";
import { SeatPickGrid } from "./SeatPickGrid";
import StudentNotesThread from "./StudentNotesThread";
import StudentToolsPopover from "./StudentToolsPopover";
import { IconMyPost } from "./StatusIcons";

export default function QuestionSeatModal({ classId, onClose }) {
  const [directory, setDirectory] = useState([]);
  const [rewards, setRewards] = useState([]);
  const [seatLayout, setSeatLayout] = useState(null);
  const [dailySeatLayout, setDailySeatLayout] = useState(null);
  const [raisedUids, setRaisedUids] = useState(() => new Set());
  // 자리 클릭 → 과일/누가기록 팝오버. `toolsAt`은 누른 자리 칸으로, 창이 그
  // 옆에 붙습니다(자리표를 덮는 모달이 아닙니다).
  const [toolsFor, setToolsFor] = useState(null);
  const [toolsAt, setToolsAt] = useState(null);
  const [notesFor, setNotesFor] = useState(null);
  // 어느 쪽에서 본 배치인가 — '멋진 순간' 패널·확대 창·수업 중 자리표와
  // **같은 값 하나**를 나눠 씁니다(lib/seatView.js). 이 창만 이 값을 안 봐서
  // 늘 학생 보기로 떴고, 패널에서 선생님 보기로 돌려 둔 채 손든 학생을 찾으면
  // 교실의 반대쪽을 보게 됐습니다 — 자리로 사람을 찾으려고 여는 창이라
  // 방향이 어긋나면 이 창의 쓸모 자체가 없어집니다.
  const [teacherView, toggleSeatView] = useSeatView();

  function openTools(s, el = null) {
    setToolsFor(s);
    setToolsAt(el);
  }

  const todayLayoutId = dailySeatLayoutId(todayDateKey());

  useEffect(() => subscribeUserDirectory(setDirectory), []);

  useEffect(() => {
    if (!classId) return;
    return subscribeClassRewards(classId, setRewards);
  }, [classId]);

  useEffect(() => {
    if (!classId) return;
    return subscribeStudySeatLayout(classId, "default", setSeatLayout);
  }, [classId]);

  useEffect(() => {
    if (!classId) return;
    return subscribeStudySeatLayout(classId, todayLayoutId, setDailySeatLayout);
  }, [classId, todayLayoutId]);

  useEffect(() => {
    if (!classId) return;
    return subscribeQuestionSignals(classId, (list) =>
      setRaisedUids(new Set(list.map((s) => s.uid).filter(Boolean)))
    );
  }, [classId]);

  // 명단 — 참여 전광판·'멋진 순간' 자리표와 같은 셈입니다(lib/roster.js).
  // 학번순이어야 합니다: 자리표에 아직 없는 학생을 빈자리에 채울 때
  // (`normalizeSeats`) 명단 차례를 그대로 써서, 이 창만 정렬이 빠져 있던 동안
  // 같은 교실이 여기서만 다른 자리에 앉았습니다.
  const { roster } = useClassRoster(classId, { directory, rewards });

  // 오늘 임시 자리표가 있으면 그것을, 없으면 기본 자리표를 씁니다(전광판과 동일)
  const seats = useMemo(
    () => normalizeSeats(dailySeatLayout?.seats ?? seatLayout?.seats ?? [], roster),
    [dailySeatLayout?.seats, seatLayout?.seats, roster]
  );
  const byUid = useMemo(() => new Map(roster.map((s) => [s.uid, s])), [roster]);
  const raisedCount = roster.filter((s) => raisedUids.has(s.uid)).length;
  const todayCountByUid = useTodayRewardCounts(classId);

  // 과일을 줄 때 실명을 함께 저장 — 공부방은 실명 공간이라 학생 화면에도
  // 실명 이름표가 보입니다(공부방 화면의 awardReward와 같은 규칙).
  function handleAward(uid, count, delta = null) {
    const d = directory.find((x) => x.uid === uid);
    const identity = d
      ? { name: d.realName || d.studentId || d.displayName || "", emoji: d.emoji || "🙂" }
      : null;
  // delta가 함께 오면(＋1·−1 단추) **서버에서 더합니다.** 화면에 보이는
  // 개수는 방금 누른 값이 아직 안 돌아왔을 수 있어, 그걸로 만든 절대값을
  // 보내면 빨리 두 번 누를 때 두 번째가 같은 값이 되어 묻힙니다
  // (addStudentReward는 트랜잭션 안에서 읽은 값에 더합니다).
  // delta가 없는 자리(개수를 직접 맞추는 곳)는 지금까지대로 절대값입니다.
    if (delta) return addStudentReward(classId, uid, delta, identity);
    return setStudentReward(classId, uid, count, identity);
  }

  function openNotes(student) {
    setToolsFor(null);
    setNotesFor({ uid: student.uid, name: student.name, emoji: student.emoji ?? "🙂" });
  }

  // 과일을 주면 roster가 갱신돼 내려오므로 열려 있는 모달의 숫자도 따라갑니다
  const toolsStudent = toolsFor
    ? { ...toolsFor, count: byUid.get(toolsFor.uid)?.count ?? toolsFor.count ?? 0 }
    : null;

  return (
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      <div className="attend-shell" onClick={(e) => e.stopPropagation()}>
        <div
          className="modal question-seat-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="question-seat-title"
        >
          <div className="modal-head">
            <h3 id="question-seat-title">🖐️ 손든 학생 자리 확인</h3>
            <button className="btn-close" onClick={onClose} aria-label="닫기">×</button>
          </div>

          {roster.length === 0 ? (
            <p className="lesson-note-empty">이 반에 입장한 학생이 없어요.</p>
          ) : (
            <SeatPickGrid
              seats={seats}
              byUid={byUid}
              raisedUids={raisedUids}
              raisedCount={raisedCount}
              todayCountByUid={todayCountByUid}
              onPick={openTools}
              headTrail={
                <SeatViewToggle teacherView={teacherView} onToggle={toggleSeatView} />
              }
              flipped={teacherView}
            />
          )}
        </div>

        {/* 누가기록 슬라이드 패널 — 자리표는 그대로 두고 오른쪽에서 나옵니다 */}
        {notesFor && (
          <aside className="attend-notes-panel" aria-label={`${notesFor.name} 누가기록`}>
            <div className="modal-head">
              <h3 className="head-icon">
                <IconMyPost size={19} /> 누가기록
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

      {toolsStudent && (
        <StudentToolsPopover
          student={toolsStudent}
          classId={classId}
          anchor={toolsAt}
          onAward={handleAward}
          onOpenNotes={openNotes}
          onClose={() => setToolsFor(null)}
        />
      )}
    </div>
  );
}
