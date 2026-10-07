import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canSubmitQuiz,
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
