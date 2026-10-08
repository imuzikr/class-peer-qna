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

// 낱말 길이 — 모둠 퍼즐은 반 전체가 읽는 문서에 낱말을 안 적고 길이(len)만
// 적습니다(정답은 지문 hash로만). 그래서 두 모양을 다 받습니다.
export function entryLen(entry) {
  return Number(entry?.len) || entry?.word?.length || 0;
}

// 판의 칸들 — "r,c" → { ch, num, entries:[번호들] }. 화면이 격자를 그릴 때 씁니다.
//   모둠 퍼즐처럼 낱말이 없으면 ch는 null입니다.
export function crosswordCells(puzzle) {
  const map = new Map();
  (puzzle?.entries ?? []).forEach((e, idx) => {
    const { dr, dc } = DIRS[e.dir] ?? DIRS.across;
    const len = entryLen(e);
    for (let i = 0; i < len; i++) {
      const k = key(e.row + dr * i, e.col + dc * i);
      const cell = map.get(k) ?? { ch: e.word?.[i] ?? null, num: null, entries: [] };
      if (cell.ch == null && e.word?.[i]) cell.ch = e.word[i];
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
  return Array.from({ length: entryLen(entry) }, (_, i) =>
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

// =============================================================
// 모둠 퍼즐 — 모둠 활동으로 만든 닿소리 채우기의 가로세로
// -------------------------------------------------------------
// 개별 활동은 위의 방식(학생마다 셋 골라 풀이 → 반이 같은 판을 각자 풂)
// 그대로이고, 모둠 활동은 흐름이 셋입니다.
//   ① 생성 — 활동에 나온 낱말 **전부**를 재료로 참여 학생 수만큼 이어 판을
//      짜고, 놓인 낱말을 무작위로 모둠마다 구성원 수만큼 나눠 줍니다.
//   ② 힌트 쓰기 — 모둠이 맡은 낱말마다 누가 쓸지 정하고 힌트를 적습니다.
//   ③ 낱말 채우기 — 모둠마다 판 하나를 함께 채웁니다(동시 편집).
//
// [정답을 반 전체 문서에 안 적습니다] 판 모양·번호·힌트는 활동 문서
//   (반 전체가 읽음)에 두지만 낱말은 **지문(hash)**만 둡니다. 낱말 자체는
//   그 낱말을 맡은 모둠의 힌트 문서에만 있어(그 모둠과 교사만 읽음), 개발자
//   도구로 활동 문서를 열어도 답이 보이지 않습니다. 학생 화면은 칸에 든
//   글자를 이어 지문을 내 견주어 '맞았나'만 압니다.
//   지문은 암호 강도가 아닙니다(32비트) — 화면에서 답을 그대로 읽어 낼 길을
//   막는 것이 목적이고, 낱말 사전을 들고 하나씩 대 보는 것까지는 못 막습니다.
//
// [우리 모둠 낱말 = 열쇠 칸] 힌트를 쓴 모둠은 제 낱말의 답을 이미 압니다.
//   그래서 그 낱말은 판이 열릴 때 미리 채워진 칸으로 두고(고칠 수 없음)
//   점수에서 뺍니다 — 실제 퍼즐처럼 실마리 칸 노릇을 합니다.
// =============================================================
export const CROSSWORD_GROUP_MAX_SIZE = 21; // 학생 수(30명 안팎)만큼 놓을 판 천장
export const CROSSWORD_HINT_MAX = CROSSWORD_CLUE_MAX;

// 지문 — FNV-1a 32비트를 36진수로. salt는 퍼즐마다 달라(같은 낱말도 퍼즐마다
// 다른 지문) 지난 퍼즐의 지문으로 이번 답을 짐작할 수 없습니다.
export function xwHash(word, salt = "") {
  const s = `${salt}|${String(word ?? "")}`;
  let h = 0x811c9dc5;
  for (const ch of s) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

// 낱말 문서들 → 판에 오를 수 있는 낱말(같은 것은 한 번).
//   words: [{ text }] — 닿소리 판의 낱말 문서 그대로
export function crosswordWordPool(words) {
  const seen = new Set();
  const out = [];
  for (const w of words ?? []) {
    const t = String(w?.text ?? w?.word ?? "").trim();
    if (!crosswordWordOk(t) || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

// 낱말 count개를 모둠에 나눕니다 — 모둠마다 구성원 수(size)까지. 낱말이
// 모자라면 모둠을 돌아가며 하나씩 주어 모자람이 한 모둠에 몰리지 않게 합니다.
// 돌려주는 값: 낱말 차례마다 groupId(못 받은 낱말은 없음 — count가 자리보다
// 많으면 남는 낱말은 null).
export function assignEntriesToGroups(count, groups, rng = Math.random) {
  const order = shuffle(
    (groups ?? []).filter((g) => g?.id && (g.size ?? 0) > 0),
    rng
  );
  const left = new Map(order.map((g) => [g.id, g.size]));
  const owners = [];
  let progress = true;
  while (owners.length < count && progress) {
    progress = false;
    for (const g of order) {
      if (owners.length >= count) break;
      if (left.get(g.id) > 0) {
        owners.push(g.id);
        left.set(g.id, left.get(g.id) - 1);
        progress = true;
      }
    }
  }
  while (owners.length < count) owners.push(null);
  // 판 위 자리와 모둠이 이어지지 않게(가로 1번이 늘 첫 모둠이 되지 않게) 섞습니다
  return shuffle(owners, rng);
}

// 모둠 퍼즐 만들기.
//   words:  낱말 문자열 목록(crosswordWordPool)
//   groups: [{ id, size }] — size는 그 모둠 구성원 수
//   돌려주는 값: { puzzle, hints, target } 또는 null
//     puzzle — 활동 문서에 담을 것(낱말 없음 · 지문만)
//     hints  — 모둠 힌트 문서들 [{ idx, groupId, word, num, dir, len }]
export function buildGroupCrossword(words, groups, {
  salt = "",
  maxSize = CROSSWORD_GROUP_MAX_SIZE,
  attempts = 200,
  rng = Math.random,
} = {}) {
  const target = (groups ?? []).reduce((n, g) => n + Math.max(0, g?.size ?? 0), 0);
  if (target < 2) return null;
  const built = buildCrossword(
    (words ?? []).map((w) => ({ word: w, clue: "" })),
    { target, maxSize, attempts, rng }
  );
  if (!built) return null;
  const owners = assignEntriesToGroups(built.entries.length, groups, rng);
  const kept = built.entries
    .map((e, i) => ({ e, groupId: owners[i] }))
    .filter((x) => x.groupId);
  const entries = kept.map(({ e, groupId }) => ({
    num: e.num,
    dir: e.dir,
    row: e.row,
    col: e.col,
    len: e.word.length,
    groupId,
    hash: xwHash(e.word, salt),
    clue: "",
  }));
  const hints = kept.map(({ e, groupId }, idx) => ({
    idx,
    groupId,
    word: e.word,
    num: e.num,
    dir: e.dir,
    len: e.word.length,
  }));
  return {
    puzzle: { mode: "group", stage: "hint", rows: built.rows, cols: built.cols, salt, entries },
    hints,
    target,
  };
}

export function isGroupCrossword(raw) {
  return raw?.mode === "group";
}

// 활동 문서의 모둠 퍼즐을 거릅니다 — 모양이 어긋난 낱말은 뺍니다.
export function normalizeGroupCrossword(raw) {
  if (!isGroupCrossword(raw)) return null;
  const rows = Number(raw.rows);
  const cols = Number(raw.cols);
  if (!(rows > 0 && cols > 0 && rows <= 40 && cols <= 40)) return null;
  const entries = (Array.isArray(raw.entries) ? raw.entries : [])
    .filter((e) =>
      e && (e.dir === "across" || e.dir === "down")
      && Number.isInteger(e.row) && Number.isInteger(e.col)
      && Number.isInteger(e.len) && e.len >= 2 && e.len <= CROSSWORD_WORD_MAX
      && typeof e.groupId === "string" && typeof e.hash === "string"
    )
    .map((e) => ({
      num: Number(e.num) || 0,
      dir: e.dir,
      row: e.row,
      col: e.col,
      len: e.len,
      groupId: e.groupId,
      hash: e.hash,
      clue: String(e.clue ?? "").slice(0, CROSSWORD_HINT_MAX),
    }));
  if (!entries.length) return null;
  return {
    mode: "group",
    stage: raw.stage === "solve" ? "solve" : "hint",
    rows,
    cols,
    salt: String(raw.salt ?? ""),
    entries,
    createdAt: raw.createdAt ?? null,
  };
}

// 힌트 문서 하나를 거릅니다.
export function normalizeXwHint(raw, idx) {
  return {
    idx: Number.isInteger(raw?.idx) ? raw.idx : Number(idx) || 0,
    groupId: String(raw?.groupId ?? ""),
    word: String(raw?.word ?? ""),
    num: Number(raw?.num) || 0,
    dir: raw?.dir === "down" ? "down" : "across",
    len: Number(raw?.len) || String(raw?.word ?? "").length,
    writerUid: raw?.writerUid || null,
    writerName: String(raw?.writerName ?? ""),
    hint: String(raw?.hint ?? "").slice(0, CROSSWORD_HINT_MAX),
  };
}

// 힌트를 냈나 — 쓸 사람을 정했고 글이 있음.
export function xwHintDone(h) {
  return !!h?.writerUid && !!String(h?.hint ?? "").trim();
}

// 우리 모둠 낱말이 차지하는 칸 → 글자(열쇠 칸).
//   hints: 그 모둠의 힌트 문서들(낱말이 들어 있음)
export function fixedLettersOf(puzzle, hints) {
  const map = new Map();
  for (const h of hints ?? []) {
    const e = puzzle?.entries?.[h.idx];
    if (!e || !h.word || h.word.length !== entryLen(e)) continue;
    entryCellKeys(e).forEach((k, i) => map.set(k, h.word[i]));
  }
  return map;
}

// 판 위에서 한 낱말이 지금 무엇으로 읽히나(열쇠 칸이 먼저).
export function boardWordOf(entry, letters, fixed) {
  return entryCellKeys(entry)
    .map((k) => fixed?.get(k) ?? letters?.[k] ?? "")
    .join("");
}

// 맞았나 — 칸이 다 찼고 지문이 같음.
export function boardEntrySolved(entry, letters, fixed, salt) {
  const w = boardWordOf(entry, letters, fixed);
  return w.length === entryLen(entry) && xwHash(w, salt) === entry.hash;
}

// 한 모둠의 풀이 현황.
//   돌려주는 값: { solved:Set(낱말 차례), total, solvedKeys:Set(칸), ownKeys:Set(칸) }
//   우리 모둠 낱말은 total·solved 어디에도 안 셉니다(열쇠 칸).
export function groupSolveProgress(puzzle, groupId, letters, fixed) {
  const solved = new Set();
  const solvedKeys = new Set();
  const ownKeys = new Set(fixed?.keys?.() ?? []);
  let total = 0;
  (puzzle?.entries ?? []).forEach((e, i) => {
    if (e.groupId === groupId) return;
    // 칸이 전부 열쇠 칸인 낱말(우리 낱말 둘 사이에 낀 두 글자 낱말 등)은
    // 풀 것이 없어 세지 않습니다 — 처음부터 '맞힘'으로 시작하면 점수가 거짓말을 합니다.
    if (entryCellKeys(e).every((k) => fixed?.has(k))) return;
    total += 1;
    if (boardEntrySolved(e, letters, fixed, puzzle.salt)) {
      solved.add(i);
      entryCellKeys(e).forEach((k) => solvedKeys.add(k));
    }
  });
  return { solved, total, solvedKeys, ownKeys };
}

// 한 낱말을 넣을 때 칸마다 무엇을 쓰고 지울지.
//   typed     — 학생이 적은 글자(띄어쓰기는 걷음)
//   protect   — 지우면 안 되는 칸(다른 맞힌 낱말의 칸) — 짧게 적었다고 남의
//               정답을 지우면 안 됩니다
//   돌려주는 값: { set: { 칸: 글자 }, del: [칸] }
export function xwCommitPlan(entry, typed, letters, fixed, protect = new Set()) {
  const chars = [...String(typed ?? "").replace(/\s+/g, "")];
  const set = {};
  const del = [];
  entryCellKeys(entry).forEach((k, i) => {
    if (fixed?.has(k)) return;
    const ch = chars[i];
    if (ch) {
      if (letters?.[k] !== ch) set[k] = ch;
    } else if (letters?.[k] && !protect.has(k)) {
      del.push(k);
    }
  });
  return { set, del };
}

// 모둠 순위 — 맞힌 수가 많은 차례, 같으면 비율, 같으면 모둠 차례.
export function rankGroupProgress(list) {
  return [...(list ?? [])].sort((a, b) =>
    (b.solved - a.solved)
    || ((b.total ? b.solved / b.total : 0) - (a.total ? a.solved / a.total : 0))
    || ((a.order ?? 0) - (b.order ?? 0))
  );
}

// ─── 개별 활동의 가로세로 — 학생마다 판 하나 ─────────────────
// 닿소리 채우기의 개별 활동은 판(group)이 한 사람짜리라, 모둠 퍼즐을 그대로
// 쓰면 '모둠마다 구성원 수만큼' = **한 사람에 낱말 하나**가 됩니다.
// 다른 학생 판은 정답이 든 문서라 못 읽으므로, 학생마다 제 판의 **요약**
// (xwProgress — 글자 없이 칸 자리와 맞힌 낱말 차례뿐)을 적어 두고 반이 그것을
// 읽어 '가장 많이 채운 친구'의 미니맵을 그립니다.

// 한 학생 판의 요약.
//   hints: 그 학생의 힌트 문서들(제 낱말 · 제가 쓴 힌트)
//   돌려주는 값: { solved, total, cells, hintChars, filled:[칸], solvedIdx:[차례] }
//     cells     — 제가 채운 칸 수(열쇠 칸 = 제 낱말은 안 셈)
//     hintChars — 제가 쓴 힌트의 글자 수(띄어쓰기 뺌)
export function soloBoardSummary(puzzle, groupId, letters, fixed, hints = []) {
  const p = groupSolveProgress(puzzle, groupId, letters, fixed);
  const cellsOnBoard = crosswordCells(puzzle);
  const filled = Object.keys(letters ?? {})
    .filter((k) => letters[k] && cellsOnBoard.has(k) && !fixed?.has(k))
    .sort();
  const hintChars = (hints ?? []).reduce(
    (n, h) => n + String(h?.hint ?? "").replace(/\s+/g, "").length,
    0
  );
  return {
    solved: p.solved.size,
    total: p.total,
    cells: filled.length,
    hintChars,
    filled,
    solvedIdx: [...p.solved].sort((a, b) => a - b),
  };
}

// 저장된 요약 문서 하나를 거릅니다(남이 쓴 값이라 모양을 믿지 않습니다).
export function normalizeXwProgress(raw, id) {
  const int = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
  return {
    groupId: String(raw?.groupId ?? id ?? ""),
    uid: String(raw?.uid ?? ""),
    solved: int(raw?.solved),
    total: int(raw?.total),
    cells: int(raw?.cells),
    hintChars: int(raw?.hintChars),
    filled: (Array.isArray(raw?.filled) ? raw.filled : []).filter((k) => typeof k === "string").slice(0, 600),
    solvedIdx: (Array.isArray(raw?.solvedIdx) ? raw.solvedIdx : []).filter((i) => Number.isInteger(i)),
  };
}

// 판을 얼마나 채웠나 — 맞힌 낱말 수가 먼저, 같으면 글자 수(채운 칸 + 제 힌트).
export function soloScoreLetters(s) {
  return (s?.cells ?? 0) + (s?.hintChars ?? 0);
}

// 개별 활동의 순위 — 맞힌 낱말 → 글자 수 → 정한 차례(order).
export function rankSoloProgress(list) {
  return [...(list ?? [])].sort((a, b) =>
    ((b.solved ?? 0) - (a.solved ?? 0))
    || (soloScoreLetters(b) - soloScoreLetters(a))
    || ((a.order ?? 0) - (b.order ?? 0))
  );
}

// 요약으로 미니맵 그리기 — 글자 대신 자리표시만 넣은 letters · 맞힌 칸 ·
// 그 학생 낱말의 칸(열쇠 칸, 글자 없음).
export function summaryMinimap(puzzle, summary) {
  const letters = {};
  (summary?.filled ?? []).forEach((k) => { letters[k] = "·"; });
  const entries = puzzle?.entries ?? [];
  const solvedKeys = new Set();
  (summary?.solvedIdx ?? []).forEach((i) => {
    if (entries[i]) entryCellKeys(entries[i]).forEach((k) => solvedKeys.add(k));
  });
  const fixed = new Map();
  entries.forEach((e) => {
    if (e.groupId === summary?.groupId) entryCellKeys(e).forEach((k) => fixed.set(k, ""));
  });
  return { letters, solvedKeys, fixed };
}

// 다음(또는 앞) 낱말 — ok(i)가 참인 것 가운데, from 뒤에서부터 한 바퀴.
// 없으면 null. 판에 직접 적다가 Enter·Tab으로 넘어갈 때 씁니다.
// 화살표로 칸 옮기기 — fromKey에서 (dr, dc) 쪽으로 가며 **판에 있는 다음 칸**을
// 찾습니다. 사이의 빈자리(낱말이 없는 칸)는 건너뜁니다 — 붙어 있는 칸만 따라가면
// 낱말 끝에서 화살표가 멈춰 '안 먹는다'로 보였습니다. 그 줄에 더 없으면 null.
export function stepCell(cells, puzzle, fromKey, dr, dc) {
  if (!fromKey || !cells) return null;
  let [r, c] = String(fromKey).split(",").map(Number);
  const rows = puzzle?.rows ?? 0;
  const cols = puzzle?.cols ?? 0;
  for (;;) {
    r += dr;
    c += dc;
    if (r < 0 || c < 0 || r >= rows || c >= cols) return null;
    const k = `${r},${c}`;
    if (cells.has(k)) return k;
  }
}

// 옮겨 간 칸에서 고를 낱말 — 화살표의 방향(←→ 가로 · ↑↓ 세로)과 같은 낱말이
// 그 칸을 지나면 그것, 없으면 지금 낱말(지나면), 그도 아니면 그 칸의 첫 낱말.
export function entryForCell(entries, cell, axis, sel) {
  const through = cell?.entries ?? [];
  if (!through.length) return null;
  return through.find((i) => entries[i]?.dir === axis)
    ?? (through.includes(sel) ? sel : through[0]);
}

export function nextOpenEntry(entries, from, ok, dir = 1) {
  const n = entries?.length ?? 0;
  if (!n) return null;
  const base = from == null ? (dir > 0 ? -1 : n) : from;
  for (let step = 1; step <= n; step++) {
    const i = (((base + dir * step) % n) + n) % n;
    if (i !== from && ok(i)) return i;
  }
  return null;
}
