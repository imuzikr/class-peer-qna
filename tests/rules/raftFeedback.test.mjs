// =============================================================
// RAFT 교사 피드백 — bookActivities/{aId}/entries/{sId}/raftFeedback/{fId}
//
// 못 박아 두는 것:
//   ① 읽기는 그 학생 · 담당 교사만(같은 반 다른 학생 · 다른 반 교사는 못 봄)
//   ② 만들기 · 고치기 · 지우기는 담당 교사만, 모양을 못 박음(rev 1로 시작, 고칠 때 +1)
//   ③ 학생은 '봤다'(seenRev = rev) 한 칸만 — 잠긴 활동에서도, 다른 칸 · 남의 메모는 못 고침
//   ④ 알림 벨의 collectionGroup 질의(studentUid == 나)가 통과하고, 남의 것은 못 봄
// =============================================================
import { describe, it, before, after, beforeEach } from "node:test";
import { assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import {
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, collectionGroup, query, where, serverTimestamp,
} from "firebase/firestore";
import { makeEnv, asStudent, asTeacher, seed } from "./helpers.mjs";

const fbCol = (sId) => ["bookActivities", "act1", "entries", sId, "raftFeedback"];
const fbPath = (sId, fId) => [...fbCol(sId), fId];
const note = (over = {}) => ({
  activityId: "act1", studentUid: "stu1", start: 0, end: 3, quote: "나는 ", text: "좋은 시작이에요",
  rev: 1, seenRev: 0, byUid: "teacherA", createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...over,
});

describe("RAFT 교사 피드백 규칙", () => {
  let env;
  before(async () => { env = await makeEnv("demo-rules-raftfb"); });
  after(async () => { await env.cleanup(); });

  beforeEach(async () => {
    await env.clearFirestore();
    await seed(env, async (db) => {
      await setDoc(doc(db, "classes", "cA"), { createdBy: "teacherA", archived: false });
      await setDoc(doc(db, "classes", "cB"), { createdBy: "teacherB", archived: false });
      for (const uid of ["stu1", "stu2"]) await setDoc(doc(db, "memberships", `${uid}_cA`), { uid, classId: "cA" });
      await setDoc(doc(db, "bookActivities", "act1"), { classId: "cA", type: "raft", title: "RAFT", locked: true });
      await setDoc(doc(db, "bookActivities", "act1", "entries", "stu1"), { authorId: "stu1", answers: { writing: "나는 고양이다" } });
      await setDoc(doc(db, ...fbPath("stu1", "f1")), { ...note(), createdAt: new Date(), updatedAt: new Date() });
    });
  });

  it("읽기 — 그 학생 · 담당 교사만", async () => {
    await assertSucceeds(getDoc(doc(asStudent(env, "stu1").firestore(), ...fbPath("stu1", "f1"))));
    await assertSucceeds(getDocs(collection(asStudent(env, "stu1").firestore(), ...fbCol("stu1"))));
    await assertSucceeds(getDocs(collection(asTeacher(env, "teacherA").firestore(), ...fbCol("stu1"))));
    await assertFails(getDoc(doc(asStudent(env, "stu2").firestore(), ...fbPath("stu1", "f1"))));
    await assertFails(getDocs(collection(asTeacher(env, "teacherB").firestore(), ...fbCol("stu1"))));
  });

  it("만들기 — 담당 교사만, 모양 · rev 1 · seenRev 0 · 제 uid", async () => {
    const t = asTeacher(env, "teacherA").firestore();
    await assertSucceeds(setDoc(doc(t, ...fbPath("stu1", "f2")), note({ byUid: "teacherA" })));
    await assertFails(setDoc(doc(t, ...fbPath("stu1", "f3")), note({ rev: 2 })));
    await assertFails(setDoc(doc(t, ...fbPath("stu1", "f3")), note({ studentUid: "stu2" })));
    await assertFails(setDoc(doc(t, ...fbPath("stu1", "f3")), note({ end: 0 })));
    await assertFails(setDoc(doc(t, ...fbPath("stu1", "f3")), note({ text: "" })));
    await assertFails(setDoc(doc(t, ...fbPath("stu1", "f3")), note({ text: "가".repeat(501) })));
    await assertFails(setDoc(doc(t, ...fbPath("stu1", "f3")), note({ extra: 1 })));
    await assertFails(setDoc(doc(t, ...fbPath("stu1", "f3")), note({ byUid: "someoneElse" })));
    await assertFails(setDoc(doc(asTeacher(env, "teacherB").firestore(), ...fbPath("stu1", "f3")), note({ byUid: "teacherB" })));
    await assertFails(setDoc(doc(asStudent(env, "stu1").firestore(), ...fbPath("stu1", "f3")), note({ byUid: "stu1" })));
  });

  it("고치기 — 교사는 글과 rev+1만, seenRev는 못 건드림", async () => {
    const t = asTeacher(env, "teacherA").firestore();
    await assertSucceeds(updateDoc(doc(t, ...fbPath("stu1", "f1")), { text: "고쳤어요", rev: 2, byUid: "teacherA", updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(t, ...fbPath("stu1", "f1")), { text: "또", rev: 2, byUid: "teacherA" }));
    await assertFails(updateDoc(doc(t, ...fbPath("stu1", "f1")), { text: "또", rev: 3, seenRev: 3, byUid: "teacherA" }));
    await assertFails(updateDoc(doc(t, ...fbPath("stu1", "f1")), { start: 1, rev: 3, byUid: "teacherA" }));
  });

  it("학생 — '봤다'(seenRev = rev) 한 칸만, 잠긴 활동에서도", async () => {
    const s1 = asStudent(env, "stu1").firestore();
    await assertSucceeds(updateDoc(doc(s1, ...fbPath("stu1", "f1")), { seenRev: 1 }));
    await assertFails(updateDoc(doc(s1, ...fbPath("stu1", "f1")), { seenRev: 5 }));
    await assertFails(updateDoc(doc(s1, ...fbPath("stu1", "f1")), { text: "내가 고침" }));
    await assertFails(updateDoc(doc(asStudent(env, "stu2").firestore(), ...fbPath("stu1", "f1")), { seenRev: 1 }));
    await assertFails(deleteDoc(doc(s1, ...fbPath("stu1", "f1"))));
  });

  it("지우기 — 담당 교사만", async () => {
    await assertFails(deleteDoc(doc(asTeacher(env, "teacherB").firestore(), ...fbPath("stu1", "f1"))));
    await assertSucceeds(deleteDoc(doc(asTeacher(env, "teacherA").firestore(), ...fbPath("stu1", "f1"))));
  });

  it("알림 벨 — collectionGroup(studentUid == 나)는 통과, 남의 uid로는 거부", async () => {
    const s1 = asStudent(env, "stu1").firestore();
    await assertSucceeds(getDocs(query(collectionGroup(s1, "raftFeedback"), where("studentUid", "==", "stu1"))));
    await assertFails(getDocs(query(collectionGroup(s1, "raftFeedback"), where("studentUid", "==", "stu2"))));
  });
});
