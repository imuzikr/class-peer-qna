// 반 명단(lib/roster.js) — 공부방·책방·손든 학생 자리 확인이 함께 쓰는 셈.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildClassRoster, studyingSummary } from "@/lib/roster";
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

// ── 선생님 보기의 자리 차례(seatOrder) ─────────────────────────────
import { seatOrder } from "@/lib/seats";

test("학생 보기는 자리 번호 그대로입니다", () => {
  assert.deepEqual(seatOrder(4, false), [0, 1, 2, 3]);
});

test("선생님 보기는 통째로 거꾸로 — 6칸 격자를 180도 돌린 그림입니다", () => {
  const order = seatOrder(30, true);
  assert.equal(order.length, 30);
  assert.deepEqual(order.slice(0, 6), [29, 28, 27, 26, 25, 24]);
  assert.deepEqual(order.slice(-6), [5, 4, 3, 2, 1, 0]);
  // 자리 (줄 r, 칸 c)가 (마지막 줄 − r, 5 − c)로 갑니다
  for (let i = 0; i < 30; i += 1) {
    const r = Math.floor(i / 6), c = i % 6;
    assert.equal(order[(4 - r) * 6 + (5 - c)], i);
  }
});

test("마지막 줄이 덜 차면 모자란 칸을 null로 채워 돌립니다(맨 위 줄의 왼쪽)", () => {
  assert.deepEqual(seatOrder(8, true), [null, null, null, null, 7, 6, 5, 4, 3, 2, 1, 0]);
});

test("studyingSummary — 출석이 있으면 쓴/출석(전체), 분자는 출석한 학생만", () => {
  const roster = [{ uid: "a" }, { uid: "b" }, { uid: "c" }, { uid: "d" }];
  const wrote = (u) => u !== "b";
  const day = "2026-10-08";
  // 출석 기록 없음 → 쓴/전체
  let s = studyingSummary(roster, wrote, [], day);
  assert.equal(s.label, "3/4");
  assert.equal(s.present, null);
  // d 결석(d는 지난 시간에 써 둠) · 반에서 빠진 x의 기록 · 어제 기록은 안 셈
  const recs = [
    { uid: "a", date: day }, { uid: "b", date: day }, { uid: "c", date: day },
    { uid: "x", date: day }, { uid: "d", date: "2026-10-07" },
  ];
  s = studyingSummary(roster, wrote, recs, day);
  assert.equal(s.label, "2/3(4)");
  assert.equal(s.count, 2);
  assert.equal(s.present, 3);
  assert.match(s.title, /결석 1명/);
});
