"use client";

// =============================================================
// 닿소리 잔디 — 세로 닿소리 14줄 × 가로 학생 (교사 전용)
// -------------------------------------------------------------
// '전체 보기'의 셋째 얼굴입니다(격자 · 낱말 구름 · 잔디). 격자와 구름이
// **무슨 낱말이 나왔나**를 보여 준다면, 여기는 **누가 어디까지 채웠나**만
// 봅니다 — 한 줄이 닿소리 하나, 한 칸이 학생 한 명입니다.
//
//   ㄱ  ■■□■■■□■…   12/26
//   ㄴ  ■□□■■□□■…    9/26
//
// [모달이 아니라 화면 안입니다]
// 공부방·책방의 전광판은 모달인데 이것은 탭 하나로 그 자리에 그려집니다.
// 낱말을 넣는 학생 화면과 나란히 띄워 두고 수업 내내 보는 자리라, 열고 닫는
// 동작이 끼면 그때마다 격자가 사라집니다.
//
// [칸 색은 둘뿐입니다 — 진하기를 쓰지 않습니다]
// 채웠으면 초록, 안 채웠으면 회색입니다(전광판의 '다 씀'·'시작 전'과 같은
// 값). 낱말 수를 진하기로 나타내 봤자 한 개 넣은 칸이 옅어 **안 채운 칸과
// 헷갈립니다** — '모둠원별 진행'의 14칸에서 이미 같은 이유로 진하기를
// 걷어 냈습니다. 몇 개 넣었는지는 칸에 마우스를 올리면 뜹니다.
// (같은 화면의 '모둠별 진행'은 그대로 진하기를 씁니다 — 거기서 묻는 것은
//  '어디에 얼마나 모였나'라 뜻이 다릅니다.)
//
// [읽는 문서가 늘지 않습니다]
// 대시보드가 이미 구독해 둔 모둠·낱말을 그대로 받아 셉니다.
// =============================================================
import { Fragment, useMemo, useState } from "react";
import { CONSONANT_LABELS, CELL_COUNT } from "@/lib/consonants";

export default function ConsonantGrassView({ students = [], onPickStudent = null }) {
  // 툴팁은 칸마다 두지 않고 하나를 옮겨 씁니다 — 칸이 14 × 반 인원이라
  // (스물여섯 명이면 364개) 저마다 달면 그만큼 요소가 늘어납니다.
  const [tip, setTip] = useState(null);

  // 줄마다 '채운 인원'. 이미 받아 둔 값으로 세므로 읽기가 늘지 않습니다.
  const doneCounts = useMemo(
    () =>
      Array.from(
        { length: CELL_COUNT },
        (_, i) => students.filter((s) => (s.counts?.[i] ?? 0) > 0).length
      ),
    [students]
  );

  // 다 채운 학생 수 — 머리말의 같은 값과 기준이 같아야 합니다(칸 기준).
  const doneStudents = useMemo(
    () => students.filter((s) => (s.counts ?? []).filter((n) => n > 0).length >= CELL_COUNT).length,
    [students]
  );

  function showTip(e, text) {
    const r = e.currentTarget.getBoundingClientRect();
    setTip({
      text,
      left: Math.min(Math.max(r.left + r.width / 2, 90), window.innerWidth - 90),
      bottom: window.innerHeight - r.top + 8,
    });
  }

  if (students.length === 0) {
    return (
      <p className="dash-side-empty">
        아직 이 활동에 배정된 학생이 없어요. 모둠을 구성하면 칸이 생깁니다.
      </p>
    );
  }

  return (
    <div className="dash-grass">
      <div className="progress-legend">
        <span className="progress-legend-item">
          <i className="progress-mark progress-mark--done" /> 채움
        </span>
        <span className="progress-legend-item">
          <i className="progress-mark progress-mark--empty" /> 아직
        </span>
        <span className="progress-legend-sum">
          다 채운 학생 {doneStudents} / {students.length}
        </span>
      </div>

      <div className="progress-scroll" onScroll={() => setTip(null)}>
        <div className="progress-grass" style={{ "--students": students.length }}>
          {/* 이름 줄 — 세로쓰기. 세로로 구를 때 위에 붙어 있어야 어느 칸이
              누구인지 잃지 않습니다(sticky). */}
          <span className="grass-act grass-corner" aria-hidden="true" />
          {students.map((s) => {
            const filled = (s.counts ?? []).filter((n) => n > 0).length;
            const done = filled >= CELL_COUNT;
            return (
              <button
                key={s.uid}
                type="button"
                // 14칸을 다 채운 학생은 이름 위에 붉은 점. 세로 줄을 하나씩
                // 눈으로 훑지 않아도 '누가 끝냈나'가 이름 줄에서 바로 읽힙니다
                // — 다 채운 줄은 초록이 열넷이라 옆줄과 잘 안 갈립니다.
                className={`grass-name${done ? " is-done" : ""}`}
                onClick={() => onPickStudent?.(s.uid)}
                title={
                  `${s.studentId ? `${s.studentId} ` : ""}${s.name}` +
                  ` — ${filled}/${CELL_COUNT}칸${done ? " · 다 채움" : ""}` +
                  `${s.groupName ? ` · ${s.groupName}` : ""}`
                }
              >
                {s.name}
              </button>
            );
          })}

          {CONSONANT_LABELS.map((label, i) => (
            <Fragment key={label}>
              <span className="grass-act">
                <span className="grass-act-letter" aria-hidden="true">{label}</span>
                <span className="grass-act-count">
                  {doneCounts[i]}/{students.length}
                </span>
              </span>
              {students.map((s) => {
                const n = s.counts?.[i] ?? 0;
                const text =
                  `${s.name} · ${label} — ` +
                  (n > 0 ? `낱말 ${n}개` : "아직 안 채움");
                return (
                  <button
                    key={s.uid}
                    type="button"
                    className={`grass-cell grass-cell--${n > 0 ? "done" : "empty"}`}
                    onClick={() => onPickStudent?.(s.uid)}
                    onMouseEnter={(e) => showTip(e, text)}
                    onMouseLeave={() => setTip(null)}
                    onFocus={(e) => showTip(e, text)}
                    onBlur={() => setTip(null)}
                    aria-label={text}
                  />
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>

      {tip && (
        <div
          className="progress-tip"
          role="tooltip"
          style={{ left: tip.left, bottom: tip.bottom }}
        >
          {tip.text}
        </div>
      )}
    </div>
  );
}
