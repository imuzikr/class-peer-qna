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
// =============================================================
import { useEffect, useMemo, useState } from "react";
import { backdropClose } from "@/lib/modal";
import {
  dailySeatLayoutId,
  setStudentReward,
  addStudentReward,
  subscribeClassMembers,
  subscribeClassRewards,
  subscribeQuestionSignals,
  subscribeStudySeatLayout,
  subscribeUserDirectory,
  todayDateKey,
} from "@/lib/store";
import { normalizeSeats } from "@/lib/seats";
import { useSeatView } from "@/lib/seatView";
import { useTodayRewardCounts } from "@/lib/useTodayRewards";
import SeatViewToggle from "./SeatViewToggle";
import StudentNotesThread from "./StudentNotesThread";
import StudentToolsPopover from "./StudentToolsPopover";
import { IconMyPost } from "./StatusIcons";

// 자리표 그리기만 담당 — 데이터 구독은 아래 컨테이너가 합니다.
// (구독과 표시를 나눠 두면 자리표 모양을 데이터 없이도 확인할 수 있습니다)
// compact: 공부방 "멋진 순간" 패널처럼 좁은 곳에 넣을 때 — 칸을 4열로 줄이고
// 안내 문구를 뺍니다(패널 폭이 좁아 한 줄에 다 안 들어가고 줄바꿈되면 자리
// 칸이 오히려 아래로 밀려 보였습니다).
// onDragStart/onDragEnd/onDropTo: 셋 다 있을 때만 자리를 드래그로 옮길 수
// 있습니다(참여 전광판의 자리표 보기와 같은 방식) — 손든 학생 자리 확인
// 화면은 실수로 자리가 바뀌면 안 돼서 이 prop들을 넘기지 않고 그대로 둡니다.
// topUids: 공부방 카드의 '반응 1등' 테두리 강조와 같은 방식으로, 오늘 과일을
// 가장 많이 받은 학생의 자리를 눈에 띄게 표시합니다(안 넘기면 강조 없음).
// todayCountByUid: uid → 오늘 받은 과일 수(lib/useTodayRewards). 자리 칸의
// 🍊 뱃지는 이 값으로 그립니다 — 누적 총계(roster[].count)가 아닙니다.
// 자리표는 수업 중에 보는 화면이라 학기 누적이 뜨면 그날의 움직임이 묻히고,
// 숫자가 커지기만 해서 오늘 누가 받았는지 읽을 수 없기 때문입니다. 누적은
// 자리를 눌러 여는 과일 주기 창에 그대로 남아 있습니다(안 넘기면 뱃지 없음).
// presentUids: 오늘 출석한 학생 uid 집합. null이면 아직 출석을 확인하기
// 전이라 자리를 모두 연한 회색으로 둡니다(출석/결석을 섣불리 단정하지
// 않으려고). 집합이 오면 그 안에 있으면 연한 초록(출석), 없으면 연한
// 주황(결석)으로 칠합니다.
// liveState: uid → 'on'|'away'|'off' (지금 화면을 보고 있는지). 있으면
// 자리 칸 오른쪽 아래에 작은 점으로 얹습니다 — presentUids(출석)와는
// 별개 신호라 배경색을 바꾸지 않고 점만 덧붙입니다.
// headLead: 머리줄 **맨 앞**에 넣을 것(수업하기 자리표의 개별/모둠 보기 탭,
// '멋진 순간' 패널의 단추 묶음 등). 안 넘기면 빈 칸이 그 자리를 지킵니다.
// headTrail: 머리줄에서 손바닥 뱃지 **바로 왼쪽**에 넣을 것(보기 방향 단추).

// 자리 칸 하나 — 자리표(SeatPickGrid)와 모둠 보기가 똑같은 모양을 쓰도록
// 최상위로 빼 두었습니다(각자 그리면 출석 색·손들기·과일 배지 규칙이
// 두 곳에서 갈라집니다). 최상위에 두는 또 다른 이유는 AttendanceBoard의
// StudentCard와 같습니다 — 컴포넌트 안에 중첩 정의하면 부모가 리렌더될 때
// DOM이 통째로 교체돼 진행 중이던 드래그가 끊깁니다.
export function SeatCell({
  student, raised = false, top = false, att = "unchecked", live = null,
  noting = false, todayCount = 0,
  onPick, draggable = false, index = null, onDragStart, onDragEnd, onDropTo,
}) {
  const s = student;
  const attLabel = att === "present" ? " · 출석" : att === "absent" ? " · 결석" : "";
  const liveLabel =
    live === "on" ? " · 보는 중" : live === "away" ? " · 화면 가려짐" : live === "off" ? " · 미접속" : "";
  // 수업 노트에 방금 필기했는지 — '보는 중'인 학생 사이에서 실제로 손이
  // 움직이는 학생을 갈라 주는 유일한 신호입니다.
  const notingLabel = noting ? " · 필기 중" : "";
  return (
    <button
      type="button"
      className={`attend-seat attend-seat--pick attend-seat--${att}${raised ? " attend-seat--raised" : ""}${top ? " attend-seat--top" : ""}`}
      /* 누른 칸(e.currentTarget)을 함께 넘깁니다 — 과일·누가기록 창이 모달이
         아니라 **이 자리 옆에 붙는 팝오버**라, 어디에 뜰지 정하려면 누른
         칸이 어디인지 알아야 합니다. */
      onClick={(e) => onPick?.(s, e.currentTarget)}
      title={`${s.name}${s.studentId ? ` · ${s.studentId}` : ""}${attLabel}${liveLabel}${notingLabel}${raised ? " · 질문 있어요" : ""}${todayCount > 0 ? ` · 오늘 과일 ${todayCount}개` : ""}${top ? " · 오늘 과일 1등" : ""} — 눌러서 과일 주기·누가기록${draggable ? ", 끌어서 자리 이동" : ""}`}
      draggable={draggable}
      onDragStart={draggable ? (e) => { onDragStart(index); e.dataTransfer.effectAllowed = "move"; } : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
      onDragOver={draggable ? (e) => e.preventDefault() : undefined}
      onDrop={draggable ? (e) => { e.preventDefault(); onDropTo(index); } : undefined}
    >
      {raised && (
        <span className="attend-seat-hand" aria-label="질문 있어요">🖐️</span>
      )}
      {live && (
        <span className={`attend-seat-live attend-seat-live--${live}`} aria-hidden="true" />
      )}
      {noting && <span className="attend-seat-noting" aria-hidden="true">✍️</span>}
      <span className="attend-seat-no">{s.studentId || "-"}</span>
      <span className="attend-seat-name">{s.name}</span>
      {todayCount > 0 && (
        <span className="attend-seat-fruit" aria-label={`오늘 받은 과일 ${todayCount}개`}>
          🍊 {todayCount}
        </span>
      )}
    </button>
  );
}

// 출석 확인 전 → unchecked(연한 회색) / 출석 → present(연한 초록)
// / 결석 → absent(연한 주황)
export function attStateOf(uid, presentUids) {
  if (!presentUids) return "unchecked";
  return presentUids.has(uid) ? "present" : "absent";
}

export function SeatPickGrid({
  seats, byUid, raisedUids, raisedCount, onPick, compact = false,
  onDragStart, onDragEnd, onDropTo, topUids = null, presentUids = null,
  liveState = null, notingUids = null, headLead = null, todayCountByUid = null,
  // 머리줄에서 손바닥 뱃지 **바로 왼쪽**에 끼우는 것 — 지금은 보기 방향 단추가
  // 여기 섭니다. 패널·확대 창의 그것과 같은 자리라, 같은 단추를 화면마다 다른
  // 데서 찾지 않아도 됩니다(`headLead`는 줄 맨 앞입니다).
  headTrail = null,
  // 선생님 자리에서 본 배치 — 자리표를 통째로 180도 돌립니다.
  // 자리 순서를 뒤집는 대신 그림을 돌리는 이유: 자리는 빈 칸이 섞인 격자라
  // 배열을 뒤집으면 빈 칸이 엉뚱한 곳으로 갑니다. 그림을 돌리면 빈 칸까지
  // 있는 그대로 돌아가고, 끌어 옮기기의 자리 번호(index)도 안 흔들립니다.
  flipped = false,
}) {
  const draggable = !!(onDragStart && onDragEnd && onDropTo);
  // **'칠판' 표시는 없습니다.** 교실 앞쪽이 어디인지 알려 주던 띠인데, 같은
  // 머리줄의 '학생 보기 / 선생님 보기' 단추가 이미 그것을 글자로 말합니다 —
  // 한 줄에 같은 뜻이 둘이면 자리만 먹습니다(판이 그만큼 내려앉습니다).
  // 방향을 바꿀 수 있게 된 뒤로는 띠를 위아래로 옮기는 일까지 따라붙어,
  // 지킬 것이 하나 더 느는 값이기도 했습니다.
  // (학생의 '자리 배치' 창은 다릅니다 — 거기엔 보기 단추가 없어 칠판 표시가
  //  방향을 말하는 유일한 것이라 `MySeatModal`에 그대로 있습니다.)
  return (
    <div className={`attend-seatmap${compact ? " attend-seatmap--compact" : ""}`}>
      <div className="attend-seatmap-head">
        {/* 칠판이 서던 자리는 비워 둡니다 — `flex: 1`로 남는 폭을 받아 손바닥
            뱃지를 오른쪽 끝으로 밀어내던 칸이라, 빼 버리면 뱃지가 줄 가운데로
            들어옵니다. */}
        {headLead ?? <span className="attend-seatmap-gap" />}
        {!compact && (
          <span className="attend-seatmap-hint">자리를 누르면 과일·누가기록을 열 수 있어요</span>
        )}
        {headTrail}
        <span className={`attend-seatmap-hands${raisedCount > 0 ? " on" : ""}`}>
          🖐️ {compact ? raisedCount : `질문 ${raisedCount}`}
        </span>
      </div>
      <div className={`attend-seatmap-grid${flipped ? " attend-seatmap-grid--flipped" : ""}`}>
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
          return (
            <SeatCell
              key={s.uid}
              student={s}
              raised={raisedUids.has(s.uid)}
              top={!!topUids?.has(s.uid)}
              att={attStateOf(s.uid, presentUids)}
              live={liveState?.get(s.uid) ?? null}
              noting={!!notingUids?.has(s.uid)}
              todayCount={todayCountByUid?.get(s.uid) ?? 0}
              onPick={onPick}
              draggable={draggable}
              index={i}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDropTo={onDropTo}
            />
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
