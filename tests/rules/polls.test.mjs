// =============================================================
// 투표 — classes/{cId}/polls/{pId} (+ votes/{uid})
// -------------------------------------------------------------
// 투표: 반 학생·담당 교사가 읽고, 담당 교사만 만들고 닫고 결과를 공유합니다.
// 표: 학생은 제 자리에 · 열린 투표에만. 읽기는 그 학생과 담당 교사 — 학생은
// 남의 표를 못 읽습니다. 앱(lib/data/polls.js)이 보내는 모양 그대로 시험합니다.
// =============================================================
import { describe, it, before, after, beforeEach } from "node:test";
import { assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import {
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, orderBy, limit,
  serverTimestamp, writeBatch,
} from "firebase/firestore";
import { makeEnv, asStudent, asTeacher, seed } from "./helpers.mjs";

const C = "cA";
const OPTS = [{ key: "o1", text: "사과" }, { key: "o2", text: "배" }, { key: "o3", text: "감" }];
const poll = (extra = {}) => ({
  classId: C, kind: "single", title: "좋아하는 과일은?", options: OPTS, byUid: "teacherA",
  open: true, shared: false, results: {}, voters: 0, createdAt: serverTimestamp(),
  closedAt: null, sharedAt: null, ...extra,
});
const vote = (uid, picks = ["o1"], extra = {}) => ({
  classId: C, pollId: "p1", uid, picks, at: serverTimestamp(), ...extra,
});
const pRef = (db, id = "p1", c = C) => doc(db, "classes", c, "polls", id);
const vRef = (db, uid, id = "p1", c = C) => doc(db, "classes", c, "polls", id, "votes", uid);

describe("투표 규칙", () => {
  let env;
  before(async () => { env = await makeEnv("demo-rules-polls"); });
  after(async () => { await env.cleanup(); });
  beforeEach(async () => {
    await env.clearFirestore();
    await seed(env, async (db) => {
      await setDoc(doc(db, "classes", C), { createdBy: "teacherA", archived: false });
      await setDoc(doc(db, "classes", "cArch"), { createdBy: "teacherA", archived: true });
      await setDoc(doc(db, "memberships", `stu1_${C}`), { uid: "stu1", classId: C });
      await setDoc(doc(db, "memberships", `stu2_${C}`), { uid: "stu2", classId: C });
      await setDoc(pRef(db), { ...poll(), createdAt: new Date() });
      await setDoc(pRef(db, "pm"), { ...poll({ kind: "multi" }), createdAt: new Date() });
    });
  });

  it("담당 교사가 엶(앞의 것을 닫는 한 묶음) — 모양이 틀리거나 남의 반 · 학생이면 거부", async () => {
    const t = asTeacher(env, "teacherA").firestore();
    const b = writeBatch(t);
    b.update(pRef(t), { open: false, closedAt: serverTimestamp() });
    b.set(pRef(t, "p2"), poll());
    await assertSucceeds(b.commit());
    await assertFails(setDoc(pRef(t, "p3"), poll({ title: "" })));
    await assertFails(setDoc(pRef(t, "p3"), poll({ kind: "rank" })));
    await assertFails(setDoc(pRef(t, "p3"), poll({ options: [OPTS[0]] })));
    await assertFails(setDoc(pRef(t, "p3"), poll({ options: Array.from({ length: 11 }, (_, i) => ({ key: `o${i}`, text: "x" })) })));
    await assertFails(setDoc(pRef(t, "p3"), poll({ shared: true })));
    await assertFails(setDoc(pRef(t, "p3"), poll({ extra: 1 })));
    await assertFails(setDoc(pRef(t, "p3", "cArch"), poll({ classId: "cArch" })));
    const other = asTeacher(env, "teacherB").firestore();
    await assertFails(setDoc(pRef(other, "p4"), poll({ byUid: "teacherB" })));
    const s1 = asStudent(env, "stu1").firestore();
    await assertFails(setDoc(pRef(s1, "p5"), poll({ byUid: "stu1" })));
  });

  it("교사 고치기는 닫기 · 결과 공유 · 센 수뿐 — 물음 · 항목은 못 바꾸고 다시 열 수도 없음", async () => {
    const t = asTeacher(env, "teacherA").firestore();
    await assertFails(updateDoc(pRef(t), { title: "바뀐 물음" }));
    await assertFails(updateDoc(pRef(t), { options: OPTS.slice(0, 2) }));
    await assertSucceeds(updateDoc(pRef(t), { shared: true, results: { o1: 2, o2: 1, o3: 0 }, voters: 3, sharedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(pRef(t), { results: { o1: 3, o2: 1, o3: 0 }, voters: 4 }));
    await assertFails(updateDoc(pRef(t), { voters: -1 }));
    await assertSucceeds(updateDoc(pRef(t), { shared: false }));
    await assertSucceeds(updateDoc(pRef(t), { open: false, closedAt: serverTimestamp() }));
    await assertFails(updateDoc(pRef(t), { open: true }));
    // 학생 · 남의 반 교사는 못 고침
    const s1 = asStudent(env, "stu1").firestore();
    await assertFails(updateDoc(pRef(s1, "pm"), { shared: true }));
    const other = asTeacher(env, "teacherB").firestore();
    await assertFails(updateDoc(pRef(other, "pm"), { shared: true }));
  });

  it("투표 읽기는 반 학생 · 담당 교사(앱과 같은 질의), 다른 반 학생은 거부", async () => {
    await seed(env, (db) => setDoc(doc(db, "memberships", `stu9_cB`), { uid: "stu9", classId: "cB" }));
    const s1 = asStudent(env, "stu1").firestore();
    await assertSucceeds(getDocs(query(collection(s1, "classes", C, "polls"), orderBy("createdAt", "desc"), limit(20))));
    const s9 = asStudent(env, "stu9").firestore();
    await assertFails(getDoc(pRef(s9)));
  });

  it("학생은 제 자리에 열린 투표의 표를 적고 바꿈 — 고른 수 · 모양 · 남의 자리는 거부", async () => {
    const s1 = asStudent(env, "stu1").firestore();
    await assertFails(setDoc(vRef(s1, "stu2"), vote("stu2")));
    await assertFails(setDoc(vRef(s1, "stu1"), vote("stu1", [])));
    await assertFails(setDoc(vRef(s1, "stu1"), vote("stu1", ["o1", "o2"]))); // 하나만 고르기
    await assertFails(setDoc(vRef(s1, "stu1"), vote("stu1", ["o1"], { extra: 1 })));
    await assertFails(setDoc(vRef(s1, "stu1"), vote("stu1", ["o1"], { pollId: "pm" })));
    await assertSucceeds(setDoc(vRef(s1, "stu1"), vote("stu1")));
    await assertSucceeds(setDoc(vRef(s1, "stu1"), vote("stu1", ["o2"])));
    // 여러 개 고르기 — 항목 수까지
    await assertSucceeds(setDoc(vRef(s1, "stu1", "pm"), vote("stu1", ["o1", "o3"], { pollId: "pm" })));
    await assertFails(setDoc(vRef(s1, "stu1", "pm"), vote("stu1", ["o1", "o2", "o3", "o4"], { pollId: "pm" })));
    // 반 밖 학생은 못 적음
    const s9 = asStudent(env, "stu9").firestore();
    await assertFails(setDoc(vRef(s9, "stu9"), vote("stu9")));
  });

  it("닫힌 투표에는 못 적음", async () => {
    await seed(env, (db) => updateDoc(pRef(db), { open: false, closedAt: new Date() }));
    const s1 = asStudent(env, "stu1").firestore();
    await assertFails(setDoc(vRef(s1, "stu1"), vote("stu1")));
  });

  it("표 읽기 — 학생은 제 것만(남의 표 · 목록 거부), 교사는 목록까지", async () => {
    await seed(env, async (db) => {
      await setDoc(vRef(db, "stu1"), { ...vote("stu1"), at: new Date() });
      await setDoc(vRef(db, "stu2"), { ...vote("stu2"), at: new Date() });
    });
    const s1 = asStudent(env, "stu1").firestore();
    await assertSucceeds(getDoc(vRef(s1, "stu1")));
    await assertSucceeds(getDoc(vRef(s1, "stu1", "pm"))); // 아직 없는 제 자리
    await assertFails(getDoc(vRef(s1, "stu2")));
    await assertFails(getDocs(collection(s1, "classes", C, "polls", "p1", "votes")));
    const t = asTeacher(env, "teacherA").firestore();
    await assertSucceeds(getDocs(collection(t, "classes", C, "polls", "p1", "votes")));
    const other = asTeacher(env, "teacherB").firestore();
    await assertFails(getDocs(collection(other, "classes", C, "polls", "p1", "votes")));
  });

  it("지우기는 담당 교사(표와 한 묶음) — 학생은 제 표도 못 지움", async () => {
    await seed(env, (db) => setDoc(vRef(db, "stu1"), { ...vote("stu1"), at: new Date() }));
    const s1 = asStudent(env, "stu1").firestore();
    await assertFails(deleteDoc(vRef(s1, "stu1")));
    await assertFails(deleteDoc(pRef(s1)));
    const t = asTeacher(env, "teacherA").firestore();
    const b = writeBatch(t);
    b.delete(vRef(t, "stu1"));
    b.delete(pRef(t));
    await assertSucceeds(b.commit());
  });
});
