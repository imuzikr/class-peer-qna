// =============================================================
// 수업 메모 — classes/{cId}/lessonMemos/{auto}
// -------------------------------------------------------------
// 수업 중에 교사가 짧게 적어 두는 메모입니다. 누가기록(studentNotes)과 달리
// 학생과 엮이지 않고, 수업 운영에 대한 것이라 학생에게 보일 것을 전제로
// 쓰지 않습니다.
//
// 여기서 지키려는 것:
//  · 학생은 읽지도 쓰지도 못할 것 — 자기 반이어도
//  · 남의 반 교사가 남의 반 메모에 손대지 못할 것
//  · 보관된 반에는 쓰지 못할 것 (다른 쓰기와 같은 기준)
//  · 작성자·반·작성시각을 나중에 바꿔치기하지 못할 것
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

const memoCol = (db, cId) => collection(db, "classes", cId, "lessonMemos");

// 클라이언트(lib/store.js addLessonMemo)가 실제로 보내는 형태
// date — 이 메모가 '어느 수업의 일'인가(교사가 고를 수 있음).
// 규칙은 이 필드를 따로 검사하지 않습니다. 교사만 읽고 쓰는 수첩이고,
// 값이 틀려도 목록에 서는 자리만 달라질 뿐이라서입니다. 다만 '규칙이
// 막지는 않는다'는 것을 여기서 못 박아 둡니다 — 필드를 늘렸다가 create가
// 통째로 거부되면 저장 자체가 안 되니까요.
const payload = (cId, authorId = "teacherA", text = "3번 활동 설명이 길었다") => ({
  classId: cId,
  text,
  date: "2026-08-31",
  authorId,
  authorName: "강현수",
  createdAt: serverTimestamp(),
});

describe("수업 메모 규칙", () => {
  let env;
  let id;

  before(async () => {
    env = await makeEnv("demo-rules-lesson-memos");
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
      const ref = await addDoc(memoCol(db, "cA"), {
        classId: "cA", text: "예전 메모", authorId: "teacherA",
        authorName: "강현수", createdAt: new Date(),
      });
      id = ref.id;
    });
  });

  // ── 쓰기 ──
  it("담당 교사는 날짜를 붙여 메모를 남길 수 있다", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertSucceeds(addDoc(memoCol(db, "cA"), payload("cA")));
  });

  it("지난 메모의 날짜를 고칠 수 있다 — 뒤늦게 적은 것을 제 날짜로 옮기는 자리", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertSucceeds(
      updateDoc(doc(db, "classes", "cA", "lessonMemos", id), {
        text: "예전 메모", date: "2026-08-20",
      })
    );
  });

  it("담당 교사는 자기 반에 메모를 남길 수 있다", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertSucceeds(addDoc(memoCol(db, "cA"), payload("cA")));
  });

  it("남의 반 교사는 남길 수 없다", async () => {
    const db = asTeacher(env, "teacherB").firestore();
    await assertFails(addDoc(memoCol(db, "cA"), payload("cA", "teacherB")));
  });

  it("학생은 남길 수 없다", async () => {
    const db = asStudent(env, "stu1").firestore();
    await assertFails(addDoc(memoCol(db, "cA"), payload("cA", "stu1")));
  });

  it("보관된 반에는 남길 수 없다", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertFails(addDoc(memoCol(db, "cOld"), payload("cOld")));
  });

  it("authorId를 다른 사람으로 위조할 수 없다", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertFails(addDoc(memoCol(db, "cA"), payload("cA", "teacherB")));
  });

  it("classId가 경로와 다르면 거부된다", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertFails(addDoc(memoCol(db, "cA"), payload("cB")));
  });

  it("빈 메모는 거부된다", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertFails(addDoc(memoCol(db, "cA"), payload("cA", "teacherA", "")));
  });

  it("2000자를 넘으면 거부된다", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertFails(addDoc(memoCol(db, "cA"), payload("cA", "teacherA", "가".repeat(2001))));
  });

  // ── 읽기 ──
  it("담당 교사는 읽을 수 있다", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertSucceeds(getDoc(doc(db, "classes", "cA", "lessonMemos", id)));
  });

  it("최고 관리자는 읽을 수 있다", async () => {
    const db = asAdmin(env, "root").firestore();
    await assertSucceeds(getDoc(doc(db, "classes", "cA", "lessonMemos", id)));
  });

  // 수업 운영 메모라 학생에게 보일 것을 전제로 쓰지 않습니다.
  it("소속 학생도 읽을 수 없다", async () => {
    const db = asStudent(env, "stu1").firestore();
    await assertFails(getDoc(doc(db, "classes", "cA", "lessonMemos", id)));
  });

  it("남의 반 교사는 읽을 수 없다", async () => {
    const db = asTeacher(env, "teacherB").firestore();
    await assertFails(getDoc(doc(db, "classes", "cA", "lessonMemos", id)));
  });

  // ── 수정·삭제 ──
  // 누가기록·과일 이력과 달리 이건 교사의 수첩이라 고치고 지울 수 있습니다.
  it("담당 교사는 자기 반 메모를 고칠 수 있다", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertSucceeds(
      updateDoc(doc(db, "classes", "cA", "lessonMemos", id), { text: "고쳐 적음" })
    );
  });

  it("고치면서 작성자를 바꿔치기할 수 없다", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertFails(
      updateDoc(doc(db, "classes", "cA", "lessonMemos", id), { authorId: "teacherB" })
    );
  });

  it("담당 교사는 지울 수 있다", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertSucceeds(deleteDoc(doc(db, "classes", "cA", "lessonMemos", id)));
  });

  it("학생은 지울 수 없다", async () => {
    const db = asStudent(env, "stu1").firestore();
    await assertFails(deleteDoc(doc(db, "classes", "cA", "lessonMemos", id)));
  });
});
