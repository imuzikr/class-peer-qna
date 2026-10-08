// =============================================================
// 가로세로 낱말퀴즈 — 닿소리 채우기의 낱말로 만듭니다 (순수 계산)
// -------------------------------------------------------------
// 학생마다 자기가 넣은 낱말 가운데 셋을 골라 뜻풀이를 적고(entries/{uid}의
// answers.crossword), 교사가 그것을 모아 퍼즐 하나를 짭니다. 짠 퍼즐은 활동
// 문서의 `crossword`에 담아 반 전체가 **같은 퍼즐**을 풉니다.
//
// [한 칸 = 음절 하나] 한글 낱말은 음절 단위로 교차합니다('광합성' × '합성어'는
//   '합'이나 '성'에서 만납니다). 그래서 낱말은 **한글 음절만**(띄어쓰기·영문·
//   숫자 없이) 두 글자 이상이어야 판에 오를 수 있습니다(`crosswordWordOk`).
//
// [짜는 방법] 가장 긴 낱말 하나를 가운데 놓고, 남은 낱말 가운데 이미 놓인
//   낱말과 같은 음절을 가진 것을 골라 그 음절에서 직각으로 겹쳐 놓습니다.
//   겹치는 칸 말고는 다른 낱말과 붙지 않아야 합니다(옆 칸 · 앞뒤 칸이 비어야
//   함) — 붙으면 뜻 없는 글자 줄이 생깁니다. 놓을 자리가 없는 낱말은 뺍니다.
//   순서를 바꿔 가며 여러 번 시도하고, **가장 많이 놓인 판**(같으면 교차가
//   많고 판이 작은 것)을 고릅니다.
//
// [몇 개를 넣나] 목표는 15개(`CROSSWORD_TARGET`)입니다. 15개를 다 놓을 수
//   없으면 14, 13 … 개로 줄여 갑니다 — 시도마다 놓을 수 있는 만큼 놓으므로,
//   여러 번 시도한 가운데 가장 많이 놓인 수가 곧 '만들 수 있는 가장 큰 퍼즐'
//   입니다(15개를 넘기지는 않습니다).
// =============================================================

export const CROSSWORD_TARGET = 15;   // 퍼즐에 넣으려는 낱말 수
export const CROSSWORD_PICKS = 3;     // 학생 한 사람이 고르는 낱말 수
export const CROSSWORD_MAX_SIZE = 15; // 판 한 변의 최대 칸 수
export const CROSSWORD_WORD_MAX = 8;  // 낱말 하나의 최대 글자 수
export const CROSSWORD_CLUE_MAX = 100; // 뜻풀이 최대 글자 수

const HANGUL = /^[가-힣]+$/;

// 판에 오를 수 있는 낱말인가 — 한글 음절만, 2~8글자.
export function crosswordWordOk(word) {
  const w = String(word ?? "").trim();
  return HANGUL.test(w) && w.length >= 2 && w.length <= CROSSWORD_WORD_MAX;
}

// 못 오르는 까닭 — 학생 화면이 낱말 칩 옆에 적습니다. 오를 수 있으면 "".
export function crosswordWordProblem(word) {
  const w = String(word ?? "").trim();
  if (!w) return "빈 낱말";
  if (!HANGUL.test(w)) return "한글로만 된 낱말만 쓸 수 있어요";
  if (w.length < 2) return "두 글자 이상이어야 해요";
  if (w.length > CROSSWORD_WORD_MAX) return `${CROSSWORD_WORD_MAX}글자까지만 쓸 수 있어요`;
  return "";
}

// 학생 기록의 낱말 풀이 목록을 고릅니다 — 낱말은 셋까지, 칸 모양을 맞춥니다.
export function normalizeCrosswordPicks(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const it of list) {
    const word = String(it?.word ?? "").trim();
    if (!word || seen.has(word)) continue;
    seen.add(word);
    out.push({ word, clue: String(it?.clue ?? "").slice(0, CROSSWORD_CLUE_MAX) });
    if (out.length >= CROSSWORD_PICKS) break;
  }
  return out;
}

// 다 썼나(= 제출) — 셋을 골랐고 셋 다 뜻풀이가 있음.
export function crosswordPicksDone(picks) {
  const list = normalizeCrosswordPicks(picks);
  return list.length >= CROSSWORD_PICKS && list.every((p) => p.clue.trim());
}

// 뜻풀이에 낱말이 그대로 들어 있나 — 그러면 풀 거리가 없습니다(경고만).
export function clueRevealsWord(word, clue) {
  const w = String(word ?? "").trim();
  return !!w && String(clue ?? "").includes(w);
}

// 학생 기록들 → 퍼즐 재료. 같은 낱말은 먼저 낸 한 사람 것만 씁니다.
//   entries: [{ authorId, answers: { crossword: [{word, clue}] } }]
export function crosswordCandidates(entries) {
  const out = [];
  const seen = new Set();
  const sorted = [...(entries ?? [])].sort(
    (a, b) => stampOf(a.updatedAt) - stampOf(b.updatedAt)
  );
  for (const e of sorted) {
    for (const p of normalizeCrosswordPicks(e?.answers?.crossword)) {
      const clue = p.clue.trim();
      if (!clue || !crosswordWordOk(p.word) || seen.has(p.word)) continue;
      seen.add(p.word);
      out.push({ word: p.word, clue, uid: e.authorId ?? e.id ?? null });
    }
  }
  return out;
}

function stampOf(t) {
  if (!t) return Infinity;
  if (typeof t === "number") return t;
  if (t instanceof Date) return t.getTime();
  if (typeof t.toMillis === "function") return t.toMillis();
  if (typeof t.seconds === "number") return t.seconds * 1000;
  return Infinity;
}

// ─── 판 짜기 ─────────────────────────────────────────────────
const DIRS = {
  across: { dr: 0, dc: 1 },
  down: { dr: 1, dc: 0 },
};
const key = (r, c) => `${r},${c}`;

// 시도 한 번 — 낱말 순서(order)를 받아 놓을 수 있는 만큼 놓습니다.
function attempt(order, { target, maxSize, rng }) {
  const cells = new Map(); // "r,c" → { ch, dirs:Set }
  const placed = [];
  let bounds = null; // { r0, r1, c0, c1 }

  const charAt = (r, c) => cells.get(key(r, c))?.ch ?? null;

  function fits(word, r, c, dir) {
    const { dr, dc } = DIRS[dir];
    const len = word.length;
    // 앞뒤 칸이 비어야 — 붙으면 더 긴 낱말이 됩니다
    if (charAt(r - dr, c - dc) !== null) return -1;
    if (charAt(r + dr * len, c + dc * len) !== null) return -1;
    let crosses = 0;
    for (let i = 0; i < len; i++) {
      const rr = r + dr * i;
      const cc = c + dc * i;
      const cell = cells.get(key(rr, cc));
      if (cell) {
        if (cell.ch !== word[i] || cell.dirs.has(dir)) return -1;
        crosses += 1;
      } else {
        // 빈 칸이면 옆(직각 방향) 칸도 비어야 — 붙으면 뜻 없는 글자 줄이 생깁니다
        if (charAt(rr + dc, cc + dr) !== null) return -1;
        if (charAt(rr - dc, cc - dr) !== null) return -1;
      }
    }
    // 판 크기
    const nb = grow(bounds, r, c, r + dr * (len - 1), c + dc * (len - 1));
    if (nb.r1 - nb.r0 + 1 > maxSize || nb.c1 - nb.c0 + 1 > maxSize) return -1;
    return crosses;
  }

  function put(word, r, c, dir, extra) {
    const { dr, dc } = DIRS[dir];
    for (let i = 0; i < word.length; i++) {
      const k = key(r + dr * i, c + dc * i);
      const cell = cells.get(k) ?? { ch: word[i], dirs: new Set() };
      cell.dirs.add(dir);
      cells.set(k, cell);
    }
    bounds = grow(bounds, r, c, r + dr * (word.length - 1), c + dc * (word.length - 1));
    placed.push({ ...extra, word, row: r, col: c, dir });
  }

  // 첫 낱말 — 가로로 가운데에
  const [first, ...rest] = order;
  if (!first) return null;
  put(first.word, 0, 0, "across", first);
  let pool = rest;

  while (placed.length < target && pool.length) {
    let best = null;
    for (const cand of pool) {
      const w = cand.word;
      for (let i = 0; i < w.length; i++) {
        // 이미 놓인 칸 가운데 같은 음절을 찾아 직각으로 겹쳐 봅니다
        for (const [k, cell] of cells) {
          if (cell.ch !== w[i] || cell.dirs.size >= 2) continue;
          const [r0, c0] = k.split(",").map(Number);
          const dir = cell.dirs.has("across") ? "down" : "across";
          const { dr, dc } = DIRS[dir];
          const r = r0 - dr * i;
          const c = c0 - dc * i;
          const crosses = fits(w, r, c, dir);
          if (crosses < 1) continue;
          const nb = grow(bounds, r, c, r + dr * (w.length - 1), c + dc * (w.length - 1));
          const area = (nb.r1 - nb.r0 + 1) * (nb.c1 - nb.c0 + 1);
          // 교차가 많을수록, 판이 덜 커질수록 — 같으면 우연에 맡깁니다
          const score = crosses * 100 - area * 0.15 + rng() * 40;
          if (!best || score > best.score) best = { cand, r, c, dir, score };
        }
      }
    }
    if (!best) break;
    put(best.cand.word, best.r, best.c, best.dir, best.cand);
    pool = pool.filter((p) => p !== best.cand);
  }

  let crossings = 0;
  for (const cell of cells.values()) if (cell.dirs.size >= 2) crossings += 1;
  const area = (bounds.r1 - bounds.r0 + 1) * (bounds.c1 - bounds.c0 + 1);
  return { placed, bounds, crossings, area };
}

function grow(b, r0, c0, r1, c1) {
  if (!b) return { r0: Math.min(r0, r1), r1: Math.max(r0, r1), c0: Math.min(c0, c1), c1: Math.max(c0, c1) };
  return {
    r0: Math.min(b.r0, r0, r1),
    r1: Math.max(b.r1, r0, r1),
    c0: Math.min(b.c0, c0, c1),
    c1: Math.max(b.c1, c0, c1),
  };
}

function shuffle(list, rng) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 같은 음절을 가진 다른 낱말이 몇 개인가 — 이어질 구석이 많은 낱말을 앞에 둡니다
function linkCounts(words) {
  const bySyl = new Map();
  words.forEach((w, i) => {
    new Set(w.word).forEach((ch) => {
      if (!bySyl.has(ch)) bySyl.set(ch, new Set());
      bySyl.get(ch).add(i);
    });
  });
  return words.map((w, i) => {
    const linked = new Set();
    new Set(w.word).forEach((ch) => bySyl.get(ch).forEach((j) => { if (j !== i) linked.add(j); }));
    return linked.size;
  });
}

// 퍼즐 만들기.
//   candidates: [{ word, clue, uid }]
//   돌려주는 값: { rows, cols, entries: [{ num, dir, row, col, word, clue, uid }] }
//     또는 낱말이 둘도 안 이어지면 null.
export function buildCrossword(candidates, {
  target = CROSSWORD_TARGET,
  maxSize = CROSSWORD_MAX_SIZE,
  attempts = 200,
  rng = Math.random,
} = {}) {
  const words = [];
  const seen = new Set();
  for (const c of candidates ?? []) {
    const word = String(c?.word ?? "").trim();
    if (!crosswordWordOk(word) || seen.has(word)) continue;
    seen.add(word);
    words.push({ word, clue: String(c?.clue ?? "").trim(), uid: c?.uid ?? null });
  }
  if (words.length < 2) return null;

  const links = linkCounts(words);
  // 어디와도 안 이어지는 낱말은 첫 낱말로 세우지 않습니다(혼자 남습니다)
  const linkable = words.filter((_, i) => links[i] > 0);
  if (linkable.length < 2) return null;

  let best = null;
  for (let t = 0; t < attempts; t++) {
    // 첫 낱말: 길고 이어질 구석이 많은 것 가운데서 고릅니다. 나머지는 섞되
    // 이어질 구석이 많은 낱말이 앞쪽에 오게 무게를 둡니다.
    const order = shuffle(linkable, rng)
      .map((w) => ({ w, s: links[words.indexOf(w)] + w.word.length * 0.5 + rng() * 3 }))
      .sort((a, b) => b.s - a.s)
      .map((x) => x.w);
    const res = attempt(order, { target, maxSize, rng });
    if (!res || res.placed.length < 2) continue;
    if (
      !best
      || res.placed.length > best.placed.length
      || (res.placed.length === best.placed.length && res.crossings > best.crossings)
      || (res.placed.length === best.placed.length && res.crossings === best.crossings && res.area < best.area)
    ) best = res;
    if (best.placed.length >= target && t >= 20) break; // 가득 찼으면 조금만 더 다듬고 그만
  }
  if (!best) return null;
  return numberLayout(best.placed, best.bounds);
}

// 왼쪽 위를 0,0으로 옮기고 번호를 매깁니다 — 신문 퍼즐처럼 읽는 차례(위→아래,
// 왼→오)로, 가로와 세로가 같은 칸에서 시작하면 같은 번호입니다.
function numberLayout(placed, b) {
  const shifted = placed.map((p) => ({ ...p, row: p.row - b.r0, col: p.col - b.c0 }));
  const starts = [...new Set(shifted.map((p) => key(p.row, p.col)))]
    .map((k) => k.split(",").map(Number))
    .sort((a, b2) => a[0] - b2[0] || a[1] - b2[1]);
  const numOf = new Map(starts.map(([r, c], i) => [key(r, c), i + 1]));
  const entries = shifted
    .map((p) => ({
      num: numOf.get(key(p.row, p.col)),
      dir: p.dir,
      row: p.row,
      col: p.col,
      word: p.word,
      clue: p.clue,
      uid: p.uid ?? null,
    }))
    .sort((a, c) => (a.dir === c.dir ? a.num - c.num : a.dir === "across" ? -1 : 1));
  return { rows: b.r1 - b.r0 + 1, cols: b.c1 - b.c0 + 1, entries };
}

// 판의 칸들 — "r,c" → { ch, num, entries:[번호들] }. 화면이 격자를 그릴 때 씁니다.
export function crosswordCells(puzzle) {
  const map = new Map();
  (puzzle?.entries ?? []).forEach((e, idx) => {
    const { dr, dc } = DIRS[e.dir] ?? DIRS.across;
    for (let i = 0; i < e.word.length; i++) {
      const k = key(e.row + dr * i, e.col + dc * i);
      const cell = map.get(k) ?? { ch: e.word[i], num: null, entries: [] };
      if (i === 0) cell.num = e.num;
      cell.entries.push(idx);
      map.set(k, cell);
    }
  });
  return map;
}

// 한 낱말이 차지하는 칸 열쇠들
export function entryCellKeys(entry) {
  const { dr, dc } = DIRS[entry?.dir] ?? DIRS.across;
  return Array.from({ length: entry?.word?.length ?? 0 }, (_, i) =>
    key(entry.row + dr * i, entry.col + dc * i)
  );
}

// 활동 문서에 실려 온 퍼즐을 거릅니다 — 모양이 어긋난 낱말은 뺍니다.
export function normalizeCrossword(raw) {
  if (!raw || typeof raw !== "object") return null;
  const rows = Number(raw.rows);
  const cols = Number(raw.cols);
  if (!(rows > 0 && cols > 0 && rows <= 40 && cols <= 40)) return null;
  const entries = (Array.isArray(raw.entries) ? raw.entries : [])
    .filter((e) =>
      e && crosswordWordOk(e.word) && (e.dir === "across" || e.dir === "down")
      && Number.isInteger(e.row) && Number.isInteger(e.col)
    )
    .map((e) => ({
      num: Number(e.num) || 0,
      dir: e.dir,
      row: e.row,
      col: e.col,
      word: e.word,
      clue: String(e.clue ?? ""),
      uid: e.uid ?? null,
    }));
  if (!entries.length) return null;
  return { rows, cols, entries, createdAt: raw.createdAt ?? null };
}
