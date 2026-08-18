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

// 학생 카드 한 장 → 활동별로 "썼는지" 여부 배열
export function cardProgress(card, activityCount) {
  const secs = card ? parseActivitySections(card.content) : [];
  return Array.from({ length: activityCount }, (_, i) =>
    stripHtml(secs[i]?.content ?? "").trim().length > 0
  );
}

export default function StudyProgressBoard({
  board,
  roster = [],
  cards = [],
  onToggleLock,
  busy = false,
  error = "",
  onClose,
}) {
  const activities = board?.activities ?? [];

  // 학생별 진행 상황 (카드가 아직 없으면 전부 미작성)
  const rows = roster.map((s) => {
    const card = cards.find((c) => c.authorId === s.uid);
    return { ...s, done: cardProgress(card, activities.length), hasCard: !!card };
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

        {error && <p className="form-error" role="alert">{error}</p>}

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
                        <button
                          type="button"
                          className={`progress-lock-btn${locked ? " locked" : ""}`}
                          onClick={() => onToggleLock?.(i, !locked)}
                          disabled={busy}
                          title={
                            locked
                              ? "잠금을 풀어 학생이 입력할 수 있게 합니다"
                              : "잠가서 더 이상 입력하지 못하게 합니다"
                          }
                        >
                          {locked ? "🔒 잠김" : "🔓 열림"}
                        </button>
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
                    {activities.map((act, i) => (
                      <td
                        key={i}
                        className={`progress-cell progress-cell--${
                          r.done[i] ? "done" : isActivityLocked(board, i) ? "locked" : "todo"
                        }`}
                        title={`${r.name} · 활동 ${i + 1} ${act} — ${
                          r.done[i] ? "작성함" : "아직 비어 있음"
                        }`}
                      >
                        {r.done[i] ? "✓" : isActivityLocked(board, i) ? "🔒" : ""}
                      </td>
                    ))}
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
