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
import {
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, serverTimestamp,
  collection, query, where, documentId,
} from "firebase/firestore";
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

  // 그날 수업 자료를 노트에 걸어 둡니다(이름 + 링크). 학생 갈래가 변경 키
  // 화이트리스트가 아니라 '본인 것 + 칸 길이 + 피드백 불변'만 보므로 규칙을
  // 고치지 않고 통과해야 합니다 — 짐작하지 말고 여기서 못박아 둡니다.
  it("학생이 수업 자료 목록을 함께 저장할 수 있다", async () => {
    const db = asStudent(env, "stu2").firestore();
    await assertSucceeds(
      setDoc(
        noteRef(db, "cA", `stu2_${DATE}`),
        payload("cA", "stu2", {
          materials: [
            { name: "디지털기술.pdf", url: "https://example.com/a.pdf", kind: "file" },
            { name: "수업 사진", url: "https://example.com/b.png", kind: "image" },
          ],
        })
      )
    );
  });

  it("자료 목록을 걸면서 남의 노트에 쓸 수는 없다", async () => {
    const db = asStudent(env, "stu2").firestore();
    await assertFails(
      setDoc(
        noteRef(db, "cA", `stu1_${DATE}`),
        payload("cA", "stu2", {
          materials: [{ name: "a.pdf", url: "https://example.com/a.pdf", kind: "file" }],
        })
      )
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

  // ── 최근 며칠치를 어떻게 읽을 것인가 ──
  // 서랍이 '안 읽은 피드백'을 찾으려면 최근 14일치를 봐야 합니다.
  // 문서 ID가 `uid_날짜`로 못 박혀 있어 **ID 목록 한 방**(documentId() in [...])
  // 으로 물어보면 빈 날은 읽기에 세지도 않아 훨씬 쌉니다. 그래서 그렇게 짜려다
  // **실측으로 막히는 것을 확인**했습니다 — 아래가 그 기록입니다.
  //
  // 규칙의 학생 갈래가 `resource.data.uid == uid()`라, 목록(list) 질의에서는
  // 문서를 열어 봐야 판정이 되는 조건이 됩니다. 질의 자체가 uid로 좁혀져
  // 있음을 규칙이 알 방법이 없어(ID 문자열의 앞부분이 uid라는 건 우리 약속일
  // 뿐입니다) 통째로 거부됩니다.
  //
  // 그래서 앱은 **날짜마다 한 건씩 get**으로 읽습니다(아래 두 번째 시험).
  // 빈 날도 한 건씩 세지만 14일이면 14건으로 묶여 있고, 질의도 색인도
  // 필요 없습니다. 이 시험을 지우지 마세요 — 지우면 다음 사람이 같은 길로
  // 다시 들어갑니다.
  it("ID 목록 한 방(in 질의)은 규칙이 거부한다 — 그래서 하루씩 읽습니다", async () => {
    const db = asStudent(env, "stu1").firestore();
    const ids = ["2026-09-01", "2026-09-02", DATE].map((d) => `stu1_${d}`);
    await assertFails(
      getDocs(
        query(collection(db, "classes", "cA", "cornellNotes"), where(documentId(), "in", ids))
      )
    );
  });

  it("아직 안 쓴 날짜를 하루씩 읽어 보는 것은 허용된다 (없으면 빈 결과)", async () => {
    const db = asStudent(env, "stu1").firestore();
    const snap = await assertSucceeds(getDoc(noteRef(db, "cA", "stu1_2026-08-28")));
    if (snap.exists()) throw new Error("없는 노트인데 있다고 나왔습니다");
  });

  it("남의 자리는 아직 안 쓴 날짜여도 읽을 수 없다", async () => {
    const db = asStudent(env, "stu2").firestore();
    await assertFails(getDoc(noteRef(db, "cA", "stu1_2026-08-28")));
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

    // ── 읽음 표시(feedbackSeenAt) ──
    // 선생님 한 마디가 도착했다는 배지를 끄려면 '읽었다'를 어딘가 적어야
    // 합니다. 브라우저에 적으면 폰에서 읽은 것을 노트북이 모르므로 노트
    // 문서에 적습니다. 학생 update 갈래는 변경 키 화이트리스트가 아니라
    // '본인 것 + 칸 길이 + 피드백 불변'만 보므로, 규칙을 고치지 않고도
    // 새 필드 하나가 통과해야 합니다 — 그것을 여기서 못박아 둡니다.
    it("학생이 '읽음' 표시만 남기는 것은 허용된다", async () => {
      const db = asStudent(env, "stu1").firestore();
      await assertSucceeds(
        updateDoc(noteRef(db, "cA", `stu1_${DATE}`), { feedbackSeenAt: serverTimestamp() })
      );
    });

    it("'읽음' 표시에 피드백 수정을 끼워 넣을 수는 없다", async () => {
      const db = asStudent(env, "stu1").firestore();
      await assertFails(
        updateDoc(noteRef(db, "cA", `stu1_${DATE}`), {
          feedbackSeenAt: serverTimestamp(),
          feedback: "내가 고친 피드백",
        })
      );
    });

    it("남의 노트에는 '읽음' 표시도 못 남긴다", async () => {
      const db = asStudent(env, "stu2").firestore();
      await assertFails(
        updateDoc(noteRef(db, "cA", `stu1_${DATE}`), { feedbackSeenAt: serverTimestamp() })
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
