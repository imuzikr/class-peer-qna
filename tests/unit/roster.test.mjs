// 반 명단(lib/roster.js) — 공부방·책방·손든 학생 자리 확인이 함께 쓰는 셈.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildClassRoster } from "@/lib/roster";
import { normalizeSeats } from "@/lib/seats";

const directory = [
  { uid: "u3", realName: "박서준", studentId: "30303", emoji: "🐯", email: "c@x" },
  { uid: "u1", realName: "김하윤", studentId: "30301", emoji: "🐰" },
  { uid: "u2", studentId: "30302" },
];
const rewards = [{ uid: "u1", count: 7 }, { uid: "u3", count: 0 }];

test("소속 차례와 상관없이 학번순이고, 칸마다 이름·학번·과일 누적이 붙습니다", () => {
  const r = buildClassRoster(["u3", "u2", "u1"], directory, rewards);
  assert.deepEqual(r.map((s) => s.uid), ["u1", "u2", "u3"]);
  assert.deepEqual(r[0], { uid: "u1", name: "김하윤", studentId: "30301", emoji: "🐰", email: null, count: 7 });
  // 실명이 없으면 학번을 이름 자리에
  assert.equal(r[1].name, "30302");
  assert.equal(r[1].count, 0);
  assert.equal(r[2].email, "c@x");
});

test("디렉터리에 없는 학생도 빠지지 않고 '이름 미설정'으로 섭니다", () => {
  const r = buildClassRoster(["ghost"], directory, rewards);
  assert.deepEqual(r, [{ uid: "ghost", name: "이름 미설정", studentId: null, emoji: "🙂", email: null, count: 0 }]);
});

test("빈 입력은 빈 명단", () => {
  assert.deepEqual(buildClassRoster(), []);
  assert.deepEqual(buildClassRoster([], directory, rewards), []);
});

test("자리표가 비었을 때 빈자리는 학번순으로 채워집니다 — 소속 차례에 흔들리지 않음", () => {
  const a = normalizeSeats([], buildClassRoster(["u3", "u1", "u2"], directory, rewards));
  const b = normalizeSeats([], buildClassRoster(["u1", "u2", "u3"], directory, rewards));
  assert.deepEqual(a.slice(0, 3), ["u1", "u2", "u3"]);
  assert.deepEqual(a, b);
});
