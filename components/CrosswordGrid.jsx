"use client";

// =============================================================
// 가로세로 판 한 장 — 모둠 퍼즐의 학생 판 · 교사 판 · 미니맵 공용
// -------------------------------------------------------------
// 그리기만 합니다. 무엇을 칸에 넣을지(글자 · 열쇠 칸 · 맞힘 · 고른 낱말)는
// 부르는 쪽이 셈해 넘깁니다(lib/crossword.js).
//   letters    { "r,c": 글자 } — 모둠이 채운 칸
//   fixed      Map("r,c" → 글자) — 열쇠 칸(우리 모둠 낱말 · 교사 화면의 정답)
//   solvedKeys Set — 맞힌 낱말의 칸(초록 · 미니맵은 모둠 색)
//   selKeys    Set — 고른 낱말의 칸
//   mini       미니맵 — 글자 없이 색만, 누를 수 없음
// =============================================================
import { useMemo } from "react";
import { crosswordCells } from "@/lib/crossword";

export default function CrosswordGrid({
  puzzle,
  letters = {},
  fixed = null,
  solvedKeys = null,
  selKeys = null,
  onCellClick = null,
  mini = false,
  tint = null, // 미니맵의 맞힘 색 { bg, border }
  showFixedLetters = true,
}) {
  const cells = useMemo(() => crosswordCells(puzzle), [puzzle]);
  const out = [];
  for (let r = 0; r < (puzzle?.rows ?? 0); r++) {
    for (let c = 0; c < (puzzle?.cols ?? 0); c++) {
      const k = `${r},${c}`;
      const cell = cells.get(k);
      if (!cell) {
        out.push(<span key={k} className="xw-cell xw-cell--void" aria-hidden="true" />);
        continue;
      }
      const isFixed = !!fixed?.has(k);
      const letter = isFixed ? (showFixedLetters ? fixed.get(k) : "") : letters[k] ?? "";
      const solved = !!solvedKeys?.has(k);
      const cls = [
        "xw-cell",
        isFixed ? "key" : "",
        solved ? "right" : "",
        selKeys?.has(k) ? "sel" : "",
        !mini && letter && !isFixed && !solved ? "filled" : "",
      ].filter(Boolean).join(" ");
      if (mini) {
        const style = solved && tint ? { background: tint.border, borderColor: tint.border } : undefined;
        out.push(<span key={k} className={`${cls}${letter && !solved ? " filled" : ""}`} style={style} />);
        continue;
      }
      out.push(
        <button
          key={k}
          type="button"
          className={cls}
          onClick={onCellClick ? () => onCellClick(k) : undefined}
          disabled={!onCellClick}
          aria-label={`${cell.num ? `${cell.num}번 ` : ""}칸${letter ? ` ${letter}` : ""}${isFixed ? " (열쇠 칸)" : ""}`}
        >
          {cell.num && <em className="xw-num">{cell.num}</em>}
          <span className="xw-ch">{letter}</span>
        </button>
      );
    }
  }
  return (
    <div
      className={`xw-grid${mini ? " xw-grid--mini" : ""}`}
      style={{ "--xw-cols": puzzle?.cols ?? 1, "--xw-rows": puzzle?.rows ?? 1 }}
      aria-hidden={mini || undefined}
    >
      {out}
    </div>
  );
}
