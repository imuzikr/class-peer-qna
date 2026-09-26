// =============================================================
// 내 생각은요... — bookActivities/{aId}/opinionNotes/{nId}
//
// 지켜야 할 것:
//   ① 반 구성원은 **서로의 메모를 다 읽는다** (entries와 반대)
//   ② 쓴 사람만 글·색을 고친다. 담당 교사는 자리만 옮긴다
//   ③ 누가 썼는지(authorId·이름표·byTeacher)는 아무도 못 바꾼다
//   ④ 학번이 있는 계정은 남의 학번·이름으로 붙이지 못한다
//   ⑤ 잠긴 활동은 학생이 손대지 못한다
// =============================================================
import { describe, it, before, after, beforeEach } from "node:test";
import { assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection } from "firebase/firestore";
import { makeEnv, asStudent, asTeacher, seed } from "./helpers.mjs";

const note = (authorId, extra = {}) => ({
  activityId: "act1",
  authorId,
  authorName: authorId === "stu1" ? "김하윤" : "이도윤",
  studentId: authorId === "stu1" ? "30101" : "30102",
  byTeacher: false,
  text: "주인공의 선택에 찬성해요",
  zone: "z1",
  x: 0.2,
  y: 0.3,
  color: "butter",
  ...extra,
});
const ref = (db, aId, nId) => doc(db, "bookActivities", aId, "opinionNotes", nId);

describe("내 생각은요 메모 규칙", () => {
  let env;

  before(async () => {
    env = await makeEnv("demo-rules-opinion");
  });
  after(async () => {
    await env.cleanup();
  });

  beforeEach(async () => {
    await env.clearFirestore();
    await seed(env, async (db) => {
      await setDoc(doc(db, "classes", "cA"), { createdBy: "teacherA", archived: false });
      await setDoc(doc(db, "classes", "cB"), { createdBy: "teacherB", archived: false });
      for (const uid of ["stu1", "stu2", "oldstu"]) {
        await setDoc(doc(db, "memberships", `${uid}_cA`), { uid, classId: "cA" });
      }
      await setDoc(doc(db, "memberships", "stuB_cB"), { uid: "stuB", classId: "cB" });
      await setDoc(doc(db, "users", "stu1"), { realName: "김하윤", studentId: "30101" });
      await setDoc(doc(db, "users", "stu2"), { realName: "이도윤", studentId: "30102" });
      // 학번 칸이 비고 실명 칸에 통째로 든 옛 계정
      await setDoc(doc(db, "users", "oldstu"), { realName: "30103박서준" });
      await setDoc(doc(db, "bookActivities", "act1"), {
        classId: "cA", type: "opinion", title: "내 생각은요...", locked: false,
        zones: [{ key: "z1", name: "찬성" }, { key: "z2", name: "반대" }],
      });
      await setDoc(doc(db, "bookActivities", "locked1"), {
        classId: "cA", type: "opinion", title: "잠긴 판", locked: true,
        zones: [{ key: "z1", name: "찬성" }, { key: "z2", name: "반대" }],
      });
      await setDoc(ref(db, "act1", "n1"), note("stu1"));
      await setDoc(ref(db, "locked1", "n1"), note("stu1", { activityId: "locked1" }));
    });
  });

  it("같은 반 학생은 남의 메모도 읽는다 (목록·한 장)", async () => {
    const db = asStudent(env, "stu2").firestore();
    await assertSucceeds(getDocs(collection(db, "bookActivities", "act1", "opinionNotes")));
    await assertSucceeds(getDoc(ref(db, "act1", "n1")));
  });

  it("다른 반 학생은 못 읽는다", async () => {
    const db = asStudent(env, "stuB").firestore();
    await assertFails(getDocs(collection(db, "bookActivities", "act1", "opinionNotes")));
  });

  it("학생은 제 이름으로 메모를 붙인다", async () => {
    const db = asStudent(env, "stu2").firestore();
    await assertSucceeds(setDoc(ref(db, "act1", "new"), note("stu2")));
  });

  it("남의 학번·이름으로는 못 붙인다", async () => {
    const db = asStudent(env, "stu2").firestore();
    await assertFails(setDoc(ref(db, "act1", "fake1"), note("stu2", { authorName: "김하윤", studentId: "30101" })));
    await assertFails(setDoc(ref(db, "act1", "fake2"), note("stu1")));
  });

  it("학번 칸이 없는 옛 계정은 화면이 가른 학번·이름으로 붙일 수 있다", async () => {
    const db = asStudent(env, "oldstu").firestore();
    await assertSucceeds(setDoc(ref(db, "act1", "old"), note("oldstu", { authorName: "박서준", studentId: "30103" })));
  });

  it("학생은 '선생님' 메모를 흉내 내지 못한다", async () => {
    const db = asStudent(env, "stu2").firestore();
    await assertFails(setDoc(ref(db, "act1", "t"), note("stu2", { byTeacher: true })));
  });

  it("빈 글 · 500자 넘는 글 · 판 밖 자리는 거부", async () => {
    const db = asStudent(env, "stu2").firestore();
    await assertFails(setDoc(ref(db, "act1", "e1"), note("stu2", { text: "" })));
    await assertFails(setDoc(ref(db, "act1", "e2"), note("stu2", { text: "가".repeat(501) })));
    await assertFails(setDoc(ref(db, "act1", "e3"), note("stu2", { x: 1.2 })));
  });

  it("쓴 사람은 글·색·자리를 고친다", async () => {
    const db = asStudent(env, "stu1").firestore();
    await assertSucceeds(updateDoc(ref(db, "act1", "n1"), { text: "생각이 바뀌었어요", color: "mint" }));
    await assertSucceeds(updateDoc(ref(db, "act1", "n1"), { zone: "z2", x: 0.5, y: 0.5 }));
  });

  it("쓴 사람도 이름표는 못 바꾼다", async () => {
    const db = asStudent(env, "stu1").firestore();
    await assertFails(updateDoc(ref(db, "act1", "n1"), { authorName: "다른 이름" }));
    await assertFails(updateDoc(ref(db, "act1", "n1"), { authorId: "stu2" }));
  });

  it("다른 학생은 남의 메모를 고치거나 옮기거나 떼지 못한다", async () => {
    const db = asStudent(env, "stu2").firestore();
    await assertFails(updateDoc(ref(db, "act1", "n1"), { text: "바꿈" }));
    await assertFails(updateDoc(ref(db, "act1", "n1"), { x: 0.9 }));
    await assertFails(deleteDoc(ref(db, "act1", "n1")));
  });

  it("담당 교사는 자리만 옮기고, 글은 못 고친다 · 뗄 수는 있다", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertSucceeds(updateDoc(ref(db, "act1", "n1"), { zone: "z2", x: 0.1, y: 0.9 }));
    await assertFails(updateDoc(ref(db, "act1", "n1"), { text: "교사가 고침" }));
    await assertSucceeds(deleteDoc(ref(db, "act1", "n1")));
  });

  it("담당 교사는 '선생님' 메모를 붙인다 · 남의 반 교사는 못 한다", async () => {
    const mine = asTeacher(env, "teacherA").firestore();
    await assertSucceeds(setDoc(ref(mine, "act1", "t1"), note("teacherA", { authorName: "선생님", studentId: null, byTeacher: true })));
    const other = asTeacher(env, "teacherB").firestore();
    await assertFails(setDoc(ref(other, "act1", "t2"), note("teacherB", { authorName: "선생님", studentId: null, byTeacher: true })));
    await assertFails(updateDoc(ref(other, "act1", "n1"), { x: 0.9 }));
  });

  it("잠긴 활동 — 학생은 붙이지도 고치지도 떼지도 못하고, 교사는 옮긴다", async () => {
    const stu = asStudent(env, "stu1").firestore();
    await assertFails(setDoc(ref(stu, "locked1", "x"), note("stu1", { activityId: "locked1" })));
    await assertFails(updateDoc(ref(stu, "locked1", "n1"), { text: "바꿈" }));
    await assertFails(deleteDoc(ref(stu, "locked1", "n1")));
    await assertSucceeds(getDoc(ref(stu, "locked1", "n1")));
    const tch = asTeacher(env, "teacherA").firestore();
    await assertSucceeds(updateDoc(ref(tch, "locked1", "n1"), { x: 0.7 }));
  });

  it("한 장 모드 — 문서 id가 uid라 두 번째 붙이기(덮어쓰기)는 거부된다", async () => {
    // addOpinionNote가 single일 때 setDoc(opinionNotes/{uid})로 씁니다.
    // 이미 있으면 update가 되고, createdAt·updatedAt을 새로 찍는 덮어쓰기는
    // 작성자 update의 changedOnly에 걸립니다 — 규칙을 안 고치고 한 장이 지켜짐.
    const db = asStudent(env, "stu2").firestore();
    const first = { ...note("stu2"), createdAt: new Date(1), updatedAt: new Date(1), movedAt: new Date(1) };
    await assertSucceeds(setDoc(ref(db, "act1", "stu2"), first));
    const again = { ...note("stu2", { text: "두 번째" }), createdAt: new Date(2), updatedAt: new Date(2), movedAt: new Date(2) };
    await assertFails(setDoc(ref(db, "act1", "stu2"), again));
    // 고치기(글·색)는 그대로 된다
    await assertSucceeds(updateDoc(ref(db, "act1", "stu2"), { text: "고쳐 씀" }));
  });

  it("쓴 사람은 제 메모를 뗀다", async () => {
    const db = asStudent(env, "stu1").firestore();
    await assertSucceeds(deleteDoc(ref(db, "act1", "n1")));
  });
});
