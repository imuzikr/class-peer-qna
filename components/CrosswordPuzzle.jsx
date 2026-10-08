"use client";

// =============================================================
// 가로세로 낱말퀴즈 판 — 학생(풀기) · 교사(정답 보기) 공용
// -------------------------------------------------------------
// 한 칸 = 음절 하나(lib/crossword.js). 학생은 **판에 직접** 적습니다 — 칸을
// 누르고 치면 그 칸부터 낱말 방향으로 들어갑니다(CrosswordTyping — 한글 조합 ·
// 조합 중 Enter를 거기서 다룹니다). 모둠 판과 같은 입력 방식입니다.
//
// 학생이 적은 답은 **이 기기에만** 둡니다(localStorage, 퍼즐마다 열쇠가
// 다름) — 서버에 쓰지 않아 규칙을 건드리지 않고, 다시 열어도 이어서 풉니다.
// 선생님이 퍼즐을 새로 만들면 열쇠가 바뀌어 빈 판으로 시작합니다.
// =============================================================
import { useEffect, useMemo, useState } from "react";
import { crosswordCells, entryCellKeys } from "@/lib/crossword";
import CrosswordTyping from "./CrosswordTyping";

const DIR_LABEL = { across: "가로", down: "세로" };

function loadFilled(storageKey) {
  if (!storageKey) return {};
  try {
    const raw = localStorage.getItem(storageKey);
    const v = raw ? JSON.parse(raw) : {};
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

export default function CrosswordPuzzle({
  puzzle,
  mode = "solve",        // 'solve'(학생) | 'answer'(교사 — 정답이 칸에 보임)
  storageKey = null,     // 학생 답을 둘 열쇠
  nameOf = null,         // (uid) => 이름 — 교사 화면에서 힌트 옆에 낸 사람
  highlightUid = null,   // 이 학생의 낱말을 짚어 보입니다(교사)
}) {
  const cells = useMemo(() => crosswordCells(puzzle), [puzzle]);
  const entries = puzzle?.entries ?? [];
  const solving = mode === "solve";

  const [filled, setFilled] = useState(() => (solving ? loadFilled(storageKey) : {}));
  const [sel, setSel] = useState(0);        // 고른 낱말(entries 차례)
  const [checked, setChecked] = useState(false); // '정답 확인'을 누른 뒤
  const [showAnswers, setShowAnswers] = useState(true); // 교사: 칸에 정답 보이기

  // 퍼즐이 바뀌면(새로 만듦) 그 퍼즐의 답을 다시 읽습니다
  useEffect(() => {
    if (!solving) return;
    setFilled(loadFilled(storageKey));
    setChecked(false);
    setSel(0);
  }, [storageKey, solving]);

  useEffect(() => {
    if (!solving || !storageKey) return;
    try { localStorage.setItem(storageKey, JSON.stringify(filled)); } catch { /* 저장 못 해도 풀기는 됩니다 */ }
  }, [filled, storageKey, solving]);

  const selEntry = entries[sel] ?? null;
  const selKeys = useMemo(() => new Set(selEntry ? entryCellKeys(selEntry) : []), [selEntry]);

  const [focusTick, setFocusTick] = useState(0);
  function pickEntry(i, focus = false) {
    setSel(i);
    if (focus) setFocusTick((t) => t + 1);
  }

  // 칸을 누르면 그 칸을 지나는 낱말을 고릅니다. 둘이 지나면 누를 때마다 번갈아.
  function pickCell(k) {
    const cell = cells.get(k);
    if (!cell) return;
    const list = cell.entries;
    const next = list.includes(sel) && list.length > 1
      ? list[(list.indexOf(sel) + 1) % list.length]
      : list[0];
    pickEntry(next);
  }

  // 판에서 적은 칸 — 이 기기에만 담습니다(위 localStorage)
  function writeCells(set, del) {
    setFilled((prev) => {
      const nx = { ...prev, ...set };
      del.forEach((k) => delete nx[k]);
      return nx;
    });
    setChecked(false);
  }

  // '정답 확인' 뒤의 칸 색 — 맞은 칸 초록, 틀린 칸 빨강(개별 활동만)
  const checkKeys = useMemo(() => {
    if (!solving || !checked) return { right: null, wrong: null };
    const right = new Set();
    const wrong = new Set();
    cells.forEach((cell, k) => {
      if (!filled[k]) return;
      (filled[k] === cell.ch ? right : wrong).add(k);
    });
    return { right, wrong };
  }, [solving, checked, cells, filled]);

  const solvedOf = (e) => entryCellKeys(e).every((k, i) => filled[k] === e.word[i]);
  const solvedCount = solving ? entries.filter(solvedOf).length : 0;
  const allFilled = solving && [...cells.keys()].every((k) => filled[k]);
  const allSolved = solving && solvedCount === entries.length && entries.length > 0;

  const across = entries.map((e, i) => ({ e, i })).filter((x) => x.e.dir === "across");
  const down = entries.map((e, i) => ({ e, i })).filter((x) => x.e.dir === "down");

  const grid = [];
  for (let r = 0; r < (puzzle?.rows ?? 0); r++) {
    for (let c = 0; c < (puzzle?.cols ?? 0); c++) {
      const k = `${r},${c}`;
      const cell = cells.get(k);
      if (!cell) {
        grid.push(<span key={k} className="xw-cell xw-cell--void" aria-hidden="true" />);
        continue;
      }
      const letter = showAnswers ? cell.ch : "";
      const mineHit = highlightUid && cell.entries.some((i) => entries[i]?.uid === highlightUid);
      grid.push(
        <button
          key={k}
          type="button"
          className={[
            "xw-cell",
            selKeys.has(k) ? "sel" : "",
            mineHit ? "mine" : "",
          ].filter(Boolean).join(" ")}
          onClick={() => pickCell(k)}
          aria-label={`${cell.num ? `${cell.num}번 ` : ""}칸${letter ? ` ${letter}` : ""}`}
        >
          {cell.num && <em className="xw-num">{cell.num}</em>}
          <span className="xw-ch">{letter}</span>
        </button>
      );
    }
  }

  function renderClues(title, list) {
    return (
      <div className="xw-clues-col">
        <h4>{title}</h4>
        <ol>
          {list.map(({ e, i }) => {
            const done = solving && checked && solvedOf(e);
            return (
              <li key={`${e.dir}${e.num}`}>
                <button
                  type="button"
                  className={`xw-clue${i === sel ? " on" : ""}${done ? " done" : ""}${
                    highlightUid && e.uid === highlightUid ? " mine" : ""
                  }`}
                  onClick={() => pickEntry(i, solving)}
                >
                  <b>{e.num}</b>
                  <span className="xw-clue-text">
                    {e.clue || "(풀이 없음)"}
                    <i className="xw-clue-len">{e.word.length}글자</i>
                    {!solving && (
                      <i className="xw-clue-ans">
                        {e.word}
                        {nameOf && e.uid && ` · ${nameOf(e.uid)}`}
                      </i>
                    )}
                  </span>
                  {done && <span className="xw-clue-ok" aria-label="맞힘">✓</span>}
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    );
  }

  return (
    <div className="xw">
      <div className="xw-board-col">
        {solving ? (
          <CrosswordTyping
            puzzle={puzzle}
            letters={filled}
            solvedKeys={checkKeys.right}
            wrongKeys={checkKeys.wrong}
            sel={sel}
            onSelect={pickEntry}
            nextOk={(i) => entryCellKeys(entries[i]).some((k) => !filled[k])}
            onWrite={writeCells}
            focusTick={focusTick}
          />
        ) : (
          <div
            className="xw-grid"
            style={{ "--xw-cols": puzzle.cols, "--xw-rows": puzzle.rows }}
          >
            {grid}
          </div>
        )}

        {solving ? (
          <>
            {selEntry && (
              <div className="xw-entry">
                <span className="xw-entry-tag">
                  {DIR_LABEL[selEntry.dir]} {selEntry.num}
                </span>
                <span className="xw-entry-clue">{selEntry.clue}</span>
                <span className="xw-entry-help">
                  칸을 누르고 바로 적으세요 · Enter 다음 낱말 · ← → 칸 옮기기 · Backspace 지우기 · 같은 칸을 한 번 더 누르면 가로 ↔ 세로
                </span>
              </div>
            )}
            <div className="xw-actions">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setChecked(true)}
                disabled={!Object.keys(filled).length}
              >
                정답 확인
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => { setFilled({}); setChecked(false); }}
                disabled={!Object.keys(filled).length}
              >
                모두 지우기
              </button>
              <span className={`xw-score${allSolved ? " all" : ""}`}>
                {allSolved
                  ? `🎉 ${entries.length}개를 모두 맞혔어요!`
                  : checked
                    ? `${solvedCount} / ${entries.length}개 맞힘`
                    : allFilled
                      ? "다 채웠어요 — 정답 확인을 눌러 보세요"
                      : `낱말 ${entries.length}개`}
              </span>
            </div>
          </>
        ) : (
          <div className="xw-actions">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setShowAnswers((v) => !v)}
              title="학생들과 함께 볼 때는 정답을 숨겨 두세요"
            >
              {showAnswers ? "칸의 정답 숨기기" : "칸에 정답 보이기"}
            </button>
            <span className="xw-score">낱말 {entries.length}개</span>
          </div>
        )}
      </div>

      <div className="xw-clues">
        {renderClues("가로", across)}
        {renderClues("세로", down)}
      </div>
    </div>
  );
}
