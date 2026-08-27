"use client";

// =============================================================
// 공부방 오른쪽 "멋진 순간" 패널 — 교사 전용
// -------------------------------------------------------------
// 참여 전광판·손들기 자리 확인과 같은 자리표(SeatPickGrid)를 패널 폭에
// 맞게 축소해 보여줍니다. 이름을 알파벳/학번 순으로 훑어 찾던 예전 목록은
// 학생 수가 많아지면 특정 학생을 찾기 어려웠는데, 자리표는 교실에서 보이는
// 위치 그대로라 눈으로 바로 찾을 수 있습니다. 자리를 누르면 참여
// 전광판과 똑같이 과일 주기·누가기록 선택 모달이 열립니다.
// 헤더의 « 버튼으로 접기 — 접으면 세로 슬림 바(개인 설정, localStorage).
// =============================================================
import { useEffect, useState } from "react";
import { subscribeQuestionSignals } from "@/lib/store";
import { normalizeSeats } from "@/lib/seats";
import { SeatPickGrid } from "./QuestionSeatModal";
import StudentToolsModal from "./StudentToolsModal";
import StudentNotesModal from "./StudentNotesModal";

const COLLAPSE_KEY = "reward_panel_collapsed";

export default function StudyRewardPanel({
  roster = [],
  onAward,
  classId = null,
  seatLayout = null,
}) {
  const [notesFor, setNotesFor] = useState(null); // 누가기록 모달 대상 학생(교사만)
  const [toolsFor, setToolsFor] = useState(null); // 자리 클릭 → 과일/누가기록 선택 모달
  const [collapsed, setCollapsed] = useState(false);
  const [raisedUids, setRaisedUids] = useState(() => new Set());

  // 접힘 상태 복원 — 개인 화면 설정이라 localStorage에 저장
  useEffect(() => {
    try { setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1"); } catch { /* 무시 */ }
  }, []);
  function toggleCollapsed() {
    setCollapsed((v) => {
      try { localStorage.setItem(COLLAPSE_KEY, v ? "0" : "1"); } catch { /* 무시 */ }
      return !v;
    });
  }

  // 손든 학생 — 참여 전광판·손들기 자리 확인과 같은 신호를 봅니다.
  useEffect(() => {
    if (!classId) { setRaisedUids(new Set()); return; }
    return subscribeQuestionSignals(classId, (list) =>
      setRaisedUids(new Set(list.map((s) => s.uid).filter(Boolean)))
    );
  }, [classId]);

  // 접힌 상태 — 세로 슬림 바. 클릭하면 다시 펼침.
  if (collapsed) {
    return (
      <aside
        className="reward-panel reward-panel--collapsed"
        role="button"
        tabIndex={0}
        onClick={toggleCollapsed}
        onKeyDown={(e) => e.key === "Enter" && toggleCollapsed()}
        title="'멋진 순간' 펼치기"
        aria-label="멋진 순간 펼치기"
      >
        <span className="reward-collapsed-expand" aria-hidden="true">«</span>
        <span className="reward-collapsed-icon" aria-hidden="true">🍎</span>
        <span className="reward-collapsed-title">멋진 순간</span>
      </aside>
    );
  }

  const byUid = new Map(roster.map((s) => [s.uid, s]));
  const seats = normalizeSeats(seatLayout?.seats ?? [], roster);
  const raisedCount = roster.filter((s) => raisedUids.has(s.uid)).length;

  function openNotes(student) {
    setToolsFor(null);
    setNotesFor({ uid: student.uid, name: student.name, emoji: student.emoji ?? "🙂" });
  }

  // 과일을 주면 roster가 갱신돼 내려오므로, 열려 있는 모달의 숫자도
  // 최신 값으로 따라가게 합니다(모달이 처음 열릴 때 찍힌 값에 머무르지 않게).
  const toolsStudent = toolsFor
    ? { ...toolsFor, count: byUid.get(toolsFor.uid)?.count ?? toolsFor.count ?? 0 }
    : null;

  return (
    <aside className="reward-panel" aria-label="멋진 순간">
      <div className="reward-head">
        <div className="reward-head-row">
          <span className="reward-title">🍎 멋진 순간</span>
          <button
            type="button"
            className="reward-collapse-btn"
            onClick={toggleCollapsed}
            title="패널 접기"
            aria-label="멋진 순간 패널 접기"
          >
            »
          </button>
        </div>
        <span className="reward-sub">자리를 눌러 과일 주기·누가기록 · 20개마다 ⭐</span>
      </div>

      {roster.length === 0 ? (
        <p className="reward-empty">
          아직 이 반에 입장한 학생이 없어요. 입장 코드를 알려 주세요.
        </p>
      ) : (
        <SeatPickGrid
          compact
          seats={seats}
          byUid={byUid}
          raisedUids={raisedUids}
          raisedCount={raisedCount}
          onPick={setToolsFor}
        />
      )}

      {toolsStudent && (
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
    </aside>
  );
}
