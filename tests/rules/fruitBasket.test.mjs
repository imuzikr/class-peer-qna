// =============================================================
// 과일 바구니 — 학생이 제 과일을 내놓는 쓰기
// -------------------------------------------------------------
// 과일(rewards.count)이 줄어든 만큼 같은 묶음에서 바구니(donated)가
// 늘어야 통과합니다. 한쪽만 바꾸거나, 개수가 안 맞거나, 남의 것을 건드리면
// 거부됩니다. 앱은 트랜잭션으로 두 쓰기를 묶습니다(lib/data/rewards.js의
// donateFruits) — 여기서는 같은 효과인 writeBatch로 시험합니다.
// =============================================================
import { describe, it, before, after, beforeEach } from "node:test";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, getDocs, collection, deleteDoc, writeBatch } from "firebase/firestore";
import { makeEnv, seed, asStudent, asTeacher } from "./helpers.mjs";

const C = "classA";
const reward = (db, uid) => doc(db, "rewards", `${C}_${uid}`);
const basket = (db, uid, c = C) => doc(db, "classes", c, "fruitBasket", uid);
const entry = (uid, donated, entered = false) => ({ classId: C, uid, donated, entered });

function donate(db, uid, { from, to, before = 0, after }) {
  const b = writeBatch(db);
  if (from !== to) b.update(reward(db, uid), { count: to });
  if (after !== undefined) b.set(basket(db, uid), entry(uid, after));
  return b.commit();
}

describe("fruitBasket — 과일 내놓기", () => {
  let env;
  before(async () => { env = await makeEnv("demo-rules-fruit-basket"); });
  after(async () => { await env.cleanup(); });
  beforeEach(async () => {
    await env.clearFirestore();
    await seed(env, async (db) => {
      await setDoc(doc(db, "classes", C), { name: "A", createdBy: "teacherA", archived: false });
      await setDoc(doc(db, "classes", "classB"), { name: "B", createdBy: "teacherA", archived: false });
      for (const u of ["s1", "s2"]) {
        await setDoc(doc(db, "memberships", `${u}_${C}`), { uid: u, classId: C });
        await setDoc(reward(db, u), { classId: C, uid: u, count: 10 });
      }
      await setDoc(doc(db, "memberships", "s3_classB"), { uid: "s3", classId: "classB" });
    });
  });

  it("과일이 줄어든 만큼 바구니가 늘면 통과(처음·이어서)", async () => {
    const db = asStudent(env, "s1").firestore();
    await assertSucceeds(donate(db, "s1", { from: 10, to: 7, after: 3 }));
    await assertSucceeds(donate(db, "s1", { from: 7, to: 5, before: 3, after: 5 }));
  });

  it("바구니만 늘리기 · 과일만 줄이기 · 개수 불일치는 거부", async () => {
    const db = asStudent(env, "s1").firestore();
    await assertFails(setDoc(basket(db, "s1"), entry("s1", 3)));
    await assertFails(setDoc(reward(db, "s1"), { classId: C, uid: "s1", count: 7 }));
    await assertFails(donate(db, "s1", { from: 10, to: 8, after: 3 }));
  });

  it("가진 것보다 많이 · 과일 늘리기는 거부", async () => {
    const db = asStudent(env, "s1").firestore();
    await assertFails(donate(db, "s1", { from: 10, to: -1, after: 11 }));
    await assertFails(setDoc(reward(db, "s1"), { classId: C, uid: "s1", count: 20 }));
  });

  it("남의 과일·바구니는 못 건드림", async () => {
    const db = asStudent(env, "s1").firestore();
    const b = writeBatch(db);
    b.update(reward(db, "s2"), { count: 7 });
    b.set(basket(db, "s2"), entry("s2", 3));
    await assertFails(b.commit());
  });

  it("응모 — 과일 없이 참으로, 다시 거짓으로는 못 되돌림", async () => {
    const db = asStudent(env, "s1").firestore();
    await assertSucceeds(setDoc(basket(db, "s1"), entry("s1", 0, true)));
    await assertFails(setDoc(basket(db, "s1"), entry("s1", 0, false)));
  });

  it("바구니를 줄이는 쓰기는 거부", async () => {
    const db = asStudent(env, "s1").firestore();
    await assertSucceeds(donate(db, "s1", { from: 10, to: 7, after: 3 }));
    await assertFails(setDoc(basket(db, "s1"), entry("s1", 1)));
  });

  it("읽기 — 반 학생·담당 교사는 되고, 다른 반 학생은 안 됨", async () => {
    await seed(env, (db) => setDoc(basket(db, "s1"), entry("s1", 4)));
    await assertSucceeds(getDocs(collection(asStudent(env, "s2").firestore(), "classes", C, "fruitBasket")));
    await assertSucceeds(getDoc(basket(asTeacher(env, "teacherA").firestore(), "s1")));
    await assertFails(getDocs(collection(asStudent(env, "s3").firestore(), "classes", C, "fruitBasket")));
  });

  it("지우기 — 담당 교사만", async () => {
    await seed(env, (db) => setDoc(basket(db, "s1"), entry("s1", 4)));
    await assertFails(deleteDoc(basket(asStudent(env, "s1").firestore(), "s1")));
    await assertSucceeds(deleteDoc(basket(asTeacher(env, "teacherA").firestore(), "s1")));
  });
});
