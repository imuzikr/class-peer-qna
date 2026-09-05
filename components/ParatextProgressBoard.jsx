"use client";

// =============================================================
// 읽는중 전광판 — 곁텍스트 읽기의 진행 상황을 한 화면에 (교사 전용)
// -------------------------------------------------------------
// 공부방의 '공부중 전광판'(StudyProgressBoard)을 책방으로 옮긴 것입니다.
// 격자의 짜임도 CSS도 그대로 씁니다(.progress-grass · .grass-*) — 두 방의
// 전광판이 서로 다른 모양이면 교사가 같은 것을 두 번 익혀야 합니다.
//
//   한 줄 = 곁텍스트 여덟 단계 중 하나   한 칸 = 학생 한 명
//
// 학생 카드 격자는 한 명이 카드 한 장이라 스물아홉 명이면 화면을 몇 번
// 굴려야 '지금 3단계까지 몇 명이 왔나'를 알 수 있습니다. 여기서는 그것이
// 한 줄입니다.
//
// [이름을 세로로 적습니다]
// 공부방 전광판은 학생 이름을 아예 안 적고 툴팁에 맡깁니다 — 칸이 인원만큼
// 늘어서기 때문입니다. 책방은 그러기 어렵습니다. 곁텍스트는 여덟 줄뿐이라
// 격자가 세로로 짧아, 이름 줄 하나를 얹을 자리가 남습니다. 그리고 이 화면은
// 칠판에 띄워 함께 보는 자리라(마우스를 올릴 수 없습니다) 누구인지가 화면에
// 적혀 있어야 합니다. 칸이 22px이라 가로로는 못 적고 세로쓰기로 적습니다.
//
// [칸 색은 학생 카드의 네모(.paratext-mark)와 같습니다]
// 같은 화면에서 카드의 여덟 네모를 보다가 이 격자를 여는데 색이 다르면
// 두 번 익혀야 합니다. 그래서 초록(다 씀) · 주황(쓰는 중) · 회색(시작 전)을
// 그대로 쓰고, 공부방에는 없는 '쓰는 중'이 여기 있는 까닭은 한 단계가
// 여러 칸으로 된 것이 셋(제목 5칸 · 목차 3칸 · 머리말 2칸)이라 '반쯤 쓴'
// 상태가 실제로 자주 생기기 때문입니다.
// 잠김(빗금)은 공부방과 같은 그림입니다.
//
// [출석은 안 봅니다] 공부방 전광판에는 '오늘 결석' 색이 있는데, 그것을
// 여기에 두려면 이 화면이 출석 기록을 새로 구독해야 합니다. 곁텍스트는
// 여러 차시에 걸쳐 채우는 활동이라 '오늘 결석'이 빈칸의 이유가 되지도
// 않습니다.
// =============================================================
import { Fragment, useEffect, useMemo, useState } from "react";
import { backdropClose } from "@/lib/modal";
import { IconLockState } from "./StatusIcons";
import {
  PARATEXT_SECTIONS,
  PARATEXT_SECTION_COUNT,
  isSectionDone,
  isSectionStarted,
  isSectionLocked,
  paratextDoneCount,
} from "@/lib/paratext";

// 칸 하나의 상태. 차례에 뜻이 있습니다 — **쓴 것이 가장 셉니다**(잠근 뒤에도
// 쓴 것은 쓴 것), 그다음이 잠김입니다. 공부방 전광판의 cellState와 같은
// 차례라, 두 화면이 같은 칸을 다르게 읽지 않습니다.
function cellState(section, answers, locked) {
  if (isSectionDone(section, answers)) return "done";
  if (locked) return "locked";
  return isSectionStarted(section, answers) ? "doing" : "empty";
}

// 한 단계에서 그 학생이 채운 칸 수 / 전체 칸 수 — 툴팁에 씁니다.
// ('쓰는 중'이 왜 쓰는 중인지는 이 숫자라야 말이 됩니다)
function fieldCount(section, answers) {
  const filled = section.fields.filter(
    (f) => String(answers[f.key] ?? "").trim().length > 0
  ).length;
  return { filled, total: section.fields.length };
}

export default function ParatextProgressBoard({
  activity,
  cards = [],           // { uid, name, studentId, entry } — ParatextBoard가 이미 만든 것
  onOpenStudent = null, // 칸·이름을 누르면 그 학생의 여덟 단계로
  onClose,
}) {
  const [tip, setTip] = useState(null);

  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose?.(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 단계마다 '다 쓴 인원'. 이미 받아 둔 기록으로 세므로 읽기가 늘지 않습니다.
  const doneCounts = useMemo(
    () =>
      PARATEXT_SECTIONS.map(
        (s) => cards.filter((c) => isSectionDone(s, c.entry?.answers ?? {})).length
      ),
    [cards]
  );

  // 여덟 칸을 다 채운 학생
  const allDone = useMemo(
    () =>
      cards.filter(
        (c) => paratextDoneCount(c.entry?.answers) === PARATEXT_SECTION_COUNT
      ).length,
    [cards]
  );

  function showTip(e, text) {
    const r = e.currentTarget.getBoundingClientRect();
    setTip({
      text,
      left: Math.min(Math.max(r.left + r.width / 2, 90), window.innerWidth - 90),
      bottom: window.innerHeight - r.top + 8,
    });
  }

  function cellSummary(card, section, i, locked) {
    const answers = card.entry?.answers ?? {};
    const who = `${card.studentId ? `${card.studentId} ` : ""}${card.name}`;
    const step = `${i + 1}. ${section.ko}`;
    const { filled, total } = fieldCount(section, answers);
    const many = total > 1 ? ` (${filled}/${total}칸)` : "";
    if (isSectionDone(section, answers)) return `${who} — ${step} 다 썼어요${many}`;
    if (locked) {
      return filled > 0
        ? `${who} — ${step} 잠김 (쓰다 만 것 ${filled}/${total}칸)`
        : `${who} — ${step} 잠김 (아직 열지 않음)`;
    }
    if (filled > 0) return `${who} — ${step} 쓰는 중${many}`;
    return `${who} — ${step} 아직 시작 전`;
  }

  return (
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      <div
        className="modal progress-modal reading-board"
        role="dialog"
        aria-modal="true"
        aria-labelledby="paratext-progress-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3 id="paratext-progress-title">
            읽는중 전광판
            {activity?.title && (
              <span className="progress-board-name">· {activity.title}</span>
            )}
          </h3>
          <button className="btn-close" onClick={onClose} aria-label="닫기">×</button>
        </div>

        {cards.length === 0 ? (
          <p className="lesson-note-empty">
            아직 이 반에 들어온 학생이 없어요. 학생이 반에 들어오면 칸이 생깁니다.
          </p>
        ) : (
          <>
            <div className="progress-legend">
              <span className="progress-legend-item">
                <i className="progress-mark progress-mark--done" /> 다 씀
              </span>
              <span className="progress-legend-item">
                <i className="progress-mark progress-mark--doing" /> 쓰는 중
              </span>
              <span className="progress-legend-item">
                <i className="progress-mark progress-mark--empty" /> 시작 전
              </span>
              <span className="progress-legend-item">
                <i className="progress-mark progress-mark--locked" /> 잠김
              </span>
              <span className="progress-legend-sum">
                여덟 단계 완성 {allDone}명 / 전체 {cards.length}명
              </span>
            </div>

            <div
              className="progress-scroll"
              onScroll={() => setTip(null)}
            >
              <div className="progress-grass" style={{ "--students": cards.length }}>
                {/* 이름 줄 — 세로쓰기. 가로 스크롤에도 위에 붙어 있게 sticky. */}
                <span className="grass-act grass-corner" aria-hidden="true" />
                {cards.map((c) => (
                  <button
                    key={c.uid}
                    type="button"
                    className="grass-name"
                    onClick={() => onOpenStudent?.(c.uid)}
                    title={`${c.studentId ? `${c.studentId} ` : ""}${c.name} — 이 학생의 곁텍스트 읽기 열기`}
                  >
                    {c.name}
                  </button>
                ))}

                {PARATEXT_SECTIONS.map((s, i) => {
                  const locked = isSectionLocked(activity, s.key);
                  return (
                    <Fragment key={s.key}>
                      <span className="grass-act">
                        <span className="grass-act-head">
                          <span className="grass-act-letter" aria-hidden="true">{s.letter}</span>
                          <span className="grass-act-no">{i + 1}. {s.ko}</span>
                          <span className={`progress-act-state${locked ? " locked" : ""}`}>
                            <IconLockState locked={locked} size={14} />
                            {locked ? "잠김" : "열림"}
                          </span>
                          <span className="grass-act-count">
                            {doneCounts[i]}/{cards.length}
                          </span>
                        </span>
                        <span className="grass-act-name" title={s.prompt}>{s.prompt}</span>
                      </span>
                      {cards.map((c) => {
                        const answers = c.entry?.answers ?? {};
                        const st = cellState(s, answers, locked);
                        const text = cellSummary(c, s, i, locked);
                        return (
                          <button
                            key={c.uid}
                            type="button"
                            className={`grass-cell grass-cell--${st}`}
                            onClick={() => onOpenStudent?.(c.uid)}
                            onMouseEnter={(e) => showTip(e, text)}
                            onMouseLeave={() => setTip(null)}
                            onFocus={(e) => showTip(e, text)}
                            onBlur={() => setTip(null)}
                            aria-label={text}
                          />
                        );
                      })}
                    </Fragment>
                  );
                })}
              </div>
            </div>
          </>
        )}

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
    </div>
  );
}
