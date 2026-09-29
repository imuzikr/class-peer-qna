import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EXAMPLE_MAX,
  cleanExample,
  exampleOf,
  examplesToMap,
  examplesFromMap,
  examplesFor,
} from "../../lib/activityExamples.js";

test("활동 이름으로 짚습니다 — 앞뒤 공백은 걷고", () => {
  const board = { activityExamples: { "반복문": "for i in range(3):\n    print(i)" } };
  assert.equal(exampleOf(board, "반복문"), "for i in range(3):\n    print(i)");
  assert.equal(exampleOf(board, "  반복문 "), "for i in range(3):\n    print(i)");
  assert.equal(exampleOf(board, "조건문"), "");
  assert.equal(exampleOf({}, "반복문"), "");
  assert.equal(exampleOf(null, "반복문"), "");
  assert.equal(exampleOf({ activityExamples: { a: 3 } }, "a"), "");
});

test("끝 공백만 걷고 들여쓰기는 남깁니다 · 천장", () => {
  assert.equal(cleanExample("    x = 1\n\n  \n"), "    x = 1");
  assert.equal(cleanExample(null), "");
  assert.equal(cleanExample("a".repeat(EXAMPLE_MAX + 10)).length, EXAMPLE_MAX);
});

test("창의 두 배열 → 맵: 빈 이름 · 빈 예시는 빠지고, 같은 이름은 앞의 것", () => {
  const map = examplesToMap(
    [" 반복문 ", "", "조건문", "출력", "반복문"],
    ["for x in y:\n    pass\n", "print(1)", "   ", "print('hi')", "뒤의 것"]
  );
  assert.deepEqual(map, { "반복문": "for x in y:\n    pass", "출력": "print('hi')" });
  assert.deepEqual(examplesToMap(null, null), {});
});

test("맵 → 창의 배열 — 순서를 바꿔도 제 활동을 따라갑니다", () => {
  const map = { A: "a()", C: "c()" };
  assert.deepEqual(examplesFromMap(["C", "B", "A"], map), ["c()", "", "a()"]);
  assert.deepEqual(examplesFromMap(["A"], undefined), [""]);
});

test("복사본에 옮길 때는 지금 활동에 있는 이름만", () => {
  assert.deepEqual(examplesFor(["A", "B"], { A: "a()", Z: "z()" }), { A: "a()" });
  assert.deepEqual(examplesFor([], { A: "a()" }), {});
});
