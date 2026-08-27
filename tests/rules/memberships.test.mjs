// =============================================================
// 반 소속 — memberships/{uid}_{classId}
//
// 원래는 본인 소속 문서만(+교사·관리자) 읽을 수 있었는데, 공부방에서
// 학생도 급우 uid 명단을 볼 수 있어야 해서(프로필 조회 전 단계) 같은 반
// 학생끼리는 서로의 memberships 문서를 읽을 수 있게 열었습니다
// (rewards 컬렉션의 isClassMember(resource.data.classId) 패턴과 동일).
// 다른 반 소속 문서는 여전히 막혀야 합니다.
// =============================================================
import { describe, it, before, after, beforeEach } from "node:test";
import { assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { makeEnv, asStudent, asTeacher, seed } from "./helpers.mjs";

describe("반 소속(memberships) 읽기", () => {
  let env;

  before(async () => {
    env = await makeEnv("demo-rules-memberships");
  });
  after(async () => {
    await env.cleanup();
  });

  beforeEach(async () => {
    await env.clearFirestore();
    await seed(env, async (db) => {
      await setDoc(doc(db, "classes", "classA"), {
        name: "1반", createdBy: "teacherA", archived: false,
      });
      await setDoc(doc(db, "classes", "classB"), {
        name: "2반", createdBy: "teacherB", archived: false,
      });
      await setDoc(doc(db, "memberships", "stu1_classA"), { uid: "stu1", classId: "classA" });
      await setDoc(doc(db, "memberships", "stu2_classA"), { uid: "stu2", classId: "classA" });
      await setDoc(doc(db, "memberships", "stu3_classB"), { uid: "stu3", classId: "classB" });
    });
  });

  it("같은 반 학생의 소속 문서를 읽을 수 있다", async () => {
    const db = asStudent(env, "stu1").firestore();
    await assertSucceeds(getDoc(doc(db, "memberships", "stu2_classA")));
  });

  it("다른 반 학생의 소속 문서는 읽을 수 없다", async () => {
    const db = asStudent(env, "stu1").firestore();
    await assertFails(getDoc(doc(db, "memberships", "stu3_classB")));
  });

  it("자기 소속 문서는 항상 읽을 수 있다", async () => {
    const db = asStudent(env, "stu1").firestore();
    await assertSucceeds(getDoc(doc(db, "memberships", "stu1_classA")));
  });

  it("반을 개설한 교사는 그 반의 모든 소속 문서를 읽을 수 있다", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertSucceeds(getDoc(doc(db, "memberships", "stu1_classA")));
    await assertSucceeds(getDoc(doc(db, "memberships", "stu2_classA")));
  });

  it("다른 반을 개설한 교사는 남의 반 소속 문서를 읽을 수 없다", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertFails(getDoc(doc(db, "memberships", "stu3_classB")));
  });

  it("보관된 반이면 같은 반 학생도 서로의 소속 문서를 읽을 수 없다", async () => {
    await seed(env, (db) =>
      setDoc(doc(db, "classes", "classA"), { name: "1반", createdBy: "teacherA", archived: true })
    );
    const db = asStudent(env, "stu1").firestore();
    await assertFails(getDoc(doc(db, "memberships", "stu2_classA")));
  });
});
