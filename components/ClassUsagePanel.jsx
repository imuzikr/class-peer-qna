"use client";

// =============================================================
// 반별 현황 — 수업 관리 창의 오른쪽 열 (수업 탭 · 프로젝트 탭)
// -------------------------------------------------------------
// 두 탭이 **같은 조각 · 같은 폭**을 씁니다(.lesson-mgr-body의 둘째 칸).
// 탭을 바꿔도 왼쪽 목록과 오른쪽 열의 경계가 그 자리에 있어야, 같은 창에서
// 무엇이 바뀌었는지(내용)와 무엇이 그대로인지(틀)가 갈립니다.
//
// 셈은 lib/classUsage.js — 여기서는 그리기만 합니다.
// =============================================================
import { dateKeyLabel } from "@/lib/dates";
import { IconLockState } from "./StatusIcons";

export default function ClassUsagePanel({ mode, groups = [], currentClassId = null, onOpenBoard }) {
  const isLessons = mode === "lessons";
  return (
    <aside className="lesson-usage" aria-label="반별 현황">
      <div className="lesson-usage-head">
        <strong>반별 현황</strong>
        <span>{isLessons ? "어느 반에서 언제 했나" : "반마다 열어 둔 프로젝트"}</span>
      </div>
      <div className="lesson-usage-list">
        {groups.length === 0 ? (
          <p className="lesson-usage-empty">아직 맡은 반이 없어요.</p>
        ) : (
          groups.map((g) => (
            <section
              key={g.classId}
              className={`lesson-usage-class${g.classId === currentClassId ? " here" : ""}`}
            >
              <div className="lesson-usage-class-head">
                <span className="lesson-usage-class-name" title={g.name}>{g.name}</span>
                {g.classId === currentClassId && <em>지금 반</em>}
                <span className="lesson-usage-count">{g.rows.length}</span>
              </div>
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
            </section>
          ))
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
