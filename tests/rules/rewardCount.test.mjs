import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { setTimeout as delay } from "node:timers/promises";
import { assertFails } from "@firebase/rules-unit-testing";
import * as firestore from "firebase/firestore";
import { makeEnv, seed, asStudent, asAdmin } from "./helpers.mjs";

// Execute the production subscriber with an emulator client, without loading
// lib/firebase.js (which initializes the live project).
const source = readFileSync(new URL("../../lib/data/rewards.js", import.meta.url), "utf8");
const start = source.indexOf("export function subscribeMyClassRewardCount(");
const end = source.indexOf("\nexport ", start + 1);
assert.ok(start >= 0 && end > start, "production reward subscriber must exist");
function subscriber(db, sdk = firestore) {
  return runInNewContext(
    source.slice(start, end).replace(/^export /, "") + "\nsubscribeMyClassRewardCount;",
    { ...sdk, db, isFirebaseConfigured: true },
  );
}

function watch(db, classId, uid) {
  const counts = [];
  const stop = subscriber(db)(classId, uid, (n) => counts.push(n));
  return { counts, stop, async waitFor(expected) {
    const deadline = Date.now() + 5000;
    while (counts.length < expected.length && Date.now() < deadline) await delay(25);
    assert.deepEqual(counts, expected);
  } };
}

const reward = (db, classId, uid) => firestore.doc(db, "rewards", `${classId}_${uid}`);
const grant = (db, classId, uid, count) => firestore.setDoc(reward(db, classId, uid), { classId, uid, count });

describe("student reward count subscription", () => {
  let env;
  before(async () => { env = await makeEnv("demo-rules-reward-count"); });
  after(async () => { await env.cleanup(); });
  beforeEach(async () => {
    await env.clearFirestore();
    await seed(env, async (db) => {
      await firestore.setDoc(firestore.doc(db, "classes", "guestRoom"), { name: "GUEST ROOM", createdBy: "teacherA", archived: false });
      await firestore.setDoc(firestore.doc(db, "classes", "school"), { name: "School", createdBy: "teacherA", archived: false });
      await firestore.setDoc(firestore.doc(db, "memberships", "guest_guestRoom"), { uid: "guest", classId: "guestRoom" });
      await firestore.setDoc(firestore.doc(db, "memberships", "student_school"), { uid: "student", classId: "school" });
    });
  });

  for (const [classId, uid, email] of [["guestRoom", "guest", "guest@gmail.com"], ["school", "student", "student@hansung.hs.kr"]]) {
    it(`${classId}: observes the first and second reward without reconnecting`, async () => {
      const db = env.authenticatedContext(uid, { email, email_verified: true }).firestore();
      const teacher = asAdmin(env, "admin").firestore();
      const stream = watch(db, classId, uid);
      try {
        await stream.waitFor([0]);
        await grant(teacher, classId, uid, 1);
        await stream.waitFor([0, 1]);
        await grant(teacher, classId, uid, 2);
        await stream.waitFor([0, 1, 2]);
      } finally { stream.stop(); }
    });
  }

  it("starts with an existing total and ignores another student's and class's rewards", async () => {
    await seed(env, (db) => grant(db, "school", "student", 4));
    const db = asStudent(env, "student").firestore();
    const teacher = asAdmin(env, "admin").firestore();
    const stream = watch(db, "school", "student");
    try {
      await stream.waitFor([4]);
      await grant(teacher, "school", "other", 20);
      await grant(teacher, "guestRoom", "student", 30);
      await grant(teacher, "school", "student", 5);
      await stream.waitFor([4, 5]);
      await grant(teacher, "school", "student", 3);
      await stream.waitFor([4, 5, 3]);
    } finally { stream.stop(); }
  });

  it("does not allow students to read rewards outside their class or grant themselves fruit", async () => {
    const db = asStudent(env, "student").firestore();
    await assertFails(firestore.getDocs(firestore.query(firestore.collection(db, "rewards"), firestore.where("classId", "==", "guestRoom"), firestore.where("uid", "==", "student"))));
    await assertFails(grant(db, "school", "student", 1));
  });
});


describe("reward subscription snapshot baseline", () => {
  it("waits for a server-confirmed total instead of reporting an empty local cache", () => {
    const counts = [];
    let receive;
    const subscribe = subscriber({}, {
      collection: () => ({}),
      where: () => ({}),
      query: () => ({}),
      onSnapshot: (_query, options, next) => {
        assert.equal(options.includeMetadataChanges, true);
        receive = next;
        return () => {};
      },
    });
    const stop = subscribe("school", "student", (n) => counts.push(n));
    try {
      receive({ metadata: { fromCache: true }, docs: [] });
      assert.deepEqual(counts, []);
      receive({ metadata: { fromCache: false }, docs: [
        { id: "school_student", data: () => ({ count: 4 }) },
      ] });
      assert.deepEqual(counts, [4]);
    } finally { stop(); }
  });
});
