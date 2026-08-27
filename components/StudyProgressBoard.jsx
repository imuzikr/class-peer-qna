"use client";

// =============================================================
// 공부중 전광판 — 학생들이 활동을 채워 가는 상황을 한눈에
// -------------------------------------------------------------
// 왼쪽에 학생 명단, 오른쪽에 활동 수만큼 칸이 생기고, 칸 색으로
// 그 학생이 그 활동을 썼는지 보여 줍니다.
//
//   초록 — 내용을 썼음
//   회색 — 아직 비어 있음
//   자물쇠 — 잠긴 활동(아직 열어 주지 않음)
//
// 활동 머리마다 자물쇠 버튼이 있어 교사가 활동을 하나씩 열어 줍니다.
// 잠긴 활동은 학생 카드에서 입력칸 대신 안내문이 보입니다.
//
// [잠금이 막는 범위]
// 카드 내용은 활동 여러 개가 한 덩어리 HTML로 저장되므로 보안 규칙이
// '몇 번째 활동이 바뀌었는지'를 알 수 없습니다. 그래서 활동별 잠금은
// 화면에서 입력을 막는 수업 진행 도구이지, 서버가 강제하는 권한이
// 아닙니다(보드 전체 잠금은 규칙으로도 막힙니다).
// =============================================================
import { backdropClose } from "@/lib/modal";
import { stripHtml } from "@/lib/html";
import {
  matchActivitySections,
  isActivityLocked,
  DONE_MIN_CHARS,
} from "@/lib/activities";

// 판정 기준은 lib/activities.js에 있습니다(학생 카드 안내와 같은 값을 쓰려고).
// 여기서 다시 내보내는 건 이 파일에서 가져다 쓰던 기존 코드를 위해서입니다.
export { DONE_MIN_CHARS };

// 학생 카드 한 장 → 활동별로 "충분히 썼는지" 여부 배열
// (stripHtml이 태그를 지우고 연속 공백을 하나로 줄인 뒤 앞뒤를 다듬으므로,
//  세는 값은 사람이 눈으로 읽는 글자 수와 같습니다)
//
// [왜 두 단계로 짝짓는가]
// 활동은 교사가 수업 준비에서 언제든 이름을 바꾸거나 추가·삭제할 수 있는데,
// 학생 카드에는 '작성 당시의 활동 이름'이 섹션 제목으로 박혀 저장됩니다.
// 그래서 수업 도중 교사가 활동 제목을 고치면, 이미 낸 답의 섹션 제목이
// 현재 활동 이름과 달라집니다. 이때
//   · 제목으로만 찾으면  → 짝을 못 찾아 '작성 전'으로 보이고
//   · 위치로만 대조하면  → 활동 수가 줄어든 경우 엉뚱한(빈) 섹션을 집어
//                          역시 '작성 전'으로 보입니다
// 실제로 이 두 경우 모두 "학생은 분명히 냈는데 미제출로 표시"되는 신고로
// 이어졌습니다. 그래서 제목이 같은 것을 먼저 확정해 두고(1단계), 남은
// 활동에는 아직 짝이 없으면서 '내용이 있는' 섹션을 순서대로 이어 붙입니다
// (2단계). 이름이 바뀌었어도 학생이 쓴 내용은 그대로 살아남습니다.
export function cardProgress(card, activities) {
  const paired = matchActivitySections(card, activities);
  return paired.map(
    (sec) => stripHtml(sec?.content ?? "").length >= DONE_MIN_CHARS
  );
}

// 칸 하나의 상태 — 색으로 구분합니다.
//   done   연한 초록 : 10자 이상 썼음 (잠겼더라도 쓴 건 쓴 것)
//   open   연한 주황 : 열려 있는데 아직 덜 씀
//   locked 회색     : 아직 열어 주지 않음
function cellState(done, locked) {
  if (done) return "done";
  return locked ? "locked" : "open";
}
const STATE_LABEL = { done: "작성함", open: "작성 전", locked: "잠김" };

export default function StudyProgressBoard({
  board,
  roster = [],
  cards = [],
  onClose,
}) {
  const activities = board?.activities ?? [];
  const isGroup = board?.activityType === "group";

  // 학생별 진행 상황 (카드가 아직 없으면 전부 미작성)
  // 모둠 보드는 카드 한 장을 모둠원 여럿이 공유하므로 memberUids로 찾음
  const rows = roster.map((s) => {
    const card = cards.find((c) =>
      isGroup ? c.memberUids?.includes(s.uid) : c.authorId === s.uid
    );
    return { ...s, done: cardProgress(card, activities) };
  });

  // 활동별 작성 인원
  const doneCounts = activities.map(
    (_, i) => rows.filter((r) => r.done[i]).length
  );

  return (
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      <div
        className="modal progress-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="progress-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3 id="progress-title">
            공부중 전광판
            {board?.title && <span className="progress-board-name">· {board.title}</span>}
          </h3>
          <button className="btn-close" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        {activities.length > 0 && roster.length > 0 && (
          <div className="progress-legend">
            <span className="progress-legend-item">
              <i className="progress-mark progress-mark--done" /> 작성함({DONE_MIN_CHARS}자 이상)
            </span>
            <span className="progress-legend-item">
              <i className="progress-mark progress-mark--open" /> 작성 전
            </span>
            <span className="progress-legend-item">
              <i className="progress-mark progress-mark--locked" /> 잠김
            </span>
          </div>
        )}

        {activities.length === 0 ? (
          <p className="lesson-note-empty">
            이 보드에는 아직 활동이 없어요. ‘수업관리 → 공부방 연동’에서 활동을 추가해 주세요.
          </p>
        ) : roster.length === 0 ? (
          <p className="lesson-note-empty">
            이 반에 입장한 학생이 없어요. 입장 코드를 알려 주세요.
          </p>
        ) : (
          <div className="progress-scroll">
            <table className="progress-table">
              <thead>
                <tr>
                  <th className="progress-name-col">학생</th>
                  {activities.map((act, i) => {
                    const locked = isActivityLocked(board, i);
                    return (
                      <th key={i} className="progress-act-col">
                        <span className="progress-act-no">활동 {i + 1}</span>
                        <span className="progress-act-name" title={act}>{act}</span>
                        {/* 잠금 조작은 수업 화면의 '활동 열기' 줄에서 합니다.
                            여기서는 지금 열려 있는지만 알려 줍니다. */}
                        <span className={`progress-act-state${locked ? " locked" : ""}`}>
                          {locked ? "잠김" : "열림"}
                        </span>
                        <span className="progress-act-count">
                          {doneCounts[i]}/{roster.length}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.uid}>
                    <th className="progress-name-col" scope="row">
                      {r.studentId && (
                        <span className="progress-student-no">{r.studentId}</span>
                      )}
                      <span className="progress-student-name">{r.name}</span>
                    </th>
                    {activities.map((act, i) => {
                      const st = cellState(r.done[i], isActivityLocked(board, i));
                      return (
                        <td
                          key={i}
                          className="progress-cell"
                          title={`${r.name} · 활동 ${i + 1} ${act} — ${STATE_LABEL[st]}`}
                        >
                          <span
                            className={`progress-mark progress-mark--${st}`}
                            role="img"
                            aria-label={STATE_LABEL[st]}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
