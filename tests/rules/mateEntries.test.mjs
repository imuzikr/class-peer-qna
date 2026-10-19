// =============================================================
// 모둠 RAFT — 같은 모둠 친구의 글 읽기 (bookActivities/{aId}/entries/{uid})
//
// 기록이 적어 둔 모둠(groupId)에 읽는 나와 글쓴이가 둘 다 있어야 읽힙니다.
// 다른 모둠 · 모둠 표시 없는 글 · 남의 모둠 id를 적은 글 · 개인 활동 ·
// RAFT가 아닌 활동 · 물러난 모둠은 거부합니다.
// =============================================================
import { describe, it, before, after, beforeEach } from "node:test";
import { assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { makeEnv, asStudent, seed } from "./helpers.mjs";

const entry = (uid, extra = {}) => ({ activityId: "act1", authorId: uid, authorName: uid, answers: { writing: "글" }, ...extra });

describe("모둠 RAFT — 친구 글 읽기", () => {
  let env;
  before(async () => { env = await makeEnv("demo-rules-mate-entries"); });
  after(async () => { await env.cleanup(); });

  beforeEach(async () => {
    await env.clearFirestore();
    await seed(env, async (db) => {
      await setDoc(doc(db, "classes", "cA"), { createdBy: "teacherA", archived: false });
      for (const uid of ["stu1", "stu2", "stu3"]) {
        await setDoc(doc(db, "memberships", `${uid}_cA`), { uid, classId: "cA" });
      }
      for (const [id, extra] of [
        ["act1", { type: "raft", grouped: true }],
        ["solo", { type: "raft", grouped: false }],
        ["para", { type: "paratext", grouped: true }],
      ]) {
        await setDoc(doc(db, "bookActivities", id), { classId: "cA", title: id, locked: false, ...extra });
        await setDoc(doc(db, "bookActivities", id, "groups", "group_1"), { memberUids: ["stu1", "stu2"] });
        await setDoc(doc(db, "bookActivities", id, "groups", "group_2"), { memberUids: ["stu3"] });
        await setDoc(doc(db, "bookActivities", id, "groups", "group_9"), { memberUids: ["stu1", "stu2"], retired: true });
        await setDoc(doc(db, "bookActivities", id, "entries", "stu2"), entry("stu2", { groupId: "group_1" }));
        await setDoc(doc(db, "bookActivities", id, "entries", "stu3"), entry("stu3", { groupId: "group_1" })); // 남의 모둠 id
      }
      await setDoc(doc(db, "bookActivities", "act1", "entries", "old"), entry("old")); // 모둠 표시 없음
      await setDoc(doc(db, "bookActivities", "act1", "entries", "ret"), entry("ret", { groupId: "group_9" }));
    });
  });

  it("같은 모둠 친구의 글은 읽힘", async () => {
    await assertSucceeds(getDoc(doc(asStudent(env, "stu1").firestore(), "bookActivities", "act1", "entries", "stu2")));
  });

  it("다른 모둠 · 남의 모둠 id · 모둠 표시 없음 · 물러난 모둠은 거부", async () => {
    const s1 = asStudent(env, "stu1").firestore();
    await assertFails(getDoc(doc(asStudent(env, "stu3").firestore(), "bookActivities", "act1", "entries", "stu2")));
    await assertFails(getDoc(doc(s1, "bookActivities", "act1", "entries", "stu3")));
    await assertFails(getDoc(doc(s1, "bookActivities", "act1", "entries", "old")));
    await assertFails(getDoc(doc(s1, "bookActivities", "act1", "entries", "ret")));
  });

  it("개인 활동 · RAFT가 아닌 활동은 거부, 없는 글도 거부", async () => {
    const s1 = asStudent(env, "stu1").firestore();
    await assertFails(getDoc(doc(s1, "bookActivities", "solo", "entries", "stu2")));
    await assertFails(getDoc(doc(s1, "bookActivities", "para", "entries", "stu2")));
    await assertFails(getDoc(doc(s1, "bookActivities", "act1", "entries", "nobody")));
  });

  it("학생은 제 글에 모둠을 적을 수 있음", async () => {
    const s2 = asStudent(env, "stu2").firestore();
    await assertSucceeds(setDoc(doc(s2, "bookActivities", "act1", "entries", "stu2"), { groupId: "group_1" }, { merge: true }));
  });
});
