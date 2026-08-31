// =============================================================
// 개별 활동의 주제어 — bookActivities/{aId}/groups/{gId}.topic
//
// 닿소리 채우기를 '개별 활동'으로 열면 판 하나가 곧 학생 한 명입니다.
// 읽는 책이 저마다 다를 수 있어 교사가 주제어를 비워 두고, 학생이 자기 판
// 한가운데를 두 번 눌러 직접 적습니다.
//
// 여기서 확인하려는 것은 '얼마나 좁게 열렸는가'입니다.
//   · 자기 판의 topic 한 필드만 (다른 필드·다른 판은 불가)
//   · 개별 활동에서만 (모둠 활동에서는 불가 — 모둠 주제어는 교사 몫)
//   · 잠긴 활동에서는 불가
// =============================================================
import { describe, it, before, after, beforeEach } from "node:test";
import { assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc } from "firebase/firestore";
import { makeEnv, asStudent, asTeacher, seed } from "./helpers.mjs";

const group = (uid, extra = {}) => ({
  activityId: "solo1",
  groupIndex: 1,
  groupName: "학생",
  memberUids: [uid],
  members: [{ uid, name: "학생" }],
  retired: false,
  ...extra,
});

describe("개별 활동 주제어 규칙", () => {
  let env;

  before(async () => {
    env = await makeEnv("demo-rules-solo-topic");
  });
  after(async () => {
    await env.cleanup();
  });

  beforeEach(async () => {
    await env.clearFirestore();
    await seed(env, async (db) => {
      await setDoc(doc(db, "classes", "cA"), { createdBy: "teacherA", archived: false });
      await setDoc(doc(db, "memberships", "stu1_cA"), { uid: "stu1", classId: "cA" });
      await setDoc(doc(db, "memberships", "stu2_cA"), { uid: "stu2", classId: "cA" });

      // 개별 활동 — 학생마다 1인 판
      await setDoc(doc(db, "bookActivities", "solo1"), {
        classId: "cA", type: "consonant", title: "닿소리", groupMode: "solo", locked: false,
      });
      await setDoc(doc(db, "bookActivities", "solo1", "groups", "solo_stu1"), group("stu1"));
      await setDoc(doc(db, "bookActivities", "solo1", "groups", "solo_stu2"), group("stu2"));

      // 모둠 활동 — 여기서는 학생이 주제어를 고칠 수 없어야 합니다
      await setDoc(doc(db, "bookActivities", "team1"), {
        classId: "cA", type: "consonant", title: "닿소리", groupMode: "teacher", locked: false,
      });
      await setDoc(doc(db, "bookActivities", "team1", "groups", "group_1"), {
        activityId: "team1", groupIndex: 1, groupName: "1모둠",
        memberUids: ["stu1", "stu2"], members: [], retired: false,
      });

      // 잠긴 개별 활동
      await setDoc(doc(db, "bookActivities", "solo2"), {
        classId: "cA", type: "consonant", title: "닿소리", groupMode: "solo", locked: true,
      });
      await setDoc(doc(db, "bookActivities", "solo2", "groups", "solo_stu1"), group("stu1"));
    });
  });

  it("학생은 자기 판의 주제어를 적을 수 있다", async () => {
    const db = asStudent(env, "stu1").firestore();
    await assertSucceeds(
      updateDoc(doc(db, "bookActivities", "solo1", "groups", "solo_stu1"), { topic: "어린 왕자" })
    );
  });

  it("남의 판 주제어는 못 고친다", async () => {
    const db = asStudent(env, "stu1").firestore();
    await assertFails(
      updateDoc(doc(db, "bookActivities", "solo1", "groups", "solo_stu2"), { topic: "가로채기" })
    );
  });

  it("주제어 말고 다른 필드는 못 고친다", async () => {
    const db = asStudent(env, "stu1").firestore();
    // 판 이름 바꾸기
    await assertFails(
      updateDoc(doc(db, "bookActivities", "solo1", "groups", "solo_stu1"), { groupName: "내 마음대로" })
    );
    // 주제어에 얹어서 명단까지 — 한 필드만 허용하므로 함께 오면 막힙니다
    await assertFails(
      updateDoc(doc(db, "bookActivities", "solo1", "groups", "solo_stu1"), {
        topic: "어린 왕자",
        memberUids: ["stu1", "stu2"],
      })
    );
  });

  it("모둠 활동에서는 학생이 주제어를 못 고친다", async () => {
    const db = asStudent(env, "stu1").firestore();
    await assertFails(
      updateDoc(doc(db, "bookActivities", "team1", "groups", "group_1"), { topic: "모둠 주제" })
    );
  });

  it("잠긴 활동에서는 주제어를 못 고친다", async () => {
    const db = asStudent(env, "stu1").firestore();
    await assertFails(
      updateDoc(doc(db, "bookActivities", "solo2", "groups", "solo_stu1"), { topic: "늦게 적기" })
    );
  });

  it("너무 긴 주제어는 막는다", async () => {
    const db = asStudent(env, "stu1").firestore();
    await assertFails(
      updateDoc(doc(db, "bookActivities", "solo1", "groups", "solo_stu1"), { topic: "가".repeat(41) })
    );
  });

  it("반 밖의 사람은 주제어를 못 적는다", async () => {
    const db = asStudent(env, "outsider").firestore();
    await assertFails(
      updateDoc(doc(db, "bookActivities", "solo1", "groups", "solo_stu1"), { topic: "남의 반" })
    );
  });

  it("담당 교사는 학생 판의 주제어를 고칠 수 있다", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertSucceeds(
      updateDoc(doc(db, "bookActivities", "solo1", "groups", "solo_stu1"), { topic: "선생님이 고침" })
    );
  });

  it("다른 반 교사는 못 고친다", async () => {
    const db = asTeacher(env, "teacherB").firestore();
    await assertFails(
      updateDoc(doc(db, "bookActivities", "solo1", "groups", "solo_stu1"), { topic: "남의 반 교사" })
    );
  });
});
