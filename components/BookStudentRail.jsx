"use client";

// =============================================================
// 왼쪽 학생 목록 — 곁텍스트 · RAFT · KWLS 교사 화면 공용
// -------------------------------------------------------------
// 닿소리 채우기의 왼쪽 모둠/학생 목록(`BookGroupBoard`의 `.book-group-rail`)과
// **같은 것**입니다. CSS도 그대로 씁니다 — 네 활동의 교사 화면이 서로 다른
// 모양이면 교사가 화면마다 다시 익혀야 합니다.
//
// 예전에는 이 세 화면이 학생 카드를 **가로 격자**로 깔고, 카드를 누르면
// 화면이 통째로 그 학생의 상세로 바뀌었습니다. 그래서
//   · 다른 학생으로 옮기려면 '← 학생 목록'으로 나갔다 다시 들어가야 했고
//   · 상세를 보는 동안 반의 진행 상황이 화면에서 사라졌습니다.
// 목록을 왼쪽에 세워 두면 옆 학생으로 바로 건너뛰고, 오른쪽 진행 패널이
// 계속 남습니다.
//
// 칸의 네모(marks)는 학생 카드에 있던 것을 그대로 옮긴 것입니다 —
// 곁텍스트 여덟 · RAFT 다섯 · KWLS 넷.
// =============================================================
export default function BookStudentRail({
  cards = [],
  pickedUid = null,
  onPick,
  rows = [],        // 단계 정의 — 네모 하나가 한 단계
  cellState,        // (row, answers) => 'done' | 'doing' | 'empty' | 'locked'
  castUid = null,   // 지금 방송 중인 학생 (빨간 점)
  meta,             // (card) => 카드 아래 한 줄 (예: '3 / 8칸 · 120자')
}) {
  return (
    <aside className="book-group-rail" aria-label="학생 목록">
      {cards.map((c) => {
        const answers = c.entry?.answers ?? {};
        const on = c.uid === pickedUid;
        return (
          <button
            key={c.uid}
            type="button"
            className={`book-rail-card book-rail-card--student${on ? " on" : ""}`}
            onClick={() => onPick?.(c.uid)}
            aria-pressed={on}
          >
            <span className="book-rail-head">
              <strong>{c.name}</strong>
              {castUid === c.uid && (
                <span className="broadcast-live-dot" aria-hidden="true" />
              )}
              {c.studentId && <span className="book-rail-members">{c.studentId}</span>}
            </span>
            {/* 학생이 스스로 적은 도서명 — 활동에 주제어가 없을 때만 생깁니다.
                저마다 다른 책을 읽는 활동이라 누가 무엇을 읽는지가 목록에서
                보여야 합니다(이미 받아 온 기록에 들어 있어 읽기가 안 늡니다). */}
            {c.entry?.topic && (
              <span className="book-rail-topic">{c.entry.topic}</span>
            )}
            <span className="book-rail-marks">
              {rows.map((row) => (
                <i
                  key={row.key}
                  className={`paratext-mark ${cellState(row, answers)}`}
                  title={`${row.letter ? `${row.letter} · ` : ""}${row.label}`}
                />
              ))}
            </span>
            {meta && <span className="book-rail-meta">{meta(c)}</span>}
          </button>
        );
      })}
    </aside>
  );
}
