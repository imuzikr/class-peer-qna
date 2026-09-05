// =============================================================
// 자리표 / 반 기본 모둠
//   classes/{cId}/seatLayouts/{layoutId}
//   classes/{cId}/groupAssignments/default
// 쓰기는 둘 다 교사 전용입니다. 읽기는 자리표만 그 반 학생에게 열려
// 있습니다(공부방 '자리 배치' — 내 자리 찾기). 모둠은 여전히 교사 전용.
// =============================================================
import { describe, it, before, after, beforeEach } from "node:test";
import { assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { makeEnv, asStudent, asTeacher, seed } from "./helpers.mjs";

const seats = (n) => Array.from({ length: n }, (_, i) => (i === 0 ? "stu1" : null));
const groups = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: `group_${i + 1}`, index: i + 1, name: `${i + 1}모둠`, memberUids: [], members: [],
  }));

describe("자리표·기본 모둠 규칙", () => {
  let env;

  before(async () => {
    env = await makeEnv("demo-rules-seats");
  });
  after(async () => {
    await env.cleanup();
  });

  beforeEach(async () => {
    await env.clearFirestore();
    await seed(env, async (db) => {
      await setDoc(doc(db, "classes", "cA"), { createdBy: "teacherA", archived: false });
      await setDoc(doc(db, "memberships", "stu1_cA"), { uid: "stu1", classId: "cA" });
    });
  });

  describe("자리표", () => {
    it("담당 교사는 기본 자리표를 저장할 수 있다", async () => {
      const db = asTeacher(env, "teacherA").firestore();
      await assertSucceeds(
        setDoc(doc(db, "classes", "cA", "seatLayouts", "default"), {
          classId: "cA", layoutId: "default", seats: seats(30), updatedBy: "teacherA",
        })
      );
    });

    it("날짜별 임시 자리표도 저장할 수 있다", async () => {
      const db = asTeacher(env, "teacherA").firestore();
      const id = "daily_2026-08-23";
      await assertSucceeds(
        setDoc(doc(db, "classes", "cA", "seatLayouts", id), {
          classId: "cA", layoutId: id, seats: seats(30), updatedBy: "teacherA",
        })
      );
    });

    it("자리 수가 30을 넘으면 거부된다", async () => {
      const db = asTeacher(env, "teacherA").firestore();
      await assertFails(
        setDoc(doc(db, "classes", "cA", "seatLayouts", "default"), {
          classId: "cA", layoutId: "default", seats: seats(31), updatedBy: "teacherA",
        })
      );
    });

    it("layoutId 필드가 문서 ID와 다르면 거부된다", async () => {
      const db = asTeacher(env, "teacherA").firestore();
      await assertFails(
        setDoc(doc(db, "classes", "cA", "seatLayouts", "default"), {
          classId: "cA", layoutId: "다른값", seats: seats(30), updatedBy: "teacherA",
        })
      );
    });

    // 공부방 머리줄의 '자리 배치'(MySeatModal)가 이 문서를 읽습니다.
    // 읽기만 열려 있고 쓰기는 여전히 교사만입니다.
    it("그 반 학생은 자리표를 읽을 수 있다 — 쓰지는 못한다", async () => {
      await seed(env, (db) =>
        setDoc(doc(db, "classes", "cA", "seatLayouts", "default"), {
          classId: "cA", layoutId: "default", seats: seats(30),
        })
      );
      const db = asStudent(env, "stu1").firestore();
      await assertSucceeds(getDoc(doc(db, "classes", "cA", "seatLayouts", "default")));
      await assertFails(
        setDoc(doc(db, "classes", "cA", "seatLayouts", "default"), {
          classId: "cA", layoutId: "default", seats: seats(30), updatedBy: "stu1",
        })
      );
    });

    // 아직 안 흔든 날에는 daily 문서가 없습니다 — 문서가 없어도 규칙 평가가
    // 오류로 끝나지 않는지(=본인조차 거부되지 않는지) 함께 고정해 둡니다.
    it("없는 날짜별 자리표를 읽어도 거부되지 않는다", async () => {
      const db = asStudent(env, "stu1").firestore();
      await assertSucceeds(
        getDoc(doc(db, "classes", "cA", "seatLayouts", "daily_2026-09-05"))
      );
    });

    it("다른 반 학생은 이 반 자리표를 읽지 못한다", async () => {
      await seed(env, (db) =>
        setDoc(doc(db, "classes", "cA", "seatLayouts", "default"), {
          classId: "cA", layoutId: "default", seats: seats(30),
        })
      );
      const db = asStudent(env, "stu2").firestore();
      await assertFails(getDoc(doc(db, "classes", "cA", "seatLayouts", "default")));
    });

    it("보관된 반은 소속 학생도 자리표를 읽지 못한다", async () => {
      await seed(env, async (db) => {
        await setDoc(doc(db, "classes", "cA"), { createdBy: "teacherA", archived: true });
        await setDoc(doc(db, "classes", "cA", "seatLayouts", "default"), {
          classId: "cA", layoutId: "default", seats: seats(30),
        });
      });
      const db = asStudent(env, "stu1").firestore();
      await assertFails(getDoc(doc(db, "classes", "cA", "seatLayouts", "default")));
    });

    it("다른 반 교사는 이 반 자리표에 손댈 수 없다", async () => {
      const db = asTeacher(env, "teacherB").firestore();
      await assertFails(
        setDoc(doc(db, "classes", "cA", "seatLayouts", "default"), {
          classId: "cA", layoutId: "default", seats: seats(30), updatedBy: "teacherB",
        })
      );
    });
  });

  describe("기본 모둠", () => {
    it("담당 교사는 기본 모둠을 저장할 수 있다", async () => {
      const db = asTeacher(env, "teacherA").firestore();
      await assertSucceeds(
        setDoc(doc(db, "classes", "cA", "groupAssignments", "default"), {
          classId: "cA", groups: groups(4), updatedBy: "teacherA",
        })
      );
    });

    it("모둠이 6개를 넘으면 거부된다", async () => {
      const db = asTeacher(env, "teacherA").firestore();
      await assertFails(
        setDoc(doc(db, "classes", "cA", "groupAssignments", "default"), {
          classId: "cA", groups: groups(7), updatedBy: "teacherA",
        })
      );
    });

    it("문서 ID가 'default'가 아니면 거부된다", async () => {
      const db = asTeacher(env, "teacherA").firestore();
      await assertFails(
        setDoc(doc(db, "classes", "cA", "groupAssignments", "other"), {
          classId: "cA", groups: groups(4), updatedBy: "teacherA",
        })
      );
    });

    // 공부방 머리줄의 '우리 모둠'(GroupMemoModal)이 이 문서를 읽습니다.
    // 읽기만 열려 있고 모둠을 짜는 것은 여전히 교사만입니다.
    it("그 반 학생은 기본 모둠을 읽을 수 있다 — 쓰지는 못한다", async () => {
      await seed(env, (db) =>
        setDoc(doc(db, "classes", "cA", "groupAssignments", "default"), {
          classId: "cA", groups: groups(4),
        })
      );
      const db = asStudent(env, "stu1").firestore();
      await assertSucceeds(getDoc(doc(db, "classes", "cA", "groupAssignments", "default")));
      await assertFails(
        setDoc(doc(db, "classes", "cA", "groupAssignments", "default"), {
          classId: "cA", groups: groups(4), updatedBy: "stu1",
        })
      );
    });

    it("다른 반 학생은 이 반 기본 모둠을 읽지 못한다", async () => {
      await seed(env, (db) =>
        setDoc(doc(db, "classes", "cA", "groupAssignments", "default"), {
          classId: "cA", groups: groups(4),
        })
      );
      const db = asStudent(env, "stu2").firestore();
      await assertFails(getDoc(doc(db, "classes", "cA", "groupAssignments", "default")));
    });
  });
});
