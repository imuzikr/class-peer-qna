// =============================================================
// 손들기 답변 — classes/{cId}/signalReplies/{학생 uid}
// -------------------------------------------------------------
// 교사가 손든 학생에게 남기는 한 마디. 읽기는 그 학생과 담당 교사, 쓰기는
// 담당 교사, 학생은 읽음(seenAt) 한 칸만.
// =============================================================
import { describe, it, before, after, beforeEach } from "node:test";
import { assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, serverTimestamp } from "firebase/firestore";
import { makeEnv, asStudent, asTeacher, seed } from "./helpers.mjs";

const ref = (db, uid, c = "cA") => doc(db, "classes", c, "signalReplies", uid);
const reply = (uid, byUid, extra = {}) => ({
  classId: "cA", uid, text: "쉬는 시간에 같이 봐요", tag: "ask", note: "3번이 어려워요",
  raisedAt: null, byUid, at: serverTimestamp(), seenAt: null, ...extra,
});

describe("손들기 답변 규칙", () => {
  let env;
  before(async () => { env = await makeEnv("demo-rules-signal-replies"); });
  after(async () => { await env.cleanup(); });
  beforeEach(async () => {
    await env.clearFirestore();
    await seed(env, async (db) => {
      await setDoc(doc(db, "classes", "cA"), { createdBy: "teacherA", archived: false });
      await setDoc(doc(db, "classes", "cArch"), { createdBy: "teacherA", archived: true });
      await setDoc(doc(db, "memberships", "stu1_cA"), { uid: "stu1", classId: "cA" });
      await setDoc(doc(db, "memberships", "stu2_cA"), { uid: "stu2", classId: "cA" });
    });
  });

  it("담당 교사는 답하고 고쳐 쓸 수 있다", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertSucceeds(setDoc(ref(db, "stu1"), reply("stu1", "teacherA")));
    await assertSucceeds(setDoc(ref(db, "stu1"), reply("stu1", "teacherA", { text: "고친 답" })));
    await assertSucceeds(getDocs(collection(db, "classes", "cA", "signalReplies")));
  });

  it("남의 반 교사 · 학생 · 모양이 틀린 답은 거부", async () => {
    await assertFails(setDoc(ref(asTeacher(env, "teacherB").firestore(), "stu1"), reply("stu1", "teacherB")));
    await assertFails(setDoc(ref(asStudent(env, "stu1").firestore(), "stu1"), reply("stu1", "stu1")));
    const t = asTeacher(env, "teacherA").firestore();
    await assertFails(setDoc(ref(t, "stu1"), reply("stu1", "teacherA", { text: "" })));
    await assertFails(setDoc(ref(t, "stu1"), reply("stu1", "teacherA", { text: "가".repeat(1001) })));
    await assertFails(setDoc(ref(t, "stu1"), reply("stu1", "someoneElse")));
    await assertFails(setDoc(ref(t, "stu1"), reply("stu2", "teacherA")));
    await assertFails(setDoc(ref(t, "stu1"), reply("stu1", "teacherA", { extra: 1 })));
    await assertFails(setDoc(ref(t, "stu1"), reply("stu1", "teacherA", { seenAt: serverTimestamp() })));
  });

  it("보관된 반에는 못 씀", async () => {
    const t = asTeacher(env, "teacherA").firestore();
    await assertFails(setDoc(ref(t, "stu1", "cArch"), { ...reply("stu1", "teacherA"), classId: "cArch" }));
  });

  it("학생은 제 답만 읽고, 읽음 한 칸만 적는다", async () => {
    await setDoc(ref(asTeacher(env, "teacherA").firestore(), "stu1"), reply("stu1", "teacherA"));
    const s1 = asStudent(env, "stu1").firestore();
    await assertSucceeds(getDoc(ref(s1, "stu1")));
    await assertFails(getDoc(ref(asStudent(env, "stu2").firestore(), "stu1")));
    await assertFails(getDocs(collection(s1, "classes", "cA", "signalReplies")));
    await assertSucceeds(updateDoc(ref(s1, "stu1"), { seenAt: serverTimestamp() }));
    await assertFails(updateDoc(ref(s1, "stu1"), { text: "제가 고침" }));
    await assertFails(updateDoc(ref(asStudent(env, "stu2").firestore(), "stu1"), { seenAt: serverTimestamp() }));
    await assertFails(deleteDoc(ref(s1, "stu1")));
  });

  it("아직 답이 없을 때도 학생은 제 자리를 읽을 수 있다(구독이 거부되지 않게)", async () => {
    await assertSucceeds(getDoc(ref(asStudent(env, "stu1").firestore(), "stu1")));
  });
});
