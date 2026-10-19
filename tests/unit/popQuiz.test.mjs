import { test } from "node:test";
import assert from "node:assert/strict";
import {
  QUIZ_HISTORY_MAX,
  canSubmitQuiz,
  nextQuizHistory,
  quizThread,
  pickOpenQuiz,
  quizAnswerFilled,
  quizCounts,
  seatQuizState,
  shouldAutoOpenQuiz,
  sortQuizzes,
  splitQuizDesc,
  studentQuizLight,
} from "@/lib/popQuiz";

const open = { id: "q1", open: true };
const closed = { id: "q0", open: false };

test("학생 불 — 열린 퀴즈에 안 보냄 빨강 · 반송 초록 · 그 밖에는 없음", () => {
  assert.equal(studentQuizLight(open, null), "red");
  assert.equal(studentQuizLight(open, { status: "returned" }), "green");
  assert.equal(studentQuizLight(open, { status: "submitted" }), null);
  assert.equal(studentQuizLight(open, { status: "rewarded" }), null);
  assert.equal(studentQuizLight(closed, null), null);
  assert.equal(studentQuizLight(closed, { status: "returned" }), null);
  assert.equal(studentQuizLight(null, null), null);
});

test("보낼 수 있나 — 열린 퀴즈 · 처음이거나 반송", () => {
  assert.equal(canSubmitQuiz(open, null), true);
  assert.equal(canSubmitQuiz(open, { status: "returned" }), true);
  assert.equal(canSubmitQuiz(open, { status: "submitted" }), false);
  assert.equal(canSubmitQuiz(open, { status: "rewarded" }), false);
  assert.equal(canSubmitQuiz(closed, { status: "returned" }), false);
});

test("처음 한 번만 저절로 — 본 적 없는 열린 퀴즈이고 아직 안 보냈을 때", () => {
  assert.equal(shouldAutoOpenQuiz(open, null, null), true);
  assert.equal(shouldAutoOpenQuiz(open, null, "q1"), false);
  assert.equal(shouldAutoOpenQuiz(open, { status: "returned" }, null), false);
  assert.equal(shouldAutoOpenQuiz(closed, null, null), false);
});

test("자리표 칸 — 보냄은 메모지, 과일은 초록, 반송·미제출은 표시 없음", () => {
  assert.equal(seatQuizState({ status: "submitted" }), "memo");
  assert.equal(seatQuizState({ status: "rewarded" }), "done");
  assert.equal(seatQuizState({ status: "returned" }), null);
  assert.equal(seatQuizState(null), null);
});

test("셈은 지금 명단만 — 반에서 빠진 학생의 답은 안 셈", () => {
  const answers = [
    { uid: "a", status: "submitted" },
    { uid: "b", status: "returned" },
    { uid: "c", status: "rewarded" },
    { uid: "gone", status: "submitted" },
  ];
  assert.deepEqual(quizCounts(answers, ["a", "b", "c", "d"]), {
    total: 4, sent: 2, pending: 1, returned: 1, rewarded: 1,
  });
});

test("열린 퀴즈가 둘이면 최근 것 · 정렬은 최근 것이 위(서버 시각 전은 지금)", () => {
  const list = [
    { id: "old", open: true, createdAt: new Date("2026-09-01") },
    { id: "new", open: true, createdAt: new Date("2026-09-02") },
    { id: "x", open: false, createdAt: new Date("2026-09-03") },
  ];
  assert.equal(pickOpenQuiz(list).id, "new");
  assert.equal(pickOpenQuiz([closed]), null);
  assert.deepEqual(sortQuizzes([...list, { id: "now", createdAt: null }]).map((q) => q.id), ["now", "x", "new", "old"]);
});

test("설명의 ``` 은 코드 블록", () => {
  assert.deepEqual(splitQuizDesc(""), []);
  assert.deepEqual(splitQuizDesc("결과를 쓰세요"), [{ type: "text", text: "결과를 쓰세요" }]);
  assert.deepEqual(splitQuizDesc("다음 코드의 결과는?\n```python\nx = 1\nprint(x + 1)\n```\n왜 그런가요?"), [
    { type: "text", text: "다음 코드의 결과는?" },
    { type: "code", text: "x = 1\nprint(x + 1)" },
    { type: "text", text: "왜 그런가요?" },
  ]);
  // 닫지 않으면 끝까지 코드
  assert.deepEqual(splitQuizDesc("보기\n```\nfor i in range(3):\n    print(i)"), [
    { type: "text", text: "보기" },
    { type: "code", text: "for i in range(3):\n    print(i)" },
  ]);
});

test("보낼 만한 답 — 글은 태그를 걷고, 코드는 공백이 아니어야", () => {
  assert.equal(quizAnswerFilled("text", "<p><br></p>"), false);
  assert.equal(quizAnswerFilled("text", "<p>&nbsp;</p>"), false);
  assert.equal(quizAnswerFilled("text", "<p>답</p>"), true);
  assert.equal(quizAnswerFilled("code", "   \n"), false);
  assert.equal(quizAnswerFilled("code", "print(1)"), true);
});

test("다시 보낼 때 이력 — 반송된 답만 지난 차례를 끝에 붙이고, 20을 넘으면 앞을 밀어냄", () => {
  assert.equal(nextQuizHistory(null), null);
  assert.equal(nextQuizHistory({ status: "submitted", text: "a" }), null);
  const r1 = { status: "returned", text: "a", output: "", returnNote: "예를 들어 줘요", submittedAt: 1, reviewedAt: 2 };
  assert.deepEqual(nextQuizHistory(r1), [{ text: "a", output: "", note: "예를 들어 줘요", submittedAt: 1, returnedAt: 2 }]);
  // 한 마디 없이 돌려보낸 것도 빈 글로 남음
  assert.equal(nextQuizHistory({ status: "returned", text: "b" })[0].note, "");
  const full = Array.from({ length: QUIZ_HISTORY_MAX }, (_, i) => ({ text: `h${i}` }));
  const next = nextQuizHistory({ ...r1, history: full });
  assert.equal(next.length, QUIZ_HISTORY_MAX);
  assert.equal(next[0].text, "h1");
  assert.equal(next.at(-1).text, "a");
});

test("대화 — 지난 차례(반송 한 마디 짝) + 지금 답", () => {
  assert.deepEqual(quizThread(null), []);
  const a = {
    status: "returned", text: "둘째", returnNote: "조금만 더", reviewedAt: 4, submittedAt: 3,
    history: [{ text: "첫째", output: "", note: "다시", submittedAt: 1, returnedAt: 2 }],
  };
  const t = quizThread(a);
  assert.equal(t.length, 2);
  assert.deepEqual([t[0].text, t[0].note, t[0].returned, t[0].current], ["첫째", "다시", true, false]);
  assert.deepEqual([t[1].text, t[1].note, t[1].returned, t[1].current], ["둘째", "조금만 더", true, true]);
  // 보낸 상태면 지금 차례에 한 마디가 없음(지난 반송의 한 마디가 남아 있어도)
  const sent = quizThread({ ...a, status: "submitted" });
  assert.deepEqual([sent[1].returned, sent[1].note], [false, ""]);
});
