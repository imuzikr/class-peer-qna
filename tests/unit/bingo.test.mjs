// 낱말 빙고(lib/bingo.js) — 줄 세기 · 순위 · 채우기 · 부르기 · 학생이 진행(차례).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BINGO_CELL_KEYS, BINGO_WORD_MAX,
  bingoCellCount, bingoLines, bingoLineCount, bingoLongestRun,
  bingoWordPool, normalizeBingo, normalizeBingoCells, bingoProgress,
  rankBingo, rankBingoFill, bingoAhead, bingoRandomFill, nextBingoCall, normalizeBingoGoal,
  bingoBoardWords, bingoTurnOrder, bingoTurnUid, bingoTurnsUntil, bingoCall, bingoUndo,
  bingoStartPatch, bingoLeadPatch, bingoPicksBy, bingoCallableWords,
  bingoBoxWords, bingoRecommendedBox,
} from "../../lib/bingo.js";

function seeded(seed = 7) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

// 0~24번 칸에 w0 ~ w24
const WORDS = Array.from({ length: 30 }, (_, i) => `w${i}`);
const FULL = Object.fromEntries(WORDS.slice(0, 25).map((w, i) => [String(i), w]));
// 4×4 — 0~15번 칸에 w0 ~ w15
const FULL4 = Object.fromEntries(WORDS.slice(0, 16).map((w, i) => [String(i), w]));

test("줄 — 5×5는 가로 5 · 세로 5 · 대각선 2 = 12줄, 4×4는 10줄이고 칸 번호가 판 안에 있다", () => {
  for (const [size, lines] of [[5, 12], [4, 10]]) {
    assert.equal(bingoLines(size).length, lines);
    assert.equal(bingoLineCount(size), lines);
    for (const l of bingoLines(size)) {
      assert.equal(l.cells.length, size);
      assert.ok(l.cells.every((i) => i >= 0 && i < bingoCellCount(size)));
    }
  }
  assert.deepEqual(bingoLines(5).find((l) => l.key === "d1").cells, [4, 8, 12, 16, 20]);
  assert.deepEqual(bingoLines(4).find((l) => l.key === "d1").cells, [3, 6, 9, 12]);
  // 크기가 없거나 이상하면 5×5(크기가 적히기 전에 만든 활동)
  assert.equal(bingoCellCount(undefined), 25);
  assert.equal(bingoCellCount(7), 25);
  // 규칙의 칸 열쇠는 가장 큰 판(0~24)
  assert.equal(BINGO_CELL_KEYS.length, 25);
});

test("낱말 상자 — 겹친 것 · 빈 것 · 너무 긴 것은 빼고 처음 차례 그대로", () => {
  const long = "가".repeat(BINGO_WORD_MAX + 1);
  const pool = bingoWordPool([{ text: " 사과 " }, { text: "사과" }, { text: "" }, { text: long }, "배", { word: "감" }]);
  assert.deepEqual(pool, ["사과", "배", "감"]);
});

test("normalizeBingo — 상자에 없는 낱말 · 겹친 부름은 버리고(by도 함께), 목표는 1~5, 크기 · 진행 기본값", () => {
  const b = normalizeBingo({ stage: "play", words: ["가", "나", "다"], called: ["나", "나", "라", "가"], by: ["u1", "u2", "u3", "u4"], goal: 9 });
  assert.equal(b.stage, "play");
  assert.deepEqual(b.called, ["나", "가"]);
  assert.deepEqual(b.by, ["u1", "u4"]);
  assert.equal(b.goal, 3);
  assert.equal(b.size, 5);
  assert.equal(b.lead, "teacher");
  assert.deepEqual(b.order, []);
  assert.equal(b.turn, 0);
  assert.equal(normalizeBingo(null), null);
  assert.equal(normalizeBingo({}).stage, "fill");
  assert.equal(normalizeBingoGoal("2"), 2);
  // by가 없던 때 부른 낱말은 ''(선생님)로 길이를 맞춤 · 차례는 order 안에서만
  const old = normalizeBingo({ words: ["가", "나"], called: ["가", "나"], size: 4, lead: "student", order: ["a", "b", "a", ""], turn: 5 });
  assert.deepEqual(old.by, ["", ""]);
  assert.equal(old.size, 4);
  assert.equal(old.lead, "student");
  assert.deepEqual(old.order, ["a", "b"]);
  assert.equal(old.turn, 0);
  assert.equal(normalizeBingo({ order: ["a", "b"], turn: 1 }).turn, 1);
});

test("칸 맵 → 길이 size² 배열(빈칸은 빈 글자) — 4×4는 앞 열여섯 칸만", () => {
  const cells = normalizeBingoCells({ 0: "가", 24: "나", 30: "넘침" });
  assert.equal(cells.length, 25);
  assert.equal(cells[0], "가");
  assert.equal(cells[24], "나");
  assert.equal(cells.filter(Boolean).length, 2);
  const four = normalizeBingoCells({ 0: "가", 15: "다", 16: "넘침", 24: "나" }, 4);
  assert.equal(four.length, 16);
  assert.deepEqual(four.filter(Boolean), ["가", "다"]);
  // 배열도 그대로 받음
  assert.deepEqual(normalizeBingoCells(["가", "", "나"], 4).slice(0, 3), ["가", "", "나"]);
});

test("부른 낱말로 칸을 표시하고 완성된 줄을 센다", () => {
  // 첫 가로줄(w0~w4)과 첫 세로줄(w0, w5, w10, w15, w20)
  const called = ["w0", "w1", "w2", "w3", "w4", "w5", "w10", "w15", "w20", "x"];
  const p = bingoProgress(FULL, called, 2);
  assert.equal(p.count, 2);
  assert.deepEqual(p.lines.sort(), ["c0", "r0"]);
  assert.equal(p.marked.size, 9);
  assert.ok(p.lineCells.has(20));
  assert.equal(p.bingo, true);
  assert.equal(p.run, 5);
  // 둘째 줄은 w20을 부른 때(9번째) 완성
  assert.equal(p.bingoAt, 9);
  // 목표 3줄이면 아직 빙고 아님
  const q = bingoProgress(FULL, called, 3);
  assert.equal(q.bingo, false);
  assert.equal(q.bingoAt, null);
});

test("4×4 — 네 칸이면 한 줄, 칸 번호는 r * 4 + c", () => {
  const p = bingoProgress(FULL4, ["w0", "w5", "w10", "w15"], 1, 4);
  assert.deepEqual(p.lines, ["d0"]);
  assert.equal(p.bingo, true);
  assert.equal(p.cells.length, 16);
  const q = bingoProgress(FULL4, ["w3", "w7", "w11", "w15"], 1, 4);
  assert.deepEqual(q.lines, ["c3"]);
  assert.equal(q.run, 4);
});

test("대각선도 줄이고, 빈칸은 표시되지 않는다", () => {
  const p = bingoProgress(FULL, ["w0", "w6", "w12", "w18", "w24"], 1);
  assert.deepEqual(p.lines, ["d0"]);
  const holes = { ...FULL };
  delete holes["12"];
  const q = bingoProgress(holes, ["w0", "w6", "w12", "w18", "w24"], 1);
  assert.equal(q.count, 0);
  assert.equal(q.filled, 24);
});

test("이어진 칸 — 가로 · 세로로 붙은 불린 칸만 세고 대각선 · 띄어진 칸은 안 셈", () => {
  assert.equal(bingoLongestRun(new Set(), 5), 0);
  assert.equal(bingoLongestRun(new Set([0, 1, 2]), 5), 3);
  // 같은 줄이어도 사이가 비면 끊김(0 1 _ 3 4)
  assert.equal(bingoLongestRun(new Set([0, 1, 3, 4]), 5), 2);
  // 세로(2, 7, 12, 17)
  assert.equal(bingoLongestRun(new Set([2, 7, 12, 17]), 5), 4);
  // 줄 끝에서 다음 줄 첫 칸으로 넘어가지 않음(4 → 5)
  assert.equal(bingoLongestRun(new Set([3, 4, 5, 6]), 5), 2);
  // 대각선(0, 6, 12)은 이어진 것이 아님
  assert.equal(bingoLongestRun(new Set([0, 6, 12]), 5), 1);
  assert.equal(bingoLongestRun(new Set([0, 4, 8, 12]), 4), 4);
});

test("순위 — 완성한 줄이 많은 차례, 같으면 학번순(먼저 빙고한 차례가 아님)", () => {
  const row = (count, run, sortKey, order) => ({ count, run, sortKey, order, filled: 25, marked: new Set() });
  const a = row(2, 5, "10105", 0);
  const b = row(3, 5, "10109", 1);
  const c = row(2, 5, "10102", 2);
  assert.deepEqual(rankBingo([a, b, c]).map((x) => x.order), [1, 2, 0]);
});

test("순위 — 0줄끼리는 가로 · 세로로 이어진 칸이 긴 차례, 그것도 같으면 학번순", () => {
  const row = (count, run, sortKey, order) => ({ count, run, sortKey, order, filled: 25, marked: new Set() });
  const rows = [
    row(0, 2, "10101", 0),
    row(0, 4, "10103", 1),
    row(0, 4, "10102", 2),
    row(1, 1, "10104", 3), // 한 줄이라도 채우면 맨 앞
    row(0, 0, "10100", 4),
  ];
  assert.deepEqual(rankBingo(rows).map((x) => x.order), [3, 2, 1, 0, 4]);
  // 1줄 이상끼리는 이어진 칸을 보지 않고 학번순
  assert.deepEqual(rankBingo([row(1, 2, "10109", 0), row(1, 5, "10110", 1)]).map((x) => x.order), [0, 1]);
  // 모둠 판(학번 없음)은 원래 차례
  assert.deepEqual(rankBingo([row(0, 1, "", 1), row(0, 1, "", 0)]).map((x) => x.order), [0, 1]);
  // 판 채우기 단계는 많이 채운 차례, 같으면 학번순
  const fill = rankBingoFill([
    { filled: 20, sortKey: "10103", order: 0 },
    { filled: 25, sortKey: "10109", order: 1 },
    { filled: 20, sortKey: "10101", order: 2 },
  ]);
  assert.deepEqual(fill.map((x) => x.order), [1, 2, 0]);
});

test("앞섬 — 줄 수, 둘 다 0줄이면 이어진 칸으로만(학번으로 가른 차례는 앞섬이 아님)", () => {
  assert.equal(bingoAhead({ count: 2, run: 0 }, { count: 1, run: 5 }), true);
  assert.equal(bingoAhead({ count: 0, run: 3 }, { count: 0, run: 2 }), true);
  assert.equal(bingoAhead({ count: 0, run: 2 }, { count: 0, run: 2 }), false);
  assert.equal(bingoAhead({ count: 1, run: 5 }, { count: 1, run: 2 }), false);
});

test("무작위 채우기 — 빈칸만, 이미 놓인 낱말은 다시 안 씀, 모자라면 남김 · 4×4는 16칸", () => {
  const set = bingoRandomFill({ 0: "w0", 1: "w1" }, WORDS, seeded());
  assert.equal(Object.keys(set).length, 23);
  assert.ok(!("0" in set) && !("1" in set));
  const vals = Object.values(set);
  assert.equal(new Set(vals).size, vals.length);
  assert.ok(!vals.includes("w0") && !vals.includes("w1"));
  const few = bingoRandomFill({}, ["가", "나", "다"], seeded());
  assert.equal(Object.keys(few).length, 3);
  const four = bingoRandomFill({ 0: "w0" }, WORDS, seeded(), 4);
  assert.equal(Object.keys(four).length, 15);
  assert.ok(Object.keys(four).every((k) => Number(k) < 16));
});

test("판에 놓인 낱말 — 겹치지 않게 ㄱ~ㅎ 차례, 판 수와 함께, 상자에 없는 낱말은 뺌", () => {
  const boards = [
    ["하마", "가방", "", "나무"],
    ["나무", "다리", "가방", "가방"],
    ["엉뚱"],
  ];
  const list = bingoBoardWords(boards, ["가방", "나무", "다리", "하마"]);
  assert.deepEqual(list.map((x) => x.word), ["가방", "나무", "다리", "하마"]);
  assert.deepEqual(list.map((x) => x.boards), [2, 2, 1, 1]);
  // 상자를 안 주면 판의 낱말 전부
  assert.ok(bingoBoardWords(boards).some((x) => x.word === "엉뚱"));
});

test("무작위 부르기 — 판에 놓인 안 부른 낱말에서만, 다 부르면 null(상자의 남은 낱말로 넘어가지 않음)", () => {
  const rng = seeded(3);
  const onBoards = bingoBoardWords([normalizeBingoCells({ 0: "w0", 1: "w1" })], WORDS);
  for (let i = 0; i < 10; i++) assert.equal(nextBingoCall(onBoards, ["w0"], rng), "w1");
  assert.equal(nextBingoCall(onBoards, ["w0", "w1"], rng), null);
  assert.equal(nextBingoCall(["가", "나"], ["가"], rng), "나");
  assert.equal(nextBingoCall([], [], rng), null);
});

// ── 학생이 진행 ─────────────────────────────────────────────
const ROSTER = [
  { uid: "s3", name: "다은", studentId: "10103" },
  { uid: "s1", name: "가람", studentId: "10101" },
  { uid: "s2", name: "나래", studentId: "10102" },
  { uid: "s4", name: "라온", studentId: "10104" },
];

test("부르는 차례 — 판에 든 학생만 학번 오름차순, 반 명단에 없는 학생은 뺌", () => {
  const boards = [
    { memberUids: ["s3", "s1"], members: [] },
    { memberUids: ["s2", "gone"], members: [{ uid: "gone", name: "떠난 학생", studentId: "10100" }] },
  ];
  assert.deepEqual(bingoTurnOrder(boards, ROSTER), ["s1", "s2", "s3"]);
  // 명단이 아직 없으면 판의 members로(학번 · 없으면 이름)
  const solo = [
    { memberUids: ["b"], members: [{ uid: "b", name: "나", studentId: "20202" }] },
    { memberUids: ["a"], members: [{ uid: "a", name: "가", studentId: "20201" }] },
    { memberUids: ["c"], members: [] },
  ];
  assert.deepEqual(bingoTurnOrder(solo, []), ["c", "a", "b"]);
});

function playing(over = {}) {
  return normalizeBingo({
    stage: "play", lead: "student", words: ["가", "나", "다", "라", "마"],
    called: [], by: [], order: ["s1", "s2", "s3"], turn: 0, ...over,
  });
}

test("학생이 진행 — 제 차례인 학생만 부르고, 차례가 학번순으로 돌아 마지막 다음은 처음", () => {
  let b = playing();
  assert.equal(bingoTurnUid(b), "s1");
  assert.equal(bingoCall(b, "가", "s2"), null); // s2의 차례가 아님
  const p1 = bingoCall(b, "가", "s1");
  assert.deepEqual(p1, { called: ["가"], by: ["s1"], turn: 1 });
  b = normalizeBingo({ ...b, ...p1 });
  assert.equal(bingoTurnUid(b), "s2");
  assert.equal(bingoCall(b, "가", "s2"), null); // 이미 불린 낱말
  assert.equal(bingoCall(b, "없음", "s2"), null); // 상자에 없는 낱말
  b = normalizeBingo({ ...b, ...bingoCall(b, "나", "s2") });
  b = normalizeBingo({ ...b, ...bingoCall(b, "다", "s3") });
  assert.equal(b.turn, 0);
  assert.equal(bingoTurnUid(b), "s1");
  assert.equal(bingoTurnsUntil(b, "s3"), 2);
  assert.equal(bingoTurnsUntil(b, "s1"), 0);
  assert.equal(bingoTurnsUntil(b, "nobody"), null);
  assert.deepEqual(bingoPicksBy(b).get("s2"), { word: "나", n: 2 });
});

test("학생이 진행 — 선생님이 대신 부르면 지금 차례 학생의 몫, 그사이 차례가 넘어갔으면 안 부름", () => {
  const b = playing({ turn: 1 });
  // uid 없이(선생님) — 지금 차례(s2)의 몫으로
  assert.deepEqual(bingoCall(b, "라"), { called: ["라"], by: ["s2"], turn: 2 });
  // '나래 대신'을 눌렀는데 그사이 다은(s3)의 차례가 되었으면 null
  assert.equal(bingoCall(playing({ turn: 2 }), "라", "s2"), null);
  // 차례가 없으면(판에 든 학생 없음) 선생님만 부름
  const empty = playing({ order: [] });
  assert.deepEqual(bingoCall(empty, "가"), { called: ["가"], by: [""] });
  assert.equal(bingoCall(empty, "가", "s1"), null);
  // 판 채우기 단계에는 아무도 못 부름
  assert.equal(bingoCall(playing({ stage: "fill" }), "가"), null);
});

test("선생님이 진행 — 차례 없이 붙이고 by는 '', 학생(uid)은 못 부름", () => {
  const b = normalizeBingo({ stage: "play", words: ["가", "나"], called: ["가"], by: [""] });
  assert.deepEqual(bingoCall(b, "나"), { called: ["가", "나"], by: ["", ""] });
  assert.equal(bingoCall(b, "가"), null);
  // 학생 화면이 늦게 바뀌어 선생님이 진행인데 학생이 누른 경우
  assert.equal(bingoCall(b, "나", "s1"), null);
});

test("되돌리기 — 학생 차례의 부름이면 차례도 그 학생에게, 선생님이 부른 것이면 차례는 그대로", () => {
  const b = playing({ called: ["가", "나"], by: ["s1", "s2"], turn: 2 });
  assert.deepEqual(bingoUndo(b), { called: ["가"], by: ["s1"], turn: 1 });
  const t = playing({ called: ["가", "나"], by: ["s1", ""], turn: 1 });
  assert.deepEqual(bingoUndo(t), { called: ["가"], by: ["s1"] });
  assert.equal(bingoUndo(playing()), null);
});

test("시작 · 진행 바꾸기 — 시작하면 차례를 새로, 학생이 진행으로 바꾸면 지금 차례 학생부터 이어 감", () => {
  assert.deepEqual(bingoStartPatch(["s1", "s2"]), { stage: "play", called: [], by: [], order: ["s1", "s2"], turn: 0 });
  const b = playing({ lead: "teacher", order: ["s1", "s2", "s3"], turn: 2 });
  assert.deepEqual(bingoLeadPatch(b, "student", ["s0", "s1", "s2", "s3"]), { lead: "student", order: ["s0", "s1", "s2", "s3"], turn: 3 });
  // 지금 차례였던 학생이 없으면 처음부터
  assert.deepEqual(bingoLeadPatch(b, "student", ["s1", "s2"]), { lead: "student", order: ["s1", "s2"], turn: 0 });
  assert.deepEqual(bingoLeadPatch(b, "teacher", ["s1"]), { lead: "teacher" });
});

// ── 머지 전 검토에서 찾은 것 ─────────────────────────────────
test("차례 번호 -0(소수로 적힘) · NaN은 정수 0으로 — 교사가 고쳐 쓰면 규칙의 `turn is int`가 다시 통과", () => {
  const b = normalizeBingo({ stage: "play", lead: "student", words: ["가"], order: ["s1", "s2"], turn: -0 });
  assert.ok(Object.is(b.turn, 0));
  assert.ok(Object.is(normalizeBingo({ order: ["s1"], turn: "x" }).turn, 0));
});

test("되돌리기 — 누를 때 본 낱말이 아직 마지막일 때만(그사이 다음 학생이 부른 낱말은 지우지 않음)", () => {
  const b = playing({ called: ["가", "나"], by: ["s1", "s2"], turn: 2 });
  assert.equal(bingoUndo(b, "가"), null);
  assert.deepEqual(bingoUndo(b, "나"), { called: ["가"], by: ["s1"], turn: 1 });
  // 낱말을 안 주면 예전처럼 마지막 것을
  assert.deepEqual(bingoUndo(b), { called: ["가"], by: ["s1"], turn: 1 });
});

test("진행 바꾸기 — 판 목록을 아직 모르면(null) 저장된 차례를 그대로, 빈 배열은 '정말 없음'", () => {
  const b = playing({ lead: "teacher", order: ["s1", "s2", "s3"], turn: 2 });
  assert.deepEqual(bingoLeadPatch(b, "student", null), { lead: "student" });
  assert.deepEqual(bingoLeadPatch(b, "student", []), { lead: "student", order: [], turn: 0 });
});

test("부르는 차례 — 디렉터리가 아직 안 와 명단 줄에 학번이 없으면 판의 members 학번으로", () => {
  const boards = [
    { memberUids: ["b"], members: [{ uid: "b", name: "나", studentId: "20202" }] },
    { memberUids: ["a"], members: [{ uid: "a", name: "가", studentId: "20201" }] },
    { memberUids: ["c"], members: [{ uid: "c", name: "다", studentId: "20203" }] },
  ];
  // buildClassRoster가 디렉터리 없이 만든 줄 — 학번 null · '이름 미설정'
  const placeholder = ["c", "b", "a"].map((uid) => ({ uid, name: "이름 미설정", studentId: null }));
  assert.deepEqual(bingoTurnOrder(boards, placeholder), ["a", "b", "c"]);
  // 명단에 학번이 있으면 명단이 먼저(만든 뒤 학번이 바뀐 경우)
  const fresh = [{ uid: "a", name: "가", studentId: "20209" }, { uid: "b", name: "나", studentId: "20202" }, { uid: "c", name: "다", studentId: "20203" }];
  assert.deepEqual(bingoTurnOrder(boards, fresh), ["b", "c", "a"]);
});

test("부르는 차례 — 학번이 없을 뿐인 학생은 명단의 지금 이름으로(판에 베낀 옛 이름 · 자리표시가 아니라)", () => {
  const boards = [
    { memberUids: ["x"], members: [{ uid: "x", name: "이름 미설정", studentId: null }] },
    { memberUids: ["y"], members: [{ uid: "y", name: "하윤(옛 이름)", studentId: null }] },
  ];
  // 디렉터리가 온 뒤의 명단 — 학번은 없고 지금 이름만
  const roster = [{ uid: "x", name: "다온", studentId: null }, { uid: "y", name: "가람", studentId: null }];
  assert.deepEqual(bingoTurnOrder(boards, roster), ["y", "x"]); // 가람 → 다온
});

test("한 판에서 아직 부를 수 있는 낱말 — 칸에 있고 · 상자에 있고 · 안 불린 것, 겹치지 않게", () => {
  const b = playing({ called: ["가"] });
  assert.deepEqual(bingoCallableWords(["가", "나", "", "나", "없음", "다"], b), ["나", "다"]);
  assert.deepEqual(bingoCallableWords([], b), []);
  assert.deepEqual(bingoCallableWords(["가"], b), []);
});

// ── 낱말 상자 — 많이 쓴 낱말만(선생님 요청) ─────────────────────
test("낱말 상자는 많이 쓴 차례 — 그 낱말을 쓴 판(모둠) 수, 같으면 처음 나온 차례 · 한 판이 두 번 써도 한 번", () => {
  const docs = [
    { text: "가", groupId: "g1" },
    { text: "나", groupId: "g1" },
    { text: "나", groupId: "g2" },
    { text: "다", groupId: "g2" },
    { text: "다", groupId: "g2" }, // 같은 판이 두 번 — 한 번으로
    { text: "라", groupId: "g3" },
    { text: "나", groupId: "g3" },
  ];
  assert.deepEqual(bingoWordPool(docs), ["나", "가", "다", "라"]);
  // 이미 정한 상자(문자열 · 모두 한 번씩)는 차례 그대로
  assert.deepEqual(bingoWordPool(["다", "가", "나"]), ["다", "가", "나"]);
});

test("상자 크기 — 5×5는 35개 · 4×4는 22개, 옛 활동(칸 없음)은 상자 전부", () => {
  assert.equal(bingoRecommendedBox(5), 35);
  assert.equal(bingoRecommendedBox(4), 22);
  const old = normalizeBingo({ words: ["가"] });
  assert.equal(old.box, 0);
  assert.equal(old.ranked, false);
  const fresh = normalizeBingo({ words: ["가"], box: 35, ranked: true });
  assert.equal(fresh.box, 35);
  assert.equal(fresh.ranked, true);
  assert.equal(normalizeBingo({ box: -3 }).box, 0);
  assert.equal(normalizeBingo({ box: "x" }).box, 0);
});

test("판을 채울 때 고르는 낱말 — 많이 쓴 앞의 box개를 ㄱ~ㅎ 차례로, box가 없으면 상자 전부", () => {
  const b = normalizeBingo({ words: ["하늘", "가방", "나무", "다리"], box: 2, ranked: true });
  assert.deepEqual(bingoBoxWords(b), ["가방", "하늘"]);
  assert.deepEqual(bingoBoxWords({ ...b, box: 0 }), ["가방", "나무", "다리", "하늘"]);
  assert.deepEqual(bingoBoxWords(null), []);
});
