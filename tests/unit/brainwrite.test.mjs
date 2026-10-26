import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bwNoteId, sortMembers, columnOrder, notesByColumn, columnRows,
  previousRow, writerProgress, writerChars,
} from "../../lib/brainwrite.js";

const M = [
  { uid: "c", name: "다", studentId: "30103" },
  { uid: "a", name: "가", studentId: "30101" },
  { uid: "e", name: "마", studentId: "30110" },
  { uid: "b", name: "나", studentId: "30102" },
];

test("학번순(숫자로)", () => {
  assert.deepEqual(sortMembers(M).map((m) => m.uid), ["a", "b", "c", "e"]);
});

test("컬럼 차례는 주인부터 돌아가며", () => {
  assert.deepEqual(columnOrder(M, "c").map((m) => m.uid), ["c", "e", "a", "b"]);
  assert.deepEqual(columnOrder(M, "a").map((m) => m.uid), ["a", "b", "c", "e"]);
  assert.deepEqual(columnOrder(M, "zz").map((m) => m.uid), ["a", "b", "c", "e"]);
});

test("줄 · 앞 사람 · 진행", () => {
  const notes = [
    { ownerUid: "c", writerUid: "c", text: "질문" },
    { ownerUid: "c", writerUid: "e", text: "  " },
    { ownerUid: "a", writerUid: "e", text: "생각" },
  ];
  assert.equal(bwNoteId("c", "e"), "c_e");
  const by = notesByColumn(notes);
  const rows = columnRows(M, "c", by);
  assert.deepEqual(rows.map((r) => r.filled), [true, false, false, false]);
  assert.equal(previousRow(M, "c", "e", by).member.uid, "c");
  assert.equal(previousRow(M, "c", "c", by), null);
  assert.deepEqual(writerProgress(M, "e", by).map((p) => p.done), [true, false, false, false]);
  assert.equal(writerChars("e", notes), 2);
});
