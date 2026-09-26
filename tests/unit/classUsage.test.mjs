// 반별 현황(lib/classUsage.js) — 수업 관리 창의 오른쪽 열.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lessonUsageByClass, projectUsageByClass } from "@/lib/classUsage";

const classes = [
  { id: "c10", name: "10반" },
  { id: "cB", name: "인공지능 기초 B" },
  { id: "c2", name: "2반" },
];

test("반은 이름순(숫자는 수로) — 지금 반을 앞으로 올리지 않습니다", () => {
  const out = lessonUsageByClass(classes, [], []);
  assert.deepEqual(out.map((c) => c.name), ["2반", "10반", "인공지능 기초 B"]);
  assert.ok(out.every((c) => c.rows.length === 0));
});

test("수업: 반마다 수업한 날(중복 없이) · 최근 것부터, 준비만 한 자료는 뒤에", () => {
  const boards = [
    { id: "b1", classId: "c2", title: "반복문 탐구" },
    { id: "b9", classId: "c10", title: "다른 반 것" },
  ];
  const lessons = [
    { id: "L1", title: "조건문", createdAt: 1, taughtDays: { c2: ["2026-09-20", "2026-09-20", "2026-09-10"] } },
    { id: "L2", title: "반복문", createdAt: 2, taughtDays: { c2: ["2026-09-25"] }, boardIds: { c2: "b1" } },
    // 기록은 없지만 이 반에 프로젝트를 연결해 둔 자료 — '준비됨'
    { id: "L3", title: "함수", createdAt: 3, boardIds: { c2: "b1" } },
    // 옛 boardId — 이 반 프로젝트일 때만 그 반의 것으로 셉니다
    { id: "L4", title: "옛 자료", createdAt: 4, boardId: "b9" },
    // 이 반 키를 '연결 안 함'(null)으로 비운 자료는 옛 boardId로 되돌아가지 않습니다
    { id: "L5", title: "비운 자료", createdAt: 5, boardId: "b1", boardIds: { c2: null } },
  ];
  const [two, ten] = lessonUsageByClass(classes, lessons, boards);
  assert.deepEqual(two.rows.map((r) => r.lessonId), ["L2", "L1", "L3"]);
  assert.deepEqual(two.rows[1].days, ["2026-09-10", "2026-09-20"]);
  assert.equal(two.rows[1].lastDay, "2026-09-20");
  assert.equal(two.rows[0].boardTitle, "반복문 탐구");
  assert.equal(two.rows[2].lastDay, null);
  assert.deepEqual(ten.rows.map((r) => r.lessonId), ["L4"]);
  assert.equal(ten.rows[0].boardTitle, "다른 반 것");
});

test("프로젝트: 수업 자료·휴지통은 빼고, 열린 활동 수·잠금·원본 여부를 셉니다", () => {
  const boards = [
    { id: "n", classId: "c2", type: "notice", title: "수업 자료" },
    { id: "x", classId: "c2", title: "지운 것", deleted: true },
    { id: "p2", classId: "c2", title: "둘째", createdAt: 20, templateId: "gone", activities: ["a"] },
    {
      id: "p1", classId: "c2", title: "첫째", createdAt: 10, templateId: "t1", editMode: "locked",
      activities: ["a", "b", "c"], activityLocks: [false, true, false],
    },
  ];
  const [two] = projectUsageByClass(classes, boards, [{ id: "t1" }]);
  assert.deepEqual(two.rows.map((r) => r.boardId), ["p1", "p2"]);
  assert.deepEqual(
    { open: two.rows[0].openActs, total: two.rows[0].totalActs, locked: two.rows[0].locked, tpl: two.rows[0].fromTemplate },
    { open: 2, total: 3, locked: true, tpl: true }
  );
  // 잠금 배열이 없는 옛 프로젝트는 다 열림 · 지운 원본을 가리키면 원본 아님
  assert.deepEqual([two.rows[1].openActs, two.rows[1].fromTemplate], [1, false]);
});
