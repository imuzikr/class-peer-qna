"use client";

// =============================================================
// 책방 전광판 — 여러 단계 × 반 전체를 한 격자로 (교사 전용)
// -------------------------------------------------------------
// 공부방의 '공부중 전광판'(StudyProgressBoard)을 책방으로 옮긴 것입니다.
// 격자의 짜임도 CSS도 그대로 씁니다(`.progress-grass`·`.grass-*`) — 두 방의
// 전광판이 서로 다른 모양이면 교사가 같은 것을 두 번 익혀야 합니다.
//
//   한 줄 = 단계 하나   한 칸 = 학생 한 명(가로 배치)
//
// 학생 카드 격자는 한 명이 카드 한 장이라 스물아홉 명이면 화면을 몇 번
// 굴려야 '지금 3단계까지 몇 명이 왔나'를 알 수 있습니다. 여기서는 한 줄입니다.
//
// **껍데기만 여기 있습니다.** 무엇이 한 줄인지(곁텍스트 여덟 단계 / RAFT 네
// 요소 + 글쓰기)와 칸 색을 어떻게 정하는지는 부르는 쪽이 넘깁니다 —
// `ParatextProgressBoard` · `RaftProgressBoard`. 활동이 늘 때 이 파일을
// 고치지 않아도 되게 하려고요.
//
// [이름을 세로로 적습니다]
// 공부방 전광판은 학생 이름을 아예 안 적고 툴팁에 맡깁니다 — 칸이 인원만큼
// 늘어서기 때문입니다. 책방은 줄이 여덟(RAFT는 다섯)뿐이라 격자가 세로로
// 짧아 이름 줄 하나를 얹을 자리가 남고, 무엇보다 칠판에 띄워 함께 보는
// 자리라(마우스를 올릴 수 없습니다) 누구인지가 화면에 적혀 있어야 합니다.
// 칸이 22px이라 가로로는 못 적고 세로쓰기로 적습니다.
//
// [칸 색은 학생 카드의 네모(.paratext-mark)와 같습니다]
// 같은 화면에서 카드의 네모를 보다가 이 격자를 여는데 색이 다르면 두 번
// 익혀야 합니다 — 초록(다 씀) · 주황(쓰는 중) · 회색(시작 전) · 빗금(잠김).
//
// [출석은 안 봅니다] 공부방 전광판에는 '오늘 결석' 색이 있는데, 그것을
// 여기에 두려면 이 화면이 출석 기록을 새로 구독해야 합니다. 책방 활동은
// 여러 차시에 걸쳐 채우는 것이라 '오늘 결석'이 빈칸의 이유가 되지도 않습니다.
// =============================================================
import { Fragment, useEffect, useMemo, useState } from "react";
import { backdropClose } from "@/lib/modal";
import { IconLockState } from "./StatusIcons";

// 범례에 적는 말 — 상태 이름은 네 화면이 같아야 합니다.
const STATE_LABEL = {
  done: "다 씀",
  doing: "쓰는 중",
  empty: "시작 전",
  locked: "잠김",
};

export default function BookProgressBoard({
  title,                 // '읽는중 전광판' 같은 창 제목
  activity,
  cards = [],            // { uid, name, studentId, entry } — 보드가 이미 만든 것
  rows = [],             // [{ key, letter, label, locked }] — 한 줄씩
  cellState,             // (row, answers) => 'done' | 'doing' | 'empty' | 'locked'
  cellTip,               // (row, card, answers, index) => 한 줄 설명
  states = ["done", "empty", "locked"], // 범례에 세울 상태(그 활동에 실제로 있는 것만)
  summary = null,        // 범례 오른쪽 끝 한 줄
  headWidth = 232,       // 단계 이름표 칸의 폭 — 이름 길이가 활동마다 달라서
  onOpenStudent = null,  // 칸·이름을 누르면 그 학생 화면으로
  onClose,
}) {
  const [tip, setTip] = useState(null);

  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose?.(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 줄마다 '다 쓴 인원'. 이미 받아 둔 기록으로 세므로 읽기가 늘지 않습니다.
  const doneCounts = useMemo(
    () =>
      rows.map(
        (r) => cards.filter((c) => cellState(r, c.entry?.answers ?? {}) === "done").length
      ),
    [rows, cards, cellState]
  );

  // 잠금이 있는 활동인가 — 곁텍스트는 단계마다 열고 잠그지만 RAFT는 그런
  // 것이 없습니다. 없는 활동에서 배지 칸을 비워 두면 이름과 진행률 사이가
  // 까닭 없이 벌어지므로, 칸 자체를 뺍니다.
  const hasLocks = rows.some((r) => r.locked != null);

  function showTip(e, text) {
    const r = e.currentTarget.getBoundingClientRect();
    setTip({
      text,
      left: Math.min(Math.max(r.left + r.width / 2, 90), window.innerWidth - 90),
      bottom: window.innerHeight - r.top + 8,
    });
  }

  return (
    <div className="modal-backdrop" {...backdropClose(onClose)}>
      <div
        className={`modal progress-modal bookboard${hasLocks ? "" : " bookboard--nolock"}`}
        style={{ "--head-w": `${headWidth}px` }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bookboard-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3 id="bookboard-title">
            {title}
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
              {states.map((st) => (
                <span key={st} className="progress-legend-item">
                  <i className={`progress-mark progress-mark--${st}`} /> {STATE_LABEL[st]}
                </span>
              ))}
              {summary && <span className="progress-legend-sum">{summary}</span>}
            </div>

            <div className="progress-scroll" onScroll={() => setTip(null)}>
              <div className="progress-grass" style={{ "--students": cards.length }}>
                {/* 이름 줄 — 세로쓰기. 세로로 구를 때 위에 붙어 있어야
                    어느 칸이 누구인지 잃지 않습니다(sticky). */}
                <span className="grass-act grass-corner" aria-hidden="true" />
                {cards.map((c) => (
                  <button
                    key={c.uid}
                    type="button"
                    className="grass-name"
                    onClick={() => onOpenStudent?.(c.uid)}
                    title={`${c.studentId ? `${c.studentId} ` : ""}${c.name} — 이 학생 화면 열기`}
                  >
                    {c.name}
                  </button>
                ))}

                {rows.map((row, i) => (
                  <Fragment key={row.key}>
                    {/* 한 줄입니다 — 이름·상태·진행률뿐. 아래에 물음을 한 줄
                        더 깔았었는데, 모든 줄이 말줄임으로 잘려 '무엇을 묻는지'는
                        어차피 안 보이면서 격자만 두 배로 길어졌습니다. 물음은
                        마우스를 올리면 뜹니다(title). */}
                    <span className="grass-act" title={row.hint || row.label}>
                      <span className="grass-act-letter" aria-hidden="true">
                        {row.letter}
                      </span>
                      <span className="grass-act-no">{i + 1}. {row.label}</span>
                      {hasLocks && (
                        <span className={`progress-act-state${row.locked ? " locked" : ""}`}>
                          <IconLockState locked={!!row.locked} size={14} />
                          {row.locked ? "잠김" : "열림"}
                        </span>
                      )}
                      <span className="grass-act-count">
                        {doneCounts[i]}/{cards.length}
                      </span>
                    </span>
                    {cards.map((c) => {
                      const answers = c.entry?.answers ?? {};
                      const st = cellState(row, answers);
                      const text = cellTip(row, c, answers, i);
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
                ))}
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
