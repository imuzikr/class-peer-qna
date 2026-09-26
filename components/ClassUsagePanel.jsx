"use client";

// =============================================================
// 반별 현황 — 수업 관리 창의 오른쪽 열 (수업 탭 · 프로젝트 탭)
// -------------------------------------------------------------
// 두 탭이 **같은 조각 · 같은 폭**을 씁니다(.lesson-mgr-body의 둘째 칸).
// 탭을 바꿔도 왼쪽 목록과 오른쪽 열의 경계가 그 자리에 있어야, 같은 창에서
// 무엇이 바뀌었는지(내용)와 무엇이 그대로인지(틀)가 갈립니다.
//
// 반마다 **접고 펴는 한 덩이**입니다. 수업·프로젝트가 쌓이면 반 여섯의 목록을
// 늘 다 펼쳐 두는 열은 한참 굴려야 옆 반에 닿습니다. 처음에는 **지금 반만**
// 펼치고, 접힌 반도 머리줄에서 개수(와 수업 탭이면 최근에 한 날)를 말합니다.
// 펼친 반은 창(LessonManagerModal)이 들고 있어 탭을 오가도 그대로입니다.
//
// 셈은 lib/classUsage.js — 여기서는 그리기만 합니다.
// =============================================================
import { dateKeyLabel } from "@/lib/dates";
import { IconLockState } from "./StatusIcons";

export default function ClassUsagePanel({
  mode,
  groups = [],
  currentClassId = null,
  onOpenBoard,
  openIds = new Set(),
  onToggle,
  onSetAll,
}) {
  const isLessons = mode === "lessons";
  const allOpen = groups.length > 0 && groups.every((g) => openIds.has(g.classId));
  return (
    <aside className="lesson-usage" aria-label="반별 현황">
      <div className="lesson-usage-head">
        <strong>반별 현황</strong>
        <span>{isLessons ? "어느 반에서 언제 했나" : "반마다 열어 둔 프로젝트"}</span>
        {groups.length > 1 && (
          <button
            type="button"
            className="lesson-usage-all"
            onClick={() => onSetAll?.(allOpen ? [] : groups.map((g) => g.classId))}
          >
            {allOpen ? "모두 접기" : "모두 펼치기"}
          </button>
        )}
      </div>
      <div className="lesson-usage-list">
        {groups.length === 0 ? (
          <p className="lesson-usage-empty">아직 맡은 반이 없어요.</p>
        ) : (
          groups.map((g) => {
            const open = openIds.has(g.classId);
            const here = g.classId === currentClassId;
            // 접힌 반의 머리줄 요약 — 수업 탭은 가장 최근에 한 날(행이 최근순이라
            // 첫 줄의 lastDay가 곧 그 반의 마지막 수업), 프로젝트 탭은 개수로 충분.
            const last = isLessons ? g.rows.find((r) => r.lastDay)?.lastDay ?? null : null;
            const bodyId = `usage-${mode}-${g.classId}`;
            return (
              <section
                key={g.classId}
                className={`lesson-usage-class${here ? " here" : ""}${open ? " open" : ""}`}
              >
                <button
                  type="button"
                  className="lesson-usage-class-head"
                  aria-expanded={open}
                  aria-controls={bodyId}
                  onClick={() => onToggle?.(g.classId)}
                >
                  {/* 글자(▸)는 기기 글꼴에 따라 점처럼 작아져 선으로 그립니다 */}
                  <svg className="lesson-usage-caret" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
                    <path d="M4.5 2.5 8 6l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="lesson-usage-class-name" title={g.name}>{g.name}</span>
                  {here && <em>지금 반</em>}
                  {!open && last && (
                    <span className="lesson-usage-last">최근 {dateKeyLabel(last)}</span>
                  )}
                  <span className="lesson-usage-count">{g.rows.length}</span>
                </button>
                {open && (
                  <div id={bodyId}>
                    {g.rows.length === 0 ? (
                      <p className="lesson-usage-empty">
                        {isLessons ? "아직 기록된 수업이 없어요" : "열어 둔 프로젝트가 없어요"}
                      </p>
                    ) : isLessons ? (
                      <ul>
                        {g.rows.map((r) => (
                          <li key={r.lessonId} className="lesson-usage-row">
                            <span className="lesson-usage-title" title={r.title}>{r.title}</span>
                            <span className="lesson-usage-meta">
                              {r.lastDay ? (
                                <>
                                  {dateKeyLabel(r.lastDay)}
                                  {r.days.length > 1 && <b> · {r.days.length}회</b>}
                                </>
                              ) : (
                                "준비됨"
                              )}
                            </span>
                            {r.boardTitle && (
                              <span className="lesson-usage-sub" title={r.boardTitle}>
                                ↳ {r.boardTitle}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <ul>
                        {g.rows.map((r) => (
                          <li key={r.boardId}>
                            <button
                              type="button"
                              className="lesson-usage-row is-button"
                              onClick={() => onOpenBoard?.(r.boardId)}
                              title={`‘${r.title}’ 열기`}
                            >
                              <span className="lesson-usage-title">{r.title}</span>
                              <span className={`lesson-usage-meta${r.locked ? " locked" : ""}`}>
                                <IconLockState locked={r.locked} size={13} />
                                {r.locked
                                  ? "잠김"
                                  : r.totalActs > 0
                                    ? `활동 ${r.openActs}/${r.totalActs}`
                                    : "활동 없음"}
                              </span>
                              {!r.fromTemplate && <span className="lesson-usage-sub">원본 없는 프로젝트</span>}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </section>
            );
          })
        )}
      </div>
      {/* 기록은 이 열이 생길 때부터 쌓입니다 — 그 전에 한 수업은 '준비됨'
          (프로젝트를 연결해 둔 자료)으로만 보입니다. 모르면 기록이 빠진
          것으로 읽혀 한 번 적어 둡니다. */}
      {isLessons && (
        <p className="lesson-usage-note">수업한 날은 ‘수업 시작하기’를 누른 날부터 쌓입니다.</p>
      )}
    </aside>
  );
}
