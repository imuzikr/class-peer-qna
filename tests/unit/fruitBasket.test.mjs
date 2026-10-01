import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FRUIT_GOAL,
  entryAmount,
  entryMax,
  basketSummary,
  myBasketEntry,
  eventChoiceOf,
  isEventPending,
  canEnterEvent,
} from "@/lib/fruitBasket";

test("entryAmount: 이번에 담을 수 — 가진 과일 안에서 1개 이상", () => {
  assert.equal(entryAmount("3", 5), 3);
  assert.equal(entryAmount(" 5 ", 5), 5);
  assert.equal(entryAmount("6", 5), 0);      // 가진 것보다 많음
  assert.equal(entryAmount("0", 5), 0);
  assert.equal(entryAmount("-2", 5), 0);
  assert.equal(entryAmount("abc", 5), 0);
  assert.equal(entryAmount("", 5), 0);
  assert.equal(entryAmount("2.9", 5), 2);    // 소수는 버림
  assert.equal(entryAmount("1", 0), 0);      // 과일이 없으면 못 담음
  assert.equal(entryMax(5), 5);
  assert.equal(entryMax(0), 0);
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
  assert.deepEqual(myBasketEntry([{ uid: "a", donated: 7, entered: true }], "a"),
    { donated: 7, entered: true, declined: false, choice: "entered", received: false });
  assert.deepEqual(myBasketEntry([], "a"),
    { donated: 0, entered: false, declined: false, choice: null, received: false });
  assert.equal(myBasketEntry([{ uid: "a", declined: true, receivedBy: "t" }], "a").received, true);
});

test("이벤트 선택 · 초록 점 · 응모 가능", () => {
  assert.equal(eventChoiceOf({ entered: true }), "entered");
  assert.equal(eventChoiceOf({ declined: true }), "declined");
  assert.equal(eventChoiceOf({}), null);
  // 초록 점 = 응모하기 · 응모하지 않기 어느 쪽이든 골랐는데 아직 접수 안 됨
  assert.equal(isEventPending({ entered: true }), true);
  assert.equal(isEventPending({ declined: true }), true);
  assert.equal(isEventPending({ entered: true, receivedBy: "t", receivedAt: null }), false); // 서버 시각 전이어도 접수함
  assert.equal(isEventPending({ donated: 3 }), false);
  // 응모 — 이번에 담을 과일 1개 이상 · 접수 전(반 바구니 100개와 무관)
  const mine = (o) => ({ donated: 0, choice: null, received: false, ...o });
  assert.equal(canEnterEvent(mine(), 1), true);
  assert.equal(canEnterEvent(mine(), 0), false);
  assert.equal(canEnterEvent(mine({ choice: "declined" }), 2), true);   // 응모 안 함 → 응모로 바꾸기
  // 응모한 뒤에도 이번에 담을 수를 정하면 다시 눌러 더 담음
  assert.equal(canEnterEvent(mine({ choice: "entered", donated: 2 }), 3), true);
  assert.equal(canEnterEvent(mine({ choice: "entered", donated: 2 }), 0), false);
  assert.equal(canEnterEvent(mine({ choice: "entered", donated: 2, received: true }), 3), false);
  // 응모 안 했는데 바구니에 이미 든 과일(옛 화면) — 0개를 더 담고 그대로 응모
  assert.equal(canEnterEvent(mine({ donated: 4 }), 0), true);
  assert.equal(canEnterEvent(mine({ choice: "declined", donated: 0 }), 0), false);
  assert.equal(canEnterEvent(mine({ received: true }), 2), false);
});

test("basketSummary: 응모 안 함 · 모두 답함 · 접수할 학생", () => {
  const s = basketSummary(
    [
      { uid: "a", donated: 60, entered: true },
      { uid: "b", donated: 0, declined: true, receivedBy: "t" },
      { uid: "gone", donated: 50, entered: true },   // 명단 밖이어도 접수 대상
    ],
    ["a", "b"]
  );
  assert.equal(s.enteredCount, 1);
  assert.equal(s.declinedCount, 1);
  assert.equal(s.allEntered, false);
  assert.equal(s.allResponded, true);
  assert.deepEqual(s.pendingUids.sort(), ["a", "gone"]);   // b는 이미 접수됨
  assert.equal(s.pendingFruit, 110);
});
