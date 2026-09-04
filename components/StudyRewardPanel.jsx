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
// 자리표 아래 빈 공간에는 모둠 현황을 보여줍니다. 학생을 카드(칩)로 만들어
// 드래그하거나(데스크톱) 학생을 짚은 뒤 모둠을 눌러서(탭 기반 — 터치 기기
// 배려) 그 자리에서 바로 기본 모둠 배치를 바꿀 수 있습니다. 모둠을 새로
// 만들거나 이름·색을 바꾸는 건 여전히 '반 관리하기 → 자리 배정하기'에서
// 합니다(그건 자주 하는 일이 아니라 이 패널에 옮겨오지 않았습니다).
//
// 헤더의 « 버튼으로 접기 — 접으면 세로 슬림 바(개인 설정, localStorage).
// =============================================================
import { useEffect, useState } from "react";
import { subscribeQuestionSignals } from "@/lib/store";
import { backdropClose } from "@/lib/modal";
import { normalizeSeats } from "@/lib/seats";
import { useTodayRewardCounts } from "@/lib/useTodayRewards";
import { SeatPickGrid } from "./QuestionSeatModal";
import RewardTally from "./RewardTally";
import StudentToolsModal from "./StudentToolsModal";
import StudentNotesModal from "./StudentNotesModal";

const COLLAPSE_KEY = "reward_panel_collapsed";
// 자리표를 보는 쪽 (학생 보기 / 선생님 보기) — 개인 화면 설정
const SEATVIEW_KEY = "reward_seat_view";
const GROUP_COLORS = ["#2563eb", "#16a34a", "#f97316", "#9333ea", "#dc2626", "#0891b2"];
// '자리 배정하기' 모달의 모둠 수 선택([2,3,4,5,6]개)과 같은 범위로 맞춥니다.
const MIN_GROUPS = 2;
const MAX_GROUPS = 6;

export default function StudyRewardPanel({
  roster = [],
  onAward,
  classId = null,
  seatLayout = null,
  groupAssignment = null,
  // 오늘 출석한 학생 uid 집합. null이면 아직 출석 확인 전(자리 모두 회색).
  presentUids = null,
  // 지금 출석을 받는 중인가. 머리줄의 '출석 n/N'은 **끝난 뒤에만** 띄웁니다 —
  // 받는 중에는 아직 오는 중인 학생이 있어 그 숫자가 결석 수처럼 읽힙니다.
  attendanceOpen = false,
  onSaveSeats,
  onSaveGroups,
}) {
  const [notesFor, setNotesFor] = useState(null); // 누가기록 모달 대상 학생(교사만)
  const [toolsFor, setToolsFor] = useState(null); // 자리 클릭 → 과일/누가기록 선택 모달
  const [collapsed, setCollapsed] = useState(false);
  const [raisedUids, setRaisedUids] = useState(() => new Set());
  const [dragIndex, setDragIndex] = useState(null);
  const [seats, setSeats] = useState(() => normalizeSeats(seatLayout?.seats ?? [], roster));
  const [groups, setGroups] = useState(() => groupAssignment?.groups ?? []);
  const [dragUid, setDragUid] = useState(null); // 드래그로 옮기는 중인 학생
  const [pickedUid, setPickedUid] = useState(null); // 짚어 둔 학생(탭으로 옮기기)
  const [zoom, setZoom] = useState(false); // 자리표 확대 보기
  // 자리표를 어느 쪽에서 보는가. 학생 보기(기본)는 학생이 앉아 칠판을 보는
  // 방향이고, 선생님 보기는 교탁에서 본 방향이라 좌우·앞뒤가 뒤집힙니다.
  // 개인 화면 설정이라 localStorage에 기억해 둡니다(수업마다 다시 고르지
  // 않게 — 한 선생님은 대개 늘 같은 쪽에서 봅니다).
  const [teacherView, setTeacherView] = useState(false);
  // 자리 칸의 🍎 뱃지는 오늘 받은 개수입니다(누적 총계는 과일 주기 모달에).
  const todayCountByUid = useTodayRewardCounts(classId);

  // 접힘 상태 복원 — 개인 화면 설정이라 localStorage에 저장
  useEffect(() => {
    try { setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1"); } catch { /* 무시 */ }
    try { setTeacherView(localStorage.getItem(SEATVIEW_KEY) === "teacher"); } catch { /* 무시 */ }
  }, []);
  function toggleSeatView() {
    setTeacherView((v) => {
      try { localStorage.setItem(SEATVIEW_KEY, v ? "student" : "teacher"); } catch { /* 무시 */ }
      return !v;
    });
  }
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

  // 저장된 모둠이 바뀌면(다른 반으로 전환 포함) 화면도 맞춥니다 — 자리표와
  // 같은 이유로 updatedAt이 바뀔 때만 다시 계산합니다.
  useEffect(() => {
    setGroups(groupAssignment?.groups ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, groupAssignment?.updatedAt]);

  async function moveSeat(from, to) {
    setDragIndex(null);
    if (from == null || to == null || from === to) return;
    const next = [...seats];
    [next[from], next[to]] = [next[to], next[from]];
    setSeats(next);
    await onSaveSeats?.(next);
  }

  // 학생 한 명을 다른 모둠으로(targetIndex) 또는 미배정으로(null) 옮깁니다.
  // 드래그로 놓거나, 학생을 짚은 뒤 모둠을 눌러도 같은 함수를 탑니다.
  async function moveToGroup(uid, targetIndex) {
    setDragUid(null);
    setPickedUid(null);
    const student = roster.find((s) => s.uid === uid);
    if (!student) return;
    const next = groups.map((g) => {
      const cleaned = { ...g, members: (g.members ?? []).filter((m) => m.uid !== uid) };
      if (targetIndex == null || g.index !== targetIndex) return cleaned;
      return {
        ...cleaned,
        members: [...cleaned.members, {
          uid: student.uid,
          name: student.name,
          studentId: student.studentId ?? null,
          emoji: student.emoji ?? "🙂",
        }],
      };
    });
    setGroups(next);
    await onSaveGroups?.(next);
  }

  // 모둠 수 조절 — 맨 뒤에 하나 추가하거나 맨 뒤 하나를 없앱니다. 없앤
  // 모둠의 학생은 groupedUids에서 자연히 빠져 '미배정'에 다시 나타납니다
  // (별도로 옮겨 줄 필요가 없습니다).
  async function addGroup() {
    if (groups.length >= MAX_GROUPS) return;
    const index = groups.length + 1;
    const next = [...groups, {
      id: `group_${index}`,
      index,
      name: `${index}모둠`,
      color: GROUP_COLORS[(index - 1) % GROUP_COLORS.length],
      members: [],
    }];
    setGroups(next);
    await onSaveGroups?.(next);
  }
  async function removeGroup() {
    if (groups.length <= MIN_GROUPS) return;
    const next = groups.slice(0, -1);
    setGroups(next);
    await onSaveGroups?.(next);
  }

  // 모둠마다 그 안의 학생을 학번순으로 재배열합니다. 카드에는 학번을
  // 표시하지 않지만, 각 학생 객체(members[].studentId)엔 저장돼 있어
  // 정렬 기준으로 쓸 수 있습니다. 학번이 없는 학생은 뒤로 보냅니다.
  async function sortGroupsByStudentId() {
    const next = groups.map((g) => ({
      ...g,
      members: [...(g.members ?? [])].sort((a, b) => {
        if (!a.studentId) return b.studentId ? 1 : 0;
        if (!b.studentId) return -1;
        return String(a.studentId).localeCompare(String(b.studentId), "ko", { numeric: true });
      }),
    }));
    setGroups(next);
    await onSaveGroups?.(next);
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
  // 출석을 끝냈고 오늘 기록이 있을 때만 '출석 n/N'을 답니다. presentUids가
  // null이면 오늘 출석을 아예 안 한 날이고, attendanceOpen이면 아직 받는
  // 중입니다. 세는 대상은 **지금 명단에 있는 학생**뿐입니다 — 반에서 빠진
  // 학생의 옛 출석 기록이 섞이면 분자가 분모를 넘습니다.
  const attendanceDone = !!presentUids && !attendanceOpen;
  const presentCount = attendanceDone
    ? roster.filter((s) => presentUids.has(s.uid)).length
    : 0;
  const groupedUids = new Set(groups.flatMap((g) => (g.members ?? []).map((m) => m.uid)));
  const ungrouped = roster.filter((s) => !groupedUids.has(s.uid));

  // 오늘 과일을 가장 많이 받은 학생(들) — 보드의 반응 1등 카드와 같은 방식으로
  // 자리표에서 테두리를 강조합니다. 오늘 아직 아무도 못 받았으면(0개) 강조하지
  // 않고, 동점이면 모두 강조합니다.
  //
  // 뱃지와 같은 기준(오늘)이어야 합니다. 뱃지는 오늘 것인데 강조가 누적
  // 1등이면, 뱃지에 큰 숫자가 붙은 학생을 두고 엉뚱한 자리에 테두리가 가
  // 화면이 서로 어긋나 보입니다.
  const todayOf = (uid) => todayCountByUid.get(uid) ?? 0;
  const maxRewardCount = roster.reduce((max, s) => Math.max(max, todayOf(s.uid)), 0);
  const topRewardUids = new Set(
    maxRewardCount > 0 ? roster.filter((s) => todayOf(s.uid) === maxRewardCount).map((s) => s.uid) : []
  );

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
      {/* 폭은 이 안쪽 상자가 정합니다 — 패널에 직접 걸면 세로 스크롤바가
          생길 때 그만큼 내용이 눌립니다(자리표 칸과 모둠 이름표가 한꺼번에
          좁아지고 줄이 다시 접혔습니다). 겹쳐 뜨는 것들(확대 보기·과일
          주기·누가기록)은 position: fixed라 이 폭에 매이지 않습니다. */}
      <div className="reward-panel-inner">
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
          headLead={
            <span className="reward-seat-head-btns">
              {/* 출석을 끝낸 뒤에만 — 오늘 몇 명이 왔나 */}
              {attendanceDone && (
                <span
                  className="reward-seat-att"
                  title={`오늘 출석 ${presentCount}명 / 전체 ${roster.length}명`}
                >
                  출석 <b>{presentCount}</b>/{roster.length}
                </span>
              )}
              {/* 지금 어느 쪽에서 본 배치인지 — 누르면 반대쪽으로 돌아갑니다 */}
              <button
                type="button"
                className="reward-seat-flip"
                onClick={toggleSeatView}
                aria-pressed={teacherView}
                title={
                  teacherView
                    ? "교탁에서 본 배치예요. 누르면 학생 쪽에서 본 배치로 돌아갑니다."
                    : "학생이 앉아 칠판을 보는 배치예요. 누르면 교탁에서 본 배치로 돌립니다."
                }
              >
                {teacherView ? "선생님 보기" : "학생 보기"}
              </button>
              <button
                type="button"
                className="reward-seat-zoom"
                onClick={() => setZoom(true)}
                title="자리표를 크게 보기"
              >
                ⤢ 확대
              </button>
            </span>
          }
          flipped={teacherView}
          seats={seats}
          byUid={byUid}
          raisedUids={raisedUids}
          raisedCount={raisedCount}
          onPick={setToolsFor}
          onDragStart={setDragIndex}
          onDragEnd={() => setDragIndex(null)}
          onDropTo={(toIndex) => moveSeat(dragIndex, toIndex)}
          topUids={topRewardUids}
          todayCountByUid={todayCountByUid}
          presentUids={presentUids}
        />
      )}

      {/* 확대 보기 — 좁은 패널에서는 이름이 8.5px까지 줄어 멀리서 안 보입니다.
          같은 SeatPickGrid를 큰 폭으로 한 번 더 그릴 뿐이라, 자리를 눌러
          과일·누가기록을 열고 끌어서 옮기는 동작이 그대로 살아 있습니다
          (seats·moveSeat 같은 상태를 공유하므로 두 화면이 어긋나지 않습니다). */}
      {zoom && (
        <div className="modal-backdrop" {...backdropClose(() => setZoom(false))}>
          <div
            className="modal reward-zoom-modal"
            role="dialog"
            aria-modal="true"
            aria-label="자리표 크게 보기"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h3>🪑 자리표</h3>
              <button className="btn-close" onClick={() => setZoom(false)} aria-label="닫기">
                ×
              </button>
            </div>
            <SeatPickGrid
              headLead={<span className="reward-zoom-lead" aria-hidden="true" />}
              /* 크게 보기도 같은 방향으로 — 한 자리표가 두 얼굴이면 안 됩니다 */
              flipped={teacherView}
              seats={seats}
              byUid={byUid}
              raisedUids={raisedUids}
              raisedCount={raisedCount}
              onPick={setToolsFor}
              onDragStart={setDragIndex}
              onDragEnd={() => setDragIndex(null)}
              onDropTo={(toIndex) => moveSeat(dragIndex, toIndex)}
              topUids={topRewardUids}
              todayCountByUid={todayCountByUid}
              presentUids={presentUids}
            />
          </div>
        </div>
      )}

      {/* 궁금한 순간 — 반 전체 과일 집계. 자리표(오늘)와 모둠 현황(구성)
          사이에 둡니다. 셋 다 '이 반을 어떻게 보고 있나'의 다른 면이고,
          이것만 누적을 다루므로 평소엔 접어 둡니다. */}
      <RewardTally classId={classId} roster={roster} />

      {/* 모둠 현황 — 학생을 카드(칩)로 드래그하거나, 짚은 뒤 모둠을 눌러서
          바로 옮길 수 있습니다. 모둠을 새로 만들거나 이름·색 수정은 여전히
          '반 관리하기 → 자리 배정하기'에서 합니다. */}
      {groups.length > 0 && (
        <div className="reward-groups">
          <div className="reward-groups-head">
            <strong className="reward-groups-title">모둠 현황</strong>
            <div className="reward-groups-count-btns">
              <button
                type="button"
                className="reward-groups-count-btn"
                onClick={removeGroup}
                disabled={groups.length <= MIN_GROUPS}
                title="모둠 하나 줄이기"
                aria-label="모둠 하나 줄이기"
              >
                −
              </button>
              <button
                type="button"
                className="reward-groups-count-btn"
                onClick={addGroup}
                disabled={groups.length >= MAX_GROUPS}
                title="모둠 하나 늘리기"
                aria-label="모둠 하나 늘리기"
              >
                ＋
              </button>
              <button
                type="button"
                className="reward-groups-sort-btn"
                onClick={sortGroupsByStudentId}
                title="모둠마다 학생을 학번순으로 정렬"
                aria-label="모둠마다 학생을 학번순으로 정렬"
              >
                🔢 정렬
              </button>
            </div>
          </div>
          {groups.map((g, i) => (
            <div
              key={g.id ?? g.index ?? i}
              className="reward-group-row"
              style={{ "--group-color": g.color || GROUP_COLORS[i % GROUP_COLORS.length] }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); if (dragUid) moveToGroup(dragUid, g.index); }}
              onClick={() => { if (pickedUid) moveToGroup(pickedUid, g.index); }}
            >
              <span className="reward-group-name">{g.name || `${g.index ?? i + 1}모둠`}</span>
              <span className="reward-group-members">
                {(g.members ?? []).length === 0 ? (
                  <em className="reward-group-empty">여기로 끌어 놓기</em>
                ) : (
                  g.members.map((m) => (
                    <button
                      key={m.uid}
                      type="button"
                      className="reward-chip"
                      draggable
                      onDragStart={(e) => { setDragUid(m.uid); e.dataTransfer.effectAllowed = "move"; }}
                      onDragEnd={() => setDragUid(null)}
                      onClick={(e) => { e.stopPropagation(); moveToGroup(m.uid, null); }}
                      title={`${m.name} — 눌러서 모둠에서 빼기`}
                    >
                      {m.name}
                    </button>
                  ))
                )}
              </span>
            </div>
          ))}

          {/* 미배정 — 아직 어느 모둠에도 없는 학생.
              모두 배정되면 '모두 배정됨'만 적힌 빈 칸이 남아 자리만 차지하므로
              감춥니다. 다만 이 칸은 **끌어다 놓아 모둠에서 빼는 자리**이기도
              해서, 학생을 끌고 있는 동안에는 비어 있어도 내놓습니다 —
              아예 없애면 끌던 손이 놓을 곳을 잃습니다.
              (모둠 안의 이름을 눌러서 빼는 길은 그대로입니다) */}
          {(ungrouped.length > 0 || dragUid) && (
          <div
            className="reward-group-row reward-group-row--unassigned"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); if (dragUid) moveToGroup(dragUid, null); }}
          >
            <span className="reward-group-name">미배정</span>
            <span className="reward-group-members">
              {ungrouped.length === 0 ? (
                <em className="reward-group-empty">여기로 끌어 놓으면 모둠에서 빠져요</em>
              ) : (
                ungrouped.map((s) => (
                  <button
                    key={s.uid}
                    type="button"
                    className={`reward-chip${pickedUid === s.uid ? " picked" : ""}`}
                    draggable
                    onDragStart={(e) => { setDragUid(s.uid); e.dataTransfer.effectAllowed = "move"; }}
                    onDragEnd={() => setDragUid(null)}
                    onClick={(e) => {
                      e.stopPropagation();
                      setPickedUid((v) => (v === s.uid ? null : s.uid));
                    }}
                    title={`${s.name} — 끌어서 모둠으로, 또는 짚은 뒤 모둠을 눌러 배정`}
                  >
                    {s.name}
                  </button>
                ))
              )}
            </span>
          </div>
          )}
        </div>
      )}

      {toolsStudent && (
        <StudentToolsModal
          student={toolsStudent}
          classId={classId}
          onAward={onAward}
          onOpenNotes={openNotes}
          onClose={() => setToolsFor(null)}
        />
      )}

      {notesFor && (
        <StudentNotesModal
          student={notesFor}
          onBack={() => { setNotesFor(null); setToolsFor(notesFor); }}
          classId={classId}
          onClose={() => setNotesFor(null)}
        />
      )}
      </div>
    </aside>
  );
}
