"use client";

// =============================================================
// 손들기 자리 확인 — 누가 손을 들었는지 자리표에서 찾습니다
// -------------------------------------------------------------
// 상단바의 🖐️ 목록은 이름만 보여 줘서, 교실에서 실제로 누가 손을 든
// 건지 눈으로 찾기 어려웠습니다. 여기서는 참여 전광판과 같은 자리표에
// 손든 학생을 🖐️로 표시해, 앉은 자리를 보고 바로 찾을 수 있게 합니다.
//
// 자리를 누르면 참여 전광판과 똑같이 과일 주기·누가기록 모달이 열립니다
// (StudentToolsModal을 공유). 자리 배치는 참여 전광판과 같은 문서를 보되
// 여기서는 옮기지 않습니다 — 자리 바꾸기는 전광판·출석 관리에서 합니다.
// =============================================================
import { useEffect, useMemo, useState } from "react";
import { backdropClose } from "@/lib/modal";
import {
  dailySeatLayoutId,
  setStudentReward,
  subscribeClassMembers,
  subscribeClassRewards,
  subscribeQuestionSignals,
  subscribeStudySeatLayout,
  subscribeUserDirectory,
  todayDateKey,
} from "@/lib/store";
import { normalizeSeats } from "@/lib/seats";
import StudentNotesThread from "./StudentNotesThread";
import StudentToolsModal from "./StudentToolsModal";

// 자리표 그리기만 담당 — 데이터 구독은 아래 컨테이너가 합니다.
// (구독과 표시를 나눠 두면 자리표 모양을 데이터 없이도 확인할 수 있습니다)
// compact: 공부방 "멋진 순간" 패널처럼 좁은 곳에 넣을 때 — 칸을 4열로 줄이고
// 안내 문구를 뺍니다(패널 폭이 좁아 한 줄에 다 안 들어가고 줄바꿈되면 자리
// 칸이 오히려 아래로 밀려 보였습니다).
// onDragStart/onDragEnd/onDropTo: 셋 다 있을 때만 자리를 드래그로 옮길 수
// 있습니다(참여 전광판의 자리표 보기와 같은 방식) — 손든 학생 자리 확인
// 화면은 실수로 자리가 바뀌면 안 돼서 이 prop들을 넘기지 않고 그대로 둡니다.
export function SeatPickGrid({
  seats, byUid, raisedUids, raisedCount, onPick, compact = false,
  onDragStart, onDragEnd, onDropTo,
}) {
  const draggable = !!(onDragStart && onDragEnd && onDropTo);
  return (
    <div className={`attend-seatmap${compact ? " attend-seatmap--compact" : ""}`}>
      <div className="attend-seatmap-head">
        <span className="attend-seatmap-board">칠판</span>
        {!compact && (
          <span className="attend-seatmap-hint">자리를 누르면 과일·누가기록을 열 수 있어요</span>
        )}
        <span className={`attend-seatmap-hands${raisedCount > 0 ? " on" : ""}`}>
          🖐️ {compact ? raisedCount : `질문 ${raisedCount}`}
        </span>
      </div>
      <div className="attend-seatmap-grid">
        {seats.map((uid, i) => {
          const s = uid ? byUid.get(uid) : null;
          if (!s) {
            return (
              <div
                key={`empty-${i}`}
                className="attend-seat attend-seat--empty"
                onDragOver={draggable ? (e) => e.preventDefault() : undefined}
                onDrop={draggable ? (e) => { e.preventDefault(); onDropTo(i); } : undefined}
              />
            );
          }
          const raised = raisedUids.has(s.uid);
          return (
            <button
              key={s.uid}
              type="button"
              className={`attend-seat attend-seat--pick${raised ? " attend-seat--raised" : ""}`}
              onClick={() => onPick(s)}
              title={`${s.name}${s.studentId ? ` · ${s.studentId}` : ""}${raised ? " · 질문 있어요" : ""} — 눌러서 과일 주기·누가기록${draggable ? ", 끌어서 자리 이동" : ""}`}
              draggable={draggable}
              onDragStart={draggable ? (e) => { onDragStart(i); e.dataTransfer.effectAllowed = "move"; } : undefined}
              onDragEnd={draggable ? onDragEnd : undefined}
              onDragOver={draggable ? (e) => e.preventDefault() : undefined}
              onDrop={draggable ? (e) => { e.preventDefault(); onDropTo(i); } : undefined}
            >
              {raised && (
                <span className="attend-seat-hand" aria-label="질문 있어요">🖐️</span>
              )}
              <span className="attend-seat-no">{s.studentId || "-"}</span>
              <span className="attend-seat-name">{s.name}</span>
              {s.count > 0 && (
                <span className="attend-seat-fruit" aria-label={`과일 ${s.count}개`}>
                  🍎 {s.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function QuestionSeatModal({ classId, onClose }) {
  const [memberUids, setMemberUids] = useState([]);
  const [directory, setDirectory] = useState([]);
  const [rewards, setRewards] = useState([]);
  const [seatLayout, setSeatLayout] = useState(null);
  const [dailySeatLayout, setDailySeatLayout] = useState(null);
  const [raisedUids, setRaisedUids] = useState(() => new Set());
  const [toolsFor, setToolsFor] = useState(null);
  const [notesFor, setNotesFor] = useState(null);

  const todayLayoutId = dailySeatLayoutId(todayDateKey());

  useEffect(() => {
    if (!classId) return;
    return subscribeClassMembers(classId, setMemberUids);
  }, [classId]);

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

  // 명단 — 참여 전광판과 같은 방식으로 디렉터리(실명·학번)와 과일 수를 붙입니다
  const roster = useMemo(() => {
    const dir = new Map(directory.map((d) => [d.uid, d]));
    const countByUid = {};
    rewards.forEach((r) => { countByUid[r.uid] = r.count ?? 0; });
    return memberUids.map((uid) => {
      const d = dir.get(uid) || {};
      return {
        uid,
        name: d.realName || d.studentId || "이름 미설정",
        studentId: d.studentId || null,
        emoji: d.emoji || "🙂",
        count: countByUid[uid] ?? 0,
      };
    });
  }, [memberUids, directory, rewards]);

  // 오늘 임시 자리표가 있으면 그것을, 없으면 기본 자리표를 씁니다(전광판과 동일)
  const seats = useMemo(
    () => normalizeSeats(dailySeatLayout?.seats ?? seatLayout?.seats ?? [], roster),
    [dailySeatLayout?.seats, seatLayout?.seats, roster]
  );
  const byUid = useMemo(() => new Map(roster.map((s) => [s.uid, s])), [roster]);
  const raisedCount = roster.filter((s) => raisedUids.has(s.uid)).length;

  // 과일을 줄 때 실명을 함께 저장 — 공부방은 실명 공간이라 학생 화면에도
  // 실명 이름표가 보입니다(공부방 화면의 awardReward와 같은 규칙).
  function handleAward(uid, count) {
    const d = directory.find((x) => x.uid === uid);
    setStudentReward(
      classId,
      uid,
      count,
      d ? { name: d.realName || d.studentId || d.displayName || "", emoji: d.emoji || "🙂" } : null
    );
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
              onPick={setToolsFor}
            />
          )}
        </div>

        {/* 누가기록 슬라이드 패널 — 자리표는 그대로 두고 오른쪽에서 나옵니다 */}
        {notesFor && (
          <aside className="attend-notes-panel" aria-label={`${notesFor.name} 누가기록`}>
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

      {toolsStudent && (
        <StudentToolsModal
          student={toolsStudent}
          onAward={handleAward}
          onOpenNotes={openNotes}
          onClose={() => setToolsFor(null)}
        />
      )}
    </div>
  );
}
