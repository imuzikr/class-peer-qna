// =============================================================
// 과일 바구니 — 학생이 제 과일을 내놓는 쓰기
// -------------------------------------------------------------
// 과일(rewards.count)이 줄어든 만큼 같은 묶음에서 바구니(donated)가
// 늘어야 통과합니다. 기부 취소는 거꾸로 — 응모 전에만, 바구니가 줄어든
// 만큼 과일이 늘어야 합니다. 한쪽만 바꾸거나, 개수가 안 맞거나, 남의 것을 건드리면
// 거부됩니다. 앱은 트랜잭션으로 두 쓰기를 묶습니다(lib/data/rewards.js의
// donateFruits) — 여기서는 같은 효과인 writeBatch로 시험합니다.
// =============================================================
import { describe, it, before, after, beforeEach } from "node:test";
import { assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, getDocs, collection, deleteDoc, writeBatch, updateDoc, serverTimestamp, runTransaction } from "firebase/firestore";
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

  it("응모 — 과일을 1개 이상 내놓아야 되고, 접수 전에는 취소할 수 있음", async () => {
    const db = asStudent(env, "s1").firestore();
    await assertFails(setDoc(basket(db, "s1"), entry("s1", 0, true)));
    await assertSucceeds(donate(db, "s1", { from: 10, to: 9, after: 1 }));
    await assertSucceeds(updateDoc(basket(db, "s1"), { entered: true }));
    await assertSucceeds(updateDoc(basket(db, "s1"), { entered: false }));
  });

  it("응모와 응모 안 함을 함께 참으로는 거부", async () => {
    const db = asStudent(env, "s1").firestore();
    await assertSucceeds(donate(db, "s1", { from: 10, to: 8, after: 2 }));
    await assertFails(updateDoc(basket(db, "s1"), { entered: true, declined: true }));
  });

  it("응모하지 않기 — 내놓은 과일을 모두 되돌려 받으며 응모 안 함으로", async () => {
    const db = asStudent(env, "s1").firestore();
    await assertSucceeds(donate(db, "s1", { from: 10, to: 6, after: 4 }));
    const b = writeBatch(db);
    b.update(reward(db, "s1"), { count: 10 });
    b.update(basket(db, "s1"), { donated: 0, declined: true });
    await assertSucceeds(b.commit());
    // 과일이 없어도 '응모 안 함'만 적는 것은 됨
    const db2 = asStudent(env, "s2").firestore();
    await assertSucceeds(setDoc(basket(db2, "s2"), { ...entry("s2", 0), declined: true }));
  });

  it("학생은 접수 칸을 못 씀", async () => {
    const db = asStudent(env, "s1").firestore();
    await assertFails(setDoc(basket(db, "s1"), { ...entry("s1", 0), declined: true, receivedBy: "s1" }));
    await assertSucceeds(setDoc(basket(db, "s1"), { ...entry("s1", 0), declined: true }));
    await assertFails(updateDoc(basket(db, "s1"), { receivedBy: "s1" }));
  });

  it("교사 접수 — 고른 학생 문서만, 담당 교사만, 그 뒤로 선택·과일 모두 굳음", async () => {
    await seed(env, async (db) => {
      await setDoc(basket(db, "s1"), { ...entry("s1", 3, true) });
      await setDoc(basket(db, "s2"), { ...entry("s2", 2) });
    });
    const t = asTeacher(env, "teacherA").firestore();
    const stamp = () => ({ receivedAt: serverTimestamp(), receivedBy: "teacherA" });
    await assertFails(updateDoc(basket(t, "s2"), stamp()));           // 아무것도 안 고름(아직)
    await assertFails(updateDoc(basket(t, "s1"), { receivedAt: serverTimestamp(), receivedBy: "someone" }));
    await assertFails(updateDoc(basket(asTeacher(env, "teacherB").firestore(), "s1"),
      { receivedAt: serverTimestamp(), receivedBy: "teacherB" }));    // 남의 반 교사
    await assertSucceeds(updateDoc(basket(t, "s1"), stamp()));
    const s1 = asStudent(env, "s1").firestore();
    await assertFails(updateDoc(basket(s1, "s1"), { entered: false }));           // 접수 뒤 취소 불가
    await assertFails(updateDoc(basket(s1, "s1"), { receivedBy: null }));         // 접수 지우기 불가
    // 접수 뒤에는 과일도 최종 제출 — 더 내놓기 · 거두기 모두 거부
    const more = writeBatch(s1);
    more.update(reward(s1, "s1"), { count: 9 });
    more.update(basket(s1, "s1"), { donated: 4 });
    await assertFails(more.commit());
    const back = writeBatch(s1);
    back.update(reward(s1, "s1"), { count: 11 });
    back.update(basket(s1, "s1"), { donated: 2 });
    await assertFails(back.commit());
    // 응모하지 않기를 고른 학생도 접수 대상
    await seed(env, (db) => setDoc(basket(db, "s2"), { ...entry("s2", 0), declined: true }));
    await assertSucceeds(updateDoc(basket(t, "s2"), stamp()));
  });

  it("기부 취소 — 응모 전에는 줄어든 만큼 과일이 돌아오면 통과", async () => {
    const db = asStudent(env, "s1").firestore();
    await assertSucceeds(donate(db, "s1", { from: 10, to: 4, after: 6 }));
    await assertSucceeds(donate(db, "s1", { from: 4, to: 6, before: 6, after: 4 }));
    await assertSucceeds(donate(db, "s1", { from: 6, to: 10, before: 4, after: 0 }));
  });

  it("기부 취소 — 바구니만 줄이기 · 과일만 늘리기 · 개수 불일치는 거부", async () => {
    const db = asStudent(env, "s1").firestore();
    await assertSucceeds(donate(db, "s1", { from: 10, to: 4, after: 6 }));
    await assertFails(setDoc(basket(db, "s1"), entry("s1", 1)));
    await assertFails(donate(db, "s1", { from: 4, to: 9, after: undefined }));
    await assertFails(donate(db, "s1", { from: 4, to: 9, before: 6, after: 3 }));
  });

  it("기부 취소 — 응모한 뒤에는 거부, 응모와 함께 줄이기도 거부", async () => {
    const db = asStudent(env, "s1").firestore();
    await assertSucceeds(donate(db, "s1", { from: 10, to: 4, after: 6 }));
    await assertSucceeds(setDoc(basket(db, "s1"), entry("s1", 6, true)));
    const b = writeBatch(db);
    b.update(reward(db, "s1"), { count: 6 });
    b.set(basket(db, "s1"), entry("s1", 4, true));
    await assertFails(b.commit());
  });

  it("기부 취소 — 돌려받아 과일 천장(100)을 넘으면 거부", async () => {
    await seed(env, async (db) => {
      await setDoc(reward(db, "s1"), { classId: C, uid: "s1", count: 98 });
      await setDoc(basket(db, "s1"), entry("s1", 5));
    });
    const db = asStudent(env, "s1").firestore();
    await assertFails(donate(db, "s1", { from: 98, to: 101, before: 5, after: 2 }));
    await assertSucceeds(donate(db, "s1", { from: 98, to: 100, before: 5, after: 3 }));
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

  // 이벤트 취소(lib/data/rewards.js의 cancelFruitEvent) — 앱과 같은 트랜잭션:
  // 학생마다 담은 만큼 과일을 돌려주고(merge) 바구니 문서를 지웁니다.
  function cancelAll(db, rows) {
    return runTransaction(db, async (tx) => {
      const got = [];
      for (const u of rows) got.push([u, await tx.get(basket(db, u)), await tx.get(reward(db, u))]);
      for (const [u, b, r] of got) {
        const back = Math.min(b.data().donated, 100 - r.data().count);
        if (back > 0) tx.set(reward(db, u), { classId: C, uid: u, count: r.data().count + back, updatedAt: serverTimestamp() }, { merge: true });
        tx.delete(basket(db, u));
      }
    });
  }

  it("이벤트 취소 — 담당 교사는 과일을 돌려주고 바구니를 비움(접수한 학생도)", async () => {
    await seed(env, async (db) => {
      await setDoc(basket(db, "s1"), { ...entry("s1", 4, true), receivedBy: "teacherA" });
      await setDoc(basket(db, "s2"), { ...entry("s2", 0), declined: true });
    });
    await assertSucceeds(cancelAll(asTeacher(env, "teacherA").firestore(), ["s1", "s2"]));
  });

  it("이벤트 취소 — 다른 반 교사 · 학생은 거부", async () => {
    await seed(env, async (db) => {
      await setDoc(doc(db, "classes", "classZ"), { name: "Z", createdBy: "teacherZ", archived: false });
      await setDoc(basket(db, "s1"), entry("s1", 4, true));
    });
    await assertFails(cancelAll(asTeacher(env, "teacherZ").firestore(), ["s1"]));
    await assertFails(cancelAll(asStudent(env, "s2").firestore(), ["s1"]));
  });
});
