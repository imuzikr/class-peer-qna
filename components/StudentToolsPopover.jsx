"use client";

// =============================================================
// 자리를 누르면 그 옆에 뜨는 작은 창 — 과일 주기 / 누가기록 열기
// -------------------------------------------------------------
// 자리표를 쓰는 네 화면이 같은 것을 씁니다: 참여 전광판(AttendanceBoard) ·
// 손들기 자리 확인(QuestionSeatModal) · 수업 중 자리표(LessonSeatPanel) ·
// '멋진 순간' 패널(StudyRewardPanel). 네 곳에서 자리를 누르는 동작이
// 똑같아야 해서 컴포넌트를 공유합니다.
//
// [모달이 아니라 팝오버입니다]
// 예전에는 화면 한가운데 모달이 떠 자리표를 통째로 덮었습니다. 과일을 주는
// 일은 대개 여러 학생에게 잇달아 하는 일인데, 그때마다 자리표가 가려졌다
// 돌아오고 **누구 옆자리를 누르려던 것인지** 화면에서 사라졌습니다. 지금은
// 누른 자리 옆에 붙어 뜨고, 다른 자리를 누르면 그 자리로 옮겨 갑니다
// (바깥을 누르거나 Esc·×로 닫힙니다).
//
// 자리 잡기와 닫기는 `lib/popover.js` 한 곳에 있습니다. `keep`으로 자리 칸을
// 걸러 두는 것이 중요합니다 — 안 그러면 옆자리를 누를 때 닫혔다 다시 열리며
// 한 번 깜빡입니다.
// =============================================================
import { useRef } from "react";
import { usePopoverAnchor, usePopoverDismiss } from "@/lib/popover";
import { REWARD_MAX } from "@/lib/store";
import StudentRewardTrend from "./StudentRewardTrend";
import { nextFruit, lastFruit } from "./RewardFruits";
import { IconMyPost } from "./StatusIcons";

const POP_W = 300;
const POP_H = 240;

// 자리 칸들 — 여기를 누른 것은 '바깥'이 아니라 **옆 학생으로 옮겨 가는 중**
// 입니다(`.attend-seat--pick`은 자리표의 칸, `.attend-desk--clickable`은
// 참여 전광판의 카드).
const SEATS = ".attend-seat--pick, .attend-desk--clickable";

// onAward(uid, 바꿀개수, delta) — 세 번째 값이 핵심입니다. 여기 보이는
// `count`는 **방금 누른 결과가 아직 안 돌아왔을 수 있는** 값이라, 그것으로
// 만든 절대값(count+1)을 그대로 보내면 빨리 두 번 누를 때 두 번째가 같은
// 값이 되어 조용히 묻힙니다. delta를 함께 주면 서버가 트랜잭션 안에서
// 지금 값에 더하므로 한 번도 안 묻힙니다.
//
// anchor: 누른 자리 칸(DOM 요소). 없으면 화면 한가운데 섭니다 — 누가기록을
// 보다가 '뒤로'로 돌아온 경우가 그렇습니다.
export default function StudentToolsPopover({
  student,
  classId = null,
  anchor = null,
  onAward,
  onOpenNotes,
  onClose,
}) {
  const count = student.count ?? 0;
  const maxed = count >= REWARD_MAX;
  const popRef = useRef(null);

  // 누른 자리를 따라다닙니다 — 자리표가 구르는 모달 안에 있을 때 창만
  // 제자리에 남으면 엉뚱한 자리를 가리킵니다.
  // 자리표가 '선생님 보기'로 180도 돌아 있어도 그대로 맞습니다 —
  // getBoundingClientRect()는 변형이 적용된 뒤의 자리를 돌려줍니다.
  const pos = usePopoverAnchor(anchor, { w: POP_W, h: POP_H });

  usePopoverDismiss(true, popRef, onClose, SEATS);

  return (
    <div
      ref={popRef}
      className="attend-tools-pop"
      style={{ left: pos.x, top: pos.y, maxHeight: pos.maxH }}
      role="dialog"
      aria-label={`${student.name} 과일 주기·누가기록`}
    >
      <div className="attend-tools-pop-head">
        {/* 이름만 줄어들며 말줄임으로 접힙니다 — 이모지·학번은 짧고 고정
            폭이라, 이름을 제 칸에 담지 않으면 긴 이름이 학번을 밀어냅니다. */}
        <strong>
          <span aria-hidden="true">{student.emoji ?? "🙂"}</span>
          <span className="attend-tools-pop-name">{student.name}</span>
          {student.studentId && (
            <span className="attend-tools-no">{student.studentId}</span>
          )}
        </strong>
        <button className="btn-close" onClick={onClose} aria-label="닫기">×</button>
      </div>

      <div className="attend-tools-cards">
        <section className="attend-tools-section">
          {/* 과일 받은 흐름 — 주는 버튼 바로 위. 지금 몇 개인지는 자리표에
              이미 적혀 있고, 주기 직전에 알고 싶은 건 '요즘 어떤가'라
              여기서 펼쳐 볼 수 있게 둡니다.
              기본은 접힘 — 이 화면이 전자칠판에 비칩니다. */}
          <StudentRewardTrend
            studentUid={student.uid}
            classId={classId}
            bare
            headRight={
              // 지금 누적 몇 개인지 — 버튼만 있으면 눌렸는지 알 수 없어
              // 누른 결과를 이 자리에서 바로 보여 줍니다.
              // key={count}로 값이 바뀔 때마다 다시 그려져 애니메이션이
              // 새로 돕니다(눌렀다는 신호). aria-live로 소리로도 알립니다.
              <span className="attend-tools-total" aria-live="polite">
                <span className="attend-tools-total-label">누적</span>
                <span className="attend-tools-total-n" key={count}>🍊 {count}</span>
              </span>
            }
          />

          {/* 주는 단추의 과일은 **다음에 붙을 과일**입니다(누적 옆은 그대로
              오렌지 — 거기는 '과일'이라는 말의 대표이지 특정 과일이 아닙니다).
              빼기 단추는 반대로 '방금 준 것'을 보여 줍니다. */}
          <div className="attend-tools-award">
            <button
              type="button"
              className="attend-award-btn attend-award-btn--minus"
              onClick={() => onAward(student.uid, count - 1, -1)}
              disabled={count <= 0}
              /* 왜 안 눌리는지 말해 줍니다 — 아무 설명 없이 꺼져 있으면
                 '고장'으로 읽힙니다(주는 단추가 가득 찼을 때와 같은 뜻). */
              title={count <= 0 ? "아직 받은 과일이 없어 뺄 것이 없어요" : "과일 하나 빼기"}
            >
              {lastFruit(count)} <span>-1</span>
            </button>
            <button
              type="button"
              className="attend-award-btn attend-award-btn--plus"
              onClick={() => onAward(student.uid, count + 1, +1)}
              disabled={maxed}
              title={maxed ? "과일이 가득 찼어요" : "과일 하나 주기"}
            >
              {nextFruit(count)} <span>+1</span>
            </button>
          </div>
          {maxed && <p className="attend-tools-maxed">과일이 가득 찼어요 (최대 {REWARD_MAX}개)</p>}
        </section>

        <button
          type="button"
          className="attend-tools-notes"
          onClick={() => onOpenNotes(student)}
        >
          <IconMyPost size={16} /> 누가기록 열기
        </button>
      </div>
    </div>
  );
}
