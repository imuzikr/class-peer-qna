"use client";

// =============================================================
// 공부방 오른쪽 "멋진 순간" 패널 — 교사 전용
// -------------------------------------------------------------
// 참여 전광판·손들기 자리 확인과 같은 자리표(SeatPickGrid)를 패널 폭에
// 맞게 축소해 보여줍니다. 이름을 알파벳/학번 순으로 훑어 찾던 예전 목록은
// 학생 수가 많아지면 특정 학생을 찾기 어려웠는데, 자리표는 교실에서 보이는
// 위치 그대로라 눈으로 바로 찾을 수 있습니다. 자리를 누르면 참여
// 전광판과 똑같이 과일 주기·누가기록 선택 모달이 열립니다.
//
// 참여 전광판의 '자리표 보기'처럼 드래그로 자리를 바꿀 수도 있습니다 —
// 다만 여기서 옮기면 그 자리가 기본 자리표(seatLayouts/default)로 곧장
// 저장됩니다(참여 전광판의 드래그는 그날 하루만 유지되는 daily 자리표를
// 바꾸는 것과 다릅니다 — 이 패널은 수업 중 상시로 열려 있으므로 '오늘만'이
// 아니라 계속 쓸 자리로 바로 반영하는 편이 맞습니다).
//
// 자리표 아래 빈 공간에는 모둠 현황을 표시합니다(보기 전용 — 모둠을 새로
// 짜거나 이름·색을 바꾸는 건 '반 관리하기 → 자리 배정하기'에서 합니다).
//
// 헤더의 « 버튼으로 접기 — 접으면 세로 슬림 바(개인 설정, localStorage).
// =============================================================
import { useEffect, useState } from "react";
import { subscribeQuestionSignals } from "@/lib/store";
import { normalizeSeats } from "@/lib/seats";
import { SeatPickGrid } from "./QuestionSeatModal";
import StudentToolsModal from "./StudentToolsModal";
import StudentNotesModal from "./StudentNotesModal";

const COLLAPSE_KEY = "reward_panel_collapsed";
const GROUP_COLORS = ["#2563eb", "#16a34a", "#f97316", "#9333ea", "#dc2626", "#0891b2"];

export default function StudyRewardPanel({
  roster = [],
  onAward,
  classId = null,
  seatLayout = null,
  groupAssignment = null,
  onSaveSeats,
}) {
  const [notesFor, setNotesFor] = useState(null); // 누가기록 모달 대상 학생(교사만)
  const [toolsFor, setToolsFor] = useState(null); // 자리 클릭 → 과일/누가기록 선택 모달
  const [collapsed, setCollapsed] = useState(false);
  const [raisedUids, setRaisedUids] = useState(() => new Set());
  const [dragIndex, setDragIndex] = useState(null);
  const [seats, setSeats] = useState(() => normalizeSeats(seatLayout?.seats ?? [], roster));

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

  // 저장된 자리표(또는 반 명단)가 바뀌면 화면도 맞춰 갱신 — 단, 드래그로
  // 옮긴 직후 저장 완료를 기다리는 동안에는 내가 만든 모양을 덮어쓰지
  // 않도록 seatLayout의 식별값이 바뀔 때만 다시 계산합니다.
  useEffect(() => {
    setSeats(normalizeSeats(seatLayout?.seats ?? [], roster));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seatLayout?.updatedAt, roster]);

  async function moveSeat(from, to) {
    setDragIndex(null);
    if (from == null || to == null || from === to) return;
    const next = [...seats];
    [next[from], next[to]] = [next[to], next[from]];
    setSeats(next);
    await onSaveSeats?.(next);
  }

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
  const raisedCount = roster.filter((s) => raisedUids.has(s.uid)).length;
  const groups = groupAssignment?.groups ?? [];

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
          onDragStart={setDragIndex}
          onDragEnd={() => setDragIndex(null)}
          onDropTo={(toIndex) => moveSeat(dragIndex, toIndex)}
        />
      )}

      {/* 모둠 현황 — 보기 전용. 새로 짜거나 이름·색 수정은 '반 관리하기 →
          자리 배정하기'에서 합니다. */}
      {groups.length > 0 && (
        <div className="reward-groups">
          <strong className="reward-groups-title">모둠 현황</strong>
          {groups.map((g, i) => (
            <div
              key={g.id ?? g.index ?? i}
              className="reward-group-row"
              style={{ "--group-color": g.color || GROUP_COLORS[i % GROUP_COLORS.length] }}
            >
              <span className="reward-group-name">{g.name || `${g.index ?? i + 1}모둠`}</span>
              <span className="reward-group-members">
                {(g.members ?? []).length === 0
                  ? "학생 없음"
                  : g.members.map((m) => m.name).join(", ")}
              </span>
            </div>
          ))}
        </div>
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
