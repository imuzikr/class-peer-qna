// RAFT 교사 피드백(lib/raftFeedback.js) — 자리 찾기 · 겹침 · 조각 나누기 · 새 피드백.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RAFT_FEEDBACK_MAX, cleanFeedbackText, normalizeRaftFeedback, isRaftFeedbackNew,
  locateFeedback, placeFeedbackNotes, feedbackOverlaps, trimFeedbackRange, splitFeedbackSegments,
} from "../../lib/raftFeedback.js";

const TEXT = "나는 고양이다. 이름은 아직 없다. 고양이는 귀엽다.";

test("메모 글 다듬기 — 앞뒤 빈칸을 걷고 500자까지", () => {
  assert.equal(cleanFeedbackText("  좋아요 \r\n "), "좋아요");
  assert.equal(cleanFeedbackText("가".repeat(RAFT_FEEDBACK_MAX + 10)).length, RAFT_FEEDBACK_MAX);
});

test("새 피드백 — rev가 seenRev보다 크면 새것(고치면 다시 새것)", () => {
  assert.equal(isRaftFeedbackNew({ rev: 1, seenRev: 0 }), true);
  assert.equal(isRaftFeedbackNew({ rev: 1, seenRev: 1 }), false);
  assert.equal(isRaftFeedbackNew({ rev: 2, seenRev: 1 }), true);
  const n = normalizeRaftFeedback({ start: "3", end: 1, rev: 0 }, "f1");
  assert.equal(n.start, 3);
  assert.equal(n.end, 3);
  assert.equal(n.rev, 1);
  assert.equal(n.id, "f1");
});

test("자리 찾기 — 그대로면 거기, 아니면 가장 가까운 같은 글, 없으면 null", () => {
  assert.deepEqual(locateFeedback(TEXT, { start: 3, end: 6, quote: "고양이" }), [3, 6]);
  // 앞에 글이 붙어 밀렸으면 가까운 쪽
  const moved = "아" + TEXT;
  assert.deepEqual(locateFeedback(moved, { start: 3, end: 6, quote: "고양이" }), [4, 7]);
  // 뒤쪽 '고양이'(21)를 가리키던 메모는 뒤쪽으로
  const at = TEXT.lastIndexOf("고양이");
  assert.deepEqual(locateFeedback(moved, { start: at, end: at + 3, quote: "고양이" }), [at + 1, at + 4]);
  assert.equal(locateFeedback(TEXT, { start: 0, end: 2, quote: "강아지" }), null);
  assert.equal(locateFeedback(TEXT, { start: 0, end: 2, quote: "" }), null);
});

test("메모를 글 차례로 놓고 번호를 붙임", () => {
  const notes = [
    { id: "b", start: 20, end: 23, quote: TEXT.slice(20, 23) },
    { id: "a", start: 3, end: 6, quote: "고양이" },
  ];
  const placed = placeFeedbackNotes(TEXT, notes);
  assert.deepEqual(placed.map((n) => [n.id, n.no]), [["a", 1], ["b", 2]]);
});

test("겹침 — 맞닿은 것은 괜찮고, 한 글자라도 겹치면 막음", () => {
  const ranges = [[3, 6], [10, 12]];
  assert.equal(feedbackOverlaps(ranges, 6, 9), false);
  assert.equal(feedbackOverlaps(ranges, 0, 3), false);
  assert.equal(feedbackOverlaps(ranges, 5, 8), true);
  assert.equal(feedbackOverlaps(ranges, 0, 20), true);
  assert.equal(feedbackOverlaps([null], 0, 5), false);
});

test("드래그 범위 다듬기 — 앞뒤 빈칸 걷기 · 거꾸로 끈 것도 · 빈 범위는 null", () => {
  assert.deepEqual(trimFeedbackRange(TEXT, 2, 7), [3, 7]);
  assert.deepEqual(trimFeedbackRange(TEXT, 7, 2), [3, 7]);
  assert.equal(trimFeedbackRange(TEXT, 2, 3), null);
});

test("조각 나누기 — 칠한 조각 · 안 칠한 조각을 이으면 원래 글", () => {
  const segs = splitFeedbackSegments(TEXT, [{ id: "x", range: [3, 6] }, { id: "y", range: [10, 12] }]);
  assert.equal(segs.map((s) => s.text).join(""), TEXT);
  assert.deepEqual(segs.filter((s) => s.id).map((s) => [s.id, s.text]), [["x", "고양이"], ["y", TEXT.slice(10, 12)]]);
  // 겹치는 뒤의 것은 버림 · 메모가 없으면 통째로 한 조각
  const over = splitFeedbackSegments(TEXT, [{ id: "x", range: [3, 8] }, { id: "y", range: [5, 9] }]);
  assert.deepEqual(over.filter((s) => s.id).map((s) => s.id), ["x"]);
  assert.deepEqual(splitFeedbackSegments("", []), [{ text: "", id: null }]);
});
