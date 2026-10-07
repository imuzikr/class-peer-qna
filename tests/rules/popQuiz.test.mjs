// =============================================================
// 돌발 퀴즈 — classes/{cId}/popQuizzes/{qId} (+ submissions/{uid})
// -------------------------------------------------------------
// 퀴즈: 반 학생·담당 교사가 읽고, 담당 교사만 만들고 닫습니다.
// 답: 학생은 제 자리에 · 열린 퀴즈에만 · 처음이거나 반송됐을 때만 보냅니다.
// 교사는 상태 칸만(반송 · 과일). 읽기는 그 학생과 담당 교사.
// 앱(lib/data/popQuiz.js)이 보내는 모양 그대로 시험합니다.
// =============================================================
import { describe, it, before, after, beforeEach } from "node:test";
import { assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import {
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, where,
  serverTimestamp, writeBatch,
} from "firebase/firestore";
import { makeEnv, asStudent, asTeacher, seed } from "./helpers.mjs";

const C = "cA";
const quiz = (extra = {}) => ({
  classId: C, kind: "text", title: "변수란?", desc: "", boardId: "b1", boardTitle: "프로젝트",
  byUid: "teacherA", open: true, createdAt: serverTimestamp(), closedAt: null, ...extra,
});
const answer = (uid, extra = {}) => ({
  classId: C, quizId: "q1", uid, kind: "text", text: "<p>값을 담는 상자</p>", output: "",
  status: "submitted", submittedAt: serverTimestamp(), ...extra,
});
const qRef = (db, id = "q1", c = C) => doc(db, "classes", c, "popQuizzes", id);
const aRef = (db, uid, id = "q1", c = C) => doc(db, "classes", c, "popQuizzes", id, "submissions", uid);

describe("돌발 퀴즈 규칙", () => {
  let env;
  before(async () => { env = await makeEnv("demo-rules-pop-quiz"); });
  after(async () => { await env.cleanup(); });
  beforeEach(async () => {
    await env.clearFirestore();
    await seed(env, async (db) => {
      await setDoc(doc(db, "classes", C), { createdBy: "teacherA", archived: false });
      await setDoc(doc(db, "classes", "cArch"), { createdBy: "teacherA", archived: true });
      await setDoc(doc(db, "memberships", `stu1_${C}`), { uid: "stu1", classId: C });
      await setDoc(doc(db, "memberships", `stu2_${C}`), { uid: "stu2", classId: C });
      await setDoc(qRef(db), { ...quiz(), createdAt: new Date() });
    });
  });

  it("담당 교사가 보내고(앞의 것을 닫는 한 묶음), 남의 반 교사·학생은 못 보냄", async () => {
    const t = asTeacher(env, "teacherA").firestore();
    const b = writeBatch(t);
    b.update(qRef(t), { open: false, closedAt: serverTimestamp() });
    b.set(qRef(t, "q2"), quiz());
    await assertSucceeds(b.commit());
    // 모양 — 빈 제목 · 긴 제목 · 모르는 종류 · 모르는 칸 · 닫힌 채 만들기
    await assertFails(setDoc(qRef(t, "q3"), quiz({ title: "" })));
    await assertFails(setDoc(qRef(t, "q3"), quiz({ title: "가".repeat(201) })));
    await assertFails(setDoc(qRef(t, "q3"), quiz({ kind: "draw" })));
    await assertFails(setDoc(qRef(t, "q3"), quiz({ extra: 1 })));
    await assertFails(setDoc(qRef(t, "q3"), quiz({ open: false })));
    await assertFails(setDoc(qRef(t, "q3", "cArch"), quiz({ classId: "cArch" })));
    const other = asTeacher(env, "teacherB").firestore();
    await assertFails(setDoc(qRef(other, "q4"), quiz({ byUid: "teacherB" })));
    const s1 = asStudent(env, "stu1").firestore();
    await assertFails(setDoc(qRef(s1, "q5"), quiz({ byUid: "stu1" })));
  });

  it("고치기는 '닫기'뿐 — 물음은 못 바꿈, 다시 열 수도 없음", async () => {
    const t = asTeacher(env, "teacherA").firestore();
    await assertFails(updateDoc(qRef(t), { title: "바뀐 물음" }));
    await assertSucceeds(updateDoc(qRef(t), { open: false, closedAt: serverTimestamp() }));
    await assertFails(updateDoc(qRef(t), { open: true, closedAt: null }));
  });

  it("퀴즈 읽기는 반 학생·담당 교사, 다른 반 학생은 거부", async () => {
    await seed(env, (db) => setDoc(doc(db, "memberships", `stu9_cB`), { uid: "stu9", classId: "cB" }));
    const s1 = asStudent(env, "stu1").firestore();
    await assertSucceeds(getDocs(query(collection(s1, "classes", C, "popQuizzes"), where("open", "==", true))));
    await assertSucceeds(getDocs(collection(s1, "classes", C, "popQuizzes")));
    const s9 = asStudent(env, "stu9").firestore();
    await assertFails(getDoc(qRef(s9)));
  });

  it("학생은 제 자리에 열린 퀴즈의 답을 보냄(모양·종류·길이)", async () => {
    const s1 = asStudent(env, "stu1").firestore();
    await assertFails(setDoc(aRef(s1, "stu2"), answer("stu2")));
    await assertFails(setDoc(aRef(s1, "stu1"), answer("stu1", { text: "" })));
    await assertFails(setDoc(aRef(s1, "stu1"), answer("stu1", { kind: "code" })));
    await assertFails(setDoc(aRef(s1, "stu1"), answer("stu1", { status: "rewarded" })));
    await assertFails(setDoc(aRef(s1, "stu1"), answer("stu1", { returnNote: "" })));
    await assertFails(setDoc(aRef(s1, "stu1"), answer("stu1", { text: "가".repeat(20001) })));
    await assertSucceeds(setDoc(aRef(s1, "stu1"), answer("stu1"), { merge: true }));
    // 보낸 뒤에는 못 고침(선생님 확인 전)
    await assertFails(setDoc(aRef(s1, "stu1"), answer("stu1", { text: "<p>고침</p>" }), { merge: true }));
  });

  it("닫힌 퀴즈에는 못 보냄", async () => {
    await seed(env, (db) => updateDoc(qRef(db), { open: false, closedAt: new Date() }));
    const s1 = asStudent(env, "stu1").firestore();
    await assertFails(setDoc(aRef(s1, "stu1"), answer("stu1"), { merge: true }));
  });

  it("반송 → 학생이 고쳐 다시 보냄 → 과일 → 그 뒤로는 못 고침", async () => {
    const s1 = asStudent(env, "stu1").firestore();
    const t = asTeacher(env, "teacherA").firestore();
    await assertSucceeds(setDoc(aRef(s1, "stu1"), answer("stu1"), { merge: true }));
    await assertSucceeds(updateDoc(aRef(t, "stu1"), {
      status: "returned", returnNote: "예를 하나 들어 줘요", reviewedBy: "teacherA", reviewedAt: serverTimestamp(),
    }));
    // 반송된 답은 다시 반송 못 함
    await assertFails(updateDoc(aRef(t, "stu1"), {
      status: "returned", returnNote: "", reviewedBy: "teacherA", reviewedAt: serverTimestamp(),
    }));
    // 학생이 상태를 멋대로 바꾸거나 한 마디를 지우는 것은 거부
    await assertFails(updateDoc(aRef(s1, "stu1"), { returnNote: "" }));
    await assertSucceeds(setDoc(aRef(s1, "stu1"), answer("stu1", { text: "<p>고친 답</p>" }), { merge: true }));
    await assertSucceeds(updateDoc(aRef(t, "stu1"), {
      status: "rewarded", reviewedBy: "teacherA", reviewedAt: serverTimestamp(),
    }));
    await assertFails(setDoc(aRef(s1, "stu1"), answer("stu1", { text: "<p>또 고침</p>" }), { merge: true }));
  });

  it("교사는 상태 칸만 — 학생 글은 못 고치고, 남의 반 교사는 거부", async () => {
    const s1 = asStudent(env, "stu1").firestore();
    await assertSucceeds(setDoc(aRef(s1, "stu1"), answer("stu1"), { merge: true }));
    const t = asTeacher(env, "teacherA").firestore();
    await assertFails(updateDoc(aRef(t, "stu1"), {
      status: "rewarded", text: "<p>대신 씀</p>", reviewedBy: "teacherA", reviewedAt: serverTimestamp(),
    }));
    await assertFails(updateDoc(aRef(t, "stu1"), {
      status: "returned", returnNote: "가".repeat(501), reviewedBy: "teacherA", reviewedAt: serverTimestamp(),
    }));
    const other = asTeacher(env, "teacherB").firestore();
    await assertFails(updateDoc(aRef(other, "stu1"), {
      status: "rewarded", reviewedBy: "teacherB", reviewedAt: serverTimestamp(),
    }));
  });

  it("답 읽기 — 본인(아직 없는 제 자리도) · 담당 교사 목록, 남의 답·학생 목록은 거부", async () => {
    const s1 = asStudent(env, "stu1").firestore();
    await assertSucceeds(getDoc(aRef(s1, "stu1")));
    await assertSucceeds(setDoc(aRef(s1, "stu1"), answer("stu1"), { merge: true }));
    const s2 = asStudent(env, "stu2").firestore();
    await assertFails(getDoc(aRef(s2, "stu1")));
    await assertFails(getDocs(collection(s2, "classes", C, "popQuizzes", "q1", "submissions")));
    const t = asTeacher(env, "teacherA").firestore();
    await assertSucceeds(getDocs(collection(t, "classes", C, "popQuizzes", "q1", "submissions")));
  });

  it("코드 퀴즈는 코드로, 실행 결과도 함께", async () => {
    await seed(env, (db) => setDoc(qRef(db, "q2"), { ...quiz({ kind: "code" }), createdAt: new Date() }));
    const s1 = asStudent(env, "stu1").firestore();
    const code = (extra = {}) => answer("stu1", { quizId: "q2", kind: "code", text: "print(1)", output: "1", ...extra });
    await assertFails(setDoc(aRef(s1, "stu1", "q2"), code({ kind: "text" }), { merge: true }));
    await assertFails(setDoc(aRef(s1, "stu1", "q2"), code({ output: "가".repeat(10001) }), { merge: true }));
    await assertSucceeds(setDoc(aRef(s1, "stu1", "q2"), code(), { merge: true }));
  });

  it("지우기는 담당 교사만", async () => {
    const s1 = asStudent(env, "stu1").firestore();
    await assertSucceeds(setDoc(aRef(s1, "stu1"), answer("stu1"), { merge: true }));
    await assertFails(deleteDoc(aRef(s1, "stu1")));
    await assertFails(deleteDoc(qRef(s1)));
    const t = asTeacher(env, "teacherA").firestore();
    await assertSucceeds(deleteDoc(aRef(t, "stu1")));
    await assertSucceeds(deleteDoc(qRef(t)));
  });
});
