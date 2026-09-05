// =============================================================
// 모둠 메모 — groupMemos (학생 ↔ 같은 모둠 학생)
// -------------------------------------------------------------
// 여기서 지켜야 하는 것 넷:
//  · 읽기는 주고받은 두 사람만 — 교사도, 같은 모둠의 제삼자도 못 봅니다.
//  · 쓰기는 **같은 기본 모둠**일 때만 — 반이 같은 것만으로는 안 됩니다.
//  · 받은 사람은 `read` 한 칸만 — 본문은 아무도 못 고칩니다.
//  · 지우는 것은 보낸 사람만.
// =============================================================
import { describe, it, before, after, beforeEach } from "node:test";
import { assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import {
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, where,
  serverTimestamp,
} from "firebase/firestore";
import { makeEnv, asStudent, asTeacher, seed } from "./helpers.mjs";

// stu1·stu2는 1모둠, stu3은 2모둠, stu9는 같은 반이지만 어느 모둠에도 없음
const GROUPS = [
  { id: "group_1", index: 1, name: "1모둠", memberUids: ["stu1", "stu2"], members: [] },
  { id: "group_2", index: 2, name: "2모둠", memberUids: ["stu3"], members: [] },
];

const pair = (a, b) => (a < b ? `${a}__${b}` : `${b}__${a}`);

// 앱(lib/store.js의 sendGroupMemo)이 실제로 보내는 모양 그대로.
// 필드를 하나라도 빼면 규칙이 '평가 오류'로 거부하는데, assertFails는
// 그래도 통과해 버려 엉뚱한 이유로 초록불이 켜집니다(README 참고).
const memo = (from, to, extra = {}) => ({
  classId: "cA",
  pairKey: pair(from, to),
  fromUid: from,
  fromName: "보낸이",
  toUid: to,
  toName: "받는이",
  html: "<div>안녕</div>",
  replyToId: null,
  replyToText: null,
  replyToName: null,
  read: false,
  createdAt: serverTimestamp(),
  ...extra,
});

describe("모둠 메모 규칙", () => {
  let env;

  before(async () => {
    env = await makeEnv("demo-rules-groupmemos");
  });
  after(async () => {
    await env.cleanup();
  });

  beforeEach(async () => {
    await env.clearFirestore();
    await seed(env, async (db) => {
      await setDoc(doc(db, "classes", "cA"), { createdBy: "teacherA", archived: false });
      for (const uid of ["stu1", "stu2", "stu3", "stu9"]) {
        await setDoc(doc(db, "memberships", `${uid}_cA`), { uid, classId: "cA" });
      }
      await setDoc(doc(db, "classes", "cA", "groupAssignments", "default"), {
        classId: "cA", groups: GROUPS,
      });
    });
  });

  describe("보내기", () => {
    it("같은 모둠 친구에게는 보낼 수 있다", async () => {
      const db = asStudent(env, "stu1").firestore();
      await assertSucceeds(setDoc(doc(db, "groupMemos", "m1"), memo("stu1", "stu2")));
    });

    it("다른 모둠 학생에게는 못 보낸다", async () => {
      const db = asStudent(env, "stu1").firestore();
      await assertFails(setDoc(doc(db, "groupMemos", "m1"), memo("stu1", "stu3")));
    });

    it("어느 모둠에도 없는 급우에게는 못 보낸다", async () => {
      const db = asStudent(env, "stu1").firestore();
      await assertFails(setDoc(doc(db, "groupMemos", "m1"), memo("stu1", "stu9")));
    });

    it("남의 이름으로는 못 보낸다 (fromUid 위조)", async () => {
      const db = asStudent(env, "stu2").firestore();
      await assertFails(setDoc(doc(db, "groupMemos", "m1"), memo("stu1", "stu2")));
    });

    it("pairKey가 두 사람과 안 맞으면 거부된다", async () => {
      const db = asStudent(env, "stu1").firestore();
      await assertFails(
        setDoc(doc(db, "groupMemos", "m1"), memo("stu1", "stu2", { pairKey: "stu1__stu9" }))
      );
    });

    it("보낸 순간부터 읽음으로 표시해 둘 수는 없다", async () => {
      const db = asStudent(env, "stu1").firestore();
      await assertFails(
        setDoc(doc(db, "groupMemos", "m1"), memo("stu1", "stu2", { read: true }))
      );
    });

    it("4000자를 넘으면 거부된다", async () => {
      const db = asStudent(env, "stu1").firestore();
      await assertFails(
        setDoc(doc(db, "groupMemos", "m1"), memo("stu1", "stu2", { html: "가".repeat(4001) }))
      );
    });

    it("createdAt을 임의 값으로 넣으면 거부된다", async () => {
      const db = asStudent(env, "stu1").firestore();
      await assertFails(
        setDoc(doc(db, "groupMemos", "m1"), memo("stu1", "stu2", { createdAt: new Date(0) }))
      );
    });

    // 모둠이 아직 없는 반 — get()이 없는 문서를 읽어 평가 오류로 끝나지
    // 않고 '거부'로 떨어지는지(exists 가드) 확인합니다.
    it("반에 기본 모둠이 없으면 아무에게도 못 보낸다", async () => {
      await seed(env, (db) => deleteDoc(doc(db, "classes", "cA", "groupAssignments", "default")));
      const db = asStudent(env, "stu1").firestore();
      await assertFails(setDoc(doc(db, "groupMemos", "m1"), memo("stu1", "stu2")));
    });

    it("보관된 반에서는 못 보낸다", async () => {
      await seed(env, (db) =>
        setDoc(doc(db, "classes", "cA"), { createdBy: "teacherA", archived: true })
      );
      const db = asStudent(env, "stu1").firestore();
      await assertFails(setDoc(doc(db, "groupMemos", "m1"), memo("stu1", "stu2")));
    });
  });

  describe("읽기", () => {
    beforeEach(async () => {
      await seed(env, (db) => setDoc(doc(db, "groupMemos", "m1"), memo("stu1", "stu2")));
    });

    it("보낸 사람과 받은 사람은 읽을 수 있다", async () => {
      for (const uid of ["stu1", "stu2"]) {
        const db = asStudent(env, uid).firestore();
        await assertSucceeds(getDoc(doc(db, "groupMemos", "m1")));
      }
    });

    it("같은 모둠이어도 제삼자는 못 읽는다", async () => {
      await seed(env, (db) =>
        setDoc(doc(db, "classes", "cA", "groupAssignments", "default"), {
          classId: "cA",
          groups: [{ id: "group_1", index: 1, name: "1모둠", memberUids: ["stu1", "stu2", "stu3"], members: [] }],
        })
      );
      const db = asStudent(env, "stu3").firestore();
      await assertFails(getDoc(doc(db, "groupMemos", "m1")));
    });

    it("담당 교사도 못 읽는다 — 누가기록과 주인이 다릅니다", async () => {
      const db = asTeacher(env, "teacherA").firestore();
      await assertFails(getDoc(doc(db, "groupMemos", "m1")));
    });

    // 앱이 실제로 쓰는 질의들. 전부 등호뿐이라 복합 색인이 없습니다.
    //
    // **pairKey 하나만 걸면 거부됩니다**(실측). list 규칙은 결과 문서가
    // 아니라 질의로 판정하므로, 질의가 toUid/fromUid를 증명하지 못하면
    // "Property toUid is undefined on object"로 떨어집니다. 그래서
    // subscribeGroupMemoThread가 보낸 것·받은 것 둘로 나눠 구독합니다 —
    // 이 사실을 여기 시험으로 박아 둡니다(지우지 마세요).
    it("pairKey 하나만 걸면 거부된다 — 질의를 둘로 나눠야 한다", async () => {
      const db = asStudent(env, "stu1").firestore();
      await assertFails(
        getDocs(query(collection(db, "groupMemos"), where("pairKey", "==", pair("stu1", "stu2"))))
      );
    });

    it("pairKey + fromUid / pairKey + toUid 두 질의는 통과한다", async () => {
      const db = asStudent(env, "stu1").firestore();
      for (const field of ["fromUid", "toUid"]) {
        await assertSucceeds(
          getDocs(
            query(
              collection(db, "groupMemos"),
              where("pairKey", "==", pair("stu1", "stu2")),
              where(field, "==", "stu1")
            )
          )
        );
      }
    });

    it("알림 벨 질의(toUid + read)도 통과한다", async () => {
      const db = asStudent(env, "stu2").firestore();
      await assertSucceeds(
        getDocs(
          query(
            collection(db, "groupMemos"),
            where("toUid", "==", "stu2"),
            where("read", "==", false)
          )
        )
      );
    });

    it("조건 없이 통째로 받으려 하면 거부된다", async () => {
      const db = asStudent(env, "stu1").firestore();
      await assertFails(getDocs(collection(db, "groupMemos")));
    });

    it("남의 대화는 어떻게 집어도 거부된다", async () => {
      const db = asStudent(env, "stu3").firestore();
      await assertFails(
        getDocs(
          query(
            collection(db, "groupMemos"),
            where("pairKey", "==", pair("stu1", "stu2")),
            where("fromUid", "==", "stu1")
          )
        )
      );
      await assertFails(
        getDocs(query(collection(db, "groupMemos"), where("toUid", "==", "stu2")))
      );
    });
  });

  describe("읽음 표시 · 거두기", () => {
    beforeEach(async () => {
      await seed(env, (db) => setDoc(doc(db, "groupMemos", "m1"), memo("stu1", "stu2")));
    });

    it("받은 사람은 읽음으로 표시할 수 있다", async () => {
      const db = asStudent(env, "stu2").firestore();
      await assertSucceeds(
        updateDoc(doc(db, "groupMemos", "m1"), { read: true, readAt: serverTimestamp() })
      );
    });

    it("보낸 사람은 읽음으로 표시할 수 없다", async () => {
      const db = asStudent(env, "stu1").firestore();
      await assertFails(updateDoc(doc(db, "groupMemos", "m1"), { read: true }));
    });

    it("받은 사람도 본문은 못 고친다", async () => {
      const db = asStudent(env, "stu2").firestore();
      await assertFails(
        updateDoc(doc(db, "groupMemos", "m1"), { read: true, html: "<div>딴말</div>" })
      );
    });

    it("읽음을 다시 안 읽음으로 되돌릴 수는 없다", async () => {
      const db = asStudent(env, "stu2").firestore();
      await assertFails(updateDoc(doc(db, "groupMemos", "m1"), { read: false }));
    });

    it("보낸 사람은 자기 메모를 거둘 수 있다", async () => {
      const db = asStudent(env, "stu1").firestore();
      await assertSucceeds(deleteDoc(doc(db, "groupMemos", "m1")));
    });

    it("받은 사람은 남의 메모를 지울 수 없다", async () => {
      const db = asStudent(env, "stu2").firestore();
      await assertFails(deleteDoc(doc(db, "groupMemos", "m1")));
    });
  });
});
