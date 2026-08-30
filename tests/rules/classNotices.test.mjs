// =============================================================
// 반 공지 발송 이력 — classes/{cId}/classNotices/{auto}
// -------------------------------------------------------------
// 공지는 학생 알림으로만 갔고 보낸 쪽에는 아무것도 안 남았습니다. 무엇을
// 언제 보냈는지 교사가 확인할 수 있게 여기에 남깁니다.
//
// 여기서 지키려는 것:
//  · 담당 교사와 관리자만 읽을 것 — 학생은 자기 알림으로 이미 받았고,
//    이 목록은 '반 전체에 무엇을 보냈나'라 교사용입니다
//  · 남의 반 교사가 남의 반 이력을 읽지 못할 것
//  · 아무도 직접 쓰지 못할 것 — 이 기록은 서버 함수(sendClassNotice)가
//    학생 알림을 실제로 보낸 뒤에 적습니다. 클라이언트가 직접 적을 수 있으면
//    '보냈다고 적혀 있는데 실제로는 안 간' 기록을 만들 수 있습니다.
//    (admin SDK는 규칙을 우회하므로 서버 함수는 영향받지 않습니다)
// =============================================================
import { describe, it, before, after, beforeEach } from "node:test";
import { assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import {
  doc,
  addDoc,
  collection,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import { makeEnv, asStudent, asTeacher, asAdmin, seed } from "./helpers.mjs";

const noticeCol = (db, cId) => collection(db, "classes", cId, "classNotices");

const payload = (cId, byUid = "teacherA") => ({
  classId: cId,
  text: "내일 수행평가는 3교시입니다.",
  sentCount: 2,
  senderUid: byUid,
  senderName: "강현수",
  sentAt: new Date(),
});

describe("반 공지 발송 이력 규칙", () => {
  let env;
  let id;

  before(async () => {
    env = await makeEnv("demo-rules-class-notices");
  });
  after(async () => {
    await env.cleanup();
  });

  beforeEach(async () => {
    await env.clearFirestore();
    await seed(env, async (db) => {
      await setDoc(doc(db, "classes", "cA"), {
        createdBy: "teacherA", archived: false, name: "A반",
      });
      await setDoc(doc(db, "classes", "cB"), {
        createdBy: "teacherB", archived: false, name: "B반",
      });
      await setDoc(doc(db, "memberships", "stu1_cA"), { uid: "stu1", classId: "cA" });
      const ref = await addDoc(noticeCol(db, "cA"), payload("cA"));
      id = ref.id;
    });
  });

  // ── 읽기 ──
  it("담당 교사는 자기 반 발송 이력을 읽을 수 있다", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertSucceeds(getDoc(doc(db, "classes", "cA", "classNotices", id)));
  });

  it("최고 관리자는 읽을 수 있다", async () => {
    const db = asAdmin(env, "root").firestore();
    await assertSucceeds(getDoc(doc(db, "classes", "cA", "classNotices", id)));
  });

  it("남의 반 교사는 읽을 수 없다", async () => {
    const db = asTeacher(env, "teacherB").firestore();
    await assertFails(getDoc(doc(db, "classes", "cA", "classNotices", id)));
  });

  // 학생은 같은 반이어도 못 봅니다 — 공지는 자기 알림으로 이미 받았고,
  // 이 목록은 반 전체에 무엇이 나갔는지를 모아 보는 교사용 화면입니다.
  it("소속 학생도 읽을 수 없다", async () => {
    const db = asStudent(env, "stu1").firestore();
    await assertFails(getDoc(doc(db, "classes", "cA", "classNotices", id)));
  });

  // ── 쓰기 (전부 막힘) ──
  it("담당 교사도 직접 만들 수 없다 (서버 함수만)", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertFails(addDoc(noticeCol(db, "cA"), payload("cA")));
  });

  it("최고 관리자도 직접 만들 수 없다", async () => {
    const db = asAdmin(env, "root").firestore();
    await assertFails(addDoc(noticeCol(db, "cA"), payload("cA")));
  });

  it("학생은 만들 수 없다", async () => {
    const db = asStudent(env, "stu1").firestore();
    await assertFails(addDoc(noticeCol(db, "cA"), payload("cA", "stu1")));
  });

  it("이력은 담당 교사도 고칠 수 없다", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertFails(
      updateDoc(doc(db, "classes", "cA", "classNotices", id), { text: "고친 내용" })
    );
  });

  it("이력은 담당 교사도 지울 수 없다", async () => {
    const db = asTeacher(env, "teacherA").firestore();
    await assertFails(deleteDoc(doc(db, "classes", "cA", "classNotices", id)));
  });
});
