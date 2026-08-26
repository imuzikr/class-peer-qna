// =============================================================
// 공부방 카드 반응(엄지 척/하트/웃는 얼굴) 배열 토글 규칙
//
// answerReactions.test.mjs와 같은 방식(meTooIds류 배열 토글)이지만, 카드는
// 잠금(editMode)이 걸려도 반응은 계속 남길 수 있어야 하고, 모둠 보드에서는
// '자기 카드'가 아니라 '자기 모둠의 카드'를 기준으로 자기 반응을 막습니다.
// =============================================================
import { describe, it, before, after, beforeEach } from "node:test";
import { assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc } from "firebase/firestore";
import { makeEnv, asStudent, asTeacher, seed } from "./helpers.mjs";

const card = (uid, extra = {}) => ({
  authorId: uid, title: "내 카드", content: "내용",
  thumbsUpIds: [], heartIds: [], smileIds: [],
  ...extra,
});

describe("공부방 카드 반응(reaction) 규칙", () => {
  let env;

  before(async () => {
    env = await makeEnv("demo-rules-card-reactions");
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
      await setDoc(doc(db, "memberships", "stu3_cA"), { uid: "stu3", classId: "cA" });
      await setDoc(doc(db, "studyBoards", "open"), { classId: "cA", title: "열린 보드", type: "cards", editMode: "open" });
      await setDoc(doc(db, "studyBoards", "locked"), { classId: "cA", title: "잠긴 보드", type: "cards", editMode: "locked" });
      await setDoc(doc(db, "studyBoards", "group"), {
        classId: "cA", title: "모둠 보드", type: "cards", editMode: "open", activityType: "group",
      });
      await setDoc(doc(db, "studyBoards", "open", "cards", "stu2"), card("stu2"));
      await setDoc(doc(db, "studyBoards", "locked", "cards", "stu2"), card("stu2"));
      await setDoc(doc(db, "studyBoards", "group", "cards", "group_1"), {
        groupId: "g1", groupIndex: 1, title: "1모둠", content: "",
        memberUids: ["stu2", "stu3"], authorId: "teacherA",
        thumbsUpIds: [], heartIds: [], smileIds: [],
      });
    });
  });

  const ref = (ctx, boardId, cardId) => doc(ctx.firestore(), "studyBoards", boardId, "cards", cardId);

  it("남의 카드에 엄지 척을 남기면 자기 uid가 추가된다", async () => {
    const ctx = asStudent(env, "stu1");
    await assertSucceeds(updateDoc(ref(ctx, "open", "stu2"), { thumbsUpIds: ["stu1"] }));
  });

  it("같은 이모티콘을 다시 누르면(취소) 자기 uid만 빠진다", async () => {
    await seed(env, (db) =>
      setDoc(doc(db, "studyBoards", "open", "cards", "stu2"), card("stu2", { thumbsUpIds: ["stu1", "stu3"] }))
    );
    const ctx = asStudent(env, "stu1");
    await assertSucceeds(updateDoc(ref(ctx, "open", "stu2"), { thumbsUpIds: ["stu3"] }));
  });

  it("서로 다른 반응은 같은 사람이 순차로 남길 수 있다", async () => {
    const ctx = asStudent(env, "stu1");
    await assertSucceeds(updateDoc(ref(ctx, "open", "stu2"), { thumbsUpIds: ["stu1"] }));
    await assertSucceeds(updateDoc(ref(ctx, "open", "stu2"), { heartIds: ["stu1"] }));
    await assertSucceeds(updateDoc(ref(ctx, "open", "stu2"), { smileIds: ["stu1"] }));
  });

  it("자기 카드에는 반응할 수 없다", async () => {
    const ctx = asStudent(env, "stu2");
    await assertFails(updateDoc(ref(ctx, "open", "stu2"), { thumbsUpIds: ["stu2"] }));
  });

  it("남의 uid를 대신 추가할 수 없다", async () => {
    const ctx = asStudent(env, "stu1");
    await assertFails(updateDoc(ref(ctx, "open", "stu2"), { thumbsUpIds: ["stu9"] }));
  });

  it("남의 반응을 대신 지울 수 없다", async () => {
    await seed(env, (db) =>
      setDoc(doc(db, "studyBoards", "open", "cards", "stu2"), card("stu2", { heartIds: ["stu3"] }))
    );
    const ctx = asStudent(env, "stu1");
    await assertFails(updateDoc(ref(ctx, "open", "stu2"), { heartIds: [] }));
  });

  it("자기 uid를 중복으로 넣어 수를 부풀릴 수 없다", async () => {
    const ctx = asStudent(env, "stu1");
    await assertFails(updateDoc(ref(ctx, "open", "stu2"), { thumbsUpIds: ["stu1", "stu1"] }));
  });

  it("반응 필드를 핑계로 카드 내용을 함께 바꿀 수 없다", async () => {
    const ctx = asStudent(env, "stu1");
    await assertFails(
      updateDoc(ref(ctx, "open", "stu2"), { thumbsUpIds: ["stu1"], content: "내용 바꿔치기" })
    );
  });

  // ── 잠금과 무관 ──
  it("보드가 잠겨 있어도 반응은 남길 수 있다 (제출물 수정이 아니므로)", async () => {
    const ctx = asStudent(env, "stu1");
    await assertSucceeds(updateDoc(ref(ctx, "locked", "stu2"), { thumbsUpIds: ["stu1"] }));
  });

  // ── 모둠 보드는 '자기 모둠 카드' 기준 ──
  it("모둠 보드에서 다른 모둠 학생은 반응할 수 있다", async () => {
    const ctx = asStudent(env, "stu1"); // stu1은 1모둠 소속이 아님
    await assertSucceeds(updateDoc(ref(ctx, "group", "group_1"), { thumbsUpIds: ["stu1"] }));
  });

  it("모둠 보드에서 같은 모둠 구성원은 자기 모둠 카드에 반응할 수 없다", async () => {
    const ctx = asStudent(env, "stu2"); // stu2는 1모둠 구성원
    await assertFails(updateDoc(ref(ctx, "group", "group_1"), { thumbsUpIds: ["stu2"] }));
  });

  it("반 밖의 사람은 반응할 수 없다", async () => {
    const ctx = asStudent(env, "outsider");
    await assertFails(updateDoc(ref(ctx, "open", "stu2"), { thumbsUpIds: ["outsider"] }));
  });

  it("담당 교사는 반응 규칙과 무관하게 카드를 고칠 수 있다", async () => {
    const ctx = asTeacher(env, "teacherA");
    await assertSucceeds(updateDoc(ref(ctx, "open", "stu2"), { thumbsUpIds: ["teacherA"] }));
  });
});
