import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FRUIT_GOAL,
  donationAmount,
  basketSummary,
  myBasketEntry,
} from "@/lib/fruitBasket";

test("donationAmount: 가진 것 안에서 양의 정수만", () => {
  assert.equal(donationAmount("3", 5), 3);
  assert.equal(donationAmount(" 5 ", 5), 5);
  assert.equal(donationAmount("6", 5), 0);   // 가진 것보다 많음
  assert.equal(donationAmount("0", 5), 0);
  assert.equal(donationAmount("-2", 5), 0);
  assert.equal(donationAmount("abc", 5), 0);
  assert.equal(donationAmount("", 5), 0);
  assert.equal(donationAmount("2.9", 5), 2);  // 소수는 버림
  assert.equal(donationAmount("1", 0), 0);    // 과일이 없으면 못 냄
});

test("basketSummary: 합계 · 목표 · 응모", () => {
  const entries = [
    { uid: "a", donated: 40, entered: true },
    { uid: "b", donated: 35 },
    { uid: "gone", donated: 30, entered: true }, // 반에서 빠진 학생
  ];
  const s = basketSummary(entries, ["a", "b", "c"]);
  assert.equal(s.total, 105);           // 빠진 학생이 낸 것도 바구니에 남음
  assert.equal(s.goal, FRUIT_GOAL);
  assert.equal(s.goalReached, true);
  assert.equal(s.percent, 100);
  assert.equal(s.enteredCount, 1);      // 응모는 지금 명단만
  assert.equal(s.memberCount, 3);
  assert.deepEqual(s.waitingUids, ["b", "c"]);
  assert.equal(s.allEntered, false);
});

test("basketSummary: 모두 응모 · 빈 명단", () => {
  const all = basketSummary(
    [{ uid: "a", donated: 60, entered: true }, { uid: "b", donated: 40, entered: true }],
    ["a", "b"]
  );
  assert.equal(all.allEntered, true);
  assert.equal(all.goalReached, true);
  const none = basketSummary([], []);
  assert.equal(none.total, 0);
  assert.equal(none.allEntered, false); // 명단이 비면 '모두'가 아님
  assert.equal(basketSummary([{ uid: "a", donated: 99 }], ["a"]).goalReached, false);
});

test("myBasketEntry", () => {
  assert.deepEqual(myBasketEntry([{ uid: "a", donated: 7, entered: true }], "a"), { donated: 7, entered: true });
  assert.deepEqual(myBasketEntry([], "a"), { donated: 0, entered: false });
});
