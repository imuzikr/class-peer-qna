// 가로세로 낱말퀴즈(lib/crossword.js) — 판이 규칙대로 짜이는가.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCrossword, crosswordCells, crosswordWordOk, crosswordCandidates,
  crosswordPicksDone, normalizeCrosswordPicks, entryCellKeys, CROSSWORD_TARGET,
} from "../../lib/crossword.js";

// 결정적인 난수 — 시험이 매번 같은 판을 봅니다
function seeded(seed = 7) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const WORDS = [
  "광합성", "합성어", "성장", "장기", "기후", "후손", "손가락", "가로수", "수소", "소나무",
  "나무늘보", "무지개", "개구리", "리듬", "듬직", "지구", "구름", "름", "태양", "양분",
  "분자", "자석", "석탄", "탄소", "소리", "리본", "본능", "능력", "력사", "사과",
].map((word) => ({ word, clue: `${word}의 뜻` }));

// 판을 칸 지도로 그려 규칙을 확인합니다 — 겹치는 칸은 글자가 같고, 낱말끼리
// 앞뒤로 붙지 않아야 합니다.
function check(puzzle) {
  const grid = new Map();
  for (const e of puzzle.entries) {
    entryCellKeys(e).forEach((k, i) => {
      if (grid.has(k)) assert.equal(grid.get(k), e.word[i], `교차 칸 ${k} 글자 다름`);
      grid.set(k, e.word[i]);
    });
    const [dr, dc] = e.dir === "across" ? [0, 1] : [1, 0];
    assert.ok(!grid.has(`${e.row - dr},${e.col - dc}`) || true);
  }
  // 앞뒤 칸이 비었나
  for (const e of puzzle.entries) {
    const [dr, dc] = e.dir === "across" ? [0, 1] : [1, 0];
    assert.ok(!grid.has(`${e.row - dr},${e.col - dc}`), `${e.word} 앞에 붙은 칸`);
    assert.ok(!grid.has(`${e.row + dr * e.word.length},${e.col + dc * e.word.length}`), `${e.word} 뒤에 붙은 칸`);
  }
  // 판 안에 있나
  for (const k of grid.keys()) {
    const [r, c] = k.split(",").map(Number);
    assert.ok(r >= 0 && c >= 0 && r < puzzle.rows && c < puzzle.cols, `${k} 판 밖`);
  }
  // 가로로 이어진 글자 줄은 모두 어떤 가로 낱말이어야 — 뜻 없는 줄이 없나
  const across = new Set(puzzle.entries.filter((e) => e.dir === "across").map((e) => e.word));
  const down = new Set(puzzle.entries.filter((e) => e.dir === "down").map((e) => e.word));
  for (let r = 0; r < puzzle.rows; r++) {
    let run = "";
    for (let c = 0; c <= puzzle.cols; c++) {
      const ch = grid.get(`${r},${c}`);
      if (ch) run += ch;
      else { if (run.length > 1) assert.ok(across.has(run), `가로 줄 '${run}'은 낱말이 아님`); run = ""; }
    }
  }
  for (let c = 0; c < puzzle.cols; c++) {
    let run = "";
    for (let r = 0; r <= puzzle.rows; r++) {
      const ch = grid.get(`${r},${c}`);
      if (ch) run += ch;
      else { if (run.length > 1) assert.ok(down.has(run), `세로 줄 '${run}'은 낱말이 아님`); run = ""; }
    }
  }
}

test("낱말이 많으면 15개까지 — 겹침·붙음 규칙을 지킴", () => {
  const p = buildCrossword(WORDS, { rng: seeded(3) });
  assert.ok(p, "판이 생김");
  assert.ok(p.entries.length <= CROSSWORD_TARGET);
  assert.ok(p.entries.length >= 10, `넣은 낱말 ${p.entries.length}`);
  check(p);
});

test("모든 낱말이 서로 이어짐(한 덩어리)", () => {
  const p = buildCrossword(WORDS, { rng: seeded(11) });
  const cells = crosswordCells(p);
  const start = [...cells.keys()][0];
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length) {
    const [r, c] = stack.pop().split(",").map(Number);
    for (const [a, b] of [[r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]]) {
      const k = `${a},${b}`;
      if (cells.has(k) && !seen.has(k)) { seen.add(k); stack.push(k); }
    }
  }
  assert.equal(seen.size, cells.size);
});

test("낱말이 적거나 안 이어지면 놓을 수 있는 만큼만", () => {
  const few = [{ word: "사과", clue: "a" }, { word: "과일", clue: "b" }, { word: "바다", clue: "c" }];
  const p = buildCrossword(few, { rng: seeded(1) });
  assert.equal(p.entries.length, 2); // 바다는 이어질 곳이 없음
  check(p);
  assert.equal(buildCrossword([{ word: "바다", clue: "" }, { word: "하늘", clue: "" }]), null);
});

test("번호 — 가로·세로가 같은 칸에서 시작하면 같은 번호, 읽는 차례대로", () => {
  const p = buildCrossword(WORDS, { rng: seeded(5) });
  const byStart = new Map();
  for (const e of p.entries) {
    const k = `${e.row},${e.col}`;
    if (byStart.has(k)) assert.equal(byStart.get(k), e.num);
    byStart.set(k, e.num);
  }
  const ordered = [...byStart.entries()]
    .map(([k, n]) => [...k.split(",").map(Number), n])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  ordered.forEach(([, , n], i) => assert.equal(n, i + 1));
});

test("판에 오를 수 있는 낱말", () => {
  assert.ok(crosswordWordOk("광합성"));
  assert.ok(!crosswordWordOk("물"));
  assert.ok(!crosswordWordOk("AI"));
  assert.ok(!crosswordWordOk("광합 작용"));
  assert.ok(!crosswordWordOk("가나다라마바사아자"));
});

test("학생 기록 → 재료: 같은 낱말은 먼저 낸 사람 것 · 풀이 없는 것은 뺌", () => {
  const entries = [
    { authorId: "b", updatedAt: 2000, answers: { crossword: [{ word: "사과", clue: "늦게" }] } },
    { authorId: "a", updatedAt: 1000, answers: { crossword: [{ word: "사과", clue: "먼저" }, { word: "과일", clue: "" }] } },
  ];
  const c = crosswordCandidates(entries);
  assert.deepEqual(c, [{ word: "사과", clue: "먼저", uid: "a" }]);
});

test("셋을 골라 셋 다 풀이를 써야 다 쓴 것", () => {
  assert.ok(!crosswordPicksDone([{ word: "사과", clue: "x" }]));
  assert.ok(!crosswordPicksDone([{ word: "사과", clue: "x" }, { word: "과일", clue: "y" }, { word: "일기", clue: " " }]));
  assert.ok(crosswordPicksDone([{ word: "사과", clue: "x" }, { word: "과일", clue: "y" }, { word: "일기", clue: "z" }]));
  assert.equal(normalizeCrosswordPicks([{ word: "a" }, { word: "a" }, { word: "b" }, { word: "c" }, { word: "d" }]).length, 3);
});

// ─── 모둠 퍼즐 ───────────────────────────────────────────────
import {
  xwHash, crosswordWordPool, assignEntriesToGroups, buildGroupCrossword,
  normalizeGroupCrossword, fixedLettersOf, boardEntrySolved, groupSolveProgress,
  xwCommitPlan, rankGroupProgress, xwHintDone, entryLen,
} from "../../lib/crossword.js";

test("지문 — 같은 낱말·같은 salt면 같고, salt가 다르면 다름", () => {
  assert.equal(xwHash("광합성", "a"), xwHash("광합성", "a"));
  assert.notEqual(xwHash("광합성", "a"), xwHash("광합성", "b"));
  assert.notEqual(xwHash("광합성", "a"), xwHash("광합상", "a"));
});

test("낱말 문서 → 판에 오를 낱말(같은 것 한 번, 안 되는 것 뺌)", () => {
  const pool = crosswordWordPool([{ text: " 사과 " }, { text: "사과" }, { text: "AI" }, { text: "물" }, { text: "과일" }]);
  assert.deepEqual(pool, ["사과", "과일"]);
});

test("모둠 배정 — 모둠마다 구성원 수까지, 모자라면 고르게", () => {
  const groups = [{ id: "g1", size: 4 }, { id: "g2", size: 4 }, { id: "g3", size: 5 }];
  const full = assignEntriesToGroups(13, groups, seeded(2));
  const count = (list, id) => list.filter((x) => x === id).length;
  assert.equal(count(full, "g1"), 4);
  assert.equal(count(full, "g2"), 4);
  assert.equal(count(full, "g3"), 5);
  const short = assignEntriesToGroups(7, groups, seeded(2));
  for (const g of groups) assert.ok(count(short, g.id) >= 2 && count(short, g.id) <= 3, `${g.id} ${count(short, g.id)}`);
  const over = assignEntriesToGroups(15, groups, seeded(2));
  assert.equal(over.filter((x) => x === null).length, 2);
});

test("모둠 퍼즐 — 반 문서에는 낱말 없이 지문만, 힌트 문서에 낱말", () => {
  const groups = [{ id: "g1", size: 4 }, { id: "g2", size: 4 }, { id: "g3", size: 4 }];
  const built = buildGroupCrossword(WORDS.map((w) => w.word), groups, { salt: "s1", rng: seeded(9) });
  assert.ok(built);
  const { puzzle, hints } = built;
  assert.equal(puzzle.entries.length, hints.length);
  assert.ok(puzzle.entries.length >= 8 && puzzle.entries.length <= 12);
  assert.ok(puzzle.entries.every((e) => !("word" in e)), "반 문서에 낱말이 실림");
  hints.forEach((h, i) => {
    assert.equal(h.idx, i);
    assert.equal(h.groupId, puzzle.entries[i].groupId);
    assert.equal(puzzle.entries[i].hash, xwHash(h.word, "s1"));
    assert.equal(entryLen(puzzle.entries[i]), h.word.length);
  });
  // 판 규칙은 낱말을 다시 붙여 확인합니다
  check({ ...puzzle, entries: puzzle.entries.map((e, i) => ({ ...e, word: hints[i].word })) });
  const norm = normalizeGroupCrossword({ ...puzzle, createdAt: 1 });
  assert.equal(norm.entries.length, puzzle.entries.length);
  assert.equal(norm.stage, "hint");
  assert.equal(normalizeGroupCrossword({ rows: 3, cols: 3, entries: [] }), null);
});

test("풀이 현황 — 우리 모둠 낱말은 열쇠 칸, 점수에서 뺌", () => {
  const groups = [{ id: "g1", size: 5 }, { id: "g2", size: 5 }];
  const { puzzle, hints } = buildGroupCrossword(WORDS.map((w) => w.word), groups, { salt: "s2", rng: seeded(4) });
  const own = hints.filter((h) => h.groupId === "g1");
  const fixed = fixedLettersOf(puzzle, own);
  const empty = groupSolveProgress(puzzle, "g1", {}, fixed);
  assert.ok(empty.total <= puzzle.entries.filter((e) => e.groupId !== "g1").length && empty.total > 0);
  assert.equal(empty.solved.size, 0);
  // 다른 모둠 낱말 하나를 칸에 채우면 맞힘
  const target = hints.find((h) => h.groupId === "g2");
  const e = puzzle.entries[target.idx];
  const plan = xwCommitPlan(e, target.word, {}, fixed);
  assert.ok(boardEntrySolved(e, plan.set, fixed, "s2"));
  const after = groupSolveProgress(puzzle, "g1", plan.set, fixed);
  assert.ok(after.solved.has(target.idx));
  // 틀린 글자는 안 맞힘
  const wrong = Object.fromEntries(Object.keys(plan.set).map((k) => [k, "가"]));
  assert.ok(!boardEntrySolved(e, wrong, new Map(), "s2"));
});

test("넣기 — 열쇠 칸은 안 건드리고, 짧게 적어도 남의 정답 칸은 안 지움", () => {
  const entry = { dir: "across", row: 0, col: 0, len: 3 };
  const fixed = new Map([["0,0", "광"]]);
  const plan = xwCommitPlan(entry, "광합", { "0,2": "성" }, fixed, new Set(["0,2"]));
  assert.deepEqual(plan.set, { "0,1": "합" });
  assert.deepEqual(plan.del, []);
  const plan2 = xwCommitPlan(entry, "", { "0,1": "합", "0,2": "성" }, fixed, new Set());
  assert.deepEqual(plan2.del.sort(), ["0,1", "0,2"]);
});

test("모둠 순위와 힌트 제출", () => {
  const r = rankGroupProgress([
    { groupId: "a", solved: 2, total: 10, order: 1 },
    { groupId: "b", solved: 5, total: 10, order: 2 },
    { groupId: "c", solved: 5, total: 9, order: 3 },
  ]);
  assert.deepEqual(r.map((x) => x.groupId), ["c", "b", "a"]);
  assert.ok(xwHintDone({ writerUid: "u", hint: "뜻" }));
  assert.ok(!xwHintDone({ writerUid: null, hint: "뜻" }));
  assert.ok(!xwHintDone({ writerUid: "u", hint: " " }));
});

test("다음 낱말 — 한 바퀴 돌아 적을 수 있는 것", async () => {
  const { nextOpenEntry } = await import("../../lib/crossword.js");
  const e = [{}, {}, {}, {}];
  assert.equal(nextOpenEntry(e, 1, (i) => i !== 2), 3);
  assert.equal(nextOpenEntry(e, 3, (i) => i !== 2), 0);
  assert.equal(nextOpenEntry(e, 0, (i) => i !== 2, -1), 3);
  assert.equal(nextOpenEntry(e, null, () => true), 0);
  assert.equal(nextOpenEntry(e, 1, (i) => i === 1), null);
});
