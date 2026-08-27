// =============================================================
// 사용자 프로필 — users/{uid}
//
// 실명·이메일·학번이 여기에만 있는 단일 출처라, '누가' 쓰는지뿐 아니라
// '어떤 필드를' 쓰는지까지 좁혀야 합니다. 특히 role은 클라이언트가 절대
// 쓸 수 없어야 합니다 — 역할 부여는 서버 함수(setUserRole)만 합니다.
// =============================================================
import { describe, it, before, after, beforeEach } from "node:test";
import { assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { makeEnv, asStudent, asTeacher, seed } from "./helpers.mjs";

// 초기(최고) 관리자 — 규칙이 이메일로 판정하므로 클레임 없이도 admin입니다.
const asInitialAdmin = (env) =>
  env.authenticatedContext("rootAdmin", {
    email: "iseoul72@gmail.com",
    email_verified: true,
  });

describe("사용자 프로필 규칙", () => {
  let env;

  before(async () => {
    env = await makeEnv("demo-rules-users");
  });
  after(async () => {
    await env.cleanup();
  });

  beforeEach(async () => {
    await env.clearFirestore();
    await seed(env, async (db) => {
      await setDoc(doc(db, "users", "stu1"), {
        uid: "stu1", role: "student", realName: "학생A", studentId: "30101",
        displayName: "다급한 달팽이", emoji: "🐌", email: "stu1@hansung.hs.kr",
      });
      await setDoc(doc(db, "users", "teacherA"), {
        uid: "teacherA", role: "teacher", realName: "김선생", displayName: "선생님", emoji: "🧑‍🏫",
      });
      await setDoc(doc(db, "users", "teacherB"), {
        uid: "teacherB", role: "teacher", realName: "박선생", displayName: "선생님", emoji: "🧑‍🏫",
      });
      await setDoc(doc(db, "users", "rootAdmin"), { uid: "rootAdmin", role: "student" });
    });
  });

  describe("학생 본인", () => {
    it("아바타·이메일은 스스로 바꿀 수 있다", async () => {
      const db = asStudent(env, "stu1").firestore();
      await assertSucceeds(updateDoc(doc(db, "users", "stu1"), { emoji: "🐧" }));
    });

    it("탈퇴 신청을 남길 수 있다", async () => {
      const db = asStudent(env, "stu1").firestore();
      await assertSucceeds(
        updateDoc(doc(db, "users", "stu1"), { withdrawRequested: true, withdrawRequestedAt: new Date() })
      );
    });

    it("자기 역할을 올릴 수 없다", async () => {
      const db = asStudent(env, "stu1").firestore();
      await assertFails(updateDoc(doc(db, "users", "stu1"), { role: "admin" }));
      await assertFails(updateDoc(doc(db, "users", "stu1"), { role: "teacher" }));
    });

    it("자기 실명·학번·닉네임은 바꿀 수 없다 (교사만 수정)", async () => {
      const db = asStudent(env, "stu1").firestore();
      await assertFails(updateDoc(doc(db, "users", "stu1"), { realName: "가짜이름" }));
      await assertFails(updateDoc(doc(db, "users", "stu1"), { studentId: "99999" }));
      await assertFails(updateDoc(doc(db, "users", "stu1"), { displayName: "내맘대로" }));
    });

    it("남의 프로필은 건드릴 수 없다", async () => {
      const db = asStudent(env, "stu1").firestore();
      await assertFails(updateDoc(doc(db, "users", "teacherA"), { realName: "변조" }));
    });

    it("남의 프로필을 읽을 수 없다", async () => {
      const db = asStudent(env, "stu1").firestore();
      await assertFails(getDoc(doc(db, "users", "teacherA")));
      await assertSucceeds(getDoc(doc(db, "users", "stu1")));
    });
  });

  describe("교사", () => {
    it("학생의 실명·학번을 고칠 수 있다 (학생 정보 수정 화면)", async () => {
      const db = asTeacher(env, "teacherA").firestore();
      await assertSucceeds(
        updateDoc(doc(db, "users", "stu1"), {
          displayName: "느긋한 판다", emoji: "🐼", realName: "홍길동",
          email: "stu1@hansung.hs.kr", studentId: "30102",
        })
      );
    });

    it("학생의 탈퇴 신청을 거절(해제)할 수 있다", async () => {
      const db = asTeacher(env, "teacherA").firestore();
      await assertSucceeds(updateDoc(doc(db, "users", "stu1"), { withdrawRequested: false }));
    });

    it("본인 실명은 스스로 고칠 수 있다", async () => {
      const db = asTeacher(env, "teacherA").firestore();
      await assertSucceeds(updateDoc(doc(db, "users", "teacherA"), { realName: "김선생님" }));
    });

    // ── 핵심 회귀 테스트 ──
    // 예전 규칙은 isTeacher()면 아무 user 문서에 아무 필드나 쓸 수 있었습니다.
    it("학생의 역할을 바꿀 수 없다", async () => {
      const db = asTeacher(env, "teacherA").firestore();
      await assertFails(updateDoc(doc(db, "users", "stu1"), { role: "admin" }));
    });

    it("자기 역할을 스스로 올릴 수 없다", async () => {
      const db = asTeacher(env, "teacherA").firestore();
      await assertFails(updateDoc(doc(db, "users", "teacherA"), { role: "admin" }));
    });

    it("다른 교사의 프로필을 고칠 수 없다", async () => {
      const db = asTeacher(env, "teacherA").firestore();
      await assertFails(updateDoc(doc(db, "users", "teacherB"), { realName: "변조" }));
      await assertFails(updateDoc(doc(db, "users", "teacherB"), { role: "student" }));
    });

    it("허용 목록에 없는 필드를 끼워 넣을 수 없다", async () => {
      const db = asTeacher(env, "teacherA").firestore();
      await assertFails(updateDoc(doc(db, "users", "stu1"), { fcmTokens: ["훔친토큰"] }));
      await assertFails(updateDoc(doc(db, "users", "stu1"), { 임의필드: "값" }));
    });

    it("정상 필드에 역할을 섞어 넣어도 통째로 거부된다", async () => {
      const db = asTeacher(env, "teacherA").firestore();
      await assertFails(updateDoc(doc(db, "users", "stu1"), { realName: "홍길동", role: "admin" }));
    });

    it("학생 프로필은 읽을 수 있다 (실명 확인)", async () => {
      const db = asTeacher(env, "teacherA").firestore();
      await assertSucceeds(getDoc(doc(db, "users", "stu1")));
    });
  });

  describe("급우(같은 반) — 공부방 명단 공개", () => {
    // classIds가 겹치는 학생끼리는 서로 프로필을 읽을 수 있어야 하고(공부방
    // 프로젝트에서 아직 카드를 안 쓴 급우도 이름표를 미리 보여주기 위함),
    // 다른 반 학생끼리는 여전히 막혀야 합니다. classIds 자체도 아무렇게나
    // 못 바꾸고, joinClass가 실제로 하는 것과 똑같은 모양(반에 실제로
    // 가입한 뒤 그 classId 한 개만 이어붙이기)만 통과해야 합니다.
    beforeEach(async () => {
      await seed(env, async (db) => {
        await setDoc(doc(db, "classes", "classA"), { name: "1반", archived: false });
        await setDoc(doc(db, "classes", "classB"), { name: "2반", archived: false });
        await updateDoc(doc(db, "users", "stu1"), { classIds: ["classA"] });
        await setDoc(doc(db, "users", "stu2"), {
          uid: "stu2", role: "student", realName: "학생B", studentId: "30102",
          displayName: "느긋한 판다", emoji: "🐼", classIds: ["classA"],
        });
        await setDoc(doc(db, "users", "stu3"), {
          uid: "stu3", role: "student", realName: "학생C", studentId: "30201",
          displayName: "씩씩한 여우", emoji: "🦊", classIds: ["classB"],
        });
        await setDoc(doc(db, "memberships", "stu1_classA"), { uid: "stu1", classId: "classA" });
        await setDoc(doc(db, "memberships", "stu2_classA"), { uid: "stu2", classId: "classA" });
        await setDoc(doc(db, "memberships", "stu3_classB"), { uid: "stu3", classId: "classB" });
      });
    });

    it("같은 반 급우 프로필을 읽을 수 있다", async () => {
      const db = asStudent(env, "stu1").firestore();
      await assertSucceeds(getDoc(doc(db, "users", "stu2")));
    });

    it("다른 반 학생 프로필은 읽을 수 없다", async () => {
      const db = asStudent(env, "stu1").firestore();
      await assertFails(getDoc(doc(db, "users", "stu3")));
    });

    it("실제로 가입한 반의 classId 한 개를 이어붙일 수 있다 (joinClass)", async () => {
      // stu1이 classB에도 새로 가입한 상황을 흉내: memberships 문서부터
      // (규칙 우회로) 만들어 두고, 그 다음 본인 classIds에 이어붙입니다 —
      // lib/store.js의 joinClass가 실제로 하는 순서와 같습니다.
      await seed(env, (db) =>
        setDoc(doc(db, "memberships", "stu1_classB"), { uid: "stu1", classId: "classB" })
      );
      const db = asStudent(env, "stu1").firestore();
      await assertSucceeds(
        updateDoc(doc(db, "users", "stu1"), { classIds: ["classA", "classB"] })
      );
    });

    it("가입하지 않은(memberships 문서가 없는) 반의 classId는 끼워 넣을 수 없다", async () => {
      const db = asStudent(env, "stu1").firestore();
      await assertFails(
        updateDoc(doc(db, "users", "stu1"), { classIds: ["classA", "classB"] })
      );
    });

    it("한 번에 두 개 이상 이어붙일 수 없다", async () => {
      await seed(env, (db) =>
        setDoc(doc(db, "memberships", "stu1_classB"), { uid: "stu1", classId: "classB" })
      );
      const db = asStudent(env, "stu1").firestore();
      await assertFails(
        updateDoc(doc(db, "users", "stu1"), { classIds: ["classA", "classB", "classC"] })
      );
    });

    it("기존 값을 지우거나 바꿀 수 없다", async () => {
      const db = asStudent(env, "stu1").firestore();
      await assertFails(updateDoc(doc(db, "users", "stu1"), { classIds: [] }));
    });

    it("classIds를 다른 필드와 한 요청에 같이 바꿀 수 없다", async () => {
      await seed(env, (db) =>
        setDoc(doc(db, "memberships", "stu2_classB"), { uid: "stu2", classId: "classB" })
      );
      const db = asStudent(env, "stu2").firestore();
      await assertFails(
        updateDoc(doc(db, "users", "stu2"), { classIds: ["classA", "classB"], realName: "위조" })
      );
    });

    it("다른 학생의 classIds는 바꿀 수 없다", async () => {
      const db = asStudent(env, "stu1").firestore();
      await assertFails(
        updateDoc(doc(db, "users", "stu2"), { classIds: ["classA", "classB"] })
      );
    });
  });

  describe("최고 관리자", () => {
    it("역할을 부여할 수 있다", async () => {
      const db = asInitialAdmin(env).firestore();
      await assertSucceeds(updateDoc(doc(db, "users", "stu1"), { role: "teacher" }));
    });

    it("자기 문서를 admin으로 맞출 수 있다 (부트스트랩 자가 치유)", async () => {
      const db = asInitialAdmin(env).firestore();
      await assertSucceeds(
        updateDoc(doc(db, "users", "rootAdmin"), {
          role: "admin", displayName: "선생님", emoji: "🧑‍🏫",
        })
      );
    });

    it("선생님 신청을 승인·거절할 수 있다", async () => {
      const db = asInitialAdmin(env).firestore();
      await assertSucceeds(
        updateDoc(doc(db, "users", "stu1"), {
          requestedRole: null, displayName: "선생님", emoji: "🧑‍🏫",
        })
      );
    });
  });
});
