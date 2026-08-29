// =============================================================
// 과일 지급 이력 — classes/{cId}/rewardEvents/{auto}
// -------------------------------------------------------------
// rewards는 누적 총계 하나뿐이라 '언제 몇 개 받았나'가 남지 않습니다.
// 참여의 변화를 보려면 시계열이 필요해 지급할 때마다 한 건 적습니다.
//
// 여기서 지키려는 것:
//  · 남의 반 교사가 남의 반 이력을 만들거나 읽지 못할 것
//  · 학생은 '자기 것만' 읽을 것 (남의 과일 이력은 못 봄)
//  · byUid·at을 위조하지 못할 것 — 위조되면 이력이 이력이 아닙니다
//  · 한 번 쓴 이력은 고치거나 지울 수 없을 것
// =============================================================
import { describe, it, before, after, beforeEach } from "node:test";
import { assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import {
  doc,
  addDoc,
  collection,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { makeEnv, asStudent, asTeacher, asAdmin, seed } from "./helpers.mjs";

const evCol = (db, cId) => collection(db, "classes", cId, "rewardEvents");

// 클라이언트(lib/store.js setStudentReward)가 실제로 보내는 형태
const payload = (cId, uid, byUid, { delta = 1, count = 1 } = {}) => ({
  classId: cId,
  uid,
  delta,
  count,
  byUid,
  at: serverTimestamp(),
});

describe("과일 지급 이력 규칙", () => {
  let env;

  before(async () => {
    env = await makeEnv("demo-rules-reward-events");
  });
  after(async () => {
    await env.cleanup();
  });

  beforeEach(async () => {
    await env.clearFirestore();
    await seed(env, async (db) => {
      await setDoc(doc(db, "classes", "cA"), {
        createdBy: "teacherA", archived: false, name: "A반",
      });
      await setDoc(doc(db, "classes", "cB"), {
        createdBy: "teacherB", archived: false, name: "B반",
      });
      await setDoc(doc(db, "classes", "cOld"), {
        createdBy: "teacherA", archived: true, name: "보관된 반",
      });
      await setDoc(doc(db, "memberships", "stu1_cA"), { uid: "stu1", classId: "cA" });
      await setDoc(doc(db, "memberships", "stu2_cA"), { uid: "stu2", classId: "cA" });
    });
  });

  // ── 쓰기 ──
  it("담당 교사는 자기 반 학생의 지급 이력을 남길 수 있다", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertSucceeds(addDoc(evCol(db, "cA"), payload("cA", "stu1", "teacherA")));
  });

  it("남의 반 교사는 남길 수 없다", async () => {
    const db = asTeacher(env, "teacherB").firestore();
    await assertFails(addDoc(evCol(db, "cA"), payload("cA", "stu1", "teacherB")));
  });

  it("학생은 스스로 이력을 남길 수 없다", async () => {
    const db = asStudent(env, "stu1").firestore();
    await assertFails(addDoc(evCol(db, "cA"), payload("cA", "stu1", "stu1")));
  });

  it("보관된 반에는 남길 수 없다", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertFails(addDoc(evCol(db, "cOld"), payload("cOld", "stu1", "teacherA")));
  });

  // byUid를 남의 것으로 적으면 '누가 줬나'가 거짓이 됩니다.
  it("byUid를 다른 사람으로 위조할 수 없다", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertFails(addDoc(evCol(db, "cA"), payload("cA", "stu1", "teacherB")));
  });

  // at을 임의 시각으로 넣으면 시계열이 무너집니다(미래로 넣으면 영영 최신).
  it("at을 임의 시각으로 넣을 수 없다", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertFails(
      addDoc(evCol(db, "cA"), {
        ...payload("cA", "stu1", "teacherA"),
        at: new Date("2099-01-01"),
      })
    );
  });

  it("classId가 경로와 다르면 거부된다", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertFails(addDoc(evCol(db, "cA"), payload("cB", "stu1", "teacherA")));
  });

  it("count가 상한(100)을 넘으면 거부된다", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertFails(
      addDoc(evCol(db, "cA"), payload("cA", "stu1", "teacherA", { count: 101 }))
    );
  });

  // 회수(마이너스)도 기록이라 delta는 음수를 허용합니다.
  it("과일을 도로 거두는 기록(delta 음수)도 남길 수 있다", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertSucceeds(
      addDoc(evCol(db, "cA"), payload("cA", "stu1", "teacherA", { delta: -1, count: 0 }))
    );
  });

  // ── 읽기 ──
  it("학생은 자기 이력을 읽을 수 있다", async () => {
    let id;
    await seed(env, async (db) => {
      const ref = await addDoc(evCol(db, "cA"), {
        classId: "cA", uid: "stu1", delta: 1, count: 1, byUid: "teacherA", at: new Date(),
      });
      id = ref.id;
    });
    const db = asStudent(env, "stu1").firestore();
    await assertSucceeds(getDoc(doc(db, "classes", "cA", "rewardEvents", id)));
  });

  it("학생은 남의 이력을 읽을 수 없다", async () => {
    let id;
    await seed(env, async (db) => {
      const ref = await addDoc(evCol(db, "cA"), {
        classId: "cA", uid: "stu2", delta: 1, count: 1, byUid: "teacherA", at: new Date(),
      });
      id = ref.id;
    });
    const db = asStudent(env, "stu1").firestore();
    await assertFails(getDoc(doc(db, "classes", "cA", "rewardEvents", id)));
  });

  it("남의 반 교사는 읽을 수 없다", async () => {
    let id;
    await seed(env, async (db) => {
      const ref = await addDoc(evCol(db, "cA"), {
        classId: "cA", uid: "stu1", delta: 1, count: 1, byUid: "teacherA", at: new Date(),
      });
      id = ref.id;
    });
    const db = asTeacher(env, "teacherB").firestore();
    await assertFails(getDoc(doc(db, "classes", "cA", "rewardEvents", id)));
  });

  it("최고 관리자는 읽을 수 있다", async () => {
    let id;
    await seed(env, async (db) => {
      const ref = await addDoc(evCol(db, "cA"), {
        classId: "cA", uid: "stu1", delta: 1, count: 1, byUid: "teacherA", at: new Date(),
      });
      id = ref.id;
    });
    const db = asAdmin(env, "root").firestore();
    await assertSucceeds(getDoc(doc(db, "classes", "cA", "rewardEvents", id)));
  });

  // ── 불변 ──
  // 고칠 수 있으면 이력이 아닙니다. 담당 교사도 예외가 아닙니다.
  it("이력은 담당 교사도 고칠 수 없다", async () => {
    let id;
    await seed(env, async (db) => {
      const ref = await addDoc(evCol(db, "cA"), {
        classId: "cA", uid: "stu1", delta: 1, count: 1, byUid: "teacherA", at: new Date(),
      });
      id = ref.id;
    });
    const db = asTeacher(env, "teacherA").firestore();
    await assertFails(
      updateDoc(doc(db, "classes", "cA", "rewardEvents", id), { delta: 99 })
    );
  });

  it("이력은 담당 교사도 지울 수 없다", async () => {
    let id;
    await seed(env, async (db) => {
      const ref = await addDoc(evCol(db, "cA"), {
        classId: "cA", uid: "stu1", delta: 1, count: 1, byUid: "teacherA", at: new Date(),
      });
      id = ref.id;
    });
    const db = asTeacher(env, "teacherA").firestore();
    await assertFails(deleteDoc(doc(db, "classes", "cA", "rewardEvents", id)));
  });
});
