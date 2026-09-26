import { test } from "node:test";
import assert from "node:assert/strict";
import {
  QMARK_PROMPTS,
  QMARK_MIN_PICKS,
  emptyQmarkAnswers,
  normalizeQmarkAnswers,
  toggleQmarkPick,
  qmarkAnsweredPicks,
  qmarkDone,
  qmarkStarted,
  qmarkChars,
  qmarkRows,
  qmarkCellState,
  QMARK_REGIONS,
  qmarkRegionFields,
} from "../../lib/qmark.js";

test("다섯 물음 · 두 개 이상", () => {
  assert.equal(QMARK_PROMPTS.length, 5);
  assert.equal(QMARK_MIN_PICKS, 2);
  assert.equal(QMARK_REGIONS.length, 6);
});

test("빈 값 · 이상한 값도 같은 모양으로", () => {
  const e = emptyQmarkAnswers();
  assert.deepEqual(e.picks, []);
  assert.equal(e.question, "");
  const n = normalizeQmarkAnswers({ picks: ["change", "zzz", "knowledge", "change"], question: 3 });
  // 정해 둔 차례로 · 모르는 key와 겹친 key는 걷힘
  assert.deepEqual(n.picks, ["knowledge", "change"]);
  assert.equal(n.question, "3");
  assert.deepEqual(normalizeQmarkAnswers(null).picks, []);
});

test("고르기 · 풀기 — 풀어도 글은 남음", () => {
  let a = { ...emptyQmarkAnswers(), bias: "편견 글" };
  a = toggleQmarkPick(a, "bias");
  assert.deepEqual(a.picks, ["bias"]);
  a = toggleQmarkPick(a, "knowledge");
  assert.deepEqual(a.picks, ["knowledge", "bias"]);
  a = toggleQmarkPick(a, "bias");
  assert.deepEqual(a.picks, ["knowledge"]);
  assert.equal(a.bias, "편견 글");
  assert.deepEqual(toggleQmarkPick(a, "nope").picks, ["knowledge"]);
});

test("완성 — 궁금증 · 이유 + 두 개 이상 고르고 글까지", () => {
  const base = { question: "왜?", reason: "궁금해서" };
  assert.equal(qmarkDone({ ...base, picks: ["use", "bias"], use: "활용", bias: "" }), false);
  assert.equal(qmarkDone({ ...base, picks: ["use", "bias"], use: "활용", bias: "편견" }), true);
  // 고르지 않은 물음의 글은 세지 않음
  assert.equal(qmarkDone({ ...base, picks: ["use"], use: "활용", bias: "편견" }), false);
  assert.equal(qmarkDone({ question: "왜?", picks: ["use", "bias"], use: "a", bias: "b" }), false);
  assert.deepEqual(qmarkAnsweredPicks({ picks: ["use", "bias"], use: " ", bias: "b" }), ["bias"]);
});

test("시작 · 글자 수 — 고른 물음만 셈", () => {
  assert.equal(qmarkStarted({}), false);
  assert.equal(qmarkStarted({ picks: ["use"] }), true);
  assert.equal(qmarkChars({ question: "ab", reason: "c", picks: ["use"], use: "de", bias: "zzzz" }), 5);
});

test("진행 줄 셋 · 칸 색", () => {
  const rows = qmarkRows();
  assert.deepEqual(rows.map((r) => r.key), ["question", "reason", "thoughts"]);
  const [q, r, t] = rows;
  assert.equal(qmarkCellState(q, { question: "x" }), "done");
  assert.equal(qmarkCellState(r, {}), "empty");
  assert.equal(qmarkCellState(t, {}), "empty");
  assert.equal(qmarkCellState(t, { picks: ["use"] }), "doing");
  assert.equal(qmarkCellState(t, { picks: ["use", "bias"], use: "a" }), "doing");
  assert.equal(qmarkCellState(t, { picks: ["use", "bias"], use: "a", bias: "b" }), "done");
});

test("띄울 영역 — 물음표 한 장 · 고르지 않은 물음은 그렇다고", () => {
  const a = { question: "왜?", reason: "이유", picks: ["use"], use: "활용" };
  assert.deepEqual(qmarkRegionFields(a, "question"), [
    { label: "궁금증", text: "왜?" },
    { label: "이유는", text: "이유" },
  ]);
  assert.deepEqual(qmarkRegionFields(a, "use"), [{ label: "", text: "활용" }]);
  assert.match(qmarkRegionFields(a, "bias")[0].text, /고르지 않았어요/);
  assert.deepEqual(qmarkRegionFields(a, "nope"), []);
});
