// =============================================================
// 과일 바구니 — 앱과 **똑같은 트랜잭션**으로 내놓기·거두기
// -------------------------------------------------------------
// fruitBasket.test.mjs는 같은 효과를 writeBatch로 시험합니다. 여기는 앱
// (lib/data/rewards.js의 enterFruitEvent)이 실제로 보내는
// 모양 그대로 — 트랜잭션 안에서 두 문서를 읽고, updatedAt에 서버 시각,
// 바구니는 merge로 — 보냅니다. 실서비스에서 '권한 없음'이 신고됐을 때
// 규칙 쪽 원인인지 가르려고 둔 시험입니다(교사가 준 과일 문서 모양 그대로).
// =============================================================
import { describe, it, before, after, beforeEach } from "node:test";
import { assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, setDoc, runTransaction, serverTimestamp } from "firebase/firestore";
import { makeEnv, seed, asStudent } from "./helpers.mjs";

const C = "classA";

async function move(db, uid, n) {
  const rewardRef = doc(db, "rewards", `${C}_${uid}`);
  const basketRef = doc(db, "classes", C, "fruitBasket", uid);
  return runTransaction(db, async (tx) => {
    const r = await tx.get(rewardRef);
    const b = await tx.get(basketRef);
    const have = r.data().count;
    const before = b.exists() ? b.data().donated : 0;
    tx.update(rewardRef, { count: have - n, updatedAt: serverTimestamp() });
    tx.set(
      basketRef,
      { classId: C, uid, donated: before + n, entered: b.exists() ? b.data().entered === true : false, updatedAt: serverTimestamp() },
      { merge: true }
    );
  });
}

// 응모하기 — 이번에 담을 개수(add)만큼 더 담으며 응모(enterFruitEvent와 같은
// 모양). 지금 담긴 수에 더하고 같은 수만큼 제 과일에서 덜며, 0이면 과일 문서를
// 안 건드립니다. 이미 응모했으면(더 담기) 처음 응모한 시각을 그대로 둡니다.
async function enterWith(db, uid, add) {
  const rewardRef = doc(db, "rewards", `${C}_${uid}`);
  const basketRef = doc(db, "classes", C, "fruitBasket", uid);
  return runTransaction(db, async (tx) => {
    const r = await tx.get(rewardRef);
    const b = await tx.get(basketRef);
    const have = r.data().count;
    const donated = b.exists() ? b.data().donated : 0;
    const again = b.exists() && b.data().entered === true;
    if (add > 0) tx.update(rewardRef, { count: have - add, updatedAt: serverTimestamp() });
    tx.set(
      basketRef,
      { classId: C, uid, donated: donated + add, entered: true, declined: false,
        ...(again ? {} : { decidedAt: serverTimestamp() }), updatedAt: serverTimestamp() },
      { merge: true }
    );
  });
}

describe("fruitBasket — 앱과 같은 트랜잭션", () => {
  let env;
  before(async () => { env = await makeEnv("demo-rules-fruit-basket-tx"); });
  after(async () => { await env.cleanup(); });
  beforeEach(async () => {
    await env.clearFirestore();
    await seed(env, async (db) => {
      await setDoc(doc(db, "classes", C), { name: "A", createdBy: "teacherA", archived: false });
      await setDoc(doc(db, "memberships", `s1_${C}`), { uid: "s1", classId: C });
      // 교사의 addStudentReward가 남기는 모양 그대로(이름표 · 서버 시각)
      await setDoc(doc(db, "rewards", `${C}_s1`), {
        classId: C, uid: "s1", count: 2, name: "학생", emoji: "🙂", updatedAt: serverTimestamp(),
      });
    });
  });

  it("처음 내놓기(바구니 문서가 없을 때) · 이어서 내놓기 · 거두기", async () => {
    const db = asStudent(env, "s1").firestore();
    await assertSucceeds(move(db, "s1", 1));
    await assertSucceeds(move(db, "s1", 1));
    await assertSucceeds(move(db, "s1", -2));
  });

  it("이벤트 취소의 반납 표시(fruitReturn)가 남은 과일 문서에서도 응모하기 · 응모하지 않기", async () => {
    await seed(env, async (db) => {
      await setDoc(doc(db, "rewards", `${C}_s1`), {
        classId: C, uid: "s1", count: 6, fruitReturn: { id: "r1", n: 4 }, updatedAt: serverTimestamp(),
      });
    });
    const db = asStudent(env, "s1").firestore();
    await assertSucceeds(move(db, "s1", 2));
    await assertSucceeds(move(db, "s1", -2));
  });

  it("응모하기: 담으며 응모(바구니 문서가 없을 때)", async () => {
    const db = asStudent(env, "s1").firestore();
    await assertSucceeds(enterWith(db, "s1", 2));
  });

  it("응모하기: 담아 둔 것에 더 담으며 응모", async () => {
    const db = asStudent(env, "s1").firestore();
    await assertSucceeds(move(db, "s1", 1));
    await assertSucceeds(enterWith(db, "s1", 1));
  });

  it("응모하기: 이미 담아 둔 과일 그대로(0개 더) 과일 문서를 안 건드리고 응모", async () => {
    const db = asStudent(env, "s1").firestore();
    await assertSucceeds(move(db, "s1", 2));
    await assertSucceeds(enterWith(db, "s1", 0));
  });

  it("응모한 뒤 나머지 과일을 더 담아 다시 응모하기", async () => {
    const db = asStudent(env, "s1").firestore();
    await assertSucceeds(enterWith(db, "s1", 1));   // 과일 2 → 1개 담아 응모
    await assertSucceeds(enterWith(db, "s1", 1));   // 남은 1개를 더 담음
  });

  it("응모한 동안 바구니를 줄여 돌려받는 쓰기는 거부(응모하지 않기로 먼저 거둬야 함)", async () => {
    const db = asStudent(env, "s1").firestore();
    await assertSucceeds(enterWith(db, "s1", 2));
    await assertFails(move(db, "s1", -1));
  });

  it("응모하며 바구니를 줄이는 한 번의 쓰기는 거부", async () => {
    const db = asStudent(env, "s1").firestore();
    await assertSucceeds(move(db, "s1", 2));
    await assertFails(runTransaction(db, async (tx) => {
      const rewardRef = doc(db, "rewards", `${C}_s1`);
      const basketRef = doc(db, "classes", C, "fruitBasket", "s1");
      const r = await tx.get(rewardRef);
      await tx.get(basketRef);
      tx.update(rewardRef, { count: r.data().count + 1, updatedAt: serverTimestamp() });
      tx.set(basketRef, { classId: C, uid: "s1", donated: 1, entered: true, declined: false,
        decidedAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
    }));
  });
});
