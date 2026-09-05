"use client";

// =============================================================
// 오른쪽 '학생별 진행' 패널 — 곁텍스트 · RAFT · KWLS 교사 화면 공용
// -------------------------------------------------------------
// 닿소리 채우기의 오른쪽 패널(`BookGroupBoard`의 `GroupProgress`)과 **같은
// 생김새**입니다. CSS도 그대로 씁니다(`.dash-side`·`.dash-progress-*`·
// `.dash-heat*`) — 네 활동의 교사 화면이 서로 다른 모양이면 교사가 화면마다
// 다시 익혀야 합니다.
//
// 한 줄이 학생 한 명입니다: 학번·이름 · `n/N칸` · 막대 · 단계별 네모.
// 줄을 누르면 가운데가 그 학생의 화면으로 바뀝니다(왼쪽 목록과 같은 일).
//
// [읽는 문서가 늘지 않습니다] 보드가 이미 구독해 둔 `entries`를 그대로
// 받습니다 — 닿소리 패널은 판마다 낱말을 따로 구독해야 했지만, 이쪽은 학생
// 한 명이 문서 한 장이라 셀 것이 이미 손에 있습니다.
//
// [색은 줄 번호로] 닿소리의 개별 활동과 같습니다(`ROW_COLORS` 10색 되풀이).
// 여기 학생들은 모둠 안 자리가 없어 '모둠 색'을 쓸 수 없고, 붙어 있는 줄끼리만
// 달라도 목록을 훑는 데 충분합니다.
// =============================================================
import { useMemo } from "react";
import { barTint, rowColor } from "@/lib/bookColors";

export default function EntryProgressPanel({
  title = "학생별 진행",
  cards = [],
  rows = [],      // 단계 정의
  cellState,      // (row, answers) => 'done' | 'doing' | 'empty' | 'locked'
  pickedUid = null,
  onPick = null,
  extra = null,   // 줄 오른쪽 끝에 덧붙일 것 (예: '· 글 120자')
}) {
  const total = rows.length;

  const list = useMemo(
    () =>
      cards.map((c, i) => {
        const answers = c.entry?.answers ?? {};
        const states = rows.map((r) => cellState(r, answers));
        return {
          ...c,
          states,
          // '다 씀'만 셉니다 — '쓰는 중'까지 세면 한 글자 쓴 칸이 다 쓴 칸과
          // 같아져, 진행률이 실제보다 앞서 보입니다.
          filled: states.filter((s) => s === "done").length,
          color: rowColor(i),
        };
      }),
    [cards, rows, cellState]
  );

  const doneCount = list.filter((m) => m.filled >= total && total > 0).length;

  return (
    <aside className="dash-side book-group-progress" aria-label={title}>
      <h3>
        {title}
        {list.length > 0 && (
          <b
            className="book-progress-done"
            title={`${total}칸을 다 채운 학생 ${doneCount}명 / ${list.length}명`}
          >
            다 채움 {doneCount} / {list.length}
          </b>
        )}
      </h3>
      {list.length === 0 ? (
        <p className="dash-side-empty">아직 이 반에 들어온 학생이 없어요.</p>
      ) : (
        <ul className="dash-progress-list">
          {list.map((m) => (
            <li key={m.uid} className={m.uid === pickedUid ? "is-picked" : ""}>
              <span className="dash-progress-name">
                <i className="dash-dot" style={{ background: m.color.border }} />
                {m.studentId && <em className="dash-progress-sid">{m.studentId}</em>}
                <span className="dash-progress-who">{m.name}</span>
              </span>
              <span className="dash-progress-num">
                {m.filled}/{total}칸
                {extra && <span className="dash-progress-words">{extra(m)}</span>}
              </span>
              <span className="dash-progress-bar">
                <b
                  style={{
                    width: total > 0 ? `${(m.filled / total) * 100}%` : 0,
                    background: barTint(m.color.border),
                  }}
                />
              </span>
              {/* 네모를 누르면 그 학생 화면으로 — 왼쪽 목록과 같은 일입니다.
                  줄 전체를 버튼으로 만들면 이름·숫자·막대까지 눌리는 것처럼
                  보여, 실제로 누르는 자리인 네모 줄만 버튼입니다. */}
              <button
                type="button"
                className="dash-heat entry-heat"
                onClick={() => onPick?.(m.uid)}
                title={`${m.name} 화면 열기`}
              >
                {m.states.map((st, i) => (
                  <i
                    key={rows[i].key}
                    className={`dash-heat-cell entry-heat-cell entry-heat-cell--${st}${
                      m.filled >= total && i === total - 1 ? " is-done" : ""
                    }`}
                    style={st === "done" ? { background: m.color.border } : undefined}
                    title={`${rows[i].label}`}
                  />
                ))}
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
