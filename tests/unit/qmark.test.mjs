import { test } from "node:test";
import assert from "node:assert/strict";
import {
  QMARK_PROMPTS,
  QMARK_MIN_PICKS,
  QMARK_ASK_COUNT,
  emptyQmarkAnswers,
  normalizeQmarkAnswers,
  editQmarkAsk,
  toggleQmarkPick,
  qmarkQuestionDone,
  qmarkThoughtDone,
  qmarkDone,
  qmarkStarted,
  qmarkChars,
  qmarkRows,
  qmarkCellState,
  QMARK_REGIONS,
  qmarkRegionFields,
} from "../../lib/qmark.js";

test("다섯 물음 · 두 개 이상 · 영역 둘", () => {
  assert.equal(QMARK_PROMPTS.length, 5);
  assert.equal(QMARK_MIN_PICKS, 2);
  assert.deepEqual(QMARK_REGIONS.map((r) => r.key), ["question", "thought"]);
});

const EMPTY = { question: "", reason: "" };

test("빈 값 · 이상한 값도 같은 모양으로 — 물음표는 늘 다섯 쌍", () => {
  assert.equal(QMARK_ASK_COUNT, 5);
  assert.deepEqual(emptyQmarkAnswers(), { asks: [EMPTY, EMPTY, EMPTY, EMPTY, EMPTY], picks: [], thought: "" });
  const n = normalizeQmarkAnswers({ asks: [], picks: ["change", "zzz", "knowledge", "change"], thought: "t" });
  assert.deepEqual(n.picks, ["knowledge", "change"]);
  assert.equal(n.asks.length, QMARK_ASK_COUNT);
  assert.equal(normalizeQmarkAnswers(null).asks.length, QMARK_ASK_COUNT);
  const many = normalizeQmarkAnswers({ asks: Array.from({ length: 9 }, () => ({ question: "q" })), thought: "" });
  assert.equal(many.asks.length, QMARK_ASK_COUNT);
  // 두 쌍만 적어 둔 기록은 뒤를 빈 쌍으로 채움 — 적은 자리는 그대로
  const two = normalizeQmarkAnswers({ asks: [{ question: "a" }, { reason: "b" }], thought: "" });
  assert.deepEqual(two.asks.slice(0, 2), [{ question: "a", reason: "" }, { question: "", reason: "b" }]);
  assert.deepEqual(two.asks.slice(2), [EMPTY, EMPTY, EMPTY]);
});

test("옛 모양 — 물음 하나 · 물음마다 쓴 글을 읽음", () => {
  const old = {
    question: "왜?",
    reason: "궁금해서",
    picks: ["use", "bias"],
    use: "활용 글",
    bias: "",
    interest: "안 고른 글",
  };
  const a = normalizeQmarkAnswers(old);
  assert.deepEqual(a.asks, [{ question: "왜?", reason: "궁금해서" }, EMPTY, EMPTY, EMPTY, EMPTY]);
  assert.equal(a.thought, `${QMARK_PROMPTS[1].text}\n활용 글`);
  // 한 번 저장해 thought가 생기면(빈 글이라도) 옛 칸은 더 안 봄
  assert.equal(normalizeQmarkAnswers({ ...old, thought: "", asks: [{ question: "새", reason: "" }] }).thought, "");
  assert.equal(normalizeQmarkAnswers({ ...old, asks: [{ question: "새", reason: "" }] }).asks[0].question, "새");
});

test("물음표 고치기 — 칸 수는 그대로", () => {
  let a = emptyQmarkAnswers();
  a = editQmarkAsk(a, 0, "question", "하나");
  a = editQmarkAsk(a, 4, "reason", "다섯 이유");
  assert.deepEqual(a.asks, [{ question: "하나", reason: "" }, EMPTY, EMPTY, EMPTY, { question: "", reason: "다섯 이유" }]);
  // 없는 자리 · 모르는 칸은 그대로
  assert.deepEqual(editQmarkAsk(a, 5, "question", "x"), a);
  assert.deepEqual(editQmarkAsk(a, 0, "zzz", "x"), a);
});

test("체크 · 풀기", () => {
  let a = toggleQmarkPick(emptyQmarkAnswers(), "bias");
  a = toggleQmarkPick(a, "knowledge");
  assert.deepEqual(a.picks, ["knowledge", "bias"]);
  a = toggleQmarkPick(a, "bias");
  assert.deepEqual(a.picks, ["knowledge"]);
  assert.deepEqual(toggleQmarkPick(a, "nope").picks, ["knowledge"]);
});

test("완성 — 적은 물음표마다 궁금증 · 이유 + 두 개 이상 체크 + 생각", () => {
  const asks = [{ question: "왜?", reason: "궁금해서" }];
  const ok = { asks, picks: ["use", "bias"], thought: "정리" };
  assert.equal(qmarkDone(ok), true);
  // 빈 쌍(＋만 눌러 둔 것)은 세지 않음
  assert.equal(qmarkDone({ ...ok, asks: [...asks, { question: "", reason: "" }] }), true);
  // 이유 없는 물음표가 하나라도 있으면 아님
  assert.equal(qmarkQuestionDone({ asks: [...asks, { question: "또", reason: "" }] }), false);
  assert.equal(qmarkQuestionDone({ asks: [{ question: "", reason: "" }] }), false);
  assert.equal(qmarkThoughtDone({ picks: ["use"], thought: "정리" }), false);
  assert.equal(qmarkThoughtDone({ picks: ["use", "bias"], thought: " " }), false);
});

test("시작 · 글자 수", () => {
  assert.equal(qmarkStarted({ asks: [], thought: "" }), false);
  assert.equal(qmarkStarted({ picks: ["use"], thought: "" }), true);
  assert.equal(
    qmarkChars({ asks: [{ question: "ab", reason: "c" }, { question: "d", reason: "" }], thought: "ef" }),
    6
  );
});

test("진행 줄 셋 · 칸 색", () => {
  const rows = qmarkRows();
  assert.deepEqual(rows.map((r) => r.key), ["question", "reason", "thoughts"]);
  const [q, r, t] = rows;
  const two = { asks: [{ question: "x", reason: "y" }, { question: "z", reason: "" }], thought: "" };
  assert.equal(qmarkCellState(q, two), "done");
  assert.equal(qmarkCellState(r, two), "doing");
  assert.equal(qmarkCellState(r, { thought: "" }), "empty");
  assert.equal(qmarkCellState(t, { thought: "" }), "empty");
  assert.equal(qmarkCellState(t, { picks: ["use"], thought: "" }), "doing");
  assert.equal(qmarkCellState(t, { picks: ["use", "bias"], thought: "" }), "doing");
  assert.equal(qmarkCellState(t, { picks: ["use", "bias"], thought: "글" }), "done");
});

test("띄울 영역 — 물음표 모두 · 체크한 물음 + 생각", () => {
  const one = { asks: [{ question: "왜?", reason: "이유" }], picks: ["use"], thought: "생각" };
  assert.deepEqual(qmarkRegionFields(one, "question"), [
    { label: "궁금증", text: "왜?" },
    { label: "이유는", text: "이유" },
  ]);
  const two = { asks: [{ question: "a", reason: "b" }, { question: "", reason: "" }, { question: "c", reason: "" }] };
  assert.deepEqual(
    qmarkRegionFields(two, "question").map((f) => f.label),
    ["궁금증 1", "이유는", "궁금증 2", "이유는"]
  );
  assert.deepEqual(qmarkRegionFields(one, "thought"), [
    { label: "고른 물음", text: `· ${QMARK_PROMPTS[1].text}` },
    { label: "나의 생각", text: "생각" },
  ]);
  assert.deepEqual(qmarkRegionFields(one, "nope"), []);
});
