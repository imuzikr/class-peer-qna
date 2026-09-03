// =============================================================
// 동료 평가 — bookActivities/{aId}/peerReviews/{받는사람_쓴사람}
//
// 설계에서 지켜야 할 것 셋을 규칙으로 못 박아 둡니다.
//   ① 같은 모둠 친구에게만 쓴다 (문서에 적힌 groupId의 명단으로 판정)
//   ② 읽는 사람은 받은 학생·쓴 학생·담당 교사뿐 (반 전체가 서로 다 보면
//      먼저 쓴 코멘트를 보고 따라 씁니다)
//   ③ 동료 평가 잠금(peerReviewLocked)은 활동 전체 잠금과 별개
// =============================================================
import { describe, it, before, after, beforeEach } from "node:test";
import { assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, deleteDoc, getDocs, collection, query, where } from "firebase/firestore";
import { makeEnv, asStudent, asTeacher, seed } from "./helpers.mjs";

const review = (toUid, fromUid, extra = {}) => ({
  activityId: "act1",
  groupId: "group_1",
  toUid,
  toName: "받는이",
  fromUid,
  fromName: "쓴이",
  html: "<p>발표 잘 들었어요</p>",
  ...extra,
});

const rid = (toUid, fromUid) => `${toUid}_${fromUid}`;

describe("동료 평가 규칙", () => {
  let env;

  before(async () => {
    env = await makeEnv("demo-rules-peer");
  });
  after(async () => {
    await env.cleanup();
  });

  beforeEach(async () => {
    await env.clearFirestore();
    await seed(env, async (db) => {
      await setDoc(doc(db, "classes", "cA"), { createdBy: "teacherA", archived: false });
      for (const uid of ["stu1", "stu2", "stu3"]) {
        await setDoc(doc(db, "memberships", `${uid}_cA`), { uid, classId: "cA" });
      }
      await setDoc(doc(db, "bookActivities", "act1"), {
        classId: "cA", type: "raft", title: "RAFT", locked: false, grouped: true,
      });
      // 1모둠: stu1·stu2 / 2모둠: stu3
      await setDoc(doc(db, "bookActivities", "act1", "groups", "group_1"), {
        activityId: "act1", groupIndex: 1, groupName: "햇살",
        memberUids: ["stu1", "stu2"],
        members: [{ uid: "stu1", name: "학생1" }, { uid: "stu2", name: "학생2" }],
      });
      await setDoc(doc(db, "bookActivities", "act1", "groups", "group_2"), {
        activityId: "act1", groupIndex: 2, groupName: "바람",
        memberUids: ["stu3"], members: [{ uid: "stu3", name: "학생3" }],
      });
      await setDoc(doc(db, "bookActivities", "locked1"), {
        classId: "cA", type: "raft", title: "잠긴 활동", locked: true, grouped: true,
      });
      await setDoc(doc(db, "bookActivities", "locked1", "groups", "group_1"), {
        activityId: "locked1", groupIndex: 1, memberUids: ["stu1", "stu2"], members: [],
      });
      await setDoc(doc(db, "bookActivities", "peerlocked1"), {
        classId: "cA", type: "raft", title: "평가만 잠근 활동",
        locked: false, grouped: true, peerReviewLocked: true,
      });
      await setDoc(doc(db, "bookActivities", "peerlocked1", "groups", "group_1"), {
        activityId: "peerlocked1", groupIndex: 1, memberUids: ["stu1", "stu2"], members: [],
      });
    });
  });

  it("같은 모둠 친구에게 쓸 수 있다", async () => {
    const db = asStudent(env, "stu1").firestore();
    await assertSucceeds(
      setDoc(doc(db, "bookActivities", "act1", "peerReviews", rid("stu2", "stu1")), review("stu2", "stu1"))
    );
  });

  it("다른 모둠 친구에게는 쓸 수 없다", async () => {
    const db = asStudent(env, "stu1").firestore();
    // 우리 모둠 id를 적어도 그 명단에 stu3이 없으므로 막힙니다
    await assertFails(
      setDoc(doc(db, "bookActivities", "act1", "peerReviews", rid("stu3", "stu1")), review("stu3", "stu1"))
    );
    // 남의 모둠 id를 적어도 그 명단에 내가 없으므로 막힙니다
    await assertFails(
      setDoc(
        doc(db, "bookActivities", "act1", "peerReviews", rid("stu3", "stu1")),
        review("stu3", "stu1", { groupId: "group_2" })
      )
    );
  });

  it("남의 이름으로 쓸 수 없다 (fromUid·문서 ID가 나여야 한다)", async () => {
    const db = asStudent(env, "stu1").firestore();
    await assertFails(
      setDoc(doc(db, "bookActivities", "act1", "peerReviews", rid("stu1", "stu2")), review("stu1", "stu2"))
    );
    // 문서 ID와 안에 적은 사람이 어긋나도 안 됩니다
    await assertFails(
      setDoc(doc(db, "bookActivities", "act1", "peerReviews", "아무거나"), review("stu2", "stu1"))
    );
  });

  it("자기 자신에게는 쓸 수 없다", async () => {
    const db = asStudent(env, "stu1").firestore();
    await assertFails(
      setDoc(doc(db, "bookActivities", "act1", "peerReviews", rid("stu1", "stu1")), review("stu1", "stu1"))
    );
  });

  it("빈 글·너무 긴 글은 저장되지 않는다", async () => {
    const db = asStudent(env, "stu1").firestore();
    await assertFails(
      setDoc(
        doc(db, "bookActivities", "act1", "peerReviews", rid("stu2", "stu1")),
        review("stu2", "stu1", { html: "" })
      )
    );
    await assertFails(
      setDoc(
        doc(db, "bookActivities", "act1", "peerReviews", rid("stu2", "stu1")),
        review("stu2", "stu1", { html: "가".repeat(4001) })
      )
    );
  });

  it("받은 학생·쓴 학생·담당 교사만 읽는다", async () => {
    await seed(env, (db) =>
      setDoc(doc(db, "bookActivities", "act1", "peerReviews", rid("stu2", "stu1")), review("stu2", "stu1"))
    );
    const path = ["bookActivities", "act1", "peerReviews", rid("stu2", "stu1")];
    // 쓴 사람
    await assertSucceeds(getDoc(doc(asStudent(env, "stu1").firestore(), ...path)));
    // 받은 사람
    await assertSucceeds(getDoc(doc(asStudent(env, "stu2").firestore(), ...path)));
    // 담당 교사
    await assertSucceeds(getDoc(doc(asTeacher(env, "teacherA").firestore(), ...path)));
    // 같은 반이지만 남남 — 여기가 열리면 서로 베껴 씁니다
    await assertFails(getDoc(doc(asStudent(env, "stu3").firestore(), ...path)));
    await assertFails(getDoc(doc(asTeacher(env, "teacherB").firestore(), ...path)));
  });

  // 학생 화면이 실제로 거는 질의 두 개가 통과하는지 — 규칙이 문서마다
  // 판정하므로, 조건 없이 컬렉션을 통째로 받으려 하면 막혀야 합니다.
  it("학생은 '내가 쓴 것'과 '내가 받은 것'만 질의할 수 있다", async () => {
    await seed(env, (db) =>
      setDoc(doc(db, "bookActivities", "act1", "peerReviews", rid("stu2", "stu1")), review("stu2", "stu1"))
    );
    const db = asStudent(env, "stu1").firestore();
    const col = collection(db, "bookActivities", "act1", "peerReviews");
    await assertSucceeds(getDocs(query(col, where("fromUid", "==", "stu1"))));
    await assertSucceeds(getDocs(query(col, where("toUid", "==", "stu1"))));
    await assertFails(getDocs(col));
  });

  it("담당 교사는 활동의 동료 평가를 통째로 읽는다", async () => {
    await seed(env, (db) =>
      setDoc(doc(db, "bookActivities", "act1", "peerReviews", rid("stu2", "stu1")), review("stu2", "stu1"))
    );
    await assertSucceeds(
      getDocs(collection(asTeacher(env, "teacherA").firestore(), "bookActivities", "act1", "peerReviews"))
    );
  });

  it("쓴 사람은 고쳐 쓸 수 있지만 받는 사람은 못 고친다", async () => {
    await seed(env, (db) =>
      setDoc(doc(db, "bookActivities", "act1", "peerReviews", rid("stu2", "stu1")), review("stu2", "stu1"))
    );
    const path = ["bookActivities", "act1", "peerReviews", rid("stu2", "stu1")];
    await assertSucceeds(
      setDoc(doc(asStudent(env, "stu1").firestore(), ...path), review("stu2", "stu1", { html: "<p>고침</p>" }))
    );
    await assertFails(
      setDoc(doc(asStudent(env, "stu2").firestore(), ...path), review("stu2", "stu1", { html: "<p>내가 고침</p>" }))
    );
  });

  it("고쳐 쓰면서 받는 사람을 바꿔치기할 수 없다", async () => {
    await seed(env, (db) =>
      setDoc(doc(db, "bookActivities", "act1", "peerReviews", rid("stu2", "stu1")), review("stu2", "stu1"))
    );
    const db = asStudent(env, "stu1").firestore();
    await assertFails(
      setDoc(
        doc(db, "bookActivities", "act1", "peerReviews", rid("stu2", "stu1")),
        review("stu3", "stu1")
      )
    );
  });

  it("동료 평가 잠금은 활동 잠금과 따로 걸린다", async () => {
    const db = asStudent(env, "stu1").firestore();
    // 활동은 안 잠겼는데 동료 평가만 잠근 경우
    await assertFails(
      setDoc(
        doc(db, "bookActivities", "peerlocked1", "peerReviews", rid("stu2", "stu1")),
        review("stu2", "stu1", { activityId: "peerlocked1" })
      )
    );
    // 활동 전체가 잠긴 경우
    await assertFails(
      setDoc(
        doc(db, "bookActivities", "locked1", "peerReviews", rid("stu2", "stu1")),
        review("stu2", "stu1", { activityId: "locked1" })
      )
    );
  });

  it("지우기는 쓴 사람과 담당 교사만", async () => {
    const path = ["bookActivities", "act1", "peerReviews", rid("stu2", "stu1")];
    await seed(env, (db) => setDoc(doc(db, ...path), review("stu2", "stu1")));
    // 받은 사람은 못 지웁니다 — 마음에 안 든다고 없앨 수 있으면 안 됩니다
    await assertFails(deleteDoc(doc(asStudent(env, "stu2").firestore(), ...path)));
    await assertSucceeds(deleteDoc(doc(asStudent(env, "stu1").firestore(), ...path)));
    await seed(env, (db) => setDoc(doc(db, ...path), review("stu2", "stu1")));
    await assertSucceeds(deleteDoc(doc(asTeacher(env, "teacherA").firestore(), ...path)));
  });

  it("반 밖의 사람은 쓸 수 없다", async () => {
    const db = asStudent(env, "outsider").firestore();
    await assertFails(
      setDoc(
        doc(db, "bookActivities", "act1", "peerReviews", rid("stu2", "outsider")),
        review("stu2", "outsider")
      )
    );
  });
});
