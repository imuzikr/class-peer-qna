// =============================================================
// 브레인 라이팅 — groups/{gId}/bwNotes/{주인}_{쓴사람}
//
// 못 박아 두는 것:
//   ① 그 모둠과 담당 교사만 읽는다
//   ② 모둠원이 제 줄만 쓴다(id = 주인_나, writerUid = 나) · 주인도 이 모둠원
//   ③ 잠긴 활동 · 낯선 칸 · 1000자 넘는 글은 거부
//   ④ 지우기는 담당 교사만
// =============================================================
import { describe, it, before, after, beforeEach } from "node:test";
import { assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { makeEnv, asStudent, asTeacher, seed } from "./helpers.mjs";

const notePath = (gId, id) => ["bookActivities", "act1", "groups", gId, "bwNotes", id];
const body = (owner, writer, text = "생각") => ({
  ownerUid: owner, writerUid: writer, writerName: "학생", text, updatedAt: serverTimestamp(),
});

describe("브레인 라이팅 규칙", () => {
  let env;
  before(async () => { env = await makeEnv("demo-rules-bw"); });
  after(async () => { await env.cleanup(); });

  beforeEach(async () => {
    await env.clearFirestore();
    await seed(env, async (db) => {
      await setDoc(doc(db, "classes", "cA"), { createdBy: "teacherA", archived: false });
      for (const uid of ["stu1", "stu2", "stu3"]) {
        await setDoc(doc(db, "memberships", `${uid}_cA`), { uid, classId: "cA" });
      }
      await setDoc(doc(db, "bookActivities", "act1"), {
        classId: "cA", type: "brainwrite", title: "브레인", locked: false, grouped: true, groupMode: "base",
      });
      await setDoc(doc(db, "bookActivities", "act1", "groups", "group_1"), { memberUids: ["stu1", "stu2"], members: [] });
      await setDoc(doc(db, "bookActivities", "act1", "groups", "group_2"), { memberUids: ["stu3"], members: [] });
      await setDoc(doc(db, ...notePath("group_1", "stu1_stu1")), { ownerUid: "stu1", writerUid: "stu1", writerName: "학생1", text: "질문" });
    });
  });

  it("읽기 — 그 모둠과 교사만", async () => {
    await assertSucceeds(getDocs(collection(asStudent(env, "stu2").firestore(), ...notePath("group_1", "x").slice(0, 5))));
    await assertSucceeds(getDocs(collection(asTeacher(env, "teacherA").firestore(), ...notePath("group_1", "x").slice(0, 5))));
    await assertFails(getDoc(doc(asStudent(env, "stu3").firestore(), ...notePath("group_1", "stu1_stu1"))));
  });

  it("쓰기 — 모둠원이 친구 칸에 제 줄을 쓴다(만들고 고치기)", async () => {
    const s = asStudent(env, "stu2").firestore();
    await assertSucceeds(setDoc(doc(s, ...notePath("group_1", "stu1_stu2")), body("stu1", "stu2")));
    await assertSucceeds(setDoc(doc(s, ...notePath("group_1", "stu1_stu2")), body("stu1", "stu2", "고친 생각")));
    await assertSucceeds(setDoc(doc(s, ...notePath("group_1", "stu2_stu2")), body("stu2", "stu2")));
  });

  it("남의 줄 · 다른 모둠 · 모둠 밖 주인은 거부", async () => {
    const s = asStudent(env, "stu2").firestore();
    await assertFails(updateDoc(doc(s, ...notePath("group_1", "stu1_stu1")), { text: "덮어쓰기" }));
    await assertFails(setDoc(doc(s, ...notePath("group_1", "stu1_stu1")), body("stu1", "stu1")));
    await assertFails(setDoc(doc(s, ...notePath("group_1", "stu3_stu2")), body("stu3", "stu2")));
    await assertFails(setDoc(doc(asStudent(env, "stu3").firestore(), ...notePath("group_1", "stu1_stu3")), body("stu1", "stu3")));
  });

  it("낯선 칸 · 긴 글 · 잠긴 활동은 거부", async () => {
    const s = asStudent(env, "stu2").firestore();
    await assertFails(setDoc(doc(s, ...notePath("group_1", "stu1_stu2")), { ...body("stu1", "stu2"), extra: 1 }));
    await assertFails(setDoc(doc(s, ...notePath("group_1", "stu1_stu2")), body("stu1", "stu2", "가".repeat(1001))));
    await seed(env, async (db) => { await updateDoc(doc(db, "bookActivities", "act1"), { locked: true }); });
    await assertFails(setDoc(doc(s, ...notePath("group_1", "stu1_stu2")), body("stu1", "stu2")));
  });

  it("지우기는 담당 교사만", async () => {
    await assertFails(deleteDoc(doc(asStudent(env, "stu1").firestore(), ...notePath("group_1", "stu1_stu1"))));
    await assertFails(deleteDoc(doc(asTeacher(env, "teacherB").firestore(), ...notePath("group_1", "stu1_stu1"))));
    await assertSucceeds(deleteDoc(doc(asTeacher(env, "teacherA").firestore(), ...notePath("group_1", "stu1_stu1"))));
  });
});
