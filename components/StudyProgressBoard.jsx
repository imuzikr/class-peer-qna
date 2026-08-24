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
import { parseActivitySections, isActivityLocked } from "@/lib/activities";


// '썼다'고 볼 최소 길이 — 공백·문장부호를 포함한 글자 수.
// 한두 글자만 눌러 둔 것을 완료로 세지 않기 위한 기준입니다.
export const DONE_MIN_CHARS = 10;

// 학생 카드 한 장 → 활동별로 "충분히 썼는지" 여부 배열
// (stripHtml이 태그를 지우고 연속 공백을 하나로 줄인 뒤 앞뒤를 다듬으므로,
//  세는 값은 사람이 눈으로 읽는 글자 수와 같습니다)
//
// [제목으로 매칭하는 이유]
// 활동은 교사가 수업 준비에서 언제든 추가·삭제·순서 변경할 수 있습니다.
// 카드에는 활동별 섹션이 작성 당시 순서 그대로 저장돼 있으므로, 그 뒤에
// 교사가 중간 활동을 지우거나 순서를 바꾸면 몇 번째 섹션인지(위치)가
// board.activities의 현재 순서와 어긋납니다 — 그대로 위치로만 대조하면
// 학생이 분명히 쓴 활동도 다른 활동 칸의 내용으로 잘못 읽혀 '작성 전'으로
// 보일 수 있습니다. 섹션에는 저장 당시 활동 이름(title)이 함께 있으므로
// 이름으로 먼저 찾고, **제목 자체가 없는 옛 카드(제목 태그가 생기기 전에
// 저장된 카드)만** 위치로 대체합니다. 제목이 있는데 못 찾은 경우(활동 이름이
// 바뀌었거나 그 활동이 삭제됨)는 다른 활동의 위치로 잘못 대조되지 않도록
// 위치 대체를 하지 않습니다 — 그 섹션 내용은 hasOrphanedContent()가 따로
// 잡아냅니다.
export function cardProgress(card, activities) {
  const secs = card ? parseActivitySections(card.content) : [];
  const hasAnyTitledSection = secs.some((s) => s.title);
  return activities.map((name, i) => {
    const sec =
      secs.find((s) => s.title === name) ??
      (hasAnyTitledSection ? undefined : secs[i]);
    return stripHtml(sec?.content ?? "").length >= DONE_MIN_CHARS;
  });
}

// 카드가 '활동 틀'(div.activity-section)로 저장돼 있는지.
// -------------------------------------------------------------
// 활동이 생기기 전에 쓴 자유형 카드, 또는 저장 과정에서 틀이 사라진 카드는
// 활동별로 나눌 수가 없어 parseActivitySections가 빈 배열을 돌려줍니다.
// 예전에는 이때 활동 칸이 전부 '작성 전'으로 칠해져서, 학생이 분명히 제출한
// 카드가 교사 화면에서는 통째로 미제출처럼 보였습니다. 그래서 '제출은 했는데
// 활동별로 나눌 수 없는 상태'를 따로 구분합니다.
export function hasActivityStructure(card) {
  return card ? parseActivitySections(card.content).length > 0 : false;
}

// 카드 안에 '현재 활동 목록 어디에도 매칭되지 않는' 섹션이 있고, 거기에
// 학생이 실제로 쓴 내용(10자 이상)이 남아 있는지.
// -------------------------------------------------------------
// 교사가 활동 이름을 바꾸거나 활동 수를 줄이면, 학생이 예전 활동 이름으로
// 써 둔 섹션은 cardProgress()에서 더는 어느 칸에도 대응되지 않습니다(위의
// 이유로 위치 대체도 하지 않음). 그 내용을 그냥 '작성 전'으로 보여 주면
// 학생이 아무것도 안 쓴 것처럼 보여 오해를 사므로, 그런 섹션이 있으면
// '제출함(활동 구분 없음)'으로 알려 줍니다.
export function hasOrphanedContent(card, activities) {
  if (!card) return false;
  const secs = parseActivitySections(card.content);
  const known = new Set(activities);
  return secs.some((s) => {
    if (s.title && known.has(s.title)) return false; // 현재 활동과 정상 매칭됨
    return stripHtml(s.content ?? "").length >= DONE_MIN_CHARS;
  });
}

// 학생이 이 보드에 무언가를 제출했는지 — 글자·그림·첨부 중 하나라도 있으면 제출.
// (활동 틀 유무와 무관하게 카드 자체를 봅니다)
export function cardSubmitted(card) {
  if (!card) return false;
  return (
    stripHtml(card.content ?? "").length > 0 ||
    !!card.imageUrl ||
    (card.attachments?.length ?? 0) > 0
  );
}

// 칸 하나의 상태 — 색으로 구분합니다.
//   done   연한 초록 : 10자 이상 썼음 (잠겼더라도 쓴 건 쓴 것)
//   free   연한 파랑 : 제출은 했는데 활동 틀이 아니라 활동별로 나눌 수 없음
//   open   연한 주황 : 열려 있는데 아직 덜 씀
//   locked 회색     : 아직 열어 주지 않음
function cellState(done, locked, freeform) {
  if (done) return "done";
  // 자유형 카드는 '어느 활동을 썼는지'를 알 수 없을 뿐 제출은 한 것이므로,
  // 미작성(주황)이 아니라 별도 색으로 표시해 오해를 막습니다.
  if (freeform) return "free";
  return locked ? "locked" : "open";
}
const STATE_LABEL = {
  done: "작성함",
  free: "제출함(활동 구분 없음)",
  open: "작성 전",
  locked: "잠김",
};

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
    const submitted = cardSubmitted(card);
    return {
      ...s,
      done: cardProgress(card, activities),
      // 제출은 했지만 (1) 활동 틀이 없거나 (2) 활동 이름이 바뀌어/삭제돼
      // 실제로 쓴 내용이 지금 활동 칸 어디에도 대응되지 않는 카드
      freeform:
        submitted &&
        (!hasActivityStructure(card) || hasOrphanedContent(card, activities)),
    };
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
            {rows.some((r) => r.freeform) && (
              <span className="progress-legend-item">
                <i className="progress-mark progress-mark--free" /> 제출함(활동 구분 없음)
              </span>
            )}
          </div>
        )}

        {activities.length === 0 ? (
          <p className="lesson-note-empty">
            이 보드에는 아직 활동이 없어요. ‘수업준비 → 공부방 연동’에서 활동을 추가해 주세요.
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
                      const st = cellState(
                        r.done[i],
                        isActivityLocked(board, i),
                        r.freeform
                      );
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
