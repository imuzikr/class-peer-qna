// =============================================================
// 열 개의 해시태그 — bookActivities/{aId}/hashtagPosts/{uid} · hashtagComments/{cId}
//
// 지켜야 할 것:
//   ① 공개 전에는 제 보고서만 읽는다(담당 교사는 전부)
//   ② 공개하면 반 구성원이 서로 읽고 댓글을 단다 · 다른 반은 못 읽는다
//   ③ 보고서는 제 uid 자리에 제 이름으로만 · 잠기면 못 고친다(읽음 표시는 됨)
//   ④ 공개를 거둬도 주인은 제 보고서에 달린 댓글을 읽는다
//   ⑤ 댓글은 고칠 수 없고, 지우기는 쓴 사람·교사만(보고서 주인은 못 지움)
// =============================================================
import { describe, it, before, after, beforeEach } from "node:test";
import { assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import {
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, collection, query, where,
} from "firebase/firestore";
import { makeEnv, asStudent, asTeacher, seed } from "./helpers.mjs";

const NAMES = { stu1: ["김하윤", "30101"], stu2: ["이도윤", "30102"] };
const post = (uid, extra = {}) => ({
  activityId: "act1",
  authorId: uid,
  authorName: NAMES[uid]?.[0] ?? "이름",
  studentId: NAMES[uid]?.[1] ?? null,
  title: "기후 위기를 읽고",
  source: { kind: "article", title: "바다가 뜨거워진다", author: "신문", date: "2026-09-01", url: "" },
  image: { url: "", caption: "", credit: "" },
  tags: [{ tag: "기후위기", quote: "기후 위기가 온다", insight: "위험하다" }],
  summary: "요약",
  ...extra,
});
const comment = (uid, extra = {}) => ({
  activityId: "act1",
  postUid: "stu1",
  authorId: uid,
  authorName: NAMES[uid]?.[0] ?? "선생님",
  studentId: NAMES[uid]?.[1] ?? null,
  byTeacher: false,
  kind: "ask",
  text: "왜 그렇게 생각했나요?",
  ...extra,
});
const pRef = (db, aId, uid) => doc(db, "bookActivities", aId, "hashtagPosts", uid);
const cCol = (db, aId) => collection(db, "bookActivities", aId, "hashtagComments");

describe("열 개의 해시태그 규칙", () => {
  let env;
  before(async () => { env = await makeEnv("demo-rules-hashtag"); });
  after(async () => { await env.cleanup(); });

  beforeEach(async () => {
    await env.clearFirestore();
    await seed(env, async (db) => {
      await setDoc(doc(db, "classes", "cA"), { createdBy: "teacherA", archived: false });
      await setDoc(doc(db, "classes", "cB"), { createdBy: "teacherB", archived: false });
      for (const uid of ["stu1", "stu2"]) {
        await setDoc(doc(db, "memberships", `${uid}_cA`), { uid, classId: "cA" });
      }
      await setDoc(doc(db, "memberships", "stuB_cB"), { uid: "stuB", classId: "cB" });
      await setDoc(doc(db, "users", "stu1"), { realName: "김하윤", studentId: "30101" });
      await setDoc(doc(db, "users", "stu2"), { realName: "이도윤", studentId: "30102" });
      await setDoc(doc(db, "bookActivities", "act1"), {
        classId: "cA", type: "hashtag", title: "열 개의 해시태그", locked: false, published: false,
      });
      await setDoc(doc(db, "bookActivities", "pub1"), {
        classId: "cA", type: "hashtag", title: "공개된 판", locked: false, published: true,
      });
      await setDoc(doc(db, "bookActivities", "lock1"), {
        classId: "cA", type: "hashtag", title: "잠긴 판", locked: true, published: true,
      });
      for (const a of ["act1", "pub1", "lock1"]) {
        await setDoc(pRef(db, a, "stu1"), post("stu1", { activityId: a }));
      }
      await setDoc(doc(db, "bookActivities", "act1", "hashtagComments", "c1"), comment("teacherA", {
        authorName: "선생님", studentId: null, byTeacher: true, kind: "like",
      }));
      await setDoc(doc(db, "bookActivities", "pub1", "hashtagComments", "c2"), comment("stu2", { activityId: "pub1" }));
    });
  });

  it("공개 전: 제 보고서만 — 친구 보고서·목록은 거부, 아직 없는 제 것은 열어 본다", async () => {
    const s2 = asStudent(env, "stu2").firestore();
    await assertFails(getDoc(pRef(s2, "act1", "stu1")));
    await assertFails(getDocs(collection(s2, "bookActivities", "act1", "hashtagPosts")));
    await assertSucceeds(getDoc(pRef(s2, "act1", "stu2")));
    const s1 = asStudent(env, "stu1").firestore();
    await assertSucceeds(getDoc(pRef(s1, "act1", "stu1")));
  });

  it("담당 교사는 공개 전에도 전부 읽는다 · 남의 반 교사는 못 읽는다", async () => {
    const t = asTeacher(env, "teacherA").firestore();
    await assertSucceeds(getDocs(collection(t, "bookActivities", "act1", "hashtagPosts")));
    await assertSucceeds(getDocs(cCol(t, "act1")));
    const o = asTeacher(env, "teacherB").firestore();
    await assertFails(getDocs(collection(o, "bookActivities", "act1", "hashtagPosts")));
  });

  it("공개 뒤: 반 구성원은 목록·댓글을 읽고, 다른 반은 못 읽는다", async () => {
    const s2 = asStudent(env, "stu2").firestore();
    await assertSucceeds(getDocs(collection(s2, "bookActivities", "pub1", "hashtagPosts")));
    await assertSucceeds(getDocs(cCol(s2, "pub1")));
    const b = asStudent(env, "stuB").firestore();
    await assertFails(getDocs(collection(b, "bookActivities", "pub1", "hashtagPosts")));
    await assertFails(getDocs(cCol(b, "pub1")));
  });

  it("공개 전에도 주인은 제 보고서에 달린 댓글(선생님 댓글)을 읽는다 · 전체 목록은 거부", async () => {
    const s1 = asStudent(env, "stu1").firestore();
    await assertSucceeds(getDocs(query(cCol(s1, "act1"), where("postUid", "==", "stu1"))));
    await assertFails(getDocs(cCol(s1, "act1")));
    const s2 = asStudent(env, "stu2").firestore();
    await assertFails(getDocs(query(cCol(s2, "act1"), where("postUid", "==", "stu1"))));
  });

  it("학생은 제 자리에 제 이름으로 보고서를 쓴다 · 남의 자리·남의 이름은 거부", async () => {
    const s2 = asStudent(env, "stu2").firestore();
    await assertSucceeds(setDoc(pRef(s2, "act1", "stu2"), post("stu2")));
    await assertFails(setDoc(pRef(s2, "act1", "stu1"), post("stu2")));
    await assertFails(setDoc(pRef(s2, "act1", "stu9"), post("stu2", { authorName: "김하윤", studentId: "30101" })));
    await assertFails(updateDoc(pRef(s2, "act1", "stu1"), { summary: "고침" }));
  });

  it("칸이 열 개를 넘거나 요약이 5000자를 넘으면 거부", async () => {
    const s2 = asStudent(env, "stu2").firestore();
    const eleven = Array.from({ length: 11 }, () => ({ tag: "a", quote: "", insight: "" }));
    await assertFails(setDoc(pRef(s2, "act1", "stu2"), post("stu2", { tags: eleven })));
    await assertFails(setDoc(pRef(s2, "act1", "stu2"), post("stu2", { summary: "가".repeat(5001) })));
  });

  it("잠긴 활동 — 고치기는 막히고 '댓글 봤다' 표시만 된다", async () => {
    const s1 = asStudent(env, "stu1").firestore();
    await assertFails(updateDoc(pRef(s1, "lock1", "stu1"), { summary: "고침" }));
    await assertSucceeds(updateDoc(pRef(s1, "lock1", "stu1"), { seenCommentsAt: new Date() }));
  });

  it("학생은 보고서를 못 지우고, 담당 교사는 지운다", async () => {
    const s1 = asStudent(env, "stu1").firestore();
    await assertFails(deleteDoc(pRef(s1, "act1", "stu1")));
    const t = asTeacher(env, "teacherA").firestore();
    await assertSucceeds(deleteDoc(pRef(t, "act1", "stu1")));
  });

  it("댓글 — 공개 전에는 학생이 못 달고, 공개 뒤에는 제 이름으로 단다", async () => {
    const s2 = asStudent(env, "stu2").firestore();
    await assertFails(addDoc(cCol(s2, "act1"), comment("stu2")));
    await assertSucceeds(addDoc(cCol(s2, "pub1"), comment("stu2", { activityId: "pub1" })));
    await assertFails(addDoc(cCol(s2, "pub1"), comment("stu2", { activityId: "pub1", authorName: "김하윤", studentId: "30101" })));
    await assertFails(addDoc(cCol(s2, "pub1"), comment("stu2", { activityId: "pub1", byTeacher: true })));
    await assertFails(addDoc(cCol(s2, "pub1"), comment("stu2", { activityId: "pub1", kind: "hate" })));
    await assertFails(addDoc(cCol(s2, "pub1"), comment("stu2", { activityId: "pub1", text: "가".repeat(501) })));
  });

  it("잠긴 활동에는 학생 댓글을 못 단다 · 교사는 공개 전에도 단다", async () => {
    const s2 = asStudent(env, "stu2").firestore();
    await assertFails(addDoc(cCol(s2, "lock1"), comment("stu2", { activityId: "lock1" })));
    const t = asTeacher(env, "teacherA").firestore();
    await assertSucceeds(addDoc(cCol(t, "act1"), comment("teacherA", {
      authorName: "선생님", studentId: null, byTeacher: true,
    })));
  });

  it("댓글은 고칠 수 없다 · 쓴 사람과 교사는 지우고, 보고서 주인은 못 지운다", async () => {
    const s2 = asStudent(env, "stu2").firestore();
    const c2 = doc(s2, "bookActivities", "pub1", "hashtagComments", "c2");
    await assertFails(updateDoc(c2, { text: "고침" }));
    const s1 = asStudent(env, "stu1").firestore();
    await assertFails(deleteDoc(doc(s1, "bookActivities", "pub1", "hashtagComments", "c2")));
    await assertSucceeds(deleteDoc(c2));
    const t = asTeacher(env, "teacherA").firestore();
    await assertSucceeds(deleteDoc(doc(t, "bookActivities", "act1", "hashtagComments", "c1")));
  });
});
