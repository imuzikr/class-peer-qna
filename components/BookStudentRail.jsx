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
// 칸의 네모(조각 바)는 오른쪽 '학생별 진행' 패널(EntryProgressPanel)의 것을
// **클래스째 그대로** 씁니다(`.dash-heat` · `.dash-heat-cell` ·
// `.entry-heat-cell--*` — 14칸 격자 · 15px · 틈 2px · 칸 이름 툴팁). 다 쓴
// 칸은 그 학생의 줄 색, 쓰는 중은 주황, 잠김은 빗금, 안 쓴 칸은 회색, 다
// 채우면 마지막 칸에 붉은 점. **이 자리에만 덧대는 CSS를 두지 마세요** —
// 한때 칸을 줄 폭에 늘여(flex) 그렸더니 오른쪽과 다른 모양이 되었습니다. 예전에는 왼쪽(초록 네모)과
// 오른쪽(줄 색 네모)에 같은 뜻의 조각 바가 두 벌 서 있어, 오른쪽 것을 이리로
// 옮기고 오른쪽 패널은 **모둠 활동일 때만** 둡니다(선생님 요청 — 그때는 왼쪽이
// 한 모둠으로 좁혀져도 오른쪽이 반 전체를 보여 줍니다).
//
// 줄 색은 **반 전체 차례**(allCards)로 매깁니다. 모둠으로 좁힌 목록의 차례로
// 매기면 같은 학생이 왼쪽과 오른쪽에서 다른 색이 됩니다.
// =============================================================
import { useMemo } from "react";
import { rowColor } from "@/lib/bookColors";

export default function BookStudentRail({
  cards = [],
  allCards = null,  // 줄 색을 매길 반 전체 목록(없으면 cards)
  pickedUid = null,
  onPick,
  rows = [],        // 단계 정의 — 네모 하나가 한 단계
  cellState,        // (row, answers) => 'done' | 'doing' | 'empty' | 'locked'
  castUid = null,   // 지금 방송 중인 학생 (빨간 점)
  meta,             // (card) => 카드 아래 한 줄 (예: '3 / 8칸 · 120자')
}) {
  const colorIdx = useMemo(
    () => new Map((allCards ?? cards).map((c, i) => [c.uid, i])),
    [allCards, cards]
  );
  const total = rows.length;

  return (
    <aside className="book-group-rail" aria-label="학생 목록">
      {cards.map((c) => {
        const answers = c.entry?.answers ?? {};
        const on = c.uid === pickedUid;
        const color = rowColor(colorIdx.get(c.uid) ?? 0);
        const states = rows.map((row) => cellState(row, answers));
        const full = total > 0 && states.every((st) => st === "done");
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
            {/* 카드 전체가 이미 '그 학생 열기' 단추라 네모 줄은 span입니다
                (단추 안의 단추를 피함) — 누르면 오른쪽 패널의 네모와 같은 일. */}
            <span className="dash-heat entry-heat">
              {rows.map((row, i) => (
                <i
                  key={row.key}
                  className={`dash-heat-cell entry-heat-cell entry-heat-cell--${states[i]}${
                    full && i === total - 1 ? " is-done" : ""
                  }`}
                  style={states[i] === "done" ? { background: color.border } : undefined}
                  title={row.label}
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
