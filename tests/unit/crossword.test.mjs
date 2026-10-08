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
