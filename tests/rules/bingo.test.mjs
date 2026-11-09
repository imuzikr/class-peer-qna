// =============================================================
// 낱말 빙고 — bookActivities/{aId}/bingoBoards/{판 id}
//
// 못 박아 두는 것:
//   ① 판은 반 구성원 · 담당 교사가 읽고, 반 밖은 못 읽는다
//   ② 쓰기는 그 판(모둠)의 구성원만, 칸 merge(지우기 포함)가 통과한다
//   ③ 판 채우기 단계(bingo.stage == 'fill')에서만 — 빙고가 시작되면 굳는다
//   ④ 잠긴 활동에서는 못 쓴다
//   ⑤ 모양을 못 박는다 — 칸 열쇠는 "0"~"24", 다른 칸 · groupId 둔갑은 거부
//   ⑥ 지우기는 담당 교사만
//   ⑦ 학생이 진행 — 제 차례인 학생만 활동 문서의 bingo.called · by · turn에 낱말 하나를
//      이어 붙이고 차례를 하나 넘긴다(상자의 안 불린 낱말 · 마지막 다음은 처음).
//      다른 칸 · 다른 필드 · 두 낱말 · 차례 건너뛰기 · 선생님이 진행 · 판 채우기 · 잠김 · 반 밖은 거부
// =============================================================
import { describe, it, before, after, beforeEach } from "node:test";
import { assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, deleteField, serverTimestamp } from "firebase/firestore";
import { makeEnv, asStudent, asTeacher, seed } from "./helpers.mjs";

const actPath = ["bookActivities", "act1"];
const boardPath = (gId) => ["bookActivities", "act1", "bingoBoards", gId];
const write = (db, gId, cells) =>
  setDoc(doc(db, ...boardPath(gId)), { groupId: gId, cells, updatedAt: serverTimestamp() }, { merge: true });

describe("낱말 빙고 규칙", () => {
  let env;
  before(async () => { env = await makeEnv("demo-rules-bingo"); });
  after(async () => { await env.cleanup(); });

  beforeEach(async () => {
    await env.clearFirestore();
    await seed(env, async (db) => {
      await setDoc(doc(db, "classes", "cA"), { createdBy: "teacherA", archived: false });
      for (const uid of ["stu1", "stu2", "stu3"]) {
        await setDoc(doc(db, "memberships", `${uid}_cA`), { uid, classId: "cA" });
      }
      await setDoc(doc(db, ...actPath), {
        classId: "cA", type: "bingo", title: "빙고", locked: false, groupMode: "base",
        bingo: { stage: "fill", words: ["사과", "배"], called: [], goal: 3 },
      });
      // 1모둠: stu1·stu2 / 2모둠: stu3
      await setDoc(doc(db, ...actPath, "groups", "group_1"), { activityId: "act1", groupIndex: 1, memberUids: ["stu1", "stu2"], members: [] });
      await setDoc(doc(db, ...actPath, "groups", "group_2"), { activityId: "act1", groupIndex: 2, memberUids: ["stu3"], members: [] });
      await setDoc(doc(db, ...boardPath("group_2")), { groupId: "group_2", cells: { 0: "사과" } });
    });
  });

  it("읽기 — 반 구성원(다른 모둠 포함) · 담당 교사는 읽고, 반 밖은 못 읽음", async () => {
    await assertSucceeds(getDoc(doc(asStudent(env, "stu1").firestore(), ...boardPath("group_2"))));
    await assertSucceeds(getDocs(collection(asStudent(env, "stu1").firestore(), ...actPath, "bingoBoards")));
    await assertSucceeds(getDocs(collection(asTeacher(env, "teacherA").firestore(), ...actPath, "bingoBoards")));
    await assertFails(getDoc(doc(asStudent(env, "outsider").firestore(), ...boardPath("group_2"))));
  });

  it("쓰기 — 그 모둠원이 칸 merge로 넣고 지움, 다른 모둠은 못 씀", async () => {
    const db1 = asStudent(env, "stu1").firestore();
    await assertSucceeds(write(db1, "group_1", { 0: "사과", 24: "배" }));
    await assertSucceeds(write(asStudent(env, "stu2").firestore(), "group_1", { 1: "배" }));
    await assertSucceeds(write(db1, "group_1", { 24: deleteField() }));
    await assertFails(write(asStudent(env, "stu3").firestore(), "group_1", { 2: "사과" }));
    await assertFails(write(db1, "group_2", { 1: "배" }));
  });

  it("모양 — 칸 열쇠는 0~24만, groupId 둔갑 · 다른 필드는 거부", async () => {
    const db1 = asStudent(env, "stu1").firestore();
    await assertFails(write(db1, "group_1", { 25: "사과" }));
    await assertFails(write(db1, "group_1", { "a": "사과" }));
    await assertFails(setDoc(doc(db1, ...boardPath("group_1")), { groupId: "group_2", cells: {}, updatedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(db1, ...boardPath("group_1")), { groupId: "group_1", cells: {}, updatedAt: serverTimestamp(), extra: 1 }));
  });

  it("빙고가 시작되면(play) · 잠기면 판이 굳음", async () => {
    const db1 = asStudent(env, "stu1").firestore();
    await seed(env, (db) => updateDoc(doc(db, ...actPath), { "bingo.stage": "play" }));
    await assertFails(write(db1, "group_1", { 0: "사과" }));
    await seed(env, (db) => updateDoc(doc(db, ...actPath), { "bingo.stage": "fill", locked: true }));
    await assertFails(write(db1, "group_1", { 0: "사과" }));
    await seed(env, (db) => updateDoc(doc(db, ...actPath), { locked: false }));
    await assertSucceeds(write(db1, "group_1", { 0: "사과" }));
  });

  it("빙고 상태가 없는 활동에서는 못 씀", async () => {
    await seed(env, (db) => updateDoc(doc(db, ...actPath), { bingo: null }));
    await assertFails(write(asStudent(env, "stu1").firestore(), "group_1", { 0: "사과" }));
  });

  describe("학생이 진행 — 제 차례에 낱말 하나 부르기", () => {
    // 차례: stu1 → stu2 → stu3 → (처음) stu1
    beforeEach(async () => {
      await seed(env, (db) => updateDoc(doc(db, ...actPath), {
        bingo: {
          stage: "play", size: 4, lead: "student", words: ["사과", "배", "감", "귤"],
          called: ["사과"], by: ["stu1"], goal: 3, order: ["stu1", "stu2", "stu3"], turn: 1,
        },
      }));
    });
    const call = (db, called, by, turn, extra = {}) =>
      updateDoc(doc(db, ...actPath), { "bingo.called": called, "bingo.by": by, "bingo.turn": turn, ...extra });

    it("제 차례인 학생이 상자의 안 불린 낱말 하나를 붙이고 차례를 넘김", async () => {
      await assertSucceeds(call(asStudent(env, "stu2").firestore(), ["사과", "배"], ["stu1", "stu2"], 2));
      // 마지막 번호(stu3) 다음은 처음(0)
      await assertSucceeds(call(asStudent(env, "stu3").firestore(), ["사과", "배", "감"], ["stu1", "stu2", "stu3"], 0));
      await assertSucceeds(call(asStudent(env, "stu1").firestore(), ["사과", "배", "감", "귤"], ["stu1", "stu2", "stu3", "stu1"], 1));
    });

    it("내 차례가 아니면 · 반 밖이면 못 부름", async () => {
      await assertFails(call(asStudent(env, "stu3").firestore(), ["사과", "배"], ["stu1", "stu3"], 2));
      await assertFails(call(asStudent(env, "stu1").firestore(), ["사과", "배"], ["stu1", "stu1"], 2));
      await seed(env, (db) => updateDoc(doc(db, ...actPath), { "bingo.order": ["stu1", "outsider", "stu3"] }));
      await assertFails(call(asStudent(env, "outsider").firestore(), ["사과", "배"], ["stu1", "outsider"], 2));
    });

    it("이미 불린 낱말 · 상자에 없는 낱말 · 두 낱말 · 앞 목록 고치기는 거부", async () => {
      const db2 = asStudent(env, "stu2").firestore();
      await assertFails(call(db2, ["사과", "사과"], ["stu1", "stu2"], 2));
      await assertFails(call(db2, ["사과", "수박"], ["stu1", "stu2"], 2));
      await assertFails(call(db2, ["사과", "배", "감"], ["stu1", "stu2", "stu2"], 2));
      await assertFails(call(db2, ["감", "배"], ["stu1", "stu2"], 2));
      await assertFails(call(db2, ["배"], ["stu2"], 2));
    });

    it("by에는 나를 · turn은 꼭 하나만 넘김", async () => {
      const db2 = asStudent(env, "stu2").firestore();
      await assertFails(call(db2, ["사과", "배"], ["stu1", "stu3"], 2));
      await assertFails(call(db2, ["사과", "배"], ["stu1"], 2));
      await assertFails(call(db2, ["사과", "배"], ["stu1", "stu2"], 1));
      await assertFails(call(db2, ["사과", "배"], ["stu1", "stu2"], 0));
    });

    it("다른 칸(목표 · 단계 · 차례 목록)이나 다른 필드는 못 고침", async () => {
      const db2 = asStudent(env, "stu2").firestore();
      await assertFails(call(db2, ["사과", "배"], ["stu1", "stu2"], 2, { "bingo.goal": 1 }));
      await assertFails(call(db2, ["사과", "배"], ["stu1", "stu2"], 2, { "bingo.order": ["stu2"] }));
      await assertFails(call(db2, ["사과", "배"], ["stu1", "stu2"], 2, { title: "바꿈" }));
      await assertFails(updateDoc(doc(db2, ...actPath), { "bingo.stage": "fill" }));
    });

    it("선생님이 진행 · 판 채우기 · 잠긴 활동에서는 학생이 못 부름", async () => {
      const db2 = asStudent(env, "stu2").firestore();
      await seed(env, (db) => updateDoc(doc(db, ...actPath), { "bingo.lead": "teacher" }));
      await assertFails(call(db2, ["사과", "배"], ["stu1", "stu2"], 2));
      await seed(env, (db) => updateDoc(doc(db, ...actPath), { "bingo.lead": "student", "bingo.stage": "fill" }));
      await assertFails(call(db2, ["사과", "배"], ["stu1", "stu2"], 2));
      await seed(env, (db) => updateDoc(doc(db, ...actPath), { "bingo.stage": "play", locked: true }));
      await assertFails(call(db2, ["사과", "배"], ["stu1", "stu2"], 2));
      await seed(env, (db) => updateDoc(doc(db, ...actPath), { locked: false }));
      await assertSucceeds(call(db2, ["사과", "배"], ["stu1", "stu2"], 2));
    });

    it("by가 called와 길이가 다르면(옛 자료) 학생은 못 붙임 — 선생님이 상태를 고쳐 쓴 뒤에만", async () => {
      await seed(env, (db) => updateDoc(doc(db, ...actPath), { "bingo.by": [] }));
      await assertFails(call(asStudent(env, "stu2").firestore(), ["사과", "배"], ["stu2"], 2));
    });

    it("교사는 그대로 무엇이든 고침(대신 고르기 · 되돌리기)", async () => {
      const t = asTeacher(env, "teacherA").firestore();
      await assertSucceeds(call(t, ["사과", "배"], ["stu1", "stu2"], 2));
      await assertSucceeds(call(t, ["사과"], ["stu1"], 1));
    });
  });

  it("지우기 — 담당 교사만", async () => {
    await assertFails(deleteDoc(doc(asStudent(env, "stu3").firestore(), ...boardPath("group_2"))));
    await assertSucceeds(deleteDoc(doc(asTeacher(env, "teacherA").firestore(), ...boardPath("group_2"))));
  });
});
