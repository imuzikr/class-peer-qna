// =============================================================
// 손들기 이력 — classes/{cId}/signalEvents/{auto}
// -------------------------------------------------------------
// questionSignals는 '지금 손든 사람'만 담고 손이 내려가면 문서가 지워져서,
// '누가 언제 손을 들었나'가 전혀 남지 않았습니다. 교사가 '확인'으로 받아 준
// 손만 여기에 한 건 적습니다('닫기'로 내린 손은 잘못 눌린 것이라 안 적습니다).
//
// 여기서 지키려는 것 — 과일 지급 이력(rewardEvents)과 같은 기준입니다:
//  · 남의 반 교사가 남의 반 이력을 만들거나 읽지 못할 것
//  · 학생은 스스로 이력을 만들 수 없을 것 (만들 수 있으면 손든 횟수를
//    자기가 부풀릴 수 있습니다 — 참여 분석의 근거가 무너집니다)
//  · 학생은 '자기 것만' 읽을 것
//  · byUid·at을 위조하지 못할 것
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

const evCol = (db, cId) => collection(db, "classes", cId, "signalEvents");

// 클라이언트(lib/store.js confirmQuestionSignal)가 실제로 보내는 형태
const payload = (cId, uid, byUid) => ({
  classId: cId,
  uid,
  name: "홍길동",
  studentId: "30101",
  raisedAt: null,
  byUid,
  at: serverTimestamp(),
});

describe("손들기 이력 규칙", () => {
  let env;

  before(async () => {
    env = await makeEnv("demo-rules-signal-events");
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
  it("담당 교사는 자기 반 학생의 손들기 이력을 남길 수 있다", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertSucceeds(addDoc(evCol(db, "cA"), payload("cA", "stu1", "teacherA")));
  });

  it("남의 반 교사는 남길 수 없다", async () => {
    const db = asTeacher(env, "teacherB").firestore();
    await assertFails(addDoc(evCol(db, "cA"), payload("cA", "stu1", "teacherB")));
  });

  // 학생이 직접 적을 수 있으면 손든 횟수를 스스로 부풀릴 수 있습니다.
  it("학생은 스스로 이력을 남길 수 없다", async () => {
    const db = asStudent(env, "stu1").firestore();
    await assertFails(addDoc(evCol(db, "cA"), payload("cA", "stu1", "stu1")));
  });

  it("보관된 반에는 남길 수 없다", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertFails(addDoc(evCol(db, "cOld"), payload("cOld", "stu1", "teacherA")));
  });

  it("byUid를 다른 사람으로 위조할 수 없다", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertFails(addDoc(evCol(db, "cA"), payload("cA", "stu1", "teacherB")));
  });

  // at을 임의 시각으로 넣으면 '최근 4주' 집계가 통째로 흔들립니다.
  it("at을 임의 시각으로 넣을 수 없다", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertFails(
      addDoc(evCol(db, "cA"), { ...payload("cA", "stu1", "teacherA"), at: new Date("2099-01-01") })
    );
  });

  it("classId가 경로와 다르면 거부된다", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertFails(addDoc(evCol(db, "cA"), payload("cB", "stu1", "teacherA")));
  });

  it("uid가 문자열이 아니면 거부된다", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertFails(
      addDoc(evCol(db, "cA"), { ...payload("cA", "stu1", "teacherA"), uid: 123 })
    );
  });

  // ── 읽기 ──
  it("학생은 자기 이력을 읽을 수 있다", async () => {
    let id;
    await seed(env, async (db) => {
      const ref = await addDoc(evCol(db, "cA"), {
        classId: "cA", uid: "stu1", byUid: "teacherA", at: new Date(),
      });
      id = ref.id;
    });
    const db = asStudent(env, "stu1").firestore();
    await assertSucceeds(getDoc(doc(db, "classes", "cA", "signalEvents", id)));
  });

  it("학생은 남의 이력을 읽을 수 없다", async () => {
    let id;
    await seed(env, async (db) => {
      const ref = await addDoc(evCol(db, "cA"), {
        classId: "cA", uid: "stu2", byUid: "teacherA", at: new Date(),
      });
      id = ref.id;
    });
    const db = asStudent(env, "stu1").firestore();
    await assertFails(getDoc(doc(db, "classes", "cA", "signalEvents", id)));
  });

  it("담당 교사는 읽을 수 있다", async () => {
    let id;
    await seed(env, async (db) => {
      const ref = await addDoc(evCol(db, "cA"), {
        classId: "cA", uid: "stu1", byUid: "teacherA", at: new Date(),
      });
      id = ref.id;
    });
    const db = asTeacher(env, "teacherA").firestore();
    await assertSucceeds(getDoc(doc(db, "classes", "cA", "signalEvents", id)));
  });

  it("남의 반 교사는 읽을 수 없다", async () => {
    let id;
    await seed(env, async (db) => {
      const ref = await addDoc(evCol(db, "cA"), {
        classId: "cA", uid: "stu1", byUid: "teacherA", at: new Date(),
      });
      id = ref.id;
    });
    const db = asTeacher(env, "teacherB").firestore();
    await assertFails(getDoc(doc(db, "classes", "cA", "signalEvents", id)));
  });

  it("최고 관리자는 읽을 수 있다", async () => {
    let id;
    await seed(env, async (db) => {
      const ref = await addDoc(evCol(db, "cA"), {
        classId: "cA", uid: "stu1", byUid: "teacherA", at: new Date(),
      });
      id = ref.id;
    });
    const db = asAdmin(env, "root").firestore();
    await assertSucceeds(getDoc(doc(db, "classes", "cA", "signalEvents", id)));
  });

  // ── 고치기·지우기 ── 고칠 수 있으면 이력이 아닙니다.
  it("교사도 이력을 고칠 수 없다", async () => {
    let id;
    await seed(env, async (db) => {
      const ref = await addDoc(evCol(db, "cA"), {
        classId: "cA", uid: "stu1", byUid: "teacherA", at: new Date(),
      });
      id = ref.id;
    });
    const db = asTeacher(env, "teacherA").firestore();
    await assertFails(updateDoc(doc(db, "classes", "cA", "signalEvents", id), { uid: "stu2" }));
  });

  it("교사도 이력을 지울 수 없다", async () => {
    let id;
    await seed(env, async (db) => {
      const ref = await addDoc(evCol(db, "cA"), {
        classId: "cA", uid: "stu1", byUid: "teacherA", at: new Date(),
      });
      id = ref.id;
    });
    const db = asTeacher(env, "teacherA").firestore();
    await assertFails(deleteDoc(doc(db, "classes", "cA", "signalEvents", id)));
  });
});
