"use client";

// =============================================================
// 가로세로 판 한 장 — 학생 판 · 교사 판 · 미니맵 공용
// -------------------------------------------------------------
// 그리기만 합니다. 무엇을 칸에 넣을지(글자 · 열쇠 칸 · 맞힘 · 고른 낱말)는
// 부르는 쪽이 셈해 넘깁니다(lib/crossword.js).
//   letters    { "r,c": 글자 } — 채운 칸(적는 중인 글자도 섞어 넘깁니다)
//   fixed      Map("r,c" → 글자) — 열쇠 칸(우리 모둠 낱말 · 교사 화면의 정답)
//   solvedKeys Set — 맞힌 낱말의 칸(초록 · 미니맵은 모둠 색)
//   wrongKeys  Set — 틀린 칸(개별 활동의 '정답 확인'에서만)
//   selKeys    Set — 고른 낱말의 칸 · cursorKey — 다음 글자가 들어갈 칸
//   typingKeys Set — 아직 저장 안 한, 적는 중인 글자의 칸
//   mini       미니맵 — 글자 없이 색만, 누를 수 없음
// 칸은 누를 수 있어도 **포커스를 가져가지 않습니다**(onMouseDown에서 막음) —
// 판에 직접 적는 화면(CrosswordTyping)은 숨은 입력칸 하나가 글자를 받는데,
// 칸이 포커스를 뺏으면 그 입력칸이 흐려져 휴대폰 자판이 내려갔다 올라옵니다.
// =============================================================
import { useMemo } from "react";
import { crosswordCells } from "@/lib/crossword";

export default function CrosswordGrid({
  puzzle,
  letters = {},
  fixed = null,
  solvedKeys = null,
  wrongKeys = null,
  selKeys = null,
  cursorKey = null,
  typingKeys = null,
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
        wrongKeys?.has(k) ? "wrong" : "",
        selKeys?.has(k) ? "sel" : "",
        cursorKey === k ? "cur" : "",
        typingKeys?.has(k) ? "typing" : "",
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
          data-k={k}
          tabIndex={-1}
          className={cls}
          onMouseDown={onCellClick ? (e) => e.preventDefault() : undefined}
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
