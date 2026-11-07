// =============================================================
// 낱말 빙고 — 셈 (독서 활동 '낱말 빙고', type: 'bingo')
// -------------------------------------------------------------
// 닿소리 채우기에 나온 낱말로 5×5 빙고를 합니다. 화면(BingoBoard · BingoStudent)과
// 데이터 함수(lib/data/books.js)는 여기 셈만 부릅니다 — JSX · Firebase를 안 가져와
// 단위 시험이 그대로 읽습니다(tests/unit/bingo.test.mjs).
//
// 자료
//   bookActivities/{aId}.bingo   — 반 전체가 읽는 활동 문서(교사만 씀)
//     { stage: 'fill' | 'play', words: [낱말], called: [부른 낱말 차례대로], goal: 줄 수 }
//   bookActivities/{aId}/bingoBoards/{판 id}  — 판 하나(모둠 · 학생)
//     { groupId, cells: { "0": 낱말, … "24": 낱말 }, updatedAt }
//     칸 하나씩 merge로 써서 모둠원이 동시에 다른 칸을 채워도 서로 덮지 않습니다.
//
// 빙고에는 숨길 정답이 없어 판을 반 전체가 읽습니다(가장 앞선 친구 · 모둠의 판).
// =============================================================

export const BINGO_SIZE = 5;
export const BINGO_CELLS = BINGO_SIZE * BINGO_SIZE; // 25
// 칸 하나에 들어갈 낱말 길이 — 규칙(firestore.rules의 bingoBoards)과 같아야 합니다
export const BINGO_WORD_MAX = 20;
// 낱말 상자의 천장 — 활동 문서가 커지지 않게(닿소리 판 스물몇 장 × 14칸 남짓)
export const BINGO_POOL_MAX = 400;
// 빙고 목표(몇 줄이면 빙고인가) — 가로 5 · 세로 5 · 대각선 2 = 12줄
export const BINGO_LINE_COUNT = BINGO_SIZE * 2 + 2;
export const BINGO_GOALS = [1, 2, 3, 4, 5];
export const BINGO_DEFAULT_GOAL = 3;

// 판의 칸 열쇠 — 규칙이 이 목록으로 칸 맵의 모양을 못 박습니다("0" ~ "24")
export const BINGO_CELL_KEYS = Array.from({ length: BINGO_CELLS }, (_, i) => String(i));

// 줄 — 가로 다섯 · 세로 다섯 · 대각선 둘. 칸 번호는 r * 5 + c.
export const BINGO_LINES = (() => {
  const out = [];
  for (let r = 0; r < BINGO_SIZE; r++) {
    out.push({ key: `r${r}`, cells: Array.from({ length: BINGO_SIZE }, (_, c) => r * BINGO_SIZE + c) });
  }
  for (let c = 0; c < BINGO_SIZE; c++) {
    out.push({ key: `c${c}`, cells: Array.from({ length: BINGO_SIZE }, (_, r) => r * BINGO_SIZE + c) });
  }
  out.push({ key: "d0", cells: Array.from({ length: BINGO_SIZE }, (_, i) => i * BINGO_SIZE + i) });
  out.push({ key: "d1", cells: Array.from({ length: BINGO_SIZE }, (_, i) => i * BINGO_SIZE + (BINGO_SIZE - 1 - i)) });
  return out;
})();

// 낱말 하나를 칸에 넣을 모양으로 — 앞뒤 빈칸을 걷고, 너무 길면 버립니다.
export function cleanBingoWord(raw) {
  const t = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!t || t.length > BINGO_WORD_MAX) return "";
  return t;
}

// 닿소리 낱말 문서들 → 낱말 상자(겹치지 않게, 처음 나온 차례 그대로).
export function bingoWordPool(words) {
  const seen = new Set();
  const out = [];
  for (const w of words ?? []) {
    const t = cleanBingoWord(typeof w === "string" ? w : w?.text ?? w?.word);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= BINGO_POOL_MAX) break;
  }
  return out;
}

export function normalizeBingoGoal(goal) {
  const n = Math.round(Number(goal));
  return BINGO_GOALS.includes(n) ? n : BINGO_DEFAULT_GOAL;
}

// 활동 문서의 bingo → 화면이 쓰는 모양. 없으면 null.
export function normalizeBingo(raw) {
  if (!raw || typeof raw !== "object") return null;
  const words = bingoWordPool(Array.isArray(raw.words) ? raw.words : []);
  const inPool = new Set(words);
  const seen = new Set();
  const called = [];
  for (const w of Array.isArray(raw.called) ? raw.called : []) {
    const t = cleanBingoWord(w);
    if (!t || seen.has(t) || !inPool.has(t)) continue;
    seen.add(t);
    called.push(t);
  }
  return {
    stage: raw.stage === "play" ? "play" : "fill",
    words,
    called,
    goal: normalizeBingoGoal(raw.goal),
  };
}

// 판 문서의 칸 맵 → 길이 25의 배열(빈칸은 "").
export function normalizeBingoCells(cells) {
  const out = Array(BINGO_CELLS).fill("");
  if (!cells || typeof cells !== "object") return out;
  for (let i = 0; i < BINGO_CELLS; i++) out[i] = cleanBingoWord(cells[i] ?? cells[String(i)]);
  return out;
}

export function bingoFilledCount(cells) {
  return (cells ?? []).filter(Boolean).length;
}

// 판에 이미 놓인 낱말(겹친 것 포함 한 번씩)
export function bingoUsedWords(cells) {
  return new Set((cells ?? []).filter(Boolean));
}

// 판 하나의 진행 — 부른 낱말(차례 목록)로 칸을 표시하고 줄을 셉니다.
//   marked   Set(칸 번호) — 부른 낱말이 든 칸
//   lines    완성된 줄의 key 목록 · lineCells Set(완성된 줄에 든 칸)
//   count    완성된 줄 수 · filled 채운 칸 수
//   bingoAt  목표 줄 수에 닿은 것이 몇 번째 부른 낱말에서인가(1부터, 못 닿으면 null)
//            — 먼저 빙고를 한 판이 앞에 서게 합니다.
export function bingoProgress(cells, called = [], goal = BINGO_DEFAULT_GOAL) {
  const list = normalizeBingoCells(Array.isArray(cells) ? Object.fromEntries(cells.map((w, i) => [i, w])) : cells);
  const at = new Map(); // 낱말 → 그 낱말이 든 칸들
  list.forEach((w, i) => {
    if (!w) return;
    if (!at.has(w)) at.set(w, []);
    at.get(w).push(i);
  });
  const need = normalizeBingoGoal(goal);
  const marked = new Set();
  let bingoAt = null;
  const countLines = () => BINGO_LINES.filter((l) => l.cells.every((i) => marked.has(i))).length;
  (called ?? []).forEach((w, n) => {
    const hit = at.get(w);
    if (!hit) return;
    hit.forEach((i) => marked.add(i));
    if (bingoAt == null && countLines() >= need) bingoAt = n + 1;
  });
  const done = BINGO_LINES.filter((l) => l.cells.every((i) => marked.has(i)));
  const lineCells = new Set(done.flatMap((l) => l.cells));
  return {
    cells: list,
    marked,
    lines: done.map((l) => l.key),
    lineCells,
    count: done.length,
    filled: bingoFilledCount(list),
    bingoAt,
    bingo: done.length >= need,
  };
}

// 순위 — 빙고를 먼저 한 판이 앞(bingoAt이 작은 차례), 그다음 줄 수 · 표시한 칸 ·
// 채운 칸, 같으면 원래 차례(order). rows: [{ ...bingoProgress, order }]
export function rankBingo(rows) {
  return [...(rows ?? [])].sort((a, b) => {
    const ab = a.bingoAt ?? Infinity;
    const bb = b.bingoAt ?? Infinity;
    if (ab !== bb) return ab - bb;
    if (b.count !== a.count) return b.count - a.count;
    if (b.marked.size !== a.marked.size) return b.marked.size - a.marked.size;
    if (b.filled !== a.filled) return b.filled - a.filled;
    return (a.order ?? 0) - (b.order ?? 0);
  });
}

function shuffle(list, rng = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 빈칸을 낱말 상자에서 무작위로 채웁니다 — 이미 놓인 낱말은 다시 안 씁니다.
// 돌려주는 값: { "칸 번호": 낱말 } (새로 채울 칸만). 낱말이 모자라면 남는 칸은 그대로.
export function bingoRandomFill(cells, pool, rng = Math.random) {
  const list = normalizeBingoCells(Array.isArray(cells) ? Object.fromEntries(cells.map((w, i) => [i, w])) : cells);
  const used = bingoUsedWords(list);
  const left = shuffle(bingoWordPool(pool).filter((w) => !used.has(w)), rng);
  const set = {};
  list.forEach((w, i) => {
    if (w || left.length === 0) return;
    set[String(i)] = left.shift();
  });
  return set;
}

// 교사의 '무작위로 부르기' — 아직 안 부른 낱말 가운데 **판에 놓인 것**에서 먼저
// 고릅니다(아무 판에도 없는 낱말을 부르면 아무 일도 안 일어나 수업이 늘어집니다).
// 판에 놓인 낱말을 다 불렀으면 상자의 남은 낱말에서. 없으면 null.
export function nextBingoCall(boards, words, called, rng = Math.random) {
  const done = new Set(called ?? []);
  const pool = bingoWordPool(words).filter((w) => !done.has(w));
  if (pool.length === 0) return null;
  const onBoards = new Set();
  (boards ?? []).forEach((cells) => normalizeBingoCells(cells).forEach((w) => w && onBoards.add(w)));
  const hot = pool.filter((w) => onBoards.has(w));
  const from = hot.length ? hot : pool;
  return from[Math.floor(rng() * from.length)] ?? null;
}
