"use client";

// =============================================================
// 낱말 빙고 판 한 장 — 학생 판 · 교사 판 · 미니맵 공용 (CrosswordGrid와 같은 생각)
// -------------------------------------------------------------
// 그리기만 합니다. 무엇을 표시할지는 부르는 쪽이 셈해 넘깁니다(lib/bingo.js).
//   size       판 크기 4 | 5 — 칸 수는 size², 열 수는 CSS 변수 --bingo-n
//   cells      길이 size² 배열 — 칸마다 낱말("" = 빈칸)
//   marked     Set(칸 번호) — 부른 낱말이 든 칸
//   lineCells  Set(칸 번호) — 완성된 줄에 든 칸(더 짙게)
//   lastWord   방금 부른 낱말 — 그 칸에 테두리
//   sel        고른 칸(판 채우기 · 학생이 진행의 내 차례) · onCellClick(칸 번호)
//   cellEnabled(칸 번호) — 주면 그 칸만 누를 수 있음(내 차례에 아직 안 불린 칸만 등)
//   mini       미니맵 — 글자 없이 색만, 누를 수 없음 · tint { bg, border }
// =============================================================
import { bingoCellCount, normalizeBingoSize } from "@/lib/bingo";

export default function BingoGrid({
  size = 5,
  cells = [],
  marked = null,
  lineCells = null,
  lastWord = "",
  sel = null,
  onCellClick = null,
  cellEnabled = null,
  mini = false,
  tint = null,
}) {
  const n = normalizeBingoSize(size);
  const total = bingoCellCount(n);
  const out = [];
  for (let i = 0; i < total; i++) {
    const word = cells[i] ?? "";
    const isMarked = !!marked?.has(i);
    const inLine = !!lineCells?.has(i);
    const can = !!onCellClick && (!cellEnabled || cellEnabled(i));
    const cls = [
      "bingo-cell",
      word ? "filled" : "empty",
      isMarked ? "marked" : "",
      inLine ? "line" : "",
      sel === i ? "sel" : "",
      !mini && lastWord && word === lastWord ? "last" : "",
    ].filter(Boolean).join(" ");
    if (mini) {
      const style = tint && (isMarked || inLine)
        ? { background: inLine ? tint.border : tint.bg, borderColor: tint.border }
        : undefined;
      out.push(<span key={i} className={cls} style={style} />);
      continue;
    }
    const r = Math.floor(i / n) + 1;
    const c = (i % n) + 1;
    out.push(
      <button
        key={i}
        type="button"
        className={cls}
        onClick={can ? () => onCellClick(i) : undefined}
        disabled={!can}
        aria-pressed={onCellClick ? sel === i : undefined}
        aria-label={`${r}행 ${c}열${word ? ` ${word}` : " 빈칸"}${isMarked ? " (불림)" : ""}${inLine ? " (빙고 줄)" : ""}`}
      >
        <span className="bingo-word">{word}</span>
      </button>
    );
  }
  return (
    <div
      className={`bingo-grid bingo-grid--${n}${mini ? " bingo-grid--mini" : ""}`}
      style={{ "--bingo-n": n }}
      aria-hidden={mini || undefined}
    >
      {out}
    </div>
  );
}
