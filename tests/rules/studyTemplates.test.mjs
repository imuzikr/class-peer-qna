// =============================================================
// 프로젝트 원본 — studyTemplates/{tId}
// -------------------------------------------------------------
// 반에 안 묶인 선생님의 프로젝트입니다. 공부방 '＋ 프로젝트 만들기'가 여기에
// 한 장을 만들고, '이 반에서 시작하기'가 그 반에 복사본(studyBoards,
// templateId = 원본 id)을 만듭니다. 수업 자료(lessons)와 같은 모양입니다.
//
// 여기서 지키려는 것:
//  · 만든 선생님만 읽고 고치고 지울 것 — 다른 교사도, 학생도 못 봅니다
//  · 남의 이름(ownerId)으로 만들지 못할 것
//  · 주인을 바꿔치기하지 못할 것(원본을 남의 목록에 밀어 넣는 길)
//  · 목록은 `where ownerId == 나`로만 — 조건 없는 목록은 거부
//  · 복사본(studyBoards)에 templateId 칸이 붙어도 **기존 규칙이 그대로
//    통과**할 것 — 그 규칙은 이번에 한 줄도 안 건드렸습니다
// =============================================================
import { describe, it, before, after, beforeEach } from "node:test";
import { assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import {
  doc,
  addDoc,
  collection,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { makeEnv, asStudent, asTeacher, asAdmin, seed } from "./helpers.mjs";

// 클라이언트(lib/store.js addStudyTemplate)가 실제로 보내는 형태
const payload = (ownerId = "teacherA") => ({
  ownerId,
  ownerName: "강현수",
  title: "[Python] 기초 입력과 리스트 제어",
  description: "input()과 리스트를 다룹니다",
  keywords: [],
  activityType: "individual",
  activities: ["값 입력받기", "리스트에 담기"],
  createdAt: serverTimestamp(),
});

describe("프로젝트 원본 규칙", () => {
  let env;

  before(async () => {
    env = await makeEnv("demo-rules-study-templates");
  });
  after(async () => {
    await env.cleanup();
  });

  beforeEach(async () => {
    await env.clearFirestore();
    await seed(env, async (db) => {
      await setDoc(doc(db, "classes", "cA"), {
        createdBy: "teacherA", archived: false, name: "정보 B",
      });
      await setDoc(doc(db, "studyTemplates", "t1"), {
        ...payload("teacherA"),
        createdAt: new Date(),
      });
    });
  });

  // ── 만들기 ──────────────────────────────────────────────
  it("교사는 자기 이름으로 원본을 만든다", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertSucceeds(addDoc(collection(db, "studyTemplates"), payload("teacherA")));
  });

  it("남의 이름(ownerId)으로는 못 만든다", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertFails(addDoc(collection(db, "studyTemplates"), payload("teacherB")));
  });

  it("학생은 원본을 못 만든다", async () => {
    const db = asStudent(env, "s1").firestore();
    await assertFails(addDoc(collection(db, "studyTemplates"), payload("s1")));
  });

  // ── 읽기 ────────────────────────────────────────────────
  it("만든 교사는 읽는다", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertSucceeds(getDoc(doc(db, "studyTemplates", "t1")));
  });

  it("다른 교사는 못 읽는다", async () => {
    const db = asTeacher(env, "teacherB").firestore();
    await assertFails(getDoc(doc(db, "studyTemplates", "t1")));
  });

  it("학생은 못 읽는다", async () => {
    const db = asStudent(env, "s1").firestore();
    await assertFails(getDoc(doc(db, "studyTemplates", "t1")));
  });

  it("관리자는 읽는다", async () => {
    const db = asAdmin(env, "admin1").firestore();
    await assertSucceeds(getDoc(doc(db, "studyTemplates", "t1")));
  });

  // ── 목록 — 규칙은 결과가 아니라 질의로 판정합니다 ─────────
  it("목록은 `where ownerId == 나`로 받는다", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertSucceeds(
      getDocs(query(collection(db, "studyTemplates"), where("ownerId", "==", "teacherA")))
    );
  });

  it("조건 없는 목록은 거부된다(남의 원본까지 집어 오는 일)", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertFails(getDocs(collection(db, "studyTemplates")));
  });

  // ── 고치기 ──────────────────────────────────────────────
  it("만든 교사는 제목·활동을 고친다", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertSucceeds(
      updateDoc(doc(db, "studyTemplates", "t1"), { title: "새 제목", activities: ["하나"] })
    );
  });

  it("주인(ownerId)은 못 바꾼다 — 원본을 남의 목록에 밀어 넣는 길", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertFails(updateDoc(doc(db, "studyTemplates", "t1"), { ownerId: "teacherB" }));
  });

  it("다른 교사는 못 고친다", async () => {
    const db = asTeacher(env, "teacherB").firestore();
    await assertFails(updateDoc(doc(db, "studyTemplates", "t1"), { title: "가로채기" }));
  });

  // ── 지우기 ──────────────────────────────────────────────
  it("만든 교사는 지운다", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertSucceeds(deleteDoc(doc(db, "studyTemplates", "t1")));
  });

  it("다른 교사는 못 지운다", async () => {
    const db = asTeacher(env, "teacherB").firestore();
    await assertFails(deleteDoc(doc(db, "studyTemplates", "t1")));
  });

  // ── 복사본 — studyBoards 규칙은 안 건드렸습니다 ──────────
  // lib/store.js의 startStudyTemplateInClass → addStudyBoard가 실제로 보내는
  // 형태 그대로. templateId 한 칸이 늘었는데 기존 create 규칙이 그대로
  // 통과해야 합니다(필드 목록을 못 박아 두지 않은 규칙이라는 것을 여기서 박음).
  const boardPayload = (classId) => ({
    classId,
    title: "[Python] 기초 입력과 리스트 제어",
    type: "student",
    description: "",
    keywords: [],
    activityType: "individual",
    activities: ["값 입력받기", "리스트에 담기"],
    activityLocks: [false, true],
    viewMode: "private",
    editMode: "open",
    createdBy: "teacherA",
    templateId: "t1",
    order: 1,
    createdAt: serverTimestamp(),
  });

  it("담당 교사는 원본에서 이 반에 복사본을 만든다(templateId 포함)", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertSucceeds(addDoc(collection(db, "studyBoards"), boardPayload("cA")));
  });

  it("남의 반에는 복사본을 못 만든다(templateId가 있어도)", async () => {
    const db = asTeacher(env, "teacherB").firestore();
    await assertFails(addDoc(collection(db, "studyBoards"), boardPayload("cA")));
  });
});
