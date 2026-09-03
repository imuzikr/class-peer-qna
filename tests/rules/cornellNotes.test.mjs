// =============================================================
// 수업 노트(코넬) — classes/{cId}/cornellNotes/{uid}_{날짜}
// -------------------------------------------------------------
// 학생이 수업 중에 적는 필기입니다. 바로 옆의 lessonMemos(교사의 수업 메모)와
// 이름이 비슷하지만 주인이 반대입니다 — 이쪽은 학생이 쓰고 교사가 읽습니다.
//
// 여기서 지키려는 것:
//  · 학생은 자기 노트에만 쓸 것 (문서 ID가 uid_날짜라 남의 자리에 못 씀)
//  · 담당 교사는 읽을 수 있지만 **본문은 못 고칠 것** — 남의 필기를 고칠 수
//    있으면 그건 그 학생의 기록이 아닙니다
//  · 교사는 feedback 한 칸만 쓸 것
//  · 학생이 다시 저장해도 선생님 피드백이 지워지지 않을 것
//  · 같은 반 급우끼리는 서로 못 읽을 것
//  · 보관된 반에는 쓰지 못할 것
// =============================================================
import { describe, it, before, after, beforeEach } from "node:test";
import { assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { makeEnv, asStudent, asTeacher, asAdmin, seed } from "./helpers.mjs";

const DATE = "2026-09-03";
const noteRef = (db, cId, id) => doc(db, "classes", cId, "cornellNotes", id);

// 클라이언트(lib/store.js saveCornellNote)가 실제로 보내는 형태
const payload = (cId, uid, extra = {}) => ({
  classId: cId,
  uid,
  date: DATE,
  lessonTitle: "디지털 기술과 사회 변화",
  cue: "키오스크? / 사물인터넷",
  notes: "<div>센서가 사람을 알아본다</div>",
  summary: "생활 곳곳에 이미 들어와 있다",
  updatedAt: serverTimestamp(),
  ...extra,
});

describe("수업 노트(코넬) 규칙", () => {
  let env;

  before(async () => {
    env = await makeEnv("demo-rules-cornell-notes");
  });
  after(async () => {
    await env.cleanup();
  });

  beforeEach(async () => {
    await env.clearFirestore();
    await seed(env, async (db) => {
      await setDoc(doc(db, "classes", "cA"), { createdBy: "teacherA", archived: false, name: "A반" });
      await setDoc(doc(db, "classes", "cB"), { createdBy: "teacherB", archived: false, name: "B반" });
      await setDoc(doc(db, "classes", "cOld"), { createdBy: "teacherA", archived: true, name: "보관된 반" });
      await setDoc(doc(db, "memberships", "stu1_cA"), { uid: "stu1", classId: "cA" });
      await setDoc(doc(db, "memberships", "stu2_cA"), { uid: "stu2", classId: "cA" });
      await setDoc(doc(db, "memberships", "stu1_cOld"), { uid: "stu1", classId: "cOld" });
      // 이미 적어 둔 노트 한 장 (읽기·수정 시험용)
      await setDoc(noteRef(db, "cA", `stu1_${DATE}`), {
        classId: "cA", uid: "stu1", date: DATE,
        cue: "먼저 적어 둔 단서", notes: "먼저 적어 둔 필기", summary: "",
      });
    });
  });

  // ── 학생이 쓰기 ──
  it("학생은 자기 노트를 만들 수 있다", async () => {
    const db = asStudent(env, "stu2").firestore();
    await assertSucceeds(setDoc(noteRef(db, "cA", `stu2_${DATE}`), payload("cA", "stu2")));
  });

  it("학생은 자기 노트를 이어서 고칠 수 있다", async () => {
    const db = asStudent(env, "stu1").firestore();
    await assertSucceeds(
      setDoc(noteRef(db, "cA", `stu1_${DATE}`), payload("cA", "stu1"), { merge: true })
    );
  });

  it("남의 자리(문서 ID)에는 쓸 수 없다", async () => {
    const db = asStudent(env, "stu2").firestore();
    await assertFails(setDoc(noteRef(db, "cA", `stu1_${DATE}`), payload("cA", "stu2")));
  });

  it("uid를 남의 것으로 위조할 수 없다", async () => {
    const db = asStudent(env, "stu2").firestore();
    await assertFails(setDoc(noteRef(db, "cA", `stu1_${DATE}`), payload("cA", "stu1")));
  });

  it("문서 ID의 날짜가 date와 다르면 거부된다", async () => {
    const db = asStudent(env, "stu2").firestore();
    await assertFails(setDoc(noteRef(db, "cA", "stu2_2026-09-01"), payload("cA", "stu2")));
  });

  it("classId가 경로와 다르면 거부된다", async () => {
    const db = asStudent(env, "stu2").firestore();
    await assertFails(setDoc(noteRef(db, "cA", `stu2_${DATE}`), payload("cB", "stu2")));
  });

  it("그 반 학생이 아니면 쓸 수 없다", async () => {
    const db = asStudent(env, "stu9").firestore();
    await assertFails(setDoc(noteRef(db, "cA", `stu9_${DATE}`), payload("cA", "stu9")));
  });

  it("보관된 반에는 쓸 수 없다", async () => {
    const db = asStudent(env, "stu1").firestore();
    await assertFails(setDoc(noteRef(db, "cOld", `stu1_${DATE}`), payload("cOld", "stu1")));
  });

  it("필기 칸이 20000자를 넘으면 거부된다", async () => {
    const db = asStudent(env, "stu2").firestore();
    await assertFails(
      setDoc(noteRef(db, "cA", `stu2_${DATE}`), payload("cA", "stu2", { notes: "가".repeat(20001) }))
    );
  });

  it("요약 칸이 2000자를 넘으면 거부된다", async () => {
    const db = asStudent(env, "stu2").firestore();
    await assertFails(
      setDoc(noteRef(db, "cA", `stu2_${DATE}`), payload("cA", "stu2", { summary: "가".repeat(2001) }))
    );
  });

  it("학생이 만들면서 피드백을 스스로 적을 수는 없다", async () => {
    const db = asStudent(env, "stu2").firestore();
    await assertFails(
      setDoc(noteRef(db, "cA", `stu2_${DATE}`), payload("cA", "stu2", { feedback: "참 잘했어요" }))
    );
  });

  // ── 읽기 ──
  it("본인은 읽을 수 있다", async () => {
    const db = asStudent(env, "stu1").firestore();
    await assertSucceeds(getDoc(noteRef(db, "cA", `stu1_${DATE}`)));
  });

  it("담당 교사는 읽을 수 있다 — 수업 뒤에 읽고 피드백을 주는 자리", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertSucceeds(getDoc(noteRef(db, "cA", `stu1_${DATE}`)));
  });

  it("최고 관리자는 읽을 수 있다", async () => {
    const db = asAdmin(env, "root").firestore();
    await assertSucceeds(getDoc(noteRef(db, "cA", `stu1_${DATE}`)));
  });

  it("같은 반 급우는 읽을 수 없다", async () => {
    const db = asStudent(env, "stu2").firestore();
    await assertFails(getDoc(noteRef(db, "cA", `stu1_${DATE}`)));
  });

  it("남의 반 교사는 읽을 수 없다", async () => {
    const db = asTeacher(env, "teacherB").firestore();
    await assertFails(getDoc(noteRef(db, "cA", `stu1_${DATE}`)));
  });

  // ── 교사의 피드백 ──
  it("담당 교사는 피드백 칸을 적을 수 있다", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertSucceeds(
      updateDoc(noteRef(db, "cA", `stu1_${DATE}`), {
        feedback: "단서 칸에 물음표를 붙여 보면 더 좋아요",
        feedbackAt: serverTimestamp(),
        feedbackBy: "teacherA",
      })
    );
  });

  it("교사는 학생의 필기 본문을 고칠 수 없다", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertFails(updateDoc(noteRef(db, "cA", `stu1_${DATE}`), { notes: "내가 고친 필기" }));
  });

  it("교사는 피드백과 본문을 한꺼번에 고칠 수 없다", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertFails(
      updateDoc(noteRef(db, "cA", `stu1_${DATE}`), { feedback: "좋아요", summary: "내가 쓴 요약" })
    );
  });

  it("남의 반 교사는 피드백도 못 적는다", async () => {
    const db = asTeacher(env, "teacherB").firestore();
    await assertFails(updateDoc(noteRef(db, "cA", `stu1_${DATE}`), { feedback: "좋아요" }));
  });

  it("학생은 자기 노트에도 피드백을 적을 수 없다", async () => {
    const db = asStudent(env, "stu1").firestore();
    await assertFails(updateDoc(noteRef(db, "cA", `stu1_${DATE}`), { feedback: "스스로 칭찬" }));
  });

  // ── 피드백이 붙은 뒤 ──
  describe("선생님 피드백이 달린 노트", () => {
    beforeEach(async () => {
      await seed(env, async (db) => {
        await setDoc(
          noteRef(db, "cA", `stu1_${DATE}`),
          { feedback: "물음표를 붙여 보세요", feedbackBy: "teacherA" },
          { merge: true }
        );
      });
    });

    it("학생이 이어서 써도 피드백은 그대로 남는다", async () => {
      const db = asStudent(env, "stu1").firestore();
      await assertSucceeds(
        setDoc(noteRef(db, "cA", `stu1_${DATE}`), payload("cA", "stu1"), { merge: true })
      );
    });

    it("학생이 피드백을 지울 수 없다", async () => {
      const db = asStudent(env, "stu1").firestore();
      await assertFails(
        setDoc(noteRef(db, "cA", `stu1_${DATE}`), payload("cA", "stu1", { feedback: "" }))
      );
    });
  });

  // ── 지우기 ──
  it("본인은 자기 노트를 지울 수 있다", async () => {
    const db = asStudent(env, "stu1").firestore();
    await assertSucceeds(deleteDoc(noteRef(db, "cA", `stu1_${DATE}`)));
  });

  it("교사는 학생 노트를 지울 수 없다", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertFails(deleteDoc(noteRef(db, "cA", `stu1_${DATE}`)));
  });
});
