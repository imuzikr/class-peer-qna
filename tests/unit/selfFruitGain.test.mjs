import { test } from "node:test";
import assert from "node:assert/strict";
import { expectSelfGain, dropSelfGain, takeSelfGain, returnedGain } from "@/lib/selfFruitGain";

test("스스로 되찾은 몫은 축포에서 빠지고, 교사가 준 몫만 남음", () => {
  expectSelfGain("c", "u", 5, 1000);
  assert.equal(takeSelfGain("c", "u", 5, 1100), 0);   // 되찾은 5 → 축포 없음
  assert.equal(takeSelfGain("c", "u", 2, 1200), 2);   // 그 뒤 교사가 준 2 → 2
  expectSelfGain("c", "u", 3, 2000);
  assert.equal(takeSelfGain("c", "u", 4, 2100), 1);   // 되찾기 3 + 교사 1이 한 번에
});

test("실패한 쓰기의 몫은 거두고, 오래된 몫은 버림", () => {
  const item = expectSelfGain("c", "v", 4, 1000);
  dropSelfGain("c", "v", item);
  assert.equal(takeSelfGain("c", "v", 4, 1100), 4);
  expectSelfGain("c", "w", 4, 1000);
  assert.equal(takeSelfGain("c", "w", 4, 1000 + 31_000), 4); // 30초 지남
  assert.equal(expectSelfGain("c", "x", 0), null);
});

test("선생님이 이벤트 취소로 돌려준 몫 — 표시가 새로 바뀐 답에서만 덜어 냄", () => {
  const a = { id: "r1", n: 4 };
  assert.equal(returnedGain(null, a), 4);           // 방금 돌려받음 → 4개는 축포 없음
  assert.equal(returnedGain(a, a), 0);              // 같은 표시 → 그 뒤 교사가 준 것은 그대로 축포
  assert.equal(returnedGain(a, { id: "r2", n: 2 }), 2);
  assert.equal(returnedGain(a, null), 0);
  assert.equal(returnedGain(null, { id: "r3", n: "x" }), 0);
});
