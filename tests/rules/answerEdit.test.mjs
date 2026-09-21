// =============================================================
// 답변 고치기·지우기 규칙 — 쓴 사람 본인
//
// 화면에 '수정·삭제'가 없던 시절에도 규칙은 이미 열려 있었습니다. 그 문이
// 얼마나 열려 있는지(무엇까지 되고 무엇은 안 되는지)를 여기 박아 둡니다 —
// 나중에 규칙을 손볼 때 이 문이 조용히 넓어지거나 닫히지 않도록.
//
// 핵심: 작성자는 **본문·첨부만** 고칩니다. 작성자·시각·반응·'이해됐어요'는
// 그대로여야 합니다(그것까지 열면 남이 남긴 반응을 제 손으로 지우거나,
// 나중에 쓴 글을 처음부터 있던 것처럼 꾸밀 수 있습니다).
// =============================================================
import { describe, it, before, after, beforeEach } from "node:test";
import { assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { makeEnv, asStudent, asTeacher, seed } from "./helpers.mjs";

const QID = "q1";
const AID = "a1";
const AUTHOR = "author1";

const answer = (extra = {}) => ({
  authorId: AUTHOR,
  authorName: "흥겨운 고래",
  content: "처음 쓴 답변",
  imageUrl: null,
  images: [],
  thumbsUpIds: [],
  heartIds: [],
  smileIds: [],
  understood: false,
  ...extra,
});

describe("답변 고치기·지우기 규칙", () => {
  let env;

  before(async () => {
    env = await makeEnv("demo-rules-answer-edit");
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

  // ── 고치기 ──
  it("쓴 사람은 자기 답변의 본문을 고칠 수 있다", async () => {
    const ctx = asStudent(env, AUTHOR);
    await assertSucceeds(updateDoc(ref(ctx), { content: "고쳐 쓴 답변" }));
  });

  it("쓴 사람은 첨부 이미지도 함께 고칠 수 있다", async () => {
    const ctx = asStudent(env, AUTHOR);
    await assertSucceeds(
      updateDoc(ref(ctx), { content: "사진을 뺐어요", images: [], imageUrl: null })
    );
  });

  it("남의 답변은 못 고친다", async () => {
    const ctx = asStudent(env, "stu9");
    await assertFails(updateDoc(ref(ctx), { content: "남의 글 바꿔치기" }));
  });

  it("고치기를 핑계로 작성자를 바꿀 수 없다", async () => {
    const ctx = asStudent(env, AUTHOR);
    await assertFails(
      updateDoc(ref(ctx), { content: "고침", authorId: "stu9" })
    );
  });

  it("고치기를 핑계로 남이 남긴 반응을 지울 수 없다", async () => {
    await seed(env, (db) =>
      setDoc(doc(db, "questions", QID, "answers", AID), answer({ heartIds: ["stu2"] }))
    );
    const ctx = asStudent(env, AUTHOR);
    await assertFails(updateDoc(ref(ctx), { content: "고침", heartIds: [] }));
  });

  it("고치기를 핑계로 '이해됐어요'를 스스로 켤 수 없다", async () => {
    const ctx = asStudent(env, AUTHOR);
    await assertFails(updateDoc(ref(ctx), { content: "고침", understood: true }));
  });

  it("교사는 남의 답변도 고칠 수 있다(중재)", async () => {
    const ctx = asTeacher(env, "t1");
    await assertSucceeds(updateDoc(ref(ctx), { content: "선생님이 정리" }));
  });

  // ── 지우기 ──
  it("쓴 사람은 자기 답변을 지울 수 있다", async () => {
    const ctx = asStudent(env, AUTHOR);
    await assertSucceeds(deleteDoc(ref(ctx)));
  });

  it("남의 답변은 못 지운다", async () => {
    const ctx = asStudent(env, "stu9");
    await assertFails(deleteDoc(ref(ctx)));
  });

  it("질문을 쓴 사람이라고 남의 답변을 지울 수는 없다", async () => {
    const ctx = asStudent(env, "qauthor");
    await assertFails(deleteDoc(ref(ctx)));
  });

  it("교사는 남의 답변도 지울 수 있다(중재)", async () => {
    const ctx = asTeacher(env, "t1");
    await assertSucceeds(deleteDoc(ref(ctx)));
  });

  it("로그인하지 않으면 고치지도 지우지도 못한다", async () => {
    const ctx = env.unauthenticatedContext();
    const r = doc(ctx.firestore(), "questions", QID, "answers", AID);
    await assertFails(updateDoc(r, { content: "고침" }));
    await assertFails(deleteDoc(r));
  });
});
