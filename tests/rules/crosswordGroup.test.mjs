// =============================================================
// 가로세로 낱말퀴즈(모둠) — groups/{gId}/xwHints · xwBoard
//
// 못 박아 두는 것:
//   ① 힌트 문서(낱말 = 정답)는 그 모둠과 담당 교사만 읽는다
//   ② 쓸 사람(알약)은 힌트가 비었을 때 · 또는 지금 쓰는 사람 자신만 바꾼다,
//      고른 사람은 그 모둠 구성원
//   ③ 힌트 글은 알약이 가리키는 학생만, 100자까지
//   ④ 판은 그 모둠원만 쓰고(칸 맵만), 교사는 읽기만
//   ⑤ 앱과 같은 모양의 merge 쓰기(칸 지우기 포함)가 통과한다
// =============================================================
import { describe, it, before, after, beforeEach } from "node:test";
import { assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, deleteField } from "firebase/firestore";
import { makeEnv, asStudent, asTeacher, seed } from "./helpers.mjs";

const hintPath = (gId, idx) => ["bookActivities", "act1", "groups", gId, "xwHints", String(idx)];
const boardPath = (gId) => ["bookActivities", "act1", "groups", gId, "xwBoard", "main"];

describe("가로세로(모둠) 규칙", () => {
  let env;
  before(async () => { env = await makeEnv("demo-rules-xw"); });
  after(async () => { await env.cleanup(); });

  beforeEach(async () => {
    await env.clearFirestore();
    await seed(env, async (db) => {
      await setDoc(doc(db, "classes", "cA"), { createdBy: "teacherA", archived: false });
      for (const uid of ["stu1", "stu2", "stu3"]) {
        await setDoc(doc(db, "memberships", `${uid}_cA`), { uid, classId: "cA" });
      }
      await setDoc(doc(db, "bookActivities", "act1"), {
        classId: "cA", type: "consonant", title: "닿소리", locked: false, groupMode: "base",
      });
      // 1모둠: stu1·stu2 / 2모둠: stu3
      await setDoc(doc(db, "bookActivities", "act1", "groups", "group_1"), {
        activityId: "act1", groupIndex: 1, memberUids: ["stu1", "stu2"], members: [],
      });
      await setDoc(doc(db, "bookActivities", "act1", "groups", "group_2"), {
        activityId: "act1", groupIndex: 2, memberUids: ["stu3"], members: [],
      });
      await setDoc(doc(db, ...hintPath("group_1", 0)), {
        activityId: "act1", groupId: "group_1", idx: 0, word: "광합성", num: 1, dir: "across", len: 3,
        writerUid: null, writerName: "", hint: "",
      });
      await setDoc(doc(db, ...hintPath("group_1", 1)), {
        activityId: "act1", groupId: "group_1", idx: 1, word: "합성어", num: 2, dir: "down", len: 3,
        writerUid: "stu2", writerName: "학생2", hint: "두 말이 합쳐진 말",
      });
      await setDoc(doc(db, ...boardPath("group_2")), { cells: { "0,0": "광" } });
    });
  });

  it("힌트 — 그 모둠과 교사는 읽고, 다른 모둠은 못 읽음", async () => {
    await assertSucceeds(getDoc(doc(asStudent(env, "stu1").firestore(), ...hintPath("group_1", 0))));
    await assertSucceeds(getDocs(collection(asStudent(env, "stu1").firestore(), "bookActivities", "act1", "groups", "group_1", "xwHints")));
    await assertSucceeds(getDocs(collection(asTeacher(env, "teacherA").firestore(), "bookActivities", "act1", "groups", "group_1", "xwHints")));
    await assertFails(getDoc(doc(asStudent(env, "stu3").firestore(), ...hintPath("group_1", 0))));
    await assertFails(getDocs(collection(asStudent(env, "stu3").firestore(), "bookActivities", "act1", "groups", "group_1", "xwHints")));
  });

  it("힌트 문서 만들기·지우기는 담당 교사만", async () => {
    const t = asTeacher(env, "teacherA").firestore();
    await assertSucceeds(setDoc(doc(t, ...hintPath("group_2", 2)), { groupId: "group_2", idx: 2, word: "사과", writerUid: null, writerName: "", hint: "" }));
    await assertSucceeds(deleteDoc(doc(t, ...hintPath("group_2", 2))));
    const s = asStudent(env, "stu1").firestore();
    await assertFails(setDoc(doc(s, ...hintPath("group_1", 5)), { groupId: "group_1", idx: 5, word: "사과", writerUid: null, writerName: "", hint: "" }));
    await assertFails(deleteDoc(doc(s, ...hintPath("group_1", 0))));
    await assertFails(setDoc(doc(asTeacher(env, "teacherB").firestore(), ...hintPath("group_2", 3)), { word: "x" }));
  });

  it("알약 — 빈 힌트는 모둠원 누구나 쓸 사람을 고름(모둠원만)", async () => {
    const s = asStudent(env, "stu1").firestore();
    await assertSucceeds(updateDoc(doc(s, ...hintPath("group_1", 0)), { writerUid: "stu2", writerName: "학생2" }));
    await assertSucceeds(updateDoc(doc(s, ...hintPath("group_1", 0)), { writerUid: null, writerName: "" }));
    await assertFails(updateDoc(doc(s, ...hintPath("group_1", 0)), { writerUid: "stu3", writerName: "남의 모둠" }));
    await assertFails(updateDoc(doc(asStudent(env, "stu3").firestore(), ...hintPath("group_1", 0)), { writerUid: "stu3", writerName: "x" }));
  });

  it("알약 — 힌트가 쓰인 뒤에는 쓴 사람만 바꿈", async () => {
    await assertFails(updateDoc(doc(asStudent(env, "stu1").firestore(), ...hintPath("group_1", 1)), { writerUid: "stu1", writerName: "학생1" }));
    await assertSucceeds(updateDoc(doc(asStudent(env, "stu2").firestore(), ...hintPath("group_1", 1)), { writerUid: "stu1", writerName: "학생1" }));
  });

  it("힌트 글 — 알약이 가리키는 학생만, 100자까지 · 낱말은 못 바꿈", async () => {
    await assertSucceeds(updateDoc(doc(asStudent(env, "stu2").firestore(), ...hintPath("group_1", 1)), { hint: "새 힌트" }));
    await assertFails(updateDoc(doc(asStudent(env, "stu1").firestore(), ...hintPath("group_1", 1)), { hint: "남의 힌트" }));
    await assertFails(updateDoc(doc(asStudent(env, "stu2").firestore(), ...hintPath("group_1", 1)), { hint: "가".repeat(101) }));
    await assertFails(updateDoc(doc(asStudent(env, "stu2").firestore(), ...hintPath("group_1", 1)), { hint: "x", word: "바꿈" }));
  });

  it("잠긴 활동에서는 학생이 못 고침", async () => {
    await seed(env, (db) => updateDoc(doc(db, "bookActivities", "act1"), { locked: true }));
    await assertFails(updateDoc(doc(asStudent(env, "stu2").firestore(), ...hintPath("group_1", 1)), { hint: "잠김" }));
    await assertFails(setDoc(doc(asStudent(env, "stu3").firestore(), ...boardPath("group_2")), { cells: { "0,1": "합" } }, { merge: true }));
  });

  it("판 — 그 모둠원이 칸 merge로 쓰고 지움, 다른 모둠은 못 읽고 못 씀", async () => {
    const s3 = asStudent(env, "stu3").firestore();
    await assertSucceeds(setDoc(doc(s3, ...boardPath("group_2")), { cells: { "0,1": "합" }, updatedAt: new Date() }, { merge: true }));
    await assertSucceeds(setDoc(doc(s3, ...boardPath("group_2")), { cells: { "0,0": deleteField() } }, { merge: true }));
    await assertSucceeds(getDoc(doc(s3, ...boardPath("group_2"))));
    // 아직 없는 판도 첫 쓰기로 생김
    await assertSucceeds(setDoc(doc(asStudent(env, "stu1").firestore(), ...boardPath("group_1")), { cells: { "1,1": "성" } }, { merge: true }));
    const s1 = asStudent(env, "stu1").firestore();
    await assertFails(getDoc(doc(s1, ...boardPath("group_2"))));
    await assertFails(setDoc(doc(s1, ...boardPath("group_2")), { cells: { "0,2": "성" } }, { merge: true }));
    // 칸 맵 말고 다른 칸은 못 둠
    await assertFails(setDoc(doc(s3, ...boardPath("group_2")), { cells: {}, score: 99 }, { merge: true }));
    await assertFails(setDoc(doc(s3, "bookActivities", "act1", "groups", "group_2", "xwBoard", "other"), { cells: {} }));
  });

  it("판 — 교사는 읽고 걷기만", async () => {
    const t = asTeacher(env, "teacherA").firestore();
    await assertSucceeds(getDoc(doc(t, ...boardPath("group_2"))));
    await assertFails(setDoc(doc(t, ...boardPath("group_2")), { cells: { "0,1": "x" } }, { merge: true }));
    await assertSucceeds(deleteDoc(doc(t, ...boardPath("group_2"))));
    await assertFails(getDoc(doc(asTeacher(env, "teacherB").firestore(), ...boardPath("group_1"))));
  });

  // ── 개별 활동의 판 요약(xwProgress) ──
  const progPath = (gId) => ["bookActivities", "act1", "xwProgress", gId];
  const prog = (gId, uid, extra = {}) => ({
    groupId: gId, uid, solved: 2, total: 8, cells: 9, hintChars: 6,
    filled: ["0,1", "0,2"], solvedIdx: [1, 3], updatedAt: new Date(), ...extra,
  });

  it("판 요약 — 그 판의 주인만 쓰고, 반 구성원·교사는 모두 읽음", async () => {
    const s3 = asStudent(env, "stu3").firestore();
    await assertSucceeds(setDoc(doc(s3, ...progPath("group_2")), prog("group_2", "stu3")));
    await assertSucceeds(setDoc(doc(s3, ...progPath("group_2")), prog("group_2", "stu3", { solved: 3 })));
    // 남의 판 · 남의 이름 · 다른 칸은 못 씀
    await assertFails(setDoc(doc(s3, ...progPath("group_1")), prog("group_1", "stu3")));
    await assertFails(setDoc(doc(asStudent(env, "stu1").firestore(), ...progPath("group_2")), prog("group_2", "stu1")));
    await assertFails(setDoc(doc(s3, ...progPath("group_2")), prog("group_2", "stu1")));
    await assertFails(setDoc(doc(s3, ...progPath("group_2")), prog("group_2", "stu3", { letters: { "0,1": "합" } })));
    await assertFails(setDoc(doc(s3, ...progPath("group_2")), prog("group_2", "stu3", { solved: -1 })));
    // 읽기 — 반 구성원 누구나(다른 판의 학생도) · 담당 교사, 다른 반 교사는 못 읽음
    await assertSucceeds(getDocs(collection(asStudent(env, "stu1").firestore(), "bookActivities", "act1", "xwProgress")));
    await assertSucceeds(getDocs(collection(asTeacher(env, "teacherA").firestore(), "bookActivities", "act1", "xwProgress")));
    await assertFails(getDocs(collection(asTeacher(env, "teacherB").firestore(), "bookActivities", "act1", "xwProgress")));
    // 지우기는 담당 교사만 · 잠기면 학생 쓰기 막힘
    await assertFails(deleteDoc(doc(s3, ...progPath("group_2"))));
    await assertSucceeds(deleteDoc(doc(asTeacher(env, "teacherA").firestore(), ...progPath("group_2"))));
    await seed(env, (db) => updateDoc(doc(db, "bookActivities", "act1"), { locked: true }));
    await assertFails(setDoc(doc(s3, ...progPath("group_2")), prog("group_2", "stu3")));
  });
});
