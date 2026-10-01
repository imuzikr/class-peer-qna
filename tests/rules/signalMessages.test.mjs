// =============================================================
// 손들기 대화 — classes/{cId}/signalMessages/{자동 id}
// -------------------------------------------------------------
// 손든 학생과 교사가 주고받는 말. 읽기는 그 학생과 담당 교사, 쓰기는 학생(제
// 대화 · 손이 올라가 있을 때)과 담당 교사, 고치기 없음, 지우기는 둘 다.
// 학생의 '읽음'은 제 손들기 문서의 seenAt.
// =============================================================
import { describe, it, before, after, beforeEach } from "node:test";
import { assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import {
  doc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, collection, query, where,
  serverTimestamp, onSnapshot, writeBatch,
} from "firebase/firestore";
import { makeEnv, asStudent, asTeacher, seed } from "./helpers.mjs";

const col = (db, c = "cA") => collection(db, "classes", c, "signalMessages");
const msg = (uid, from, byUid, extra = {}) => ({
  classId: "cA", uid, from, text: "3번이 어려워요", byUid, at: serverTimestamp(), ...extra,
});
const raise = (db, uid) => setDoc(doc(db, "classes", "cA", "questionSignals", uid), {
  classId: "cA", uid, name: "학생", tag: "ask", note: "질문",
  createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
});

describe("손들기 대화 규칙", () => {
  let env;
  before(async () => { env = await makeEnv("demo-rules-signal-messages"); });
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

  it("학생은 손이 올라가 있을 때만 제 대화에 쓴다", async () => {
    const s1 = asStudent(env, "stu1").firestore();
    await assertFails(addDoc(col(s1), msg("stu1", "student", "stu1")));
    await assertSucceeds(raise(s1, "stu1"));
    await assertSucceeds(addDoc(col(s1), msg("stu1", "student", "stu1")));
    // 남의 대화 · 교사인 척 · 모양이 틀린 말
    await assertFails(addDoc(col(s1), msg("stu2", "student", "stu1")));
    await assertFails(addDoc(col(s1), msg("stu1", "teacher", "stu1")));
    await assertFails(addDoc(col(s1), msg("stu1", "student", "stu1", { text: "" })));
    await assertFails(addDoc(col(s1), msg("stu1", "student", "stu1", { text: "가".repeat(1001) })));
    await assertFails(addDoc(col(s1), msg("stu1", "student", "stu1", { extra: 1 })));
    await assertFails(addDoc(col(s1), msg("stu1", "student", "stu2")));
  });

  it("담당 교사는 답하고, 남의 반 교사 · 보관된 반은 거부", async () => {
    const t = asTeacher(env, "teacherA").firestore();
    await assertSucceeds(addDoc(col(t), msg("stu1", "teacher", "teacherA")));
    await assertSucceeds(getDocs(col(t)));
    await assertFails(addDoc(col(asTeacher(env, "teacherB").firestore()), msg("stu1", "teacher", "teacherB")));
    await assertFails(addDoc(col(t, "cArch"), { ...msg("stu1", "teacher", "teacherA"), classId: "cArch" }));
  });

  it("학생은 제 대화만 읽고(where uid == 나), 고치지 못하고, 지울 수 있다", async () => {
    const t = asTeacher(env, "teacherA").firestore();
    const ref = await addDoc(col(t), msg("stu1", "teacher", "teacherA"));
    await addDoc(col(t), msg("stu2", "teacher", "teacherA"));
    const s1 = asStudent(env, "stu1").firestore();
    await assertSucceeds(getDocs(query(col(s1), where("uid", "==", "stu1"))));
    await assertFails(getDocs(col(s1)));
    await assertFails(getDocs(query(col(asStudent(env, "stu2").firestore()), where("uid", "==", "stu1"))));
    const mine = doc(s1, "classes", "cA", "signalMessages", ref.id);
    await assertFails(updateDoc(mine, { text: "고침" }));
    await assertFails(deleteDoc(doc(asStudent(env, "stu2").firestore(), "classes", "cA", "signalMessages", ref.id)));
    // 앱과 같이 — 제 대화를 질의해 한 묶음으로 지움
    const snap = await getDocs(query(col(s1), where("uid", "==", "stu1")));
    const b = writeBatch(s1);
    snap.docs.forEach((d) => b.delete(d.ref));
    await assertSucceeds(b.commit());
  });

  it("교사는 대화를 지운다(닫기)", async () => {
    const t = asTeacher(env, "teacherA").firestore();
    const ref = await addDoc(col(t), msg("stu1", "teacher", "teacherA"));
    await assertSucceeds(deleteDoc(ref));
  });

  it("학생은 제 손들기 문서에 읽음(seenAt)을 적는다", async () => {
    const s1 = asStudent(env, "stu1").firestore();
    await raise(s1, "stu1");
    await assertSucceeds(updateDoc(doc(s1, "classes", "cA", "questionSignals", "stu1"), {
      seenAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }));
  });

  it("미리 걸어 둔 학생 구독에 교사의 말이 도착한다", async () => {
    const s1 = asStudent(env, "stu1").firestore();
    const got = [];
    let fail = null;
    const off = onSnapshot(query(col(s1), where("uid", "==", "stu1")),
      (snap) => got.push(snap.docs.map((d) => d.data().text)), (e) => { fail = e; });
    await new Promise((r) => setTimeout(r, 400));
    await addDoc(col(asTeacher(env, "teacherA").firestore()), msg("stu1", "teacher", "teacherA", { text: "같이 봐요" }));
    for (let i = 0; i < 40 && !got.some((l) => l.includes("같이 봐요")); i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    off();
    if (fail) throw fail;
    if (!got.some((l) => l.includes("같이 봐요"))) throw new Error(`안 옴: ${JSON.stringify(got)}`);
  });
});
