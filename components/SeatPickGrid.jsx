"use client";

// =============================================================
// 자리표 — 칸 하나(SeatCell)와 판(SeatPickGrid)
// -------------------------------------------------------------
// 참여 전광판 · '멋진 순간' 패널 · 수업 중 자리표 · 돌발 퀴즈 관리 창이 같은
// 자리표를 씁니다. 한때 손들기 자리 확인 창(QuestionSeatModal) 안에 있었는데,
// 손들기를 걷으며(돌발 퀴즈로 바꿈) 제 파일로 옮겼습니다.
// =============================================================
import SeatGrid from "./SeatGrid";
import { seatOrder } from "@/lib/seats";
import { IconQuizMemo } from "./StatusIcons";

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
// headTrail: 머리줄 **끝**에 넣을 것(보기 방향 단추).
// quizStateByUid: 돌발 퀴즈 관리 창 — uid → 'memo'(보냄 · 확인 전) | 'done'(과일
// 받음). 메모지 그림 · 초록 바탕으로 그립니다(lib/popQuiz.js의 seatQuizState).

// 자리 칸 하나 — 자리표(SeatPickGrid)와 모둠 보기가 똑같은 모양을 쓰도록
// 최상위로 빼 두었습니다(각자 그리면 출석 색·퀴즈 표시·과일 배지 규칙이
// 두 곳에서 갈라집니다). 최상위에 두는 또 다른 이유는 AttendanceBoard의
// StudentCard와 같습니다 — 컴포넌트 안에 중첩 정의하면 부모가 리렌더될 때
// DOM이 통째로 교체돼 진행 중이던 드래그가 끊깁니다.
export function SeatCell({
  student, top = false, att = "unchecked", live = null,
  // 돌발 퀴즈 — 'memo'(보냄 · 확인 전) | 'done'(과일 받음) | null
  quiz = null,
  // 누르면 무엇을 하나(툴팁 끝) — 돌발 퀴즈 창은 '답 보기'입니다.
  action = "과일 주기·누가기록",
  noting = false, todayCount = 0,
  // 과일 바구니 이벤트에서 고른 것("entered" | "declined") — 선생님이 아직
  // 접수하지 않았을 때만 넘어옵니다(오른쪽 위 초록 점).
  eventChoice = null,
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
      className={`attend-seat attend-seat--pick attend-seat--${att}${quiz === "done" ? " attend-seat--quizdone" : ""}${top ? " attend-seat--top" : ""}${eventChoice ? " attend-seat--event" : ""}`}
      /* 누른 칸(e.currentTarget)을 함께 넘깁니다 — 과일·누가기록 창이 모달이
         아니라 **이 자리 옆에 붙는 팝오버**라, 어디에 뜰지 정하려면 누른
         칸이 어디인지 알아야 합니다. */
      onClick={(e) => onPick?.(s, e.currentTarget)}
      title={`${s.name}${s.studentId ? ` · ${s.studentId}` : ""}${attLabel}${liveLabel}${notingLabel}${quiz === "memo" ? " · 퀴즈 답 보냄" : quiz === "done" ? " · 퀴즈 과일 받음" : ""}${todayCount > 0 ? ` · 오늘 과일 ${todayCount}개` : ""}${top ? " · 오늘 과일 1등" : ""}${eventChoice === "entered" ? " · 이벤트 응모(접수 전)" : eventChoice === "declined" ? " · 이벤트 응모 안 함(접수 전)" : ""} — 눌러서 ${action}${draggable ? ", 끌어서 자리 이동" : ""}`}
      draggable={draggable}
      onDragStart={draggable ? (e) => { onDragStart(index); e.dataTransfer.effectAllowed = "move"; } : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
      onDragOver={draggable ? (e) => e.preventDefault() : undefined}
      onDrop={draggable ? (e) => { e.preventDefault(); onDropTo(index); } : undefined}
    >
      {eventChoice && (
        <span
          className="attend-seat-event"
          aria-label={eventChoice === "entered" ? "이벤트 응모" : "이벤트 응모 안 함"}
        />
      )}
      {quiz === "memo" && (
        <span className="attend-seat-quiz" aria-label="퀴즈 답 보냄">
          <IconQuizMemo size={15} />
        </span>
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
  seats, byUid, onPick, compact = false,
  onDragStart, onDragEnd, onDropTo, topUids = null, presentUids = null,
  liveState = null, notingUids = null, headLead = null, todayCountByUid = null,
  // 과일 바구니 이벤트 — uid → "entered" | "declined"(접수 전인 학생만)
  eventChoiceByUid = null,
  // 머리줄 끝에 끼우는 것 — 지금은 보기 방향 단추가 여기 섭니다. 패널·확대
  // 창의 그것과 같은 자리라, 같은 단추를 화면마다 다른 데서 찾지 않아도
  // 됩니다(`headLead`는 줄 맨 앞입니다).
  headTrail = null,
  // 돌발 퀴즈 — uid → 'memo' | 'done'(위 머리 주석)
  quizStateByUid = null,
  // 자리 칸 툴팁의 '눌러서 …' — 돌발 퀴즈 창은 '답 보기'
  action = "과일 주기·누가기록",
  // 머리줄 안내 — 안 주면 과일·누가기록 안내
  hint = "자리를 누르면 과일·누가기록을 열 수 있어요",
  // 선생님 자리에서 본 배치 — 자리 번호를 거꾸로 세워 그립니다(`seatOrder`).
  // 번호 자체는 그대로 넘기므로 빈 칸은 제자리를 지키고, 끌어 옮기기·자리
  // 누르기도 같은 번호를 씁니다. 예전처럼 CSS로 그림을 돌리면 글자가
  // 흐려졌습니다(lib/seats.js).
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
        {/* 칠판이 서던 자리는 비워 둡니다 — `flex: 1`로 남는 폭을 받아 끝의
            단추(headTrail)를 오른쪽 끝으로 밀어내는 칸이라, 빼 버리면 단추가
            줄 가운데로 들어옵니다. */}
        {headLead ?? <span className="attend-seatmap-gap" />}
        {!compact && (
          <span className="attend-seatmap-hint">{hint}</span>
        )}
        {headTrail}
      </div>
      <SeatGrid className="attend-seatmap-grid">
        {seatOrder(seats.length, flipped).map((i, pos) => {
          if (i == null) return <div key={`pad-${pos}`} className="attend-seat-pad" aria-hidden="true" />;
          const uid = seats[i];
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
              quiz={quizStateByUid?.get(s.uid) ?? null}
              action={action}
              top={!!topUids?.has(s.uid)}
              att={attStateOf(s.uid, presentUids)}
              live={liveState?.get(s.uid) ?? null}
              noting={!!notingUids?.has(s.uid)}
              todayCount={todayCountByUid?.get(s.uid) ?? 0}
              eventChoice={eventChoiceByUid?.get(s.uid) ?? null}
              onPick={onPick}
              draggable={draggable}
              index={i}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDropTo={onDropTo}
            />
          );
        })}
      </SeatGrid>
    </div>
  );
}

