// =============================================================
// 간편 메신저 — classes/{cId}/chatMessages · chatReads
// -------------------------------------------------------------
// 지켜야 하는 것:
//  · 학생은 제 1:1 방(dm_나)과 **제가 든 모둠 방**만 읽고 씁니다.
//  · 담당 교사는 반의 모든 방을 읽고 씁니다. 남의 반 교사는 못 봅니다.
//  · 말은 아무도 못 고치고, 지우는 것은 담당 교사만.
//  · 읽음 표시는 본인 것만.
// =============================================================
import { describe, it, before, after, beforeEach } from "node:test";
import { assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import {
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, where,
  orderBy, limit, serverTimestamp,
} from "firebase/firestore";
import { makeEnv, asStudent, asTeacher, seed } from "./helpers.mjs";

// stu1·stu2는 1모둠, stu3은 2모둠, stu9는 같은 반이지만 어느 모둠에도 없음
const GROUPS = [
  { id: "group_1", index: 1, name: "1모둠", memberUids: ["stu1", "stu2"], members: [] },
  { id: "group_2", index: 2, name: "2모둠", memberUids: ["stu3"], members: [] },
];

// 앱(lib/data/messenger.js의 sendChatMessage)이 실제로 보내는 모양 그대로.
const msg = (from, room, role = "student", extra = {}) => ({
  classId: "cA",
  room,
  fromUid: from,
  fromName: role === "teacher" ? "선생님" : "학생",
  fromRole: role,
  text: "안녕하세요",
  at: serverTimestamp(),
  ...extra,
});
const chats = (db) => collection(db, "classes", "cA", "chatMessages");

describe("간편 메신저 규칙", () => {
  let env;
  before(async () => { env = await makeEnv("demo-rules-messenger"); });
  after(async () => { await env.cleanup(); });

  beforeEach(async () => {
    await env.clearFirestore();
    await seed(env, async (db) => {
      await setDoc(doc(db, "classes", "cA"), { createdBy: "teacherA", archived: false });
      for (const uid of ["stu1", "stu2", "stu3", "stu9"]) {
        await setDoc(doc(db, "memberships", `${uid}_cA`), { uid, classId: "cA" });
      }
      await setDoc(doc(db, "classes", "cA", "groupAssignments", "default"), { classId: "cA", groups: GROUPS });
      await setDoc(doc(db, "classes", "cA", "chatMessages", "d1"), msg("teacherA", "dm_stu1", "teacher", { at: new Date() }));
      await setDoc(doc(db, "classes", "cA", "chatMessages", "g1"), msg("stu2", "grp_group_1", "student", { at: new Date() }));
      await setDoc(doc(db, "classes", "cA", "chatMessages", "g2"), msg("stu3", "grp_group_2", "student", { at: new Date() }));
    });
  });

  describe("보내기", () => {
    it("학생은 선생님과의 제 1:1 방에 보낼 수 있다", async () => {
      const db = asStudent(env, "stu1").firestore();
      await assertSucceeds(setDoc(doc(chats(db), "m1"), msg("stu1", "dm_stu1")));
    });
    it("학생은 남의 1:1 방에는 못 보낸다", async () => {
      const db = asStudent(env, "stu1").firestore();
      await assertFails(setDoc(doc(chats(db), "m1"), msg("stu1", "dm_stu2")));
    });
    it("학생은 제 모둠 방에 보낼 수 있고 남의 모둠 방에는 못 보낸다", async () => {
      const db = asStudent(env, "stu1").firestore();
      await assertSucceeds(setDoc(doc(chats(db), "m1"), msg("stu1", "grp_group_1")));
      await assertFails(setDoc(doc(chats(db), "m2"), msg("stu1", "grp_group_2")));
    });
    it("어느 모둠에도 없는 학생은 모둠 방에 못 보낸다", async () => {
      const db = asStudent(env, "stu9").firestore();
      await assertFails(setDoc(doc(chats(db), "m1"), msg("stu9", "grp_group_1")));
    });
    it("학생은 선생님 이름표(fromRole teacher)로 못 보낸다", async () => {
      const db = asStudent(env, "stu1").firestore();
      await assertFails(setDoc(doc(chats(db), "m1"), msg("stu1", "dm_stu1", "teacher")));
    });
    it("남의 uid로는 못 보낸다", async () => {
      const db = asStudent(env, "stu2").firestore();
      await assertFails(setDoc(doc(chats(db), "m1"), msg("stu1", "dm_stu1")));
    });
    it("빈 글 · 1000자 초과 · 임의 시각 · 낯선 칸은 거부된다", async () => {
      const db = asStudent(env, "stu1").firestore();
      await assertFails(setDoc(doc(chats(db), "a"), msg("stu1", "dm_stu1", "student", { text: "" })));
      await assertFails(setDoc(doc(chats(db), "b"), msg("stu1", "dm_stu1", "student", { text: "가".repeat(1001) })));
      await assertFails(setDoc(doc(chats(db), "c"), msg("stu1", "dm_stu1", "student", { at: new Date(0) })));
      await assertFails(setDoc(doc(chats(db), "d"), msg("stu1", "dm_stu1", "student", { extra: 1 })));
    });
    it("서식 글(html)을 함께 보낼 수 있고, 4000자를 넘으면 거부된다", async () => {
      const db = asStudent(env, "stu1").firestore();
      await assertSucceeds(setDoc(doc(chats(db), "h1"), msg("stu1", "dm_stu1", "student", { html: "<b>안녕</b>하세요" })));
      await assertFails(setDoc(doc(chats(db), "h2"), msg("stu1", "dm_stu1", "student", { html: "가".repeat(4001) })));
      await assertFails(setDoc(doc(chats(db), "h3"), msg("stu1", "dm_stu1", "student", { html: 3 })));
    });
    it("인용 답장(quote)을 달 수 있고, 모양 · 길이가 틀리면 거부된다", async () => {
      const db = asStudent(env, "stu1").firestore();
      const q = (quote) => msg("stu1", "dm_stu1", "student", { quote });
      await assertSucceeds(setDoc(doc(chats(db), "q1"), q({ id: "d1", name: "선생님", text: "3번 줄을 다시 봐요" })));
      await assertSucceeds(setDoc(doc(chats(db), "q2"), q({ id: "d1", text: "이름 없이" })));
      await assertFails(setDoc(doc(chats(db), "q3"), q({ id: "d1", name: "선생님", text: "가".repeat(201) })));
      await assertFails(setDoc(doc(chats(db), "q4"), q({ id: "", text: "빈 id" })));
      await assertFails(setDoc(doc(chats(db), "q5"), q({ id: "d1", text: "" })));
      await assertFails(setDoc(doc(chats(db), "q6"), q({ id: "d1", text: "칸 더함", extra: 1 })));
      await assertFails(setDoc(doc(chats(db), "q7"), q("문자열 인용")));
    });
    it("담당 교사는 1:1 방 · 모둠 방 어디든 보낼 수 있다", async () => {
      const db = asTeacher(env, "teacherA").firestore();
      await assertSucceeds(setDoc(doc(chats(db), "t1"), msg("teacherA", "dm_stu3", "teacher")));
      await assertSucceeds(setDoc(doc(chats(db), "t2"), msg("teacherA", "grp_group_2", "teacher")));
    });
    it("남의 반 교사는 못 보낸다", async () => {
      const db = asTeacher(env, "teacherB").firestore();
      await assertFails(setDoc(doc(chats(db), "t1"), msg("teacherB", "dm_stu1", "teacher")));
    });
    it("보관된 반에서는 학생도 교사도 못 보낸다", async () => {
      await seed(env, (db) => setDoc(doc(db, "classes", "cA"), { createdBy: "teacherA", archived: true }));
      await assertFails(setDoc(doc(chats(asStudent(env, "stu1").firestore()), "m1"), msg("stu1", "dm_stu1")));
      await assertFails(setDoc(doc(chats(asTeacher(env, "teacherA").firestore()), "m2"), msg("teacherA", "dm_stu1", "teacher")));
    });
  });

  describe("읽기", () => {
    it("학생은 제 1:1 방을 질의로 읽는다(앱과 같은 모양)", async () => {
      const db = asStudent(env, "stu1").firestore();
      await assertSucceeds(getDocs(query(chats(db), where("room", "==", "dm_stu1"))));
    });
    it("학생은 남의 1:1 방을 못 읽는다", async () => {
      const db = asStudent(env, "stu2").firestore();
      await assertFails(getDocs(query(chats(db), where("room", "==", "dm_stu1"))));
      await assertFails(getDoc(doc(chats(db), "d1")));
    });
    it("학생은 제 모둠 방을 읽고, 남의 모둠 방은 못 읽는다", async () => {
      const db = asStudent(env, "stu1").firestore();
      await assertSucceeds(getDocs(query(chats(db), where("room", "==", "grp_group_1"))));
      await assertFails(getDocs(query(chats(db), where("room", "==", "grp_group_2"))));
    });
    it("학생은 조건 없이 반 전체를 못 읽는다", async () => {
      const db = asStudent(env, "stu1").firestore();
      await assertFails(getDocs(chats(db)));
    });
    it("담당 교사는 반 전체 최근 말을 읽는다(앱과 같은 모양)", async () => {
      const db = asTeacher(env, "teacherA").firestore();
      await assertSucceeds(getDocs(query(chats(db), orderBy("at", "desc"), limit(300))));
    });
    it("남의 반 교사는 못 읽는다", async () => {
      const db = asTeacher(env, "teacherB").firestore();
      await assertFails(getDocs(query(chats(db), orderBy("at", "desc"), limit(300))));
    });
  });

  describe("고치기 · 지우기", () => {
    it("말은 쓴 사람도 못 고친다", async () => {
      const db = asTeacher(env, "teacherA").firestore();
      await assertFails(updateDoc(doc(chats(db), "d1"), { text: "바꿈" }));
    });
    it("담당 교사만 지운다", async () => {
      await assertFails(deleteDoc(doc(chats(asStudent(env, "stu2").firestore()), "g1")));
      await assertSucceeds(deleteDoc(doc(chats(asTeacher(env, "teacherA").firestore()), "g1")));
    });
  });

  describe("읽음 표시", () => {
    const reads = (db, uid) => doc(db, "classes", "cA", "chatReads", uid);
    it("본인 것만 쓰고 읽는다(앱과 같은 merge 모양)", async () => {
      const db = asStudent(env, "stu1").firestore();
      await assertSucceeds(setDoc(reads(db, "stu1"), { rooms: { dm_stu1: 123 }, updatedAt: serverTimestamp() }, { merge: true }));
      await assertSucceeds(getDoc(reads(db, "stu1")));
      await assertFails(setDoc(reads(db, "stu2"), { rooms: { dm_stu2: 1 } }, { merge: true }));
      await assertFails(getDoc(reads(asStudent(env, "stu2").firestore(), "stu1")));
    });
    it("교사도 제 것을 쓴다 · 낯선 칸은 거부", async () => {
      const db = asTeacher(env, "teacherA").firestore();
      await assertSucceeds(setDoc(reads(db, "teacherA"), { rooms: { dm_stu1: 5 } }, { merge: true }));
      await assertFails(setDoc(reads(db, "teacherA"), { rooms: {}, other: 1 }, { merge: true }));
    });
  });
});
