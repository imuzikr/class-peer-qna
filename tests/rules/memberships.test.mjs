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
import { doc, getDoc, setDoc, deleteDoc, updateDoc, serverTimestamp } from "firebase/firestore";
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

// =============================================================
// 반 편성 고치기 — 담당 교사가 자기 반에 학생을 직접 넣고 뺍니다
// -------------------------------------------------------------
// 학기 초에 학생이 코드를 잘못 눌러 옆 반에 들어가는 일이 잦은데, 지금까지는
// 고칠 길이 없었습니다(생성은 '본인 + 유효한 입장 코드'로만 열려 있었음).
// 여는 범위는 **자기가 개설한, 보관되지 않은 반**뿐입니다.
// =============================================================
describe("반 편성 고치기(교사)", () => {
  let env;

  before(async () => {
    env = await makeEnv("demo-rules-memberships-edit");
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
      await setDoc(doc(db, "users", "stu1"), {
        role: "student", realName: "학생1", classIds: ["classA", "classB"],
      });
      await setDoc(doc(db, "memberships", "stu1_classA"), { uid: "stu1", classId: "classA" });
    });
  });

  const membership = (uid, classId) => ({ uid, classId, joinedAt: serverTimestamp() });

  it("담당 교사는 자기 반에 학생을 넣을 수 있다", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertSucceeds(
      setDoc(doc(db, "memberships", "stu2_classA"), membership("stu2", "classA"))
    );
  });

  it("남의 반에는 넣을 수 없다", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertFails(
      setDoc(doc(db, "memberships", "stu2_classB"), membership("stu2", "classB"))
    );
  });

  it("보관된 반에는 넣을 수 없다", async () => {
    await seed(env, (db) =>
      setDoc(doc(db, "classes", "classA"), { name: "1반", createdBy: "teacherA", archived: true })
    );
    const db = asTeacher(env, "teacherA").firestore();
    await assertFails(
      setDoc(doc(db, "memberships", "stu2_classA"), membership("stu2", "classA"))
    );
  });

  // 문서 ID가 곧 '누구의 어느 반'입니다 — 어긋나면 명단과 문서가 따로 놉니다.
  it("문서 ID가 uid_classId와 안 맞으면 거부된다", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertFails(
      setDoc(doc(db, "memberships", "엉뚱한id"), membership("stu2", "classA"))
    );
  });

  it("학생은 여전히 남을 반에 넣을 수 없다", async () => {
    const db = asStudent(env, "stu1").firestore();
    await assertFails(
      setDoc(doc(db, "memberships", "stu2_classA"), membership("stu2", "classA"))
    );
  });

  it("담당 교사는 자기 반에서 학생을 뺄 수 있다", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertSucceeds(deleteDoc(doc(db, "memberships", "stu1_classA")));
  });

  // classIds는 급우 프로필 읽기 판정(isClassmateOf)의 기준이라, 소속을 지워도
  // 여기 남아 있으면 그 반 급우의 이름·학번을 계속 읽을 수 있습니다.
  it("교사는 학생의 classIds를 줄일 수 있다", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertSucceeds(updateDoc(doc(db, "users", "stu1"), { classIds: ["classB"] }));
  });

  // 늘릴 수 있으면 교사가 학생에게 '남의 반 명단을 읽을 권한'을 얹어 줄 수
  // 있게 됩니다. 줄이는 쪽은 늘 권한을 좁히므로 안전합니다.
  it("교사가 학생의 classIds를 늘리는 것은 거부된다", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertFails(
      updateDoc(doc(db, "users", "stu1"), { classIds: ["classA", "classB", "classC"] })
    );
  });

  it("개수만 줄이면서 없던 반을 끼워 넣는 것도 거부된다", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertFails(updateDoc(doc(db, "users", "stu1"), { classIds: ["classC"] }));
  });

  it("교사는 다른 교사의 classIds에는 손댈 수 없다", async () => {
    await seed(env, (db) =>
      setDoc(doc(db, "users", "teacherB"), { role: "teacher", classIds: ["classA", "classB"] })
    );
    const db = asTeacher(env, "teacherA").firestore();
    await assertFails(updateDoc(doc(db, "users", "teacherB"), { classIds: ["classB"] }));
  });
});
