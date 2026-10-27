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

import { rowWritable, writerSlots } from "../../lib/brainwrite.js";

test("앞 사람이 써야 내 줄이 열림", () => {
  const rows = [{ filled: true }, { filled: false }, { filled: false }];
  assert.equal(rowWritable(rows, 0), true);
  assert.equal(rowWritable(rows, 1), true);
  assert.equal(rowWritable(rows, 2), false);
  assert.equal(rowWritable([{ filled: false }, { filled: true }], 1), true); // 이미 쓴 줄
});

test("이어 쓰는 차례 — k번째 줄의 주인", () => {
  const by = notesByColumn([
    { ownerUid: "a", writerUid: "a", text: "q" },
    { ownerUid: "a", writerUid: "b", text: "x" },
  ]);
  const s = writerSlots(M, "b", by);
  assert.deepEqual(s.map((x) => x.owner.uid), ["b", "a", "e", "c"]);
  assert.deepEqual(s.map((x) => x.done), [false, true, false, false]);
  assert.deepEqual(s.map((x) => x.ready), [true, true, false, false]);
});


test("학생 질문은 본인 첫 칸에 남고 저장된 뒤 친구의 답변 차례가 열림", () => {
  const empty = columnRows(M, "a", {});
  assert.equal(empty[0].member.uid, "a");
  assert.equal(rowWritable(empty, 0), true);
  assert.equal(rowWritable(empty, 1), false);
  const by = notesByColumn([
    { ownerUid: "a", writerUid: "a", text: "주인공은 왜 떠났을까?" },
    { ownerUid: "a", writerUid: "b", text: "새로운 곳이 궁금해서라고 생각해요." },
  ]);
  const rows = columnRows(M, "a", by);
  assert.equal(rows[0].note.text, "주인공은 왜 떠났을까?");
  assert.equal(rows[1].member.uid, "b");
  assert.equal(rowWritable(rows, 1), true);
  assert.equal(rowWritable(rows, 2), true);
  assert.equal(rowWritable(rows, 3), false);
  assert.equal(writerSlots(M, "a", by)[0].done, true);
});
