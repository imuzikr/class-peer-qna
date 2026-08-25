// =============================================================
// 답변 반응(엄지 척/하트/웃는 얼굴) 배열 토글 규칙
//
// meTooIds와 같은 이유로 자기 답변엔 반응할 수 없고, 배열에 중복 없이
// '이번에 바뀐 사람은 나뿐'이어야 합니다. 반응은 종류별로 필드가 나뉘어
// 있어(thumbsUpIds/heartIds/smileIds), 같은 사람이 서로 다른 종류를 동시에
// 남길 수 있는지도 함께 확인합니다.
// =============================================================
import { describe, it, before, after, beforeEach } from "node:test";
import { assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc } from "firebase/firestore";
import { makeEnv, asStudent, seed } from "./helpers.mjs";

const QID = "q1";
const AID = "a1";

const answer = ({ thumbsUpIds = [], heartIds = [], smileIds = [] } = {}) => ({
  authorId: "author1",
  content: "답변 내용",
  imageUrl: null,
  images: [],
  thumbsUpIds,
  heartIds,
  smileIds,
});

describe("답변 반응(reaction) 규칙", () => {
  let env;

  before(async () => {
    env = await makeEnv("demo-rules-answer-reactions");
  });
  after(async () => {
    await env.cleanup();
  });

  beforeEach(async () => {
    await env.clearFirestore();
    await seed(env, (db) => setDoc(doc(db, "questions", QID), { authorId: "qauthor" }));
    await seed(env, (db) => setDoc(doc(db, "questions", QID, "answers", AID), answer()));
  });

  const ref = (ctx) => doc(ctx.firestore(), "questions", QID, "answers", AID);

  it("남의 답변에 엄지 척을 남기면 자기 uid가 추가된다", async () => {
    const ctx = asStudent(env, "stu1");
    await assertSucceeds(updateDoc(ref(ctx), { thumbsUpIds: ["stu1"] }));
  });

  it("같은 이모티콘을 다시 누르면(취소) 자기 uid만 빠진다", async () => {
    await seed(env, (db) =>
      setDoc(doc(db, "questions", QID, "answers", AID), answer({ thumbsUpIds: ["stu1", "stu2"] }))
    );
    const ctx = asStudent(env, "stu1");
    await assertSucceeds(updateDoc(ref(ctx), { thumbsUpIds: ["stu2"] }));
  });

  it("서로 다른 반응은 같은 사람이 동시에 남길 수 있다(순차 업데이트)", async () => {
    const ctx = asStudent(env, "stu1");
    await assertSucceeds(updateDoc(ref(ctx), { thumbsUpIds: ["stu1"] }));
    await assertSucceeds(updateDoc(ref(ctx), { heartIds: ["stu1"] }));
    await assertSucceeds(updateDoc(ref(ctx), { smileIds: ["stu1"] }));
  });

  it("자기 답변에는 반응할 수 없다", async () => {
    const ctx = asStudent(env, "author1");
    await assertFails(updateDoc(ref(ctx), { thumbsUpIds: ["author1"] }));
  });

  it("남의 uid를 대신 추가할 수 없다", async () => {
    const ctx = asStudent(env, "stu1");
    await assertFails(updateDoc(ref(ctx), { thumbsUpIds: ["stu9"] }));
  });

  it("남의 반응을 대신 지울 수 없다", async () => {
    await seed(env, (db) =>
      setDoc(doc(db, "questions", QID, "answers", AID), answer({ heartIds: ["stu2"] }))
    );
    const ctx = asStudent(env, "stu1");
    await assertFails(updateDoc(ref(ctx), { heartIds: [] }));
  });

  it("자기 uid를 중복으로 넣어 수를 부풀릴 수 없다", async () => {
    const ctx = asStudent(env, "stu1");
    await assertFails(updateDoc(ref(ctx), { thumbsUpIds: ["stu1", "stu1", "stu1"] }));
  });

  it("반응 필드 하나를 핑계로 다른 반응 필드를 함께 바꿀 수 없다", async () => {
    const ctx = asStudent(env, "stu1");
    await assertFails(
      updateDoc(ref(ctx), { thumbsUpIds: ["stu1"], heartIds: ["stu1"] })
    );
  });

  it("반응을 핑계로 답변 내용을 함께 바꿀 수 없다", async () => {
    const ctx = asStudent(env, "stu1");
    await assertFails(
      updateDoc(ref(ctx), { thumbsUpIds: ["stu1"], content: "내용 바꿔치기" })
    );
  });
});
