"use client";

// =============================================================
// 낱말 빙고 판 한 장 — 학생 판 · 교사 판 · 미니맵 공용 (CrosswordGrid와 같은 생각)
// -------------------------------------------------------------
// 그리기만 합니다. 무엇을 표시할지는 부르는 쪽이 셈해 넘깁니다(lib/bingo.js).
//   size       판 크기 4 | 5 — 칸 수는 size², 열 수는 CSS 변수 --bingo-n
//   cells      길이 size² 배열 — 칸마다 낱말("" = 빈칸)
//   marked     Set(칸 번호) — 부른 낱말이 든 칸
//   lineCells  Set(칸 번호) — 완성된 줄에 든 칸(읽어 주는 글 '빙고 줄'에만 씀)
//   lines      완성된 줄의 key 목록(r0 · c2 · d0 …) — 그 줄을 따라 **붉은 직선**을 판 바깥까지
//              조금 더 길게 긋습니다(선생님 요청 — 한때 줄의 칸을 짙게 칠했는데, 줄이 여럿이면
//              어느 줄인지 안 보였음. 직선은 한때 회색이었음)
//   lastWord   방금 부른 낱말 — 그 칸에 테두리
//   sel        고른 칸(판 채우기 · 학생이 진행의 내 차례) · onCellClick(칸 번호)
//   cellEnabled(칸 번호) — 주면 그 칸만 누를 수 있음(내 차례에 아직 안 불린 칸만 등)
//   mini       미니맵 — 글자 없이 색만, 누를 수 없음 · tint { bg, border }
// =============================================================
import { bingoCellCount, normalizeBingoSize } from "@/lib/bingo";

// 완성된 줄 하나 → 판 위에 겹쳐 긋는 직선. 가로 · 세로는 그 줄의 격자 영역을 기준으로 놓아
// 칸 사이 틈과 상관없이 칸 한가운데를 지나고, 대각선은 판보다 사방으로 조금 큰 SVG 한 줄(판이
// 정사각형이라, 사방으로 같은 만큼 넓힌 상자의 모서리끼리 이어도 대각선 칸들의 한가운데를 지남).
// 판 바깥으로 나가는 길이는 CSS(61-bingo.css의 --strike-out) 한 곳이 정합니다.
// 칸 위에 겹치지만 누름을 막지 않습니다.
// 격자 선 번호는 시작 · 끝을 **둘 다** 숫자로 못 박습니다(1 ~ n+1). 판 위에 겹쳐 그리는
// 요소(position: absolute)는 끝을 비우면 'span 1'이 아니라 '판 끝까지'로 잡혀, 한때 첫 가로줄이
// 판 한가운데에 그어졌습니다. `-1`도 쓰지 않습니다('명시한 격자의 끝').
function Strike({ lineKey, n }) {
  const kind = lineKey[0];
  const k = Number(lineKey.slice(1));
  const all = `1 / ${n + 1}`;
  const one = `${k + 1} / ${k + 2}`;
  if (kind === "r") {
    return <span className="bingo-strike bingo-strike--row" style={{ gridRow: one, gridColumn: all }} aria-hidden="true" />;
  }
  if (kind === "c") {
    return <span className="bingo-strike bingo-strike--col" style={{ gridColumn: one, gridRow: all }} aria-hidden="true" />;
  }
  return (
    <svg
      className="bingo-strike bingo-strike--diag"
      style={{ gridArea: `1 / 1 / ${n + 1} / ${n + 1}` }}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {k === 0 ? <line x1="0" y1="0" x2="100" y2="100" /> : <line x1="100" y1="0" x2="0" y2="100" />}
    </svg>
  );
}

export default function BingoGrid({
  size = 5,
  cells = [],
  marked = null,
  lineCells = null,
  lines = null,
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
      // 불린 칸은 모둠(판) 색으로 옅게 — 빙고 줄도 같은 색이고, 줄은 위에 긋는 붉은 직선으로 보입니다
      const style = tint && isMarked ? { background: tint.bg, borderColor: tint.border } : undefined;
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
      {(lines ?? []).map((key) => <Strike key={key} lineKey={key} n={n} />)}
    </div>
  );
}
