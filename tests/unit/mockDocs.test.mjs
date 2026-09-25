// 데모 모드 문서 고치기 — 같은 참조를 돌려주면 React가 다시 그리지 않습니다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { replaceDoc } from "@/lib/mockDocs";

test("새 객체로 갈아 끼우고, 목록의 같은 자리에 둡니다", () => {
  const a = { id: "a", n: 1 };
  const b = { id: "b", n: 2 };
  const c = { id: "c", n: 3 };
  const list = [a, b, c];
  const next = replaceDoc(list, b, { n: 20 });
  assert.notEqual(next, b, "같은 참조면 구독하는 쪽이 바뀐 줄 모릅니다");
  assert.deepEqual(next, { id: "b", n: 20 });
  assert.equal(list[1], next, "순서가 곧 화면 차례라 자리가 그대로여야 합니다");
  assert.equal(list[0], a);
  assert.equal(list[2], c);
  assert.deepEqual(b, { id: "b", n: 2 }, "옛 객체는 건드리지 않습니다");
});

test("Object.assign처럼 고칠 값을 여럿 받고, 뒤의 것이 이깁니다", () => {
  const d = { id: "d", x: 1, y: 1 };
  const list = [d];
  replaceDoc(list, d, { x: 2, y: 2 }, { y: 3 });
  assert.deepEqual(list[0], { id: "d", x: 2, y: 3 });
});

test("고칠 값 자리에 함수 — 지금 문서를 보고 셈합니다", () => {
  const q = { id: "q", answerCount: 4 };
  const list = [q];
  replaceDoc(list, q, (cur) => ({ answerCount: cur.answerCount + 1 }));
  assert.equal(list[0].answerCount, 5);
});

test("문서가 없으면 아무 일도 없이 null", () => {
  const list = [{ id: "a" }];
  assert.equal(replaceDoc(list, null, { x: 1 }), null);
  assert.equal(replaceDoc(list, undefined, { x: 1 }), null);
  assert.deepEqual(list, [{ id: "a" }]);
});

test("목록에 없는 문서는 예전처럼 그 자리에서 고칩니다 — 고친 것을 잃지 않게", () => {
  const stray = { id: "s", n: 1 };
  const list = [{ id: "a" }];
  const out = replaceDoc(list, stray, { n: 2 });
  assert.equal(out, stray);
  assert.equal(stray.n, 2);
  assert.equal(list.length, 1);
});
